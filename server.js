import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { once } from 'node:events';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { BlockList } from 'node:net';
import { networkInterfaces } from 'node:os';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { dependencyDirectory, dependencyManifest, pwaRoot } from './dependency-path.js';

const require = createRequire(dependencyManifest);
const { default: OBSWebSocket } = require('obs-websocket-js');
const QRCode = require('qrcode');

const pwaAddress = process.argv.find((arg) => arg.startsWith('--pwa='))?.slice(6);
const lan = process.argv.includes('--lan') || pwaAddress !== undefined;
const port = Number(process.env.NEXDECK_PORT || 3000);
const obsPort = Number(process.env.NEXDECK_OBS_PORT || 4455);
const tlsCert = process.env.NEXDECK_TLS_CERT;
const tlsKey = process.env.NEXDECK_TLS_KEY;
if (Boolean(tlsCert) !== Boolean(tlsKey)) {
  throw new Error('Informe NEXDECK_TLS_CERT e NEXDECK_TLS_KEY juntos.');
}
if (pwaAddress !== undefined && tlsCert) throw new Error('Use --pwa sem NEXDECK_TLS_CERT e NEXDECK_TLS_KEY.');
const scheme = tlsCert ? 'https://' : 'http://';
const pwaPort = Number(process.env.NEXDECK_PWA_PORT || 3443);
const desktopHost = new URL(scheme + '127.0.0.1:' + port).host;
const token = randomBytes(24).toString('base64url');
const obs = new OBSWebSocket();
let connected = false;
let obsVersions;
let connecting = false;
let lastError = '';
let password = process.env.NEXDECK_OBS_PASSWORD || '';
let pendingCommand = false;
let stateRequest;
let cachedState;
let sampledAt = 0;

function privateIPv4(ip) {
  const [first, second] = ip.split('.').map(Number);
  return first === 10 || (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
}

const lanInterfaces = lan ? Object.values(networkInterfaces()).flat()
  .filter((entry) => entry.family === 'IPv4' && !entry.internal && privateIPv4(entry.address) && entry.cidr) : [];
const lanAddresses = lanInterfaces.map(({ address }) => address);
const subnets = new Map(lanInterfaces.map(({ address, cidr }) => {
  const subnet = new BlockList();
  subnet.addSubnet(address, Number(cidr.split('/')[1]), 'ipv4');
  return [address, subnet];
}));
if (pwaAddress !== undefined && !lanAddresses.includes(pwaAddress)) {
  throw new Error('O endereço de --pwa precisa estar ativo neste computador.');
}
const pwaDirectory = pwaAddress && join(pwaRoot, pwaAddress);
const lanUrls = pwaDirectory ? [new URL('https://' + pwaAddress + ':' + pwaPort)] :
  lanAddresses.map((ip) => new URL(scheme + ip + ':' + port));
const allowedHosts = new Set([desktopHost, ...lanUrls.map((url) => url.host)]);
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/manifest.json', ['manifest.json', 'application/manifest+json']],
  ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8']],
  ['/icon.svg', ['icon.svg', 'image/svg+xml']],
  ['/icon-192.png', ['icon-192.png', 'image/png']],
  ['/icon-512.png', ['icon-512.png', 'image/png']],
]);

obs.on('ConnectionClosed', () => {
  connected = false;
  cachedState = undefined;
});

async function connect() {
  if (connecting) throw new HttpError(409, 'Já estamos conectando ao OBS.');
  connecting = true;
  connected = false;
  cachedState = undefined;
  try {
    await obs.disconnect();
    await obs.connect('ws://127.0.0.1:' + obsPort, password, { eventSubscriptions: 0 });
    const versions = await obs.call('GetVersion').catch(() => null);
    obsVersions = versions && { obsVersion: versions.obsVersion, obsWebSocketVersion: versions.obsWebSocketVersion };
    connected = true;
    lastError = '';
  } catch {
    lastError = 'Não foi possível conectar ao OBS. Confira se ele está aberto, se o servidor WebSocket está habilitado e se a porta e a senha estão corretas.';
  } finally {
    connecting = false;
  }
}

