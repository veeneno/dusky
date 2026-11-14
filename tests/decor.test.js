// decorações do perfil (server/decor.js)
const test = require('node:test');
const assert = require('node:assert');
const { cleanDecor, isDecorUpload } = require('../server/decor');

const IMG = '/uploads/decor/0123456789abcdef0123456789abcdef.gif';

test('modelo válido passa; nada limpa', () => {
  assert.deepStrictEqual(cleanDecor('nameplate', 'preset:aurora', null), { value: 'preset:aurora' });
  assert.deepStrictEqual(cleanDecor('avatar_deco', 'preset:anel-rgb', null), { value: 'preset:anel-rgb' });
  assert.deepStrictEqual(cleanDecor('profile_fx', null, IMG), { value: null });
  assert.deepStrictEqual(cleanDecor('profile_fx', '', null), { value: null });
});

test('imagem enviada só continua se for a mesma que já está', () => {
  assert.deepStrictEqual(cleanDecor('nameplate', IMG, IMG), { value: IMG });
  assert.throws(() => cleanDecor('nameplate', IMG, null), /decoração inválida/);
  assert.throws(() => cleanDecor('nameplate', '/uploads/decor/ffffffffffffffffffffffffffffffff.gif', IMG), /decoração inválida/);
});

test('recusa modelo de outra decoração, slot inválido e lixo', () => {
  assert.throws(() => cleanDecor('nameplate', 'preset:neve', null), /modelo de decoração inválido/);
  assert.throws(() => cleanDecor('banner', 'preset:aurora', null), /decoração inválida/);
  assert.throws(() => cleanDecor('nameplate', 'https://evil.example/x.gif', null), /decoração inválida/);
  assert.throws(() => cleanDecor('nameplate', { preset: 'aurora' }, null), /decoração inválida/);
});

test('caminho de imagem: só o formato que o upload gera', () => {
  assert.ok(isDecorUpload(IMG));
  assert.ok(!isDecorUpload('/uploads/decor/../avatars/x.gif'));
  assert.ok(!isDecorUpload('/uploads/decor/0123456789abcdef0123456789abcdef.svg'));
  assert.ok(!isDecorUpload("/uploads/decor/0123456789abcdef0123456789abcdef.gif');x"));
});
