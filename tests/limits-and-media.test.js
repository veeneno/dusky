// Limites de anexo por conta, limite de frequência, fila de processos e a porta de entrada da
// mídia (LiveKit): só entra na sala quem está na call do site.
process.env.DUSKY_DB_PATH = ':memory:';
process.env.UPLOAD_MAX_MB = '100';
process.env.UPLOAD_QUOTA_MB = '5120';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../server/db');
const uploadLimits = require('../server/uploadLimits');
const limits = require('../server/limits');
const sfu = require('../server/sfu/livekit');

db.prepare("INSERT INTO users(id,username,password_hash,is_site_admin) VALUES(901,'lim-admin','x',1),(902,'lim-comum','x',0)").run();
after(() => db.close());

test('limite padrão é 100 MB por arquivo; admin do site não tem limite', () => {
  const comum = uploadLimits.limitsFor(902);
  assert.equal(comum.unlimited, false);
  assert.equal(comum.maxMB, 100);
  assert.equal(comum.maxBytes, 100 * 1024 * 1024);
  assert.equal(comum.quotaMB, 5120);
  const admin = uploadLimits.limitsFor(901);
  assert.equal(admin.unlimited, true);
  assert.equal(admin.maxBytes, Infinity);
  // mesmo com valor gravado, o admin continua sem limite
  db.prepare('UPDATE users SET upload_max_mb = 1 WHERE id = 901').run();
  assert.equal(uploadLimits.limitsFor(901).unlimited, true);
});

test('limite próprio da conta substitui o padrão e null volta pro padrão', () => {
  db.prepare('UPDATE users SET upload_max_mb = 500, upload_quota_mb = 20480 WHERE id = 902').run();
  let l = uploadLimits.limitsFor(902);
  assert.equal(l.maxMB, 500);
  assert.equal(l.quotaMB, 20480);
  db.prepare('UPDATE users SET upload_max_mb = NULL, upload_quota_mb = NULL WHERE id = 902').run();
  l = uploadLimits.limitsFor(902);
  assert.equal(l.maxMB, 100);
});

test('valores do painel são validados', () => {
  assert.deepEqual(uploadLimits.parseSetting(''), { ok: true, value: null });
  assert.deepEqual(uploadLimits.parseSetting(null), { ok: true, value: null });
  assert.deepEqual(uploadLimits.parseSetting('250'), { ok: true, value: 250 });
  assert.equal(uploadLimits.parseSetting('0').ok, false);
  assert.equal(uploadLimits.parseSetting('-5').ok, false);
  assert.equal(uploadLimits.parseSetting('1.5').ok, false);
  assert.equal(uploadLimits.parseSetting('abc').ok, false);
  assert.equal(uploadLimits.parseSetting(String(uploadLimits.MAX_SETTABLE_MB + 1)).ok, false);
});

test('uso da cota soma só anexos enviados (gif do GIPHY não conta)', () => {
  db.prepare("INSERT INTO servers(id,name,owner_id) VALUES(901,'lim',902)").run();
  db.prepare("INSERT INTO channels(id,name,type,server_id) VALUES(901,'c','text',901)").run();
  db.prepare("INSERT INTO messages(channel_id,user_id,content,attachment_url,attachment_size) VALUES(901,902,'','/uploads/attachments/a.bin',?),(901,902,'','https://media.giphy.com/x.gif',999999999)").run(3 * 1024 * 1024);
  assert.equal(uploadLimits.usedBytes(902), 3 * 1024 * 1024);
});

test('limite de frequência recusa depois do máximo e o admin passa direto', () => {
  for (let i = 0; i < 3; i++) assert.equal(limits.hit('t', 'k', 3, 60000), false);
  assert.equal(limits.hit('t', 'k', 3, 60000), true);
  const mw = limits.perUser('t2', 1, 60000);
  const run = (user) => {
    let status = 200; let passed = false;
    const res = { set() {}, status(s) { status = s; return { json() {} }; } };
    mw({ user, ip: '1.2.3.4' }, res, () => { passed = true; });
    return passed ? 200 : status;
  };
  assert.equal(run({ id: 902, is_site_admin: false }), 200);
  assert.equal(run({ id: 902, is_site_admin: false }), 429);
  assert.equal(run({ id: 901, is_site_admin: true }), 200);
  assert.equal(run({ id: 901, is_site_admin: true }), 200);
});

