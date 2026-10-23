import test from 'node:test';
import assert from 'node:assert/strict';
import { createPurchases, skinsFrom, PRODUCTS } from '../src/platform/purchases.js';
import { canUseTheme, createSkinPreview, FREE_THEMES, skinKey } from '../src/ui/skins.js';

const NOW = Date.parse('2026-10-23T12:00:00Z');
function memStorage(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return { get: (k, d) => (m.has(k) ? JSON.parse(m.get(k)) : d), set: (k, v) => m.set(k, JSON.stringify(v)), remove: (k) => m.delete(k) };
}
function plugin({ purchases = [], purchaseResult = null } = {}) {
  return {
    async getPurchases() { return { purchases }; },
    async getProducts() { return { products: [] }; },
    async purchaseProduct() { return purchaseResult; },
    async restorePurchases() {},
    async addListener() { return { remove() {} }; },
  };
}

test('皮肤产品 ID 与免费皮肤', () => {
  assert.deepEqual(FREE_THEMES, ['paper', 'ink']);
  for (const id of ['cinnabar', 'nebula', 'celadon']) assert.equal(PRODUCTS[skinKey(id)].id, `laiganjue.skin.${id}`);
  assert.deepEqual(skinsFrom([{ productIdentifier: 'laiganjue.skin.nebula' }, { productIdentifier: 'laiganjue.skin.celadon', revocationDate: '2026-10-01' }, { productIdentifier: PRODUCTS.yearly.id }]), ['nebula'], '退款的不算，订阅不是皮肤');
});

test('单买皮肤只解锁这一套，Pro 解锁全部，免费皮肤总能用', async () => {
  const storage = memStorage();
  const iap = createPurchases({ plugin: plugin({ purchaseResult: { productIdentifier: 'laiganjue.skin.nebula', transactionId: 't1' } }), storage, now: () => NOW, os: 'ios' });
  assert.equal(canUseTheme(iap, 'paper'), true);
  assert.equal(canUseTheme(iap, 'nebula'), false);
  const r = await iap.purchase('skin_nebula');
  assert.equal(r.ok, true);
  assert.equal(canUseTheme(iap, 'nebula'), true, '刚买完立即可用（商店列表滞后也不丢）');
  assert.equal(canUseTheme(iap, 'cinnabar'), false);
  assert.equal(iap.pro, false, '皮肤不是 Pro');
  await iap.refresh();
  assert.deepEqual(iap.skins, ['nebula'], '刷新后仍保留刚买的皮肤');
  assert.deepEqual(storage.get('iap.state').skins, ['nebula'], '写入缓存，冷启动可用');

  const pro = createPurchases({ plugin: plugin({ purchases: [{ productIdentifier: PRODUCTS.lifetime.id }] }), storage: memStorage(), now: () => NOW, os: 'ios' });
  await pro.refresh();
  for (const id of ['cinnabar', 'nebula', 'celadon']) assert.equal(canUseTheme(pro, id), true);
});

test('恢复购买找回单套皮肤，订阅到期后付费皮肤不可用', async () => {
  const iap = createPurchases({ plugin: plugin({ purchases: [{ productIdentifier: 'laiganjue.skin.celadon' }] }), storage: memStorage(), now: () => NOW, os: 'ios' });
  await iap.restore();
  assert.equal(canUseTheme(iap, 'celadon'), true);
  const expired = createPurchases({ plugin: plugin(), storage: memStorage({ 'iap.state': { pro: true, plan: 'monthly', until: NOW - 1000 } }), now: () => NOW, os: 'ios' });
  assert.equal(canUseTheme(expired, 'nebula'), false);
});

test('网页版：默认锁住付费皮肤，dev.skins 用于截图脚本预览', () => {
  const storage = memStorage();
  const iap = createPurchases({ plugin: null, storage, now: () => NOW });
  assert.equal(canUseTheme(iap, 'cinnabar'), false);
  storage.set('dev.skins', true);
  assert.equal(canUseTheme(iap, 'cinnabar'), true);
});

test('试穿倒计时：10 秒到点出购买卡，提前结束不再回调', () => {
  const timers = [];
  const setTimer = (fn) => { timers.push(fn); return timers.length; };
  const ticks = [], ends = [];
  const p = createSkinPreview({ seconds: 10, onTick: (n) => ticks.push(n), onEnd: (w) => ends.push(w), setTimer, clearTimer: () => {} });
  for (let i = 0; i < 10; i++) timers[0]();
  assert.deepEqual(ticks, [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual(ends, ['timeout']);
  timers[0]();
  assert.deepEqual(ends, ['timeout'], '只结束一次');

  const ends2 = [];
  const q = createSkinPreview({ onEnd: (w) => ends2.push(w), setTimer, clearTimer: () => {} });
  q.end('unlock');
  q.end('cancel');
  assert.deepEqual(ends2, ['unlock']);
  const ends3 = [];
  const s = createSkinPreview({ onEnd: (w) => ends3.push(w), setTimer, clearTimer: () => {} });
  s.stop();
  assert.equal(s.done, true);
  assert.deepEqual(ends3, []);
});
