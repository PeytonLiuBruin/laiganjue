import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HEADS,
  TAILS,
  EDGE,
  flipCoin,
  rollDice,
  diceRotation,
  DICE_ROTATION,
  FACE_NORMALS,
  rotateVec,
  judgeBigSmall,
  analyzeDice,
  diceSpecialKeys,
  sumBand,
  majority,
  streakOf,
  pushHistory,
  flipAngle,
  restAngle,
  spinsForIntensity,
  powerOf,
  PIP_LAYOUT,
  diceSlots,
  fitFontSize,
  textWeight,
  normalizeOption,
  pickOption,
  fillTemplate,
  headsRate,
} from '../src/modules/coin/core.js';
import * as data from '../src/modules/coin/data.js';
import { seeded } from '../src/core/rng.js';

/* ------------------------------ 硬币 ------------------------------ */

test('flipCoin: seeded 20000 次，正反各约 50%，误差 < 2%', () => {
  const rnd = seeded('coin-fair');
  const n = 20000;
  let heads = 0;
  for (let i = 0; i < n; i++) {
    const f = flipCoin(rnd);
    assert.ok(f === HEADS || f === TAILS, '默认不出立币');
    if (f === HEADS) heads++;
  }
  assert.ok(Math.abs(heads / n - 0.5) < 0.02, 'heads ratio ' + heads / n);
});

test('flipCoin: edgeChance 控制立币彩蛋', () => {
  const rnd = seeded(3);
  for (let i = 0; i < 3000; i++) assert.notEqual(flipCoin(rnd, { edgeChance: 0 }), EDGE);
  let edges = 0;
  const rnd2 = seeded(4);
  for (let i = 0; i < 3000; i++) if (flipCoin(rnd2, { edgeChance: 0.1 }) === EDGE) edges++;
  assert.ok(edges > 200 && edges < 400, 'edge ~10%: ' + edges);
});

test('flipAngle: 终止角度 = 圈数×360 + 面偏移', () => {
  assert.equal(restAngle(HEADS), 0);
  assert.equal(restAngle(TAILS), 180);
  assert.equal(restAngle(EDGE), 90);
  assert.equal(flipAngle(HEADS, 3), 1080);
  assert.equal(flipAngle(TAILS, 5), 1980);
  assert.equal(flipAngle(EDGE, 4), 1530);
  assert.equal(flipAngle(HEADS, 4) % 360, 0);
  assert.equal(flipAngle(TAILS, 7) % 360, 180);
});

test('spinsForIntensity: 3–7 圈且随强度单调不减', () => {
  let prev = 0;
  for (let i = 0; i <= 60; i += 2) {
    const s = spinsForIntensity(i);
    assert.ok(s >= 3 && s <= 7, `intensity ${i} → ${s}`);
    assert.ok(s >= prev);
    prev = s;
  }
  assert.equal(spinsForIntensity(0), 3);
  assert.equal(spinsForIntensity(40), 7);
  assert.equal(spinsForIntensity(undefined), spinsForIntensity(20));
  assert.equal(spinsForIntensity(NaN), spinsForIntensity(20));
});

test('powerOf: 0.7–1.5', () => {
  assert.equal(powerOf(0), 0.7);
  assert.equal(powerOf(20), 1);
  assert.equal(powerOf(100), 1.5);
  assert.equal(powerOf('x'), 1);
});

test('majority: 三局两胜 / 全同 / 平局', () => {
  const m = majority([HEADS, TAILS, HEADS]);
  assert.equal(m.winner, HEADS);
  assert.deepEqual(m.counts, { heads: 2, tails: 1 });
  assert.equal(m.tie, false);
  assert.equal(m.sweep, false);
  const s = majority([TAILS, TAILS, TAILS]);
  assert.equal(s.winner, TAILS);
  assert.equal(s.sweep, true);
  const t = majority([HEADS, TAILS]);
  assert.equal(t.tie, true);
  assert.equal(t.winner, null);
  assert.equal(majority([]).tie, true);
});

