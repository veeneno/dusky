const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const catalog = require('../public/decor/catalog.json');
const { cleanDecor, isDecorUpload } = require('../server/decor');
const MEDIA = /^\/decor\/media\/[a-f0-9]{64}\.(png|webp|webm)$/;

test('todo item do catálogo salva somente no slot correto; nunca vira upload removível', () => {
  const ids = new Set();
  for (const item of catalog.items) {
    assert.ok(!ids.has(item.id), `ID repetido: ${item.id}`); ids.add(item.id);
    const value = 'catalog:' + item.id;
    assert.deepEqual(cleanDecor(item.slot, value, null), { value });
    assert.equal(isDecorUpload(value), false);
    for (const slot of ['avatar_deco', 'nameplate', 'profile_fx']) {
      if (slot !== item.slot) assert.throws(() => cleanDecor(slot, value, null));
    }
  }
  for (const value of ['catalog:missing', 'catalog:../x', 'catalog:__proto__', 'catalog:<script>']) {
    assert.throws(() => cleanDecor('avatar_deco', value, value));
  }
});

test('catálogo atual completo, arquivo histórico incluído e todas as URLs são locais', () => {
  const expected = { avatar_deco: 698, nameplate: 300, profile_fx: 368 };
  const media = new Set();
  for (const [slot, count] of Object.entries(expected)) {
    assert.equal(catalog.items.filter(e => e.slot === slot && e.source === 'catalog').length, count);
  }
  assert.ok(catalog.items.some(e => e.source === 'archive'));
  for (const e of catalog.items) {
    for (const value of [e.preview, e.image, e.video].filter(Boolean)) { assert.match(value, MEDIA); media.add(value); }
    if (e.slot === 'profile_fx') {
      assert.ok(e.layers.length);
      for (const layer of e.layers) {
        assert.ok(Number.isFinite(layer.duration) && layer.duration > 0, e.id);
        for (const key of ['start', 'loopDelay']) assert.ok(Number.isFinite(layer[key]) && layer[key] >= 0, e.id);
        for (const url of [layer.src, ...layer.variants]) { assert.match(url, MEDIA); media.add(url); }
      }
    }
  }
  // Ative no servidor após importar as mídias; CI sem o acervo ainda valida o esquema acima.
  if (process.env.DUSKY_VERIFY_DECOR_MEDIA === '1') {
    for (const url of media) assert.ok(fs.existsSync(path.join(__dirname, '../public', url)), `mídia ausente: ${url}`);
  }
});
