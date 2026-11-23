import { existsSync, mkdirSync, mkdtempSync, renameSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { pwaRoot } from './dependency-path.js';

const address = process.argv[2];
const interfaces = Object.values(networkInterfaces()).flat();
const local = interfaces.some((entry) => !entry.internal && entry.family === 'IPv4' && entry.address === address);
if (!local || !/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address)) {
  throw new Error('Informe um IPv4 privado deste computador, na rede compartilhada com o celular.');
}

const gitOpenSSL = process.env.ProgramFiles && join(process.env.ProgramFiles, 'Git', 'usr', 'bin', 'openssl.exe');
const openssl = process.env.NEXDECK_OPENSSL || (gitOpenSSL && existsSync(gitOpenSSL) ? gitOpenSSL : 'openssl');
function run(args, cwd, quiet = false) {
  const result = spawnSync(openssl, args, { cwd, windowsHide: true, stdio: quiet ? 'ignore' : ['ignore', 'ignore', 'inherit'] });
  if (result.error) throw new Error('OpenSSL indisponível. Instale o OpenSSL ou defina NEXDECK_OPENSSL.', { cause: result.error });
  if (!quiet && result.status !== 0) throw new Error('O OpenSSL não concluiu a geração do certificado.');
  return result.status === 0;
}

const destination = join(pwaRoot, address);
if (existsSync(destination)) {
  if (!existsSync(join(destination, 'ca.cer')) || !existsSync(join(destination, 'server.key')) ||
      !run(['x509', '-in', 'server.pem', '-noout', '-checkend', '86400'], destination, true)) {
    throw new Error('O certificado existente está incompleto ou vencendo. Mova a pasta do certificado para outro local e prepare um novo.');
  }
} else {
  mkdirSync(pwaRoot, { recursive: true, mode: 0o700 });
  const stage = mkdtempSync(join(pwaRoot, 'new-'));
  const files = ['ca.key', 'ca.pem', 'ca.srl', 'request.csr', 'leaf.cnf', 'server.key', 'server.pem', 'ca.cer'];
  let published = false;
  try {
    writeFileSync(join(stage, 'leaf.cnf'), [
      'basicConstraints=critical,CA:FALSE',
      'keyUsage=critical,digitalSignature,keyEncipherment',
      'extendedKeyUsage=serverAuth',
      'subjectAltName=IP:' + address,
    ].join('\n'));
    run(['req', '-x509', '-newkey', 'rsa:2048', '-noenc', '-days', '365', '-sha256',
      '-subj', '/CN=NexDeck CA ' + address, '-addext', 'basicConstraints=critical,CA:TRUE,pathlen:0',
      '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-keyout', 'ca.key', '-out', 'ca.pem'], stage);
    run(['req', '-new', '-newkey', 'rsa:2048', '-noenc', '-subj', '/CN=' + address,
      '-keyout', 'server.key', '-out', 'request.csr'], stage);
    run(['x509', '-req', '-in', 'request.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial',
      '-days', '365', '-sha256', '-extfile', 'leaf.cnf', '-out', 'server.pem'], stage);
    run(['verify', '-CAfile', 'ca.pem', '-verify_ip', address, '-purpose', 'sslserver', 'server.pem'], stage);
    run(['x509', '-in', 'ca.pem', '-outform', 'DER', '-out', 'ca.cer'], stage);
    for (const path of files.slice(0, 5)) unlinkSync(join(stage, path));
    renameSync(stage, destination);
    published = true;
  } finally {
    if (!published) {
      for (const path of files) {
        if (existsSync(join(stage, path))) unlinkSync(join(stage, path));
      }
      rmdirSync(stage);
    }
  }
}

console.log('Certificado para transferir ao celular: ' + join(destination, 'ca.cer'));
console.log('Inicie com: npm start -- --pwa=' + address);
