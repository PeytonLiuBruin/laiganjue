import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODE,
  TONE,
  TONE_WEIGHT,
  toneWeights,
  pickAnswer,
  pickRephrase,
  validatePools,
  chargeStep,
  reduceRepeat,
  normalizeQuestion,
  PENDULUM,
  decidePendulum,
  initPendulum,
  pendulumStep,
  convergenceBias,
  classifySwing,
  simulateAsk,
  angularMomentum,
  pendulumLabel,
  PENDULUM_PARAMS,
} from '../src/modules/crystal/core.js';
import { YESNO, ORACLE, WORDS, REPHRASE, PENDULUM_TEXT, REPEAT_EGG, MODES, TABS, LABELS, BALL_HINTS, BALL_BADGE, PENDULUM_HINTS, PENDULUM_BADGE, TONE_LABEL, MODE_LABEL, MODE_SEAL, QUESTION_PLACEHOLDER, EMPTY_QUESTION_KICKER, TAP_WHISPERS } from '../src/modules/crystal/data.js';
import { seeded } from '../src/core/rng.js';

/* ------------------------------ 答案池 ------------------------------ */

test('答案池校验：是非 20（10/5/5）/ 神谕 ≥ 60 / 一字 ≥ 40，且无重复、长度合规', () => {
  const v = validatePools();
  assert.deepEqual(v.errors, []);
  assert.equal(v.ok, true);
  assert.equal(YESNO.length, 20);
  assert.ok(ORACLE.length >= 60, 'oracle ' + ORACLE.length);
  assert.ok(WORDS.length >= 40, 'words ' + WORDS.length);
  const tones = YESNO.reduce((a, it) => ((a[it.tone] = (a[it.tone] || 0) + 1), a), {});
  assert.deepEqual(tones, { yes: 10, maybe: 5, no: 5 });
  assert.equal(new Set(ORACLE.map((o) => o.text)).size, ORACLE.length);
  assert.equal(new Set(WORDS.map((w) => w.char)).size, WORDS.length);
  assert.equal(new Set(YESNO.map((y) => y.text)).size, YESNO.length);
});

test('文案无占位词、无乱码，且每条都有注解', () => {
  const bad = /TODO|待补|示例|lorem|�/i;
  const all = [
    ...YESNO.map((x) => x.text + x.note),
    ...ORACLE.map((x) => x.text + x.note),
    ...WORDS.map((x) => x.char + x.note),
    ...Object.values(REPHRASE).flat(),
    ...Object.values(PENDULUM_TEXT).flatMap((p) => [p.title, p.conclusion, p.verse, ...p.advice]),
    REPEAT_EGG.text,
    REPEAT_EGG.note,
  ];
  for (const s of all) {
    assert.ok(typeof s === 'string' && s.trim().length > 0, 'empty text');
    assert.ok(!bad.test(s), 'placeholder in: ' + s);
  }
  for (const it of [...YESNO, ...ORACLE, ...WORDS]) assert.ok(it.note && it.note.length >= 10, 'note missing');
  for (const k of ['yes', 'maybe', 'no', 'oracle', 'word']) assert.ok(REPHRASE[k].length >= 3, 'rephrase ' + k);
  assert.equal(MODES.length, 3);
  assert.equal(TABS.length, 2);
});

test('界面文案：提示 ≤ 18 字且动词开头、按钮 ≤ 6 字、徽记 ≤ 8 字、无英文残留', () => {
  const bad = /TODO|待补|示例|xxx|lorem|[A-Za-z]/;
  const len = (s) => [...s].length;
  for (const k of ['idle', 'low', 'mid', 'high', 'charging', 'clearing', 'revealed']) {
    const t = BALL_HINTS[k];
    assert.ok(t && len(t) <= 18, `ball hint ${k}: ${t}`);
    assert.ok(!bad.test(t), t);
  }
  for (const k of ['idle', 'asking', 'done']) {
    const t = PENDULUM_HINTS[k];
    assert.ok(t && len(t) <= 18, `pendulum hint ${k}: ${t}`);
    assert.ok(!bad.test(t), t);
  }
  // 静止态的那一句必须以动词起头，进入页面 3 秒内知道该做什么
  assert.match(BALL_HINTS.idle, /^(摩擦|摇|凝视|轻抚)/);
  assert.match(PENDULUM_HINTS.idle, /^(拖动|倾斜|松手)/);
  for (const [k, t] of Object.entries(LABELS)) {
    assert.ok(t && len(t) <= 6, `label ${k}: ${t}`);
    assert.ok(!bad.test(t), t);
  }
  assert.notEqual(LABELS.gaze, LABELS.again, '做过一次后按钮要换成「再问一次」之类');
  assert.notEqual(LABELS.askPendulum, LABELS.again);
  for (const t of [...Object.values(BALL_BADGE), ...Object.values(PENDULUM_BADGE), ...Object.values(TONE_LABEL), ...Object.values(MODE_LABEL)]) {
    assert.ok(t && len(t) <= 8 && !bad.test(t), t);
  }
  assert.equal(len(MODE_SEAL.oracle), 1);
  assert.equal(len(MODE_SEAL.word), 1);
  for (const t of Object.values(MODE_SEAL.yesno)) assert.equal(len(t), 1);
  for (const p of Object.values(PENDULUM_TEXT)) {
    assert.ok(len(p.seal) <= 2 && len(p.title) <= 8 && len(p.badge.replace(/[\s·]/g, '')) <= 8, p.title);
    assert.ok(len(p.conclusion) <= 60, p.conclusion);
  }
  assert.ok(len(QUESTION_PLACEHOLDER) <= 20 && !bad.test(QUESTION_PLACEHOLDER));
  assert.ok(len(EMPTY_QUESTION_KICKER) <= 10);
  for (const t of TAP_WHISPERS) assert.ok(len(t) <= 12 && !bad.test(t), t);
});

