// 硬币骰子 · 纯逻辑（无 DOM、无 window）。可直接搬到小程序。
// 三种玩法共用：硬币正反 / 骰子点数与朝上面旋转 / 二选一。
import { random } from '../../core/rng.js';

export const HEADS = 'heads';
export const TAILS = 'tails';
export const EDGE = 'edge';

/* ------------------------------ 硬币 ------------------------------ */

/**
 * 抛一枚硬币。rnd 可注入以便测试。
 * edgeChance 为"立币"彩蛋概率，默认 0（完全公平：一次 rnd，< 0.5 为正）。
 */
export function flipCoin(rnd = random, { edgeChance = 0 } = {}) {
  if (edgeChance > 0 && rnd() < edgeChance) return EDGE;
  return rnd() < 0.5 ? HEADS : TAILS;
}

/** 各面静止时的 rotateX 角度：正 0 / 反 180 / 立 90 */
export const FACE_OFFSET = { [HEADS]: 0, [TAILS]: 180, [EDGE]: 90 };

export function restAngle(face) {
  return FACE_OFFSET[face] ?? 0;
}

/** 由体感强度决定翻转圈数：3–7 圈（强度 10 以下 3 圈，40 以上 7 圈） */
export function spinsForIntensity(intensity = 20) {
  const v = Number(intensity);
  const k = Math.max(0, Math.min(1, ((Number.isFinite(v) ? v : 20) - 10) / 30));
  return 3 + Math.round(k * 4);
}

/** 动画终止角度 = 圈数×360 + 该面的静止角度 */
export function flipAngle(face, spins) {
  return spins * 360 + restAngle(face);
}

/** 体感强度 → 动画力度系数 0.7–1.5 */
export function powerOf(intensity = 20) {
  const v = Number(intensity);
  return Math.max(0.7, Math.min(1.5, (Number.isFinite(v) ? v : 20) / 20));
}

/** 多数判定（连抛 / 三局两胜）。results: ['heads'|'tails'...] */
export function majority(results) {
  const counts = { heads: 0, tails: 0 };
  for (const r of results) if (counts[r] != null) counts[r]++;
  const tie = counts.heads === counts.tails;
  const winner = tie ? null : counts.heads > counts.tails ? HEADS : TAILS;
  return { counts, tie, winner, total: results.length, sweep: !tie && (counts.heads === 0 || counts.tails === 0) };
}

/** 末尾连续相同的一段：{face, len} */
export function streakOf(history) {
  if (!history || !history.length) return { face: null, len: 0 };
  const face = history[history.length - 1];
  let len = 0;
  for (let i = history.length - 1; i >= 0 && history[i] === face; i--) len++;
  return { face, len };
}

/** 累计计数 + 最近 N 次历史（纯函数，返回新对象） */
export function pushHistory(history, face, limit = 20) {
  return history.concat([face]).slice(-limit);
}

/* ------------------------------ 骰子 ------------------------------ */

/** 掷 n 颗 sides 面骰。返回长度 n、取值 [1, sides] 的数组 */
export function rollDice(n, sides = 6, rnd = random) {
  const count = Math.max(1, Math.min(12, Math.floor(Number(n)) || 1));
  const s = Math.max(2, Math.floor(Number(sides)) || 6);
  const out = [];
  for (let i = 0; i < count; i++) out.push(1 + Math.floor(rnd() * s));
  return out;
}

/**
 * 未旋转立方体各面的法向量（CSS 坐标：x 右、y 下、z 朝观者）。
 * 对应 CSS 面布局：
 *   1 → translateZ(h)             +z
 *   6 → rotateY(180) translateZ   −z
 *   2 → rotateY(90) translateZ    +x
 *   5 → rotateY(−90) translateZ   −x
 *   3 → rotateX(90) translateZ    −y
 *   4 → rotateX(−90) translateZ   +y
 * 对面之和为 7。
 */
export const FACE_NORMALS = {
  1: [0, 0, 1],
  6: [0, 0, -1],
  2: [1, 0, 0],
  5: [-1, 0, 0],
  3: [0, -1, 0],
  4: [0, 1, 0],
};

/** 让某一面朝上（+z）的立方体旋转，写作 CSS `rotateX(rx) rotateY(ry)` */
export const DICE_ROTATION = {
  1: { rx: 0, ry: 0 },
  6: { rx: 180, ry: 0 },
  2: { rx: 0, ry: -90 },
  5: { rx: 0, ry: 90 },
  3: { rx: -90, ry: 0 },
  4: { rx: 90, ry: 0 },
};

export function diceRotation(face) {
  return DICE_ROTATION[face] || DICE_ROTATION[1];
}

/**
 * 用 CSS 同样的顺序旋转一个向量：transform: rotateX(rx) rotateY(ry)
 * 即先施加 rotateY 再施加 rotateX（CSS 矩阵从右往左作用于点）。
 */
export function rotateVec([x, y, z], rx, ry) {
  const a = (ry * Math.PI) / 180;
  const b = (rx * Math.PI) / 180;
  // rotateY(a): x' = x cos a + z sin a ; z' = −x sin a + z cos a
  const x1 = x * Math.cos(a) + z * Math.sin(a);
  const y1 = y;
  const z1 = -x * Math.sin(a) + z * Math.cos(a);
  // rotateX(b): y'' = y cos b − z sin b ; z'' = y sin b + z cos b
  return [x1, y1 * Math.cos(b) - z1 * Math.sin(b), y1 * Math.sin(b) + z1 * Math.cos(b)];
}

