// "Site de teste" (server/siteTestes.js): com o cookie, html/js/css saem da pasta da branch testes;
// sem ele, ou sem a pasta, tudo continua igual. HTTP real com pastas temporárias.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const siteTestes = require('../server/siteTestes');

let tmp, server, base, st;
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dusky-site-testes-'));
  const main = path.join(tmp, 'dusky', 'public');
  const testes = path.join(tmp, 'dusky-testes', 'public');
  write(path.join(main, 'app.html'), 'main');
  write(path.join(main, 'js', 'so-main.js'), 'so na main');
  write(path.join(main, 'vendor', 'lib.js'), 'vendor da main');
  write(path.join(testes, 'app.html'), 'testes');
  write(path.join(testes, 'vendor', 'lib.js'), 'vendor da testes');
  // worktree: .git é um arquivo, a ref fica na pasta comum
  const common = path.join(tmp, 'dusky', '.git');
  const wt = path.join(common, 'worktrees', 'dusky-testes');
  write(path.join(tmp, 'dusky-testes', '.git'), `gitdir: ${wt}\n`);
  write(path.join(wt, 'HEAD'), 'ref: refs/heads/testes\n');
  write(path.join(wt, 'commondir'), '../..\n');
  write(path.join(common, 'refs', 'heads', 'testes'), '919c6912345678901234567890123456789abcd\n');

  st = siteTestes.create({ dir: testes, mainDir: main });
  const opts = { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') };
  const app = express();
  app.use(st.router);
  app.use(st.staticMiddleware(opts));
  app.use(express.static(main, opts));
  server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  await new Promise((r) => server.close(r));
  fs.rmSync(tmp, { recursive: true, force: true });
});
const COOKIE = { cookie: 'outro=1; dusky_site=testes' };
const get = (p, headers = {}) => fetch(base + p, { headers, redirect: 'manual' });

test('sem o cookie: site normal, e a chave diz que dá pra ligar', async () => {
  assert.equal(await (await get('/app.html')).text(), 'main');
  const info = await (await get('/api/site-testes')).json();
  assert.deepEqual(info, { available: true, on: false, commit: '919c691' });
});

test('ligar e desligar mexem só no cookie', async () => {
  const on = await fetch(base + '/api/site-testes', { method: 'PUT' });
  assert.equal(on.status, 200);
  const set = on.headers.get('set-cookie');
  assert.match(set, /^dusky_site=testes;/);
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Lax/);
  const off = await fetch(base + '/api/site-testes', { method: 'DELETE', headers: COOKIE });
  assert.match(off.headers.get('set-cookie'), /^dusky_site=;.*Expires=Thu, 01 Jan 1970/);
  assert.equal((await (await get('/api/site-testes', COOKIE)).json()).on, true);
});

test('com o cookie: arquivo da branch, privado; o que falta lá e vendor/ vêm da main', async () => {
  const page = await get('/app.html', COOKIE);
  assert.equal(await page.text(), 'testes');
  assert.equal(page.headers.get('cache-control'), 'private, no-cache');
  assert.equal(await (await get('/js/so-main.js', COOKIE)).text(), 'so na main');
  assert.equal(await (await get('/vendor/lib.js', COOKIE)).text(), 'vendor da main');
  // cookie com outro valor não liga nada
  assert.equal(await (await get('/app.html', { cookie: 'dusky_site=outra' })).text(), 'main');
});

test('/site-teste/sair desliga e volta pro app', async () => {
  const r = await get('/site-teste/sair', COOKIE);
  assert.equal(r.status, 302);
  assert.equal(r.headers.get('location'), '/app.html');
  assert.match(r.headers.get('set-cookie'), /^dusky_site=;/);
});

test('sem a pasta da branch: a chave some e o cookie não muda nada', async () => {
  const gone = siteTestes.create({ dir: path.join(tmp, 'nao-existe'), mainDir: path.join(tmp, 'dusky', 'public') });
  const app = express();
  app.use(gone.router);
  app.use(gone.staticMiddleware());
  app.use(express.static(path.join(tmp, 'dusky', 'public')));
  const s = app.listen(0, '127.0.0.1'); await new Promise((r) => s.once('listening', r));
  const b = 'http://127.0.0.1:' + s.address().port;
  try {
    assert.deepEqual(await (await fetch(b + '/api/site-testes', { headers: COOKIE })).json(), { available: false, on: false, commit: null });
    assert.equal((await fetch(b + '/api/site-testes', { method: 'PUT' })).status, 404);
    assert.equal(await (await fetch(b + '/app.html', { headers: COOKIE })).text(), 'main');
  } finally {
    await new Promise((r) => s.close(r));
  }
});

test('a pasta da branch nunca é a própria pasta do site', async () => {
  const main = path.join(tmp, 'dusky', 'public');
  assert.equal(siteTestes.create({ dir: main, mainDir: main }).available(), false);
});
