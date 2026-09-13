import { test } from 'node:test';
import assert from 'node:assert/strict';
import { throwJiaobei, judge, initSession, reduceSession, tally, OUTCOME } from '../src/modules/jiaobei/core.js';
import { seeded } from '../src/core/rng.js';

test('judge: 一平一凸=圣杯, 两平=笑杯, 两凸=阴杯, 立=立筊', () => {
  assert.equal(judge('flat', 'round'), OUTCOME.SHENG);
  assert.equal(judge('round', 'flat'), OUTCOME.SHENG);
  assert.equal(judge('flat', 'flat'), OUTCOME.XIAO);
  assert.equal(judge('round', 'round'), OUTCOME.YIN);
  assert.equal(judge('stand', 'flat'), OUTCOME.LI);
});

test('throwJiaobei: 分布大致 50% 圣杯 / 25% 笑 / 25% 阴, 立筊极少', () => {
  const rnd = seeded('jiaobei');
  const n = 20000;
  const t = { sheng: 0, xiao: 0, yin: 0, li: 0 };
  for (let i = 0; i < n; i++) t[throwJiaobei(rnd).outcome]++;
  assert.ok(Math.abs(t.sheng / n - 0.5) < 0.03, 'sheng ~50%: ' + t.sheng / n);
  assert.ok(Math.abs(t.xiao / n - 0.25) < 0.03, 'xiao ~25%');
  assert.ok(Math.abs(t.yin / n - 0.25) < 0.03, 'yin ~25%');
  assert.ok(t.li / n < 0.01 && t.li > 0, 'li rare but present');
});

test('throwJiaobei: standChance=0 时不出立筊', () => {
  const rnd = seeded(7);
  for (let i = 0; i < 5000; i++) assert.notEqual(throwJiaobei(rnd, { standChance: 0 }).outcome, OUTCOME.LI);
});

test('三圣杯会话：连续三圣杯成功', () => {
  let s = initSession();
  const sheng = { outcome: OUTCOME.SHENG };
  s = reduceSession(s, sheng);
  s = reduceSession(s, sheng);
  assert.equal(s.done, false);
  assert.equal(s.streak, 2);
  s = reduceSession(s, sheng);
  assert.equal(s.done, true);
  assert.equal(s.success, true);
});

test('三圣杯会话：笑杯清零继续，阴杯终止', () => {
  let s = initSession();
  s = reduceSession(s, { outcome: OUTCOME.SHENG });
  s = reduceSession(s, { outcome: OUTCOME.XIAO });
  assert.equal(s.streak, 0);
  assert.equal(s.done, false);
  s = reduceSession(s, { outcome: OUTCOME.YIN });
  assert.equal(s.done, true);
  assert.equal(s.success, false);
  // 结束后不再变化
  const after = reduceSession(s, { outcome: OUTCOME.SHENG });
  assert.deepEqual(after, s);
});

test('三圣杯会话：立筊直接成功', () => {
  const s = reduceSession(initSession(), { outcome: OUTCOME.LI });
  assert.equal(s.done, true);
  assert.equal(s.success, true);
  assert.equal(s.miracle, true);
});

test('tally', () => {
  const t = tally([{ outcome: 'sheng' }, { outcome: 'sheng' }, { outcome: 'yin' }]);
  assert.deepEqual(t, { sheng: 2, xiao: 0, yin: 1, li: 0 });
});
