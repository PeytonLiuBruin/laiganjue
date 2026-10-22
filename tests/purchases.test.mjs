import test from 'node:test';
import assert from 'node:assert/strict';
import { createPurchases, entitlementFrom, grantsPro, periodLabel, trialDays, PRODUCTS } from '../src/platform/purchases.js';
import { createQuota, dayKey } from '../src/platform/quota.js';
import { fineprint, ctaLabel } from '../src/ui/paywall.js';

const NOW = Date.parse('2026-10-22T12:00:00Z');
const DAY = 86400000;

function memStorage(init = {}) {
  const m = new Map(Object.entries(init).map(([k, v]) => [k, JSON.stringify(v)]));
  return { get: (k, d) => (m.has(k) ? JSON.parse(m.get(k)) : d), set: (k, v) => m.set(k, JSON.stringify(v)), remove: (k) => m.delete(k), raw: m };
}

function fakePlugin({ purchases = [], products = [], purchaseResult = null, purchaseError = null } = {}) {
  const calls = [];
  let listener = null;
  return {
    calls,
    emit: (tx) => listener?.(tx),
    async getPurchases(o) { calls.push(['getPurchases', o]); return { purchases }; },
    async getProducts(o) { calls.push(['getProducts', o]); return { products: products.filter((p) => o.productIdentifiers.includes(p.identifier)) }; },
    async purchaseProduct(o) { calls.push(['purchaseProduct', o]); if (purchaseError) throw purchaseError; return purchaseResult; },
    async restorePurchases() { calls.push(['restorePurchases']); },
    async manageSubscriptions() { calls.push(['manage']); },
    async addListener(name, cb) { calls.push(['addListener', name]); listener = cb; return { remove() {} }; },
  };
}

test('权益判断：有效订阅、过期、退款、买断', () => {
  const sub = (exp, extra = {}) => ({ productIdentifier: PRODUCTS.yearly.id, expirationDate: new Date(exp).toISOString(), ...extra });
  assert.equal(grantsPro(sub(NOW + DAY), NOW), true);
  assert.equal(grantsPro(sub(NOW - DAY), NOW), false);
  assert.equal(grantsPro(sub(NOW - DAY, { subscriptionState: 'inGracePeriod' }), NOW), true, '宽限期内保留权益');
  assert.equal(grantsPro(sub(NOW + DAY, { revocationDate: '2026-10-20' }), NOW), false, '退款后失效');
  assert.equal(grantsPro({ productIdentifier: PRODUCTS.lifetime.id }, NOW), true);
  assert.equal(grantsPro({ productIdentifier: PRODUCTS.pack5.id }, NOW), false, '单次解读包不是 Pro');
  assert.equal(grantsPro({ productIdentifier: 'other.app.pro', isActive: true }, NOW), false);

  assert.deepEqual(entitlementFrom([], NOW), { pro: false, plan: null, until: null });
  const e = entitlementFrom([sub(NOW + DAY), { productIdentifier: PRODUCTS.monthly.id, expirationDate: new Date(NOW + 5 * DAY).toISOString() }], NOW);
  assert.deepEqual(e, { pro: true, plan: 'monthly', until: NOW + 5 * DAY }, '取到期最晚的订阅');
  assert.equal(entitlementFrom([sub(NOW + DAY), { productIdentifier: PRODUCTS.lifetime.id }], NOW).plan, 'lifetime', '买断优先');
});

test('周期与试用的中文显示', () => {
  assert.equal(periodLabel({ unitString: 'year', numberOfUnits: 1 }), '每年');
  assert.equal(periodLabel({ unit: 2, numberOfUnits: 1 }), '每月');
  assert.equal(periodLabel({ unitString: 'month', numberOfUnits: 3 }), '每 3 个月');
  assert.equal(periodLabel(null), '');
  assert.equal(trialDays({ introductoryPrice: { price: 0, numberOfPeriods: 1, subscriptionPeriod: { unitString: 'day', numberOfUnits: 3 } } }), 3);
  assert.equal(trialDays({ introductoryPrice: { price: 0.99, numberOfPeriods: 1, subscriptionPeriod: { unitString: 'week', numberOfUnits: 1 } } }), 0, '付费推介价不算免费试用');
  assert.equal(trialDays({}), 0);
});

test('网页版：不可购买，所有操作安全降级', async () => {
  const storage = memStorage();
  const iap = createPurchases({ plugin: null, storage, now: () => NOW });
  assert.equal(iap.available, false);
  assert.equal(iap.pro, false);
  assert.deepEqual(await iap.loadProducts(), {});
  assert.deepEqual(await iap.purchase('yearly'), { ok: false, reason: 'web' });
  assert.equal((await iap.restore()).ok, false);
  await iap.init(); await iap.manage();
  storage.set('dev.pro', true);
  assert.equal(iap.pro, true, '网页版可用 dev.pro 预览 Pro 界面');
});

