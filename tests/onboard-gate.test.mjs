import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnboardGate } from '../src/ui/onboard-gate.js';

test('老用户：深链要打开的卡立即打开', () => {
  const g = createOnboardGate(false);
  const seen = [];
  g.run(() => seen.push('pro'));
  assert.deepEqual(seen, ['pro']);
  assert.equal(g.waiting, false);
});

test('新用户：引导关掉前排队，关掉后按顺序打开，之后立即打开', () => {
  const g = createOnboardGate(true);
  const seen = [];
  g.run(() => seen.push('pro'));
  g.run(() => seen.push('skin'));
  assert.deepEqual(seen, []);
  g.release();
  assert.deepEqual(seen, ['pro', 'skin']);
  g.release();
  assert.deepEqual(seen, ['pro', 'skin'], '重复 release 不重放');
  g.run(() => seen.push('later'));
  assert.deepEqual(seen, ['pro', 'skin', 'later']);
});

test('队列里一项出错不影响后面的', () => {
  const g = createOnboardGate(true);
  const seen = [];
  const err = console.error;
  console.error = () => {};
  try {
    g.run(() => { throw new Error('x'); });
    g.run(() => seen.push('ok'));
    g.release();
  } finally { console.error = err; }
  assert.deepEqual(seen, ['ok']);
});

test('app.js 深链的付费卡与皮肤卡走引导闸门，引导关闭时放行', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/ui/app.js', import.meta.url), 'utf8');
  assert.ok(/onboardGate\.run\(\(\) => openPaywall\(platform\)\)/.test(src), '深链付费卡没走引导闸门');
  assert.ok(/onboardGate\.run\(\(\) => \{[\s\S]{0,300}openSkinOffer/.test(src), '深链皮肤卡没走引导闸门');
  assert.ok(/el\.remove\(\);[^\n]*onboardGate\.release\(\)/.test(src), '引导关闭时没有放行');
});
