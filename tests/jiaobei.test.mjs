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

// —— 文案预算：与产品清单一致（提示 ≤ 18 字、一句话 ≤ 40 字、标题 ≤ 8 字、段落 ≤ 120 字），且不夹英文/占位符 ——
import { OUTCOMES, SESSION_TEXT, HINTS, BRIEFS, STREAK_BRIEFS, THREE_MODE_INTRO, MODES, SHARE_SIGN } from '../src/modules/jiaobei/data.js';

const len = (s) => [...String(s)].length;
const clean = (s) => !/[A-Za-z]|TODO|xxx|示例/.test(s) && !/["']/.test(s);

test('文案预算：操作提示 ≤ 18 字，动词或状态开头，无英文', () => {
  for (const [k, t] of Object.entries(HINTS)) {
    assert.ok(len(t) <= 18, `HINTS.${k} 太长: ${t}`);
    assert.ok(clean(t), `HINTS.${k} 含英文/占位: ${t}`);
  }
});

test('文案预算：结果条标题 ≤ 8 字、一句话 ≤ 40 字', () => {
  for (const o of Object.values(OUTCOMES)) assert.ok(len(o.name) <= 8, o.name);
  for (const t of Object.values(SESSION_TEXT)) { assert.ok(len(t.title) <= 8, t.title); assert.ok(len(t.sub) <= 40, t.sub); }
  for (const b of Object.values(BRIEFS)) assert.ok(len(b) <= 40 && clean(b), b);
  for (const b of STREAK_BRIEFS.sheng.slice(1)) assert.ok(len(b) <= 40 && clean(b), b);
  assert.ok(len(STREAK_BRIEFS.xiao) <= 40 && clean(STREAK_BRIEFS.xiao));
});

test('文案预算：抽屉每段 ≤ 120 字，引号用中文弯引号', () => {
  for (const o of Object.values(OUTCOMES)) {
    for (const k of ['meaning', 'advice']) { assert.ok(len(o[k]) <= 120, `${o.name}.${k}`); assert.ok(clean(o[k]), `${o.name}.${k} 含直引号或英文`); }
    for (const v of o.verses) assert.ok(len(v) <= 40 && clean(v), v);
    assert.ok(o.seal && len(o.seal) <= 2, `${o.name} 印章 1–2 字`);
  }
  for (const t of Object.values(SESSION_TEXT)) assert.ok(len(t.meaning) <= 120 && clean(t.meaning), t.title);
  assert.ok(len(THREE_MODE_INTRO) <= 120 && clean(THREE_MODE_INTRO));
  assert.equal(MODES.length, 2);
  assert.ok(SHARE_SIGN.includes('来感觉'));
});

// —— 舞台几何：两杯落定不叠、飞行最高点不出框、不压徽记、不压面向标签（四种手机舞台尺寸） ——
import { LAYOUT, restGap, restSideMargin, peakSideMargin, peakTopClearance, restLabelClearance } from '../src/modules/jiaobei/layout.js';

// 舞台内宽 × 高：360×640 / 375×667 / 390×844 / 430×932 下 clamp(260px, 44svh, 400px) 的结果
const STAGES = [[332, 282], [347, 293], [358, 371], [394, 400]];

test('舞台几何：两杯向内漂到极限仍有间隔，不叠成一团', () => {
  assert.ok(restGap() >= 8, `落定间隔 ${restGap()} 世界单位`);
  assert.ok(LAYOUT.GROUND > 0.6 && LAYOUT.GROUND < 0.8);
});

test('舞台几何：落定与最高点都离左右边框 ≥ 16px，上不压徽记，下不压标签', () => {
  for (const [w, h] of STAGES) {
    assert.ok(restSideMargin(w, h) >= 16, `${w}×${h} 落定侧边距 ${restSideMargin(w, h).toFixed(1)}`);
    assert.ok(peakSideMargin(w, h) >= 16, `${w}×${h} 最高点侧边距 ${peakSideMargin(w, h).toFixed(1)}`);
    assert.ok(peakTopClearance(w, h) >= 8, `${w}×${h} 最高点距徽记 ${peakTopClearance(w, h).toFixed(1)}`);
    assert.ok(restLabelClearance(w, h) >= 10, `${w}×${h} 杯子距标签 ${restLabelClearance(w, h).toFixed(1)}`);
  }
});
