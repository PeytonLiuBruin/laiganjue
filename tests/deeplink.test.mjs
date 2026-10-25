import test from 'node:test';
import assert from 'node:assert/strict';
import { routeFromUrl } from '../src/ui/deeplink.js';

const MODS = { qian: {}, tarot: {} };

test('深链：付费卡、玩法页、首页', () => {
  assert.deepEqual(routeFromUrl('laiganjue://pro', MODS), { paywall: true });
  assert.deepEqual(routeFromUrl('laiganjue://pro/?from=widget', MODS), { paywall: true });
  assert.deepEqual(routeFromUrl('laiganjue://m/qian', MODS), { hash: '#/m/qian' });
  assert.deepEqual(routeFromUrl('LAIGANJUE://m/tarot#x', MODS), { hash: '#/m/tarot' });
  assert.deepEqual(routeFromUrl('laiganjue://', MODS), { hash: '#/' });
});

test('深链：付费皮肤单买卡只认列出的皮肤', () => {
  const SKINS = ['cinnabar', 'nebula', 'celadon'];
  assert.deepEqual(routeFromUrl('laiganjue://skin/nebula', MODS, SKINS), { skin: 'nebula' });
  assert.deepEqual(routeFromUrl('laiganjue://skin/Celadon/', MODS, SKINS), { skin: 'celadon' });
  assert.equal(routeFromUrl('laiganjue://skin/paper', MODS, SKINS), null, '免费皮肤不出购买卡');
  assert.equal(routeFromUrl('laiganjue://skin/nebula', MODS), null, '没传皮肤表时不认');
});

test('深链：不认识的链接不做任何事', () => {
  assert.equal(routeFromUrl('laiganjue://m/nope', MODS), null, '不存在的玩法');
  assert.equal(routeFromUrl('laiganjue://m/constructor', MODS), null, '原型链上的名字不算玩法');
  assert.equal(routeFromUrl('https://example.com/pro', MODS), null, '别的协议');
  assert.equal(routeFromUrl('laiganjue://settings/reset', MODS), null);
  assert.equal(routeFromUrl(undefined, MODS), null);
});
