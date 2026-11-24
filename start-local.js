import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isIPv4 } from 'node:net';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { dependencyDirectory, dependencyManifest } from './dependency-path.js';

const dependencyFiles = [
  join(dependencyDirectory, 'node_modules', 'obs-websocket-js', 'package.json'),
  join(dependencyDirectory, 'node_modules', 'qrcode', 'package.json'),
  join(dependencyDirectory, 'node_modules', 'jsqr', 'dist', 'jsQR.js'),
  join(dependencyDirectory, 'node_modules', '@fortawesome', 'fontawesome-free', 'webfonts', 'fa-solid-900.woff2'),
];

function dependenciesReady() {
  const localLock = join(dependencyDirectory, 'package-lock.json');
  return existsSync(dependencyManifest) && existsSync(localLock) &&
    readFileSync(localLock).equals(readFileSync(new URL('./package-lock.json', import.meta.url))) &&
    dependencyFiles.every((path) => existsSync(path));
}

function serverOptions() {
  const explicitPwa = process.argv.find((arg) => arg.startsWith('--pwa='));
  const basicOptions = { mode: explicitPwa || '--lan', env: process.env };
  const root = join(dependencyDirectory, '..');
  const profile = join(root, 'duckdns.json');
  if (explicitPwa || process.argv.includes('--lan') || process.env.NEXDECK_TLS_CERT || process.env.NEXDECK_TLS_KEY || !existsSync(profile)) {
    return basicOptions;
  }
  const { hostname, address } = JSON.parse(readFileSync(profile, 'utf8'));
  if (typeof hostname !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.duckdns\.org$/.test(hostname) ||
      typeof address !== 'string' || !isIPv4(address)) {
    throw new Error('A configuração local do DuckDNS não contém um nome e IP válidos.');
  }
  const certs = join(root, 'acme', 'certificates');
  const cert = join(certs, hostname + '.crt');
  const key = join(certs, hostname + '.key');
  if (!existsSync(cert) || !existsSync(key)) {
    throw new Error('Certificado do DuckDNS não encontrado. Execute prepare-duckdns.ps1 novamente.');
  }
  return {
    mode: '--pwa=' + address,
    env: { ...process.env, NEXDECK_PWA_HOST: hostname, NEXDECK_TLS_CERT: cert, NEXDECK_TLS_KEY: key },
  };
}

if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('O NexDeck precisa do Node.js 22 ou mais recente. Instale a versão LTS em https://nodejs.org/.');
  process.exitCode = 1;
} else {
  if (!dependenciesReady()) {
    console.log('Preparando o NexDeck pela primeira vez. Aguarde a instalação das dependências...');
    const setup = spawnSync(process.execPath, ['setup.js'], { stdio: 'inherit' });
    if (setup.status !== 0) {
      console.error('Não foi possível preparar o NexDeck. Confira a conexão à internet e tente novamente.');
      process.exitCode = setup.status ?? 1;
    }
  }

  let options;
  if (!process.exitCode) {
    try { options = serverOptions(); }
    catch (error) {
      console.error('Não foi possível carregar a configuração do NexDeck:', error.message);
      process.exitCode = 1;
    }
  }

  if (options) {
    const server = spawn(process.execPath, ['server.js', options.mode], {
      env: options.env,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const logs = createInterface({ input: server.stdout });
    logs.on('line', (line) => {
      console.log(line);
      if (!line.startsWith('NexDeck: ')) return;
      console.log('Deixe esta janela aberta enquanto usa o NexDeck. Ctrl+C encerra o painel.');
      if (!process.argv.includes('--no-browser') && process.platform === 'win32') {
        const browser = spawn('explorer.exe', [line.slice('NexDeck: '.length)], { stdio: 'ignore' });
        browser.on('error', () => console.log('Abra o endereço acima no navegador.'));
      }
    });
    server.on('error', (error) => {
      console.error('Não foi possível iniciar o servidor:', error.message);
      process.exitCode = 1;
    });
    server.on('close', (code) => { process.exitCode = code ?? 0; });
    process.on('SIGINT', () => server.kill());
    process.on('SIGTERM', () => server.kill());
  }
}