test('streakOf / pushHistory', () => {
  assert.deepEqual(streakOf([]), { face: null, len: 0 });
  assert.deepEqual(streakOf([HEADS, TAILS, TAILS, TAILS]), { face: TAILS, len: 3 });
  assert.deepEqual(streakOf([HEADS]), { face: HEADS, len: 1 });
  const h = pushHistory(Array(20).fill(HEADS), TAILS, 20);
  assert.equal(h.length, 20);
  assert.equal(h[19], TAILS);
});

test('headsRate', () => {
  assert.equal(headsRate({ heads: 0, tails: 0 }), null);
  assert.equal(headsRate({ heads: 3, tails: 1 }), 75);
  assert.equal(headsRate({ heads: 1, tails: 2 }), 33);
});

/* ------------------------------ 骰子 ------------------------------ */

test('rollDice: 长度与取值范围', () => {
  const rnd = seeded('dice');
  for (let n = 1; n <= 6; n++) {
    const r = rollDice(n, 6, rnd);
    assert.equal(r.length, n);
    for (const v of r) assert.ok(v >= 1 && v <= 6 && Number.isInteger(v));
  }
  const d20 = rollDice(3, 20, rnd);
  assert.equal(d20.length, 3);
  for (const v of d20) assert.ok(v >= 1 && v <= 20);
  assert.equal(rollDice(0, 6, rnd).length, 1, '至少 1 颗');
  assert.equal(rollDice(99, 6, rnd).length, 12, '最多 12 颗');
});

test('rollDice: D6 分布大致均匀（30000 颗，每面 ±2%）', () => {
  const rnd = seeded('dice-uniform');
  const counts = [0, 0, 0, 0, 0, 0, 0];
  const n = 30000;
  for (let i = 0; i < n; i++) counts[rollDice(1, 6, rnd)[0]]++;
  for (let f = 1; f <= 6; f++) assert.ok(Math.abs(counts[f] / n - 1 / 6) < 0.02, `face ${f}: ${counts[f] / n}`);
});

test('diceRotation: 六个面的旋转各不相同', () => {
  const seen = new Set();
  for (let f = 1; f <= 6; f++) {
    const r = diceRotation(f);
    const key = `${((r.rx % 360) + 360) % 360},${((r.ry % 360) + 360) % 360}`;
    assert.ok(!seen.has(key), 'duplicate rotation for face ' + f);
    seen.add(key);
  }
  assert.equal(seen.size, 6);
  assert.deepEqual(diceRotation(99), DICE_ROTATION[1]);
});

test('diceRotation: 旋转后该面法向量指向 +z（朝上）', () => {
  for (let f = 1; f <= 6; f++) {
    const { rx, ry } = diceRotation(f);
    const [x, y, z] = rotateVec(FACE_NORMALS[f], rx, ry);
    assert.ok(Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9 && Math.abs(z - 1) < 1e-9, `face ${f} → (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`);
    // 对面（和为 7）应指向 −z
    const [, , zo] = rotateVec(FACE_NORMALS[7 - f], rx, ry);
    assert.ok(Math.abs(zo + 1) < 1e-9, `opposite of ${f} should face down`);
  }
});

test('rotateVec: 与 CSS rotateX / rotateY 约定一致', () => {
  // rotateY(90): +z → +x
  let v = rotateVec([0, 0, 1], 0, 90);
  assert.ok(Math.abs(v[0] - 1) < 1e-9 && Math.abs(v[2]) < 1e-9);
  // rotateX(90): +z → −y（屏幕向上）
  v = rotateVec([0, 0, 1], 90, 0);
  assert.ok(Math.abs(v[1] + 1) < 1e-9 && Math.abs(v[2]) < 1e-9);
});