test('toneWeights：三组权重之和恰为 5:3:2', () => {
  const ws = toneWeights(YESNO);
  const sum = { yes: 0, maybe: 0, no: 0 };
  YESNO.forEach((it, i) => (sum[it.tone] += ws[i]));
  assert.ok(Math.abs(sum.yes - TONE_WEIGHT.yes) < 1e-9);
  assert.ok(Math.abs(sum.maybe - TONE_WEIGHT.maybe) < 1e-9);
  assert.ok(Math.abs(sum.no - TONE_WEIGHT.no) < 1e-9);
});

test('pickAnswer(yesno)：语气分布 ≈ 50% / 30% / 20%', () => {
  const rnd = seeded('crystal-yesno');
  const n = 30000;
  const t = { yes: 0, maybe: 0, no: 0 };
  for (let i = 0; i < n; i++) {
    const a = pickAnswer(MODE.YESNO, rnd);
    assert.equal(a.mode, MODE.YESNO);
    assert.ok(YESNO.some((y) => y.text === a.text && y.tone === a.tone));
    t[a.tone]++;
  }
  assert.ok(Math.abs(t.yes / n - 0.5) < 0.02, 'yes ' + t.yes / n);
  assert.ok(Math.abs(t.maybe / n - 0.3) < 0.02, 'maybe ' + t.maybe / n);
  assert.ok(Math.abs(t.no / n - 0.2) < 0.02, 'no ' + t.no / n);
});

test('pickAnswer(oracle / word)：只从对应池中取，且每条都可被抽到', () => {
  const rnd = seeded('crystal-cover');
  const seenO = new Set();
  const seenW = new Set();
  for (let i = 0; i < 6000; i++) {
    const o = pickAnswer(MODE.ORACLE, rnd);
    assert.ok(ORACLE.some((x) => x.text === o.text && x.note === o.note));
    seenO.add(o.text);
    const w = pickAnswer(MODE.WORD, rnd);
    assert.ok(WORDS.some((x) => x.char === w.text && x.note === w.note));
    assert.equal([...w.text].length, 1);
    seenW.add(w.text);
  }
  assert.equal(seenO.size, ORACLE.length);
  assert.equal(seenW.size, WORDS.length);
});

test('pickRephrase：按语气 / 模式给出「换个问法」', () => {
  const rnd = seeded('re');
  assert.ok(REPHRASE.yes.includes(pickRephrase({ mode: 'yesno', tone: 'yes' }, rnd)));
  assert.ok(REPHRASE.no.includes(pickRephrase({ mode: 'yesno', tone: 'no' }, rnd)));
  assert.ok(REPHRASE.oracle.includes(pickRephrase({ mode: 'oracle' }, rnd)));
  assert.ok(REPHRASE.word.includes(pickRephrase({ mode: 'word' }, rnd)));
});

test('连问彩蛋：同一问题连问三次触发；空问题不计数', () => {
  let s = reduceRepeat(null, '这份工作值得接吗？');
  assert.equal(s.count, 1);
  s = reduceRepeat(s, '这份工作值得接吗');
  s = reduceRepeat(s, ' 这份工作值得接吗？？ ');
  assert.equal(s.count, 3);
  const a = pickAnswer(MODE.ORACLE, seeded(1), { repeat: s.count });
  assert.equal(a.egg, true);
  assert.equal(a.text, REPEAT_EGG.text);
  assert.equal(a.tone, TONE.MAYBE);
  s = reduceRepeat(s, '换个问题');
  assert.equal(s.count, 1);
  assert.deepEqual(reduceRepeat(s, '   '), { last: '', count: 0 });
  assert.equal(normalizeQuestion('要 不 要？'), '要不要');
  assert.equal(pickAnswer(MODE.YESNO, seeded(2), { repeat: 2 }).egg, undefined);
});

test('chargeStep：进度夹在 [0,1]', () => {
  assert.equal(chargeStep(0, 0.35), 0.35);
  assert.equal(chargeStep(0.9, 0.35), 1);
  assert.equal(chargeStep(0.2, -1), 0);
  assert.equal(chargeStep(NaN, 0.5), 0.5);
});

/* ------------------------------ 灵摆 ------------------------------ */

