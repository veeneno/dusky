'use strict';
// `npm start`: sobe o servidor do dusky e, junto, o túnel do Cloudflare.
//
// Padrão: túnel RÁPIDO — não precisa de conta nem domínio. O Cloudflare dá um endereço aleatório
// (https://<palavras>.trycloudflare.com) que aparece em destaque aqui no terminal e fica salvo em
// tunnel-url.txt. Ele MUDA toda vez que isto reinicia: aí o app desktop dos amigos avisa que não
// conectou e pede o endereço novo.
//
// Túnel nomeado (endereço fixo, precisa de domínio no Cloudflare): CLOUDFLARE_TUNNEL_MODE=nomeado no
// .env, mais uma das duas:
//   CLOUDFLARE_TUNNEL_TOKEN=...   token do túnel (Zero Trust > Networks > Tunnels > seu túnel > token)
//   CLOUDFLARE_TUNNEL_NAME=...    nome de um túnel criado com `cloudflared tunnel create` (usa ~/.cloudflared)
// Sem o cloudflared instalado, sobe só o servidor (e avisa). Só o servidor de propósito: `npm run start:local`.

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');

function readEnvFile() {
  const out = {};
  try {
    for (const line of fs.readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  } catch (_) { /* sem .env */ }
  return out;
}

const env = { ...readEnvFile(), ...process.env };

function findCloudflared() {
  const names = process.platform === 'win32' ? ['cloudflared.exe'] : ['cloudflared'];
  const dirs = (process.env.PATH || '').split(path.delimiter).concat([path.join(os.homedir(), '.local', 'bin'), '/usr/local/bin']);
  for (const d of dirs) for (const n of names) {
    const p = path.join(d, n);
    if (d && fs.existsSync(p)) return p;
  }
  return null;
}

const children = [];
let shuttingDown = false;

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) { try { c.kill('SIGTERM'); } catch (_) { /* já saiu */ } }
  setTimeout(() => process.exit(code), 500);
}

const server = spawn(process.execPath, [path.join(root, 'server', 'index.js')], { cwd: root, stdio: 'inherit' });
children.push(server);
server.on('exit', (code) => {
  console.log(`[start] servidor encerrou (código ${code})`);
  shutdown(code || 0);
});

const token = env.CLOUDFLARE_TUNNEL_TOKEN;
const tunnelName = env.CLOUDFLARE_TUNNEL_NAME;
// "rapido" (padrão): túnel rápido, sem conta nem domínio — endereço aleatório *.trycloudflare.com
// "nomeado": o túnel antigo (CLOUDFLARE_TUNNEL_TOKEN/NAME), que precisa de um domínio no Cloudflare
const mode = /^(nomeado|named)$/i.test(env.CLOUDFLARE_TUNNEL_MODE || '') ? 'named' : 'quick';
const port = env.PORT || '3000';
const bin = findCloudflared();
// endereço fixo do túnel nomeado (só pra mostrar no terminal), ex: dusky.veneno.space. Aceita
// vários separados por vírgula (ex: "dusky.veneno.space,didiscord.veneno.space" — o mesmo túnel
// atende todos os endereços que tiverem rota DNS pra ele)
const hostnames = (env.CLOUDFLARE_TUNNEL_HOSTNAME || '').split(',')
  .map((h) => h.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
const URL_FILE = path.join(root, 'tunnel-url.txt');

function announce(url) {
  try { fs.writeFileSync(URL_FILE, url + '\n'); } catch (_) { /* só informativo */ }
  const line = '='.repeat(Math.max(60, url.length + 8));
  console.log(`\n${line}\n  endereço do dusky (manda pros amigos colarem no app):\n\n    ${url}\n\n  muda toda vez que o npm start reinicia — também salvo em tunnel-url.txt\n${line}\n`);
}

if (!bin) {
  console.warn('[start] túnel do Cloudflare NÃO iniciado: cloudflared não encontrado (instale ou coloque em ~/.local/bin).');
} else if (mode === 'named' && !token && !tunnelName) {
  console.warn('[start] túnel do Cloudflare NÃO iniciado: CLOUDFLARE_TUNNEL_MODE=nomeado mas sem CLOUDFLARE_TUNNEL_TOKEN/NAME no .env.');
} else {
  let args;
  if (mode === 'quick') {
    // sem o config.yml do túnel nomeado atrapalhando (ele pode apontar pra outro serviço)
    args = ['tunnel', '--no-autoupdate', '--config', process.platform === 'win32' ? 'NUL' : '/dev/null', '--url', `http://localhost:${port}`];
  } else if (token) {
    args = ['tunnel', '--no-autoupdate', 'run', '--token', token];
  } else {
    args = ['tunnel', '--no-autoupdate', 'run', '--url', `http://localhost:${port}`, tunnelName];
  }
  const tunnel = spawn(bin, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(tunnel);
  console.log(`[start] túnel do Cloudflare (${mode === 'quick' ? 'rápido' : 'nomeado'}) iniciando…`);
  let announced = false;
  const onOutput = (chunk) => {
    const text = String(chunk);
    // o --config vazio (de propósito) gera um aviso inofensivo — não polui o terminal com ele
    const shown = text.split('\n').filter((l) => l && !/Configuration file .* was empty/.test(l));
    if (shown.length) process.stderr.write(shown.map((l) => '[cloudflared] ' + l).join('\n') + '\n');
    if (mode === 'quick' && !announced) {
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (m) { announced = true; announce(m[0]); }
    }
    // túnel nomeado: avisa quando a primeira conexão com o Cloudflare subiu
    if (mode === 'named' && !announced && /Registered tunnel connection/i.test(text)) {
      announced = true;
      if (hostnames.length) console.log(`\n[start] túnel no ar: ${hostnames.map((h) => 'https://' + h).join('  e  ')}\n`);
    }
  };
  tunnel.stdout.on('data', onOutput);
  tunnel.stderr.on('data', onOutput);
  tunnel.on('exit', (code) => {
    if (!shuttingDown) console.warn(`[start] cloudflared encerrou (código ${code}); o servidor segue rodando só local.`);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
