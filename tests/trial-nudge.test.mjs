import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { nudgeCopy } from '../src/ui/paywall.js';

// 第 62 轮：连续使用提示的优惠说法只来自 StoreKit，网页版不出提示，提示条是描边厚边的卡通样式。

test('年度产品配了试用才写「前 N 天免费」', () => {
  const c = nudgeCopy(3, { yearly: { priceString: '¥98.00', price: 98, trialDays: 3 } });
  assert.equal(c.text, '连续 3 天来感觉了 · 年度 Pro 前 3 天免费');
  assert.equal(c.lead, '连续 3 天来感觉了');
  assert.equal(c.offer, '年度 Pro 前 3 天免费');
  assert.match(c.reason, /免费试用 3 天/);
});

test('没有试用时写折合每月，价格也取不到时不提优惠', () => {
  const eq = nudgeCopy(4, { yearly: { priceString: '¥98.00', price: 98, trialDays: 0 } });
  assert.equal(eq.text, '连续 4 天来感觉了 · 年度 Pro 约 ¥8.17 / 月');
  for (const info of [undefined, {}, { yearly: { priceString: '¥98.00' } }]) {
    const c = nudgeCopy(3, info);
    assert.equal(c.text, '连续 3 天来感觉了 · 看看来感觉 Pro');
    assert.doesNotMatch(c.text + c.reason, /免费|试用|¥/);
  }
});

test('网页版（不能购买）不出提示，也不记已提示', async () => {
  const src = await readFile(new URL('../src/ui/ritual.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('function trialNudge'), src.indexOf('function clearResult'));
  assert.match(body, /!iap\?\.available\) return;/);
  assert.ok(body.indexOf('iap?.available') < body.indexOf('markNudged'), '先判断能否购买，再记已提示');
  assert.match(body, /nudgeCopy\(n, p\)/, '取到价格后换文案');
  assert.match(body, /offer\.textContent = copy\.offer/, '只换下行优惠');
  assert.doesNotMatch(body, /可免费试用`/, '不再写死试用');
});

test('提示条描边厚边，「看看」与 × 至少 44px', async () => {
  const css = await readFile(new URL('../src/styles/toon-paywall.css', import.meta.url), 'utf8');
  const part = css.slice(css.indexOf('第 62 轮'));
  assert.match(part, /\.ritual-nudge \{[^}]*border: 2px solid[^}]*box-shadow: 0 4px 0/);
  assert.match(part, /\.ritual-nudge-go \{[^}]*min-height: 44px/);
  assert.match(part, /\.ritual-nudge-x \{[^}]*width: 44px; height: 44px/);
});

test('试穿条的「解锁」与 × 至少 44px，「解锁」金币色描边胶囊', async () => {
  const css = await readFile(new URL('../src/styles/toon-paywall.css', import.meta.url), 'utf8');
  const part = css.slice(css.indexOf('试穿条的「解锁」'));
  assert.match(part, /\.skin-try-unlock \{[^}]*min-height: 44px[^}]*border: 2px solid #8a3a10/);
  assert.match(part, /\.skin-try-close \{[^}]*width: 44px; height: 44px/);
});

test('灵签番号条与印章白字带签纸墨色描边', async () => {
  const css = await readFile(new URL('../src/styles/toon-props.css', import.meta.url), 'utf8');
  const part = css.slice(css.indexOf('第 62 轮'));
  assert.match(part, /\.m-qian \.qn-paper-no,\s*\.m-qian \.qn-seal \{\s*text-shadow: 1\.5px 0 0 var\(--qn-ink\)/);
});