test('PIP_LAYOUT: 每面点数正确且位置合法不重复', () => {
  for (let f = 1; f <= 6; f++) {
    const pips = PIP_LAYOUT[f];
    assert.equal(pips.length, f);
    const keys = new Set(pips.map(([r, c]) => `${r},${c}`));
    assert.equal(keys.size, f, 'no duplicate pips');
    for (const [r, c] of pips) assert.ok(r >= 1 && r <= 3 && c >= 1 && c <= 3);
  }
});

test('judgeBigSmall: 3 颗 D6 以 10/11 为界；其他颗数按中线', () => {
  assert.equal(judgeBigSmall([1, 2, 3]), 'small');
  assert.equal(judgeBigSmall([4, 3, 3]), 'small'); // 10
  assert.equal(judgeBigSmall([4, 4, 3]), 'big'); // 11
  assert.equal(judgeBigSmall([6, 6, 6]), 'big');
  assert.equal(judgeBigSmall([3, 4]), 'even'); // 7 = 2×3.5
  assert.equal(judgeBigSmall([1]), 'small');
  assert.equal(judgeBigSmall([4]), 'big');
  assert.equal(judgeBigSmall([10], 20), 'small'); // 中线 10.5
  assert.equal(judgeBigSmall([11], 20), 'big');
});

test('analyzeDice / diceSpecialKeys: 豹子、顺子、对子、四五六、一二三、满堂红', () => {
  const t = analyzeDice([5, 5, 5]);
  assert.equal(t.sum, 15);
  assert.equal(t.triple, true);
  assert.equal(t.allSame, true);
  assert.deepEqual(diceSpecialKeys([5, 5, 5]), ['triple']);
  assert.deepEqual(diceSpecialKeys([6, 6, 6]), ['triple', 'allMax']);
  assert.deepEqual(diceSpecialKeys([1, 1, 1]), ['triple', 'allOne']);
  assert.deepEqual(diceSpecialKeys([6, 4, 5]), ['456']);
  assert.deepEqual(diceSpecialKeys([3, 1, 2]), ['123']);
  assert.deepEqual(diceSpecialKeys([2, 3, 4]), ['straight']);
  assert.deepEqual(diceSpecialKeys([2, 2, 5]), ['onePair']);
  assert.deepEqual(diceSpecialKeys([4, 4]), ['pair']);
  assert.deepEqual(diceSpecialKeys([3, 4]), ['seven']);
  assert.deepEqual(diceSpecialKeys([2, 2, 5, 5]), ['twoPair']);
  assert.deepEqual(diceSpecialKeys([2, 2, 2, 2]), ['allSame']);
  assert.deepEqual(diceSpecialKeys([1, 3, 5]), []);
  assert.deepEqual(diceSpecialKeys([20], 20), ['nat20']);
  assert.deepEqual(diceSpecialKeys([1], 20), ['nat1']);
  for (const k of ['triple', 'allSame', 'pair', 'onePair', 'twoPair', '456', '123', 'straight', 'allMax', 'allOne', 'seven', 'nat20', 'nat1']) {
    assert.ok(data.DICE_SPECIALS[k] && data.DICE_SPECIALS[k].name && data.DICE_SPECIALS[k].text, 'special text for ' + k);
  }
});

test('sumBand: 低 / 中 / 高', () => {
  assert.equal(sumBand([1, 1, 1]), 'low');
  assert.equal(sumBand([3, 4, 3]), 'mid');
  assert.equal(sumBand([6, 6, 5]), 'high');
  assert.equal(sumBand([1]), 'low');
  assert.equal(sumBand([6]), 'high');
});

test('diceSlots: 数量正确，两颗之间不重叠', () => {
  for (let n = 1; n <= 6; n++) {
    const s = diceSlots(n, 52);
    assert.equal(s.length, n);
    for (let i = 0; i < n; i++) {
      assert.ok(Math.abs(s[i].x) <= 100 && Math.abs(s[i].y) <= 60, '落在托盘内');
      for (let j = i + 1; j < n; j++) {
        const d = Math.hypot(s[i].x - s[j].x, s[i].y - s[j].y);
        assert.ok(d >= 52 * 1.25, `slot ${i}/${j} too close: ${d}`);
      }
    }
  }
});

