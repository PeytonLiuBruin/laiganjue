import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { monthlyEquivalent, yearlySavings } from '../src/ui/paywall.js';

const CN = { yearly: { priceString: '¥98.00', price: 98, currencyCode: 'CNY' }, monthly: { priceString: '¥18.00', price: 18, currencyCode: 'CNY' } };

test('年度折合每月：沿用 StoreKit 价格字符串的货币符号与位置', () => {
  assert.equal(monthlyEquivalent(CN), '¥8.17');
  assert.equal(monthlyEquivalent({ yearly: { priceString: '$29.99', price: 29.99 } }), '$2.50');
  assert.equal(monthlyEquivalent({ yearly: { priceString: '29,99 €', price: 29.99 } }), '2,50 €');
  assert.equal(monthlyEquivalent({ yearly: { priceString: '¥4800', price: 4800 } }), '¥400', '没有小数的币种不补小数');
  assert.equal(monthlyEquivalent({ yearly: { priceString: 'HK$238.00', price: 238 } }), 'HK$19.83');
});

test('取不到价格时不显示折合', () => {
  assert.equal(monthlyEquivalent({}), '');
  assert.equal(monthlyEquivalent({ yearly: { priceString: '¥98.00' } }), '');
  assert.equal(monthlyEquivalent({ yearly: { priceString: '免费', price: 98 } }), '');
});

test('年度省多少：按月续 12 个月对比，向下取整，币种不同或不足 10% 不写', () => {
  assert.equal(yearlySavings(CN), 54);
  assert.equal(yearlySavings({ yearly: { price: 29.99 }, monthly: { price: 4.99 } }), 49);
  assert.equal(yearlySavings({ yearly: { price: 100, currencyCode: 'CNY' }, monthly: { price: 4.99, currencyCode: 'USD' } }), 0);
  assert.equal(yearlySavings({ yearly: { price: 200 }, monthly: { price: 18 } }), 0);
  assert.equal(yearlySavings({ yearly: { price: 98 } }), 0);
});

test('折合行是小字，扣款价格仍是方案格里最醒目的价格', async () => {
  const css = await readFile(new URL('../src/styles/toon-paywall.css', import.meta.url), 'utf8');
  assert.match(css, /\.pw-eq \{ font: 800 11px/);
  assert.match(css, /\.pw-price \{ font: 900 var\(--fs-s\)/);
  const js = await readFile(new URL('../src/ui/paywall.js', import.meta.url), 'utf8');
  assert.match(js, /`约 \$\{eqText\} \/ 月`/);
  assert.match(js, /`省 \$\{save\}%`/);
});