test('decidePendulum：分布 ≈ 45 / 40 / 15', () => {
  const rnd = seeded('pendulum');
  const n = 30000;
  const t = { yes: 0, no: 0, unclear: 0 };
  for (let i = 0; i < n; i++) t[decidePendulum(rnd)]++;
  assert.ok(Math.abs(t.yes / n - 0.45) < 0.02, 'yes ' + t.yes / n);
  assert.ok(Math.abs(t.no / n - 0.4) < 0.02, 'no ' + t.no / n);
  assert.ok(Math.abs(t.unclear / n - 0.15) < 0.02, 'unclear ' + t.unclear / n);
  assert.equal(pendulumLabel(PENDULUM.YES), '是');
  assert.equal(pendulumLabel(PENDULUM.NO), '否');
  assert.equal(pendulumLabel(PENDULUM.UNCLEAR), '不明');
});

test('pendulumStep：纯函数，不改输入；无外力时能量衰减到静止', () => {
  const s0 = { x: 0.8, y: -0.3, vx: 0, vy: 0, t: 0 };
  const frozen = JSON.stringify(s0);
  let s = s0;
  for (let i = 0; i < 60 * 12; i++) s = pendulumStep(s, 1 / 60);
  assert.equal(JSON.stringify(s0), frozen);
  assert.ok(Math.hypot(s.x, s.y) < 0.05, 'should decay, r=' + Math.hypot(s.x, s.y));
  assert.ok(Math.abs(s.t - 12) < 1e-6);
});

test('pendulumStep：1000 步随机大外力 / NaN 输入下仍有界、有限', () => {
  const rnd = seeded('wild');
  let s = initPendulum();
  let maxR = 0;
  for (let i = 0; i < 1000; i++) {
    s = pendulumStep(s, 1 / 60 + rnd() * 0.2, { x: (rnd() - 0.5) * 600, y: (rnd() - 0.5) * 600 });
    maxR = Math.max(maxR, Math.hypot(s.x, s.y));
    assert.ok(Number.isFinite(s.x + s.y + s.vx + s.vy), 'finite');
  }
  assert.ok(maxR <= PENDULUM_PARAMS.maxR + 1e-9, 'bounded r=' + maxR);
  const bad = pendulumStep({ x: NaN, y: 1, vx: Infinity, vy: 0, t: 0 }, NaN, { x: NaN });
  assert.ok(Number.isFinite(bad.x + bad.y + bad.vx + bad.vy));
  const bad2 = pendulumStep({ x: NaN, y: 1, vx: Infinity, vy: 0, t: 0 }, 1 / 60, { x: NaN });
  assert.ok(Number.isFinite(bad2.x + bad2.y + bad2.vx + bad2.vy));
});

test('convergenceBias：strength=0 时无力；三种目标下 4.5s 内收敛到对应模式', () => {
  assert.deepEqual(convergenceBias({ x: 0.3, y: 0.2, vx: 1, vy: -1 }, PENDULUM.YES, 0), { x: 0, y: 0 });
  for (const target of [PENDULUM.YES, PENDULUM.NO, PENDULUM.UNCLEAR]) {
    let ok = 0;
    const N = 120;
    for (let i = 0; i < N; i++) {
      const r = simulateAsk(target, seeded(`${target}-${i}`));
      if (r.decided === target) ok++;
      assert.ok(Number.isFinite(r.final.x + r.final.y + r.final.vx + r.final.vy));
      assert.ok(Math.hypot(r.final.x, r.final.y) <= PENDULUM_PARAMS.maxR);
    }
    assert.ok(ok >= N * 0.97, `${target}: ${ok}/${N}`);
  }
  // 几乎静止起步（只有轻微倾斜）也要能收敛
  for (const target of [PENDULUM.YES, PENDULUM.NO, PENDULUM.UNCLEAR]) {
    const r = simulateAsk(target, seeded('low-' + target), { kick: 0.1 });
    assert.equal(r.decided, target);
  }
});

test('classifySwing：直线 → 是/否，圆 → 不明', () => {
  const w = Math.sqrt(PENDULUM_PARAMS.k);
  const line = (axis) => Array.from({ length: 120 }, (_, i) => {
    const t = i / 60;
    const p = 0.5 * Math.cos(w * t);
    const v = -0.5 * w * Math.sin(w * t);
    return axis === 'y' ? { x: 0.02, y: p, vx: 0, vy: v } : { x: p, y: 0.02, vx: v, vy: 0 };
  });
  const circle = Array.from({ length: 120 }, (_, i) => {
    const t = i / 60;
    return { x: 0.5 * Math.cos(w * t), y: 0.5 * Math.sin(w * t), vx: -0.5 * w * Math.sin(w * t), vy: 0.5 * w * Math.cos(w * t) };
  });
  assert.equal(classifySwing(line('y')), PENDULUM.YES);
  assert.equal(classifySwing(line('x')), PENDULUM.NO);
  assert.equal(classifySwing(circle), PENDULUM.UNCLEAR);
  assert.equal(classifySwing([]), PENDULUM.UNCLEAR);
  assert.ok(Math.abs(angularMomentum(circle[0]) - 0.25 * w) < 1e-9);
});