/* ------------------------------ 二选一 ------------------------------ */

test('fitFontSize: 越长越小，长文分两行', () => {
  const s1 = fitFontSize('做');
  const s2 = fitFontSize('不做');
  const s4 = fitFontSize('去看电影');
  const s6 = fitFontSize('再来一杯咖啡');
  const s8 = fitFontSize('把这件事说出去');
  assert.equal(s1.lines, 1);
  assert.ok(s1.size >= s2.size && s2.size >= s4.size);
  assert.equal(s4.lines, 1);
  assert.equal(s6.lines, 2);
  assert.equal(s8.lines, 2);
  assert.ok(s6.size >= s8.size);
  assert.ok(s8.size >= 14);
  assert.ok(fitFontSize('Yes').size >= fitFontSize('YesYesYes').size);
  assert.ok(textWeight('ab') < textWeight('人人'));
});

test('normalizeOption / pickOption', () => {
  assert.equal(normalizeOption('  ', '做'), '做');
  assert.equal(normalizeOption(' 去  吃 饭 ', '做'), '去 吃 饭');
  assert.equal(normalizeOption('一二三四五六七八九十', '做'), '一二三四五六七八');
  assert.deepEqual(pickOption(HEADS, 'A', 'B'), { winner: 'A', loser: 'B' });
  assert.deepEqual(pickOption(TAILS, 'A', 'B'), { winner: 'B', loser: 'A' });
});

test('fillTemplate', () => {
  assert.equal(fillTemplate('{w} 胜 {l}', { w: '做', l: '不做' }), '做 胜 不做');
  assert.equal(fillTemplate('{n} 抛', { n: 3 }), '3 抛');
  assert.equal(fillTemplate('{x}', {}), '');
});

/* ------------------------------ 内容 ------------------------------ */

const PLACEHOLDER = /TODO|待补|示例|占位|lorem/i;

test('data: 判词数量与占位词检查', () => {
  assert.ok(data.CHOICE_VERDICTS.length >= 20, '二选一判词 ≥ 20');
  for (const v of data.CHOICE_VERDICTS) {
    assert.ok(v.includes('{w}'), '判词须含胜出项: ' + v);
    assert.ok(!PLACEHOLDER.test(v));
  }
  assert.ok(data.COIN_QUIPS.heads.length >= 10 && data.COIN_QUIPS.tails.length >= 10);
  const all = JSON.stringify(data);
  assert.ok(!PLACEHOLDER.test(all), '不得出现占位文字');
  assert.ok(!/�/.test(all), '不得出现乱码');
});

test('data: 结构完整', () => {
  for (const f of ['heads', 'tails', 'edge']) {
    const x = data.FACES[f];
    assert.ok(x.name && x.alias && x.badge && x.seal && x.dot && x.meaning, 'face ' + f);
    assert.ok(data.COIN_QUIPS[f].length >= 3);
  }
  for (const s of ['big', 'small', 'even']) assert.ok(data.DICE_SIZE[s].name && data.DICE_SIZE[s].text);
  for (const b of ['low', 'mid', 'high']) assert.ok(data.DICE_SUM_FLAVOR[b].length >= 3);
  for (let i = 1; i <= 6; i++) assert.ok(data.D6_SINGLE[i]);
  assert.deepEqual(
    data.MODES.map((m) => m.value),
    ['coin', 'dice', 'choice'],
  );
  assert.deepEqual(
    data.BURST_MODES.map((m) => m.value),
    [1, 3, 5, 10],
  );
  assert.equal(data.DICE_COUNTS.length, 6);
  assert.ok(data.CHOICE_PRESETS.every(([a, b]) => a && b && a !== b));
  assert.ok(Object.keys(data.COIN_INSCRIPTION).length === 4);
  for (const m of ['coin', 'dice', 'choice']) assert.ok(data.STAGE_HINT[m] && data.GESTURE_TEXT[m] && data.PRIMARY_LABEL[m]);
});