async function getState() {
  if (!connected) return { connected, connecting, error: lastError };
  if (stateRequest) return stateRequest;
  if (cachedState && Date.now() - sampledAt < 1000) return cachedState;
  stateRequest = (async () => {
    const [scene, inputs, record, stream, replay] = await Promise.all([
      obs.call('GetSceneList'), obs.call('GetInputList'), obs.call('GetRecordStatus'),
      obs.call('GetStreamStatus'), obs.call('GetReplayBufferStatus').catch(() => null),
    ]);
    const audio = await Promise.all(inputs.inputs.map(async ({ inputName }) => {
      try {
        const { inputMuted } = await obs.call('GetInputMute', { inputName });
        return { name: inputName, muted: inputMuted };
      } catch {
        return null;
      }
    }));
    cachedState = {
      ...obsVersions, connected, currentScene: scene.currentProgramSceneName,
      scenes: scene.scenes.map(({ sceneName }) => sceneName),
      audio: audio.filter(Boolean), recording: record.outputActive,
      streaming: stream.outputActive, replay: replay?.outputActive ?? false,
    };
    sampledAt = Date.now();
    return cachedState;
  })().finally(() => { stateRequest = undefined; });
  return stateRequest;
}

const outputActions = new Map([
  ['record', ['GetRecordStatus', 'StartRecord', 'StopRecord']],
  ['stream', ['GetStreamStatus', 'StartStream', 'StopStream']],
]);

