// efeito no nome do perfil (server/nameStyle.js)
const test = require('node:test');
const assert = require('node:assert');
const { cleanNameStyle } = require('../server/nameStyle');

test('efeito válido vira JSON com as cores em minúsculo', () => {
  assert.strictEqual(cleanNameStyle({ effect: 'neon', c1: '#FF00AA', c2: '#00ffcc' }), '{"effect":"neon","c1":"#ff00aa","c2":"#00ffcc"}');
  assert.strictEqual(cleanNameStyle({ effect: 'led' }), '{"effect":"led"}');
});

test('sem efeito limpa', () => {
  assert.strictEqual(cleanNameStyle(null), null);
  assert.strictEqual(cleanNameStyle(''), null);
  assert.strictEqual(cleanNameStyle({ effect: '' }), null);
});

test('recusa efeito desconhecido, cor inválida e lixo', () => {
  assert.throws(() => cleanNameStyle({ effect: 'explosao' }), /efeito do nome inválido/);
  assert.throws(() => cleanNameStyle({ effect: 'neon', c1: 'red' }), /cor do efeito inválida/);
  assert.throws(() => cleanNameStyle({ effect: 'neon', c1: '#fff;background:url(x)' }), /cor do efeito inválida/);
  assert.throws(() => cleanNameStyle({ effect: 'neon', c1: ['#ffffff'] }), /cor do efeito inválida/);
  assert.throws(() => cleanNameStyle('neon'), /efeito do nome inválido/);
  assert.throws(() => cleanNameStyle([]), /efeito do nome inválido/);
});

test('campos extras não passam', () => {
  assert.strictEqual(cleanNameStyle({ effect: 'pulso', c1: '#112233', evil: '<script>' }), '{"effect":"pulso","c1":"#112233"}');
});
