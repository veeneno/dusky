// Últimas linhas de log do servidor, em memória, pro painel de admin (página /admin → logs).
// Fica no lugar do console: tudo que o servidor escreve continua indo pro terminal/journal como
// antes e uma cópia vai pra cá (até MAX linhas; as mais velhas saem). Reiniciar zera.
const util = require('util');

const MAX = 3000;
const lines = []; // { seq, at, level, text }
let seq = 0;

function push(level, args) {
  let text = util.format(...args);
  if (text.length > 4000) text = text.slice(0, 4000) + '…';
  lines.push({ seq: ++seq, at: new Date().toISOString(), level, text });
  if (lines.length > MAX) lines.splice(0, lines.length - MAX);
}

let installed = false;
function install() {
  if (installed) return;
  installed = true;
  for (const [method, level] of [['log', 'info'], ['info', 'info'], ['warn', 'warn'], ['error', 'error']]) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      try { push(level, args); } catch (_) { /* log nunca derruba nada */ }
      original(...args);
    };
  }
  process.on('uncaughtExceptionMonitor', (err) => push('error', ['[erro não tratado]', err && err.stack ? err.stack : err]));
}

// after = só as linhas depois desse número; level = info|warn|error (e acima); q = texto
function entries({ after = 0, level = '', q = '', limit = 500 } = {}) {
  const rank = { info: 0, warn: 1, error: 2 };
  const min = rank[level] ?? 0;
  const needle = String(q || '').toLowerCase();
  const out = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    const l = lines[i];
    if (l.seq <= after) break;
    if (rank[l.level] < min) continue;
    if (needle && !l.text.toLowerCase().includes(needle)) continue;
    out.push(l);
  }
  return { lines: out.reverse(), last: seq };
}

function counts(sinceMs) {
  const since = Date.now() - sinceMs;
  const c = { info: 0, warn: 0, error: 0 };
  for (let i = lines.length - 1; i >= 0; i--) {
    if (Date.parse(lines[i].at) < since) break;
    c[lines[i].level]++;
  }
  return c;
}

module.exports = { install, entries, counts };