test('fila de processos roda no máximo N ao mesmo tempo', async () => {
  const slot = limits.semaphore(2, 10);
  let running = 0; let peak = 0;
  const job = () => slot(async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 20)); running--; });
  await Promise.all([job(), job(), job(), job(), job()]);
  assert.equal(peak, 2);
  const full = limits.semaphore(1, 0);
  const hold = full(() => new Promise((r) => setTimeout(r, 30)));
  await assert.rejects(full(async () => {}), /ocupado/);
  await hold;
});

test('mídia: só entra quem está na call (ou acabou de pedir o ingresso)', () => {
  const calls = new Map([[10, 5]]); // conta 10 está na call do canal 5
  sfu.setVoiceLookup((uid) => calls.get(uid) ?? null);
  assert.equal(sfu.mediaAllowed('10', 'canal-5'), true);
  assert.equal(sfu.mediaAllowed('tela-10', 'canal-5'), true);
  assert.equal(sfu.mediaAllowed('ver-10', 'canal-5'), true);
  assert.equal(sfu.mediaAllowed('10', 'canal-6'), false, 'outra call');
  assert.equal(sfu.mediaAllowed('11', 'canal-5'), false, 'não está na call');
  assert.equal(sfu.mediaAllowed('ver-11', 'canal-5'), false, 'assistente oculto sem estar na call');
  assert.equal(sfu.mediaAllowed('lixo', 'canal-5'), false);
  // pediu o ingresso pra entrar: janela curta pro principal e o assistente, nunca pro auxiliar de tela
  assert.equal(sfu.openEntryWindow(11, 5), true);
  assert.equal(sfu.mediaAllowed('11', 'canal-5'), true);
  assert.equal(sfu.mediaAllowed('ver-11', 'canal-5'), true);
  assert.equal(sfu.mediaAllowed('tela-11', 'canal-5'), false);
  // saiu da call / foi expulso: a janela fecha na hora
  sfu.onLeftCall(5, 11);
  assert.equal(sfu.mediaAllowed('11', 'canal-5'), false);
});

test('ingresso: assinatura conferida, validade curta, falsificado recusado', () => {
  const token = sfu.createToken({ room: 'canal-5', identity: 10, name: 'x' });
  const payload = sfu.verifyToken(token);
  assert.ok(payload);
  assert.equal(payload.sub, '10');
  assert.ok(payload.exp - Math.floor(Date.now() / 1000) <= sfu.TOKEN_TTL_SEC);
  assert.ok(sfu.TOKEN_TTL_SEC <= 15 * 60, 'nada de ingresso de 24 h');
  const [h, b, s] = token.split('.');
  const forged = JSON.parse(Buffer.from(b, 'base64url').toString());
  forged.sub = '999';
  assert.equal(sfu.verifyToken(`${h}.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${s}`), null);
  assert.equal(sfu.verifyToken('a.b.c'), null);
});

test("entrar na call e sair antes da janela fechar não pune a conta (bug: caía pra malha)", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const calls = new Map();
  sfu.setVoiceLookup((uid) => calls.get(uid) ?? null);
  assert.equal(sfu.openEntryWindow(20, 23), true); // pediu ingresso do canal 23
  calls.set(20, 23);                                // entrou na call
  calls.delete(20); sfu.onLeftCall(23, 20);         // saiu logo em seguida
  t.mock.timers.tick(31 * 1000);                    // a janela do canal 23 vence
  assert.equal(sfu.openEntryWindow(20, 2), true, "tem que conseguir ingresso pra outra call");
  // quem pega ingresso e NUNCA entra continua barrado por um tempo
  assert.equal(sfu.openEntryWindow(21, 5), true);
  t.mock.timers.tick(31 * 1000);
  assert.equal(sfu.openEntryWindow(21, 5), false);
});