async function command({ action, name, enabled }) {
  if (!connected) throw new HttpError(409, 'Conecte ao OBS no painel do computador.');
  if (pendingCommand || connecting) throw new HttpError(409, 'Aguarde o comando atual terminar.');
  pendingCommand = true;
  try {
    if (action === 'scene' && typeof name === 'string') {
      await obs.call('SetCurrentProgramScene', { sceneName: name });
    } else if (action === 'mute' && typeof name === 'string' && typeof enabled === 'boolean') {
      await obs.call('SetInputMute', { inputName: name, inputMuted: enabled });
    } else if (outputActions.has(action) && typeof enabled === 'boolean') {
      const [status, start, stop] = outputActions.get(action);
      const { outputActive } = await obs.call(status);
      if (outputActive !== enabled) await obs.call(enabled ? start : stop);
    } else if (action === 'replay') {
      await obs.call('SaveReplayBuffer');
    } else {
      throw new HttpError(400, 'Ação inválida.');
    }
  } finally {
    if (stateRequest) await stateRequest.catch(() => {});
    cachedState = undefined;
    pendingCommand = false;
  }
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function authorized(request) {
  const actual = Buffer.from(request.headers.authorization || '');
  const expected = Buffer.from('Bearer ' + token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function body(request) {
  if (request.headers['content-type'] !== 'application/json') throw new HttpError(415, 'Envie JSON.');
  let content = '';
  for await (const chunk of request) {
    content += chunk;
    if (Buffer.byteLength(content) > 8192) throw new HttpError(413, 'Solicitação muito grande.');
  }
  try {
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    return parsed;
  } catch {
    throw new HttpError(400, 'Dados inválidos.');
  }
}

async function handleRequest(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy',
    "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
  function json(status, data) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(data));
  }
  try {
    const host = request.headers.host;
    const remote = request.socket.remoteAddress;
    const requestScheme = request.socket.encrypted ? 'https://' : 'http://';
    const desktop = host === desktopHost && remote === '127.0.0.1' && requestScheme === scheme;
    const remoteAllowed = privateIPv4(remote || '') && lanUrls.some((url) =>
      url.origin === requestScheme + host && subnets.get(url.hostname)?.check(remote, 'ipv4'));
    if (!allowedHosts.has(host) || (!desktop && !remoteAllowed)) {
      throw new HttpError(403, 'Endereço fora da rede configurada.');
    }
    const path = new URL(request.url, 'http://127.0.0.1').pathname;
    if (request.headers.origin && request.headers.origin !== requestScheme + host) {
      throw new HttpError(403, 'Origem inválida.');
    }
    if (request.method === 'GET' && assets.has(path)) {
      const [file, type] = assets.get(path);
      const data = await readFile(new URL('./public/' + file, import.meta.url));
      response.writeHead(200, { 'Content-Type': type });
      response.end(data);
    } else if (request.method === 'GET' && path === '/fa-solid-900.woff2') {
      const font = join(dependencyDirectory, 'node_modules', '@fortawesome', 'fontawesome-free', 'webfonts', 'fa-solid-900.woff2');
      const data = await readFile(font);
      response.writeHead(200, { 'Content-Type': 'font/woff2' });
      response.end(data);
    } else if (request.method === 'GET' && path === '/pwa-ca.cer' && pwaDirectory && desktop) {
      const certificate = await readFile(join(pwaDirectory, 'ca.cer'));
      response.writeHead(200, { 'Content-Type': 'application/pkix-cert', 'Content-Disposition': 'attachment; filename=NexDeck-CA.cer' });
      response.end(certificate);
    } else if (request.method === 'GET' && path === '/api/bootstrap') {
      if (!desktop) throw new HttpError(403, 'Abra o QR de pareamento no computador.');
      json(200, { token, addresses: lanUrls.map((url) => url.origin), pwa: Boolean(pwaDirectory) });
    } else if (path.startsWith('/api/')) {
      if (!authorized(request)) throw new HttpError(401, 'Abra novamente o link de pareamento.');
      if (request.method === 'GET' && path === '/api/state') {
        json(200, await getState());
      } else if (request.method === 'GET' && path === '/api/pair') {
        if (!desktop) throw new HttpError(403, 'O pareamento está disponível no computador.');
        const address = new URL(request.url, 'http://127.0.0.1').searchParams.get('address');
        if (!lanUrls.some((url) => url.origin === address)) {
          throw new HttpError(400, 'Selecione um endereço da rede local.');
        }
        const url = address + '/#' + token;
        json(200, { url, qr: await QRCode.toDataURL(url, { width: 240, margin: 2 }) });
      } else if (request.method === 'POST' && path === '/api/connect') {
        if (!desktop) throw new HttpError(403, 'Configure o OBS pelo painel do computador.');
        const settings = await body(request);
        if (typeof settings.password !== 'string' || settings.password.length > 256) {
          throw new HttpError(400, 'Senha inválida.');
        }
        if (connecting || pendingCommand) throw new HttpError(409, 'Aguarde a operação atual.');
        password = settings.password;
        await connect();
        json(200, { connected, error: lastError });
      } else if (request.method === 'POST' && path === '/api/command') {
        await command(await body(request));
        json(200, { ok: true });
      } else {
        throw new HttpError(404, 'Rota não encontrada.');
      }
    } else {
      throw new HttpError(404, 'Página não encontrada.');
    }
  } catch (error) {
    if (!response.destroyed) {
      json(error.status || 502, { error: error.status ? error.message :
        'O OBS não concluiu a solicitação. Confira o estado no painel e tente novamente.' });
    }
  }
}

const server = tlsCert ? createHttpsServer({
  cert: await readFile(tlsCert),
  key: await readFile(tlsKey),
}, handleRequest) : createHttpServer(handleRequest);

if (pwaDirectory) {
  const mobile = createHttpsServer({
    cert: await readFile(join(pwaDirectory, 'server.pem')),
    key: await readFile(join(pwaDirectory, 'server.key')),
  }, handleRequest);
  await once(mobile.listen(pwaPort, pwaAddress), 'listening');
}
await once(server.listen(port, lan && !pwaDirectory ? '0.0.0.0' : '127.0.0.1'), 'listening');
console.log('NexDeck: ' + scheme + desktopHost);
if (pwaDirectory) console.log('PWA: ' + lanUrls[0].origin);
if (lan && !lanAddresses.length) console.log('Nenhum endereço IPv4 privado encontrado.');
void connect();