/** 点数在 3×3 网格里的位置 [row, col]（1 起） */
export const PIP_LAYOUT = {
  1: [[2, 2]],
  2: [
    [1, 1],
    [3, 3],
  ],
  3: [
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  4: [
    [1, 1],
    [1, 3],
    [3, 1],
    [3, 3],
  ],
  5: [
    [1, 1],
    [1, 3],
    [2, 2],
    [3, 1],
    [3, 3],
  ],
  6: [
    [1, 1],
    [2, 1],
    [3, 1],
    [1, 3],
    [2, 3],
    [3, 3],
  ],
};

/** 大小：总和大于中线为大、小于为小、正好为平。3 颗 D6：≤10 小 / ≥11 大 */
export function judgeBigSmall(values, sides = 6) {
  const sum = values.reduce((a, b) => a + b, 0);
  const mid = (values.length * (sides + 1)) / 2;
  if (sum > mid) return 'big';
  if (sum < mid) return 'small';
  return 'even';
}

/** 一把骰子的结构化分析 */
export function analyzeDice(values, sides = 6) {
  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const sorted = values.slice().sort((a, b) => a - b);
  const allSame = n >= 2 && sorted.every((v) => v === sorted[0]);
  const triple = n === 3 && allSame;
  const straight = n >= 3 && sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const pairs = Object.values(counts).filter((c) => c === 2).length;
  const min = n;
  const max = n * sides;
  const ratio = max > min ? (sum - min) / (max - min) : 0.5;
  return { n, sum, sides, sorted, size: judgeBigSmall(values, sides), allSame, triple, straight, pairs, min, max, ratio };
}

/** 彩蛋关键字（对应 data.DICE_SPECIALS 的键），按重要程度排序 */
export function diceSpecialKeys(values, sides = 6) {
  const a = analyzeDice(values, sides);
  const keys = [];
  const key = a.sorted.join(',');
  if (a.triple) keys.push('triple');
  else if (a.allSame) keys.push(a.n === 2 ? 'pair' : 'allSame');
  if (a.n === 3 && key === '4,5,6') keys.push('456');
  else if (a.n === 3 && key === '1,2,3') keys.push('123');
  else if (a.straight) keys.push('straight');
  if (a.n >= 2 && values.every((v) => v === sides)) keys.push('allMax');
  else if (a.n >= 2 && values.every((v) => v === 1)) keys.push('allOne');
  if (!a.allSame && a.n >= 3 && a.pairs === 1) keys.push('onePair');
  if (a.n >= 4 && a.pairs >= 2) keys.push('twoPair');
  if (a.n === 2 && sides === 6 && a.sum === 7) keys.push('seven');
  if (a.n === 1 && sides === 20 && values[0] === 20) keys.push('nat20');
  if (a.n === 1 && sides === 20 && values[0] === 1) keys.push('nat1');
  return keys;
}

/** 总和所处区段：low / mid / high */
export function sumBand(values, sides = 6) {
  const { ratio } = analyzeDice(values, sides);
  if (ratio < 0.34) return 'low';
  if (ratio > 0.66) return 'high';
  return 'mid';
}

/**
 * n 颗骰子在托盘上的落点（相对托盘中心，px）。
 * ≤3 颗一排，4–6 颗两排；任意两颗中心距 ≥ size×1.3。
 */
export function diceSlots(n, size = 52) {
  const count = Math.max(1, Math.min(12, Math.floor(n) || 1));
  const rows = count <= 3 ? [count] : [Math.ceil(count / 2), Math.floor(count / 2)];
  const gapX = size * 1.55;
  const gapY = size * 1.3;
  const out = [];
  rows.forEach((c, ri) => {
    const y = rows.length === 1 ? 0 : ri === 0 ? -gapY / 2 : gapY / 2;
    for (let i = 0; i < c; i++) out.push({ x: (i - (c - 1) / 2) * gapX, y });
  });
  return out;
}

/* ------------------------------ 二选一 ------------------------------ */

/** 文字"视觉宽度"：中日韩全角按 1，拉丁/数字按 0.6 */
export function textWeight(text) {
  let w = 0;
  for (const ch of String(text || '')) w += ch.charCodeAt(0) < 0x2e80 ? 0.6 : 1;
  return w;
}

/**
 * 自动缩字：在直径 150 的硬币上放下 A/B 文字。
 * ≤4 个字一行，更长的分两行。返回 {size(px), lines}
 */
export function fitFontSize(text, { width = 104, max = 60, min = 14 } = {}) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const weight = Math.max(0.6, textWeight(text));
  if (weight <= 4) return { size: clamp(Math.floor(width / weight) - 2, min, max), lines: 1 };
  const perLine = Math.ceil(weight / 2);
  return { size: clamp(Math.floor(width / perLine) - 2, min, 40), lines: 2 };
}

/** 清洗选项文字：去首尾空白、限长、空则用默认 */
export function normalizeOption(text, fallback, maxLen = 8) {
  const t = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  const chars = [...t];
  return chars.length ? chars.slice(0, maxLen).join('') : fallback;
}

/** 由硬币面得出胜者：正面 → A，反面 → B */
export function pickOption(face, a, b) {
  return face === HEADS ? { winner: a, loser: b } : { winner: b, loser: a };
}

/* ------------------------------ 工具 ------------------------------ */

/** 简单模板：'{w} 胜' → vars.w */
export function fillTemplate(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (_, k) => (vars[k] == null ? '' : String(vars[k])));
}

/** 正面率百分比（整数），无数据返回 null */
export function headsRate(tally) {
  const total = (tally.heads || 0) + (tally.tails || 0);
  if (!total) return null;
  return Math.round(((tally.heads || 0) / total) * 100);
}