test('原生：启动刷新权益、读本地化价格、购买、恢复', async () => {
  const storage = memStorage();
  const plugin = fakePlugin({
    products: [
      { identifier: PRODUCTS.yearly.id, priceString: '¥98.00', price: 98, currencyCode: 'CNY', subscriptionPeriod: { unitString: 'year', numberOfUnits: 1 }, introductoryPrice: { price: 0, numberOfPeriods: 1, subscriptionPeriod: { unitString: 'day', numberOfUnits: 3 } } },
      { identifier: PRODUCTS.lifetime.id, priceString: '¥198.00', price: 198, currencyCode: 'CNY' },
    ],
    purchaseResult: { productIdentifier: PRODUCTS.yearly.id, transactionId: 't1', expirationDate: new Date(NOW + 3 * DAY).toISOString() },
  });
  const iap = createPurchases({ plugin, storage, now: () => NOW, os: 'ios' });
  let changes = 0;
  iap.onChange(() => changes++);
  await iap.init();
  assert.equal(iap.pro, false);
  assert.deepEqual(plugin.calls.find((c) => c[0] === 'getPurchases')[1], { onlyCurrentEntitlements: true });

  const products = await iap.loadProducts();
  assert.equal(products.yearly.priceString, '¥98.00');
  assert.equal(products.yearly.period, '每年');
  assert.equal(products.yearly.trialDays, 3);
  assert.equal(products.lifetime.period, '');
  assert.equal(products.monthly, undefined, '商店没返回的产品不显示');

  assert.deepEqual(await iap.purchase('yearly'), { ok: true });
  assert.equal(iap.pro, true);
  assert.equal(iap.plan, 'yearly');
  assert.ok(changes >= 1);
  assert.equal(storage.get('iap.state').pro, true, '权益写入缓存，离线冷启动可用');

  // 缓存过期后自动失效
  const later = createPurchases({ plugin: fakePlugin(), storage, now: () => NOW + 4 * DAY, os: 'ios' });
  assert.equal(later.pro, false);

  const restored = createPurchases({ plugin: fakePlugin({ purchases: [{ productIdentifier: PRODUCTS.lifetime.id }] }), storage: memStorage(), now: () => NOW, os: 'ios' });
  assert.deepEqual(await restored.restore(), { ok: true, pro: true });
  assert.equal(restored.plan, 'lifetime');
});

test('原生：用户取消购买不报错；单次解读包按交易只入账一次', async () => {
  const cancel = createPurchases({ plugin: fakePlugin({ purchaseError: Object.assign(new Error('Purchase cancelled'), { code: 'USER_CANCELLED' }) }), storage: memStorage(), now: () => NOW, os: 'ios' });
  assert.deepEqual(await cancel.purchase('monthly'), { ok: false, cancelled: true });
  assert.equal(cancel.pro, false);

  const storage = memStorage();
  const plugin = fakePlugin({ purchaseResult: { productIdentifier: PRODUCTS.pack5.id, transactionId: 'p1' } });
  const iap = createPurchases({ plugin, storage, now: () => NOW, os: 'ios' });
  await iap.init();
  await iap.purchase('pack5');
  assert.equal(iap.credits, 5);
  plugin.emit({ productIdentifier: PRODUCTS.pack5.id, transactionId: 'p1' });
  assert.equal(iap.credits, 5, '同一笔交易的更新通知不重复入账');
  assert.equal(iap.pro, false);
  assert.equal(iap.useCredit(), true);
  assert.equal(iap.credits, 4);
  assert.equal(storage.get('iap.credits'), 4);
});

test('免费额度：每个玩法每天 1 次，次日重置，Pro 与单次包', () => {
  let now = new Date(2026, 9, 22, 23, 50).getTime();
  const storage = memStorage();
  const iap = { pro: false, credits: 0, useCredit() { if (this.credits <= 0) return false; this.credits--; return true; } };
  const q = createQuota({ storage, purchases: iap, now: () => now });
  assert.equal(dayKey(now), '2026-10-22');
  assert.equal(q.peek('qian'), 'free');
  assert.equal(q.take('qian'), 'free');
  assert.equal(q.left('qian'), 0);
  assert.equal(q.take('qian'), null, '当天第二次需要付费');
  assert.equal(q.take('tarot'), 'free', '不同玩法分别计数');

  iap.credits = 1;
  assert.equal(q.take('qian'), 'credit');
  assert.equal(iap.credits, 0);
  assert.equal(q.take('qian'), null);

  iap.pro = true;
  assert.equal(q.take('qian'), 'pro');
  assert.equal(q.take('qian'), 'pro', 'Pro 不限次数');
  iap.pro = false;

  now += 20 * 60 * 1000; // 跨过本地午夜
  assert.equal(q.peek('qian'), 'free', '次日重置');
});

test('付费卡文案：价格周期、自动续期与取消方式写清楚', () => {
  const yearly = { priceString: '¥98.00', period: '每年', trialDays: 3 };
  const t = fineprint('yearly', yearly);
  assert.match(t, /免费试用 3 天/);
  assert.match(t, /¥98\.00 \/ 年/);
  assert.match(t, /自动续期/);
  assert.match(t, /24 小时/);
  assert.match(t, /取消/);
  assert.match(fineprint('lifetime', {}), /不会自动续费/);
  assert.equal(ctaLabel('yearly', yearly), '免费试用 3 天');
  assert.equal(ctaLabel('monthly', { priceString: '¥18.00', period: '每月' }), '开通 Pro');
  assert.equal(ctaLabel('lifetime', { priceString: '¥198.00' }), '¥198.00 永久解锁');
});
