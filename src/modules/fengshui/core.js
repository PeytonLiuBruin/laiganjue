// 风水 · 纯逻辑（无 DOM）：方位换算、命卦、八宅八星、年紫白飞星。
import { DIRECTIONS, MOUNTAINS, GUA, GUA_BY_NUM, EIGHT_HOUSE, STARS8, NINE_STARS } from './data.js';

export function normalizeHeading(deg) {
  const n = Number(deg) || 0;
  return ((n % 360) + 360) % 360;
}

/** 朝向角度 → 八方位对象 */
export function directionAt(heading) {
  const h = normalizeHeading(heading);
  return DIRECTIONS[Math.round(h / 45) % 8];
}

/** 朝向角度 → 二十四山 */
export function mountainAt(heading) {
  const h = normalizeHeading(heading);
  return MOUNTAINS[Math.round(h / 15) % 24];
}

/** 最短有向角差 a − b，范围 (−180, 180]：用于平滑转动与判断"是否已转离记录的方位" */
export function angleDiff(a, b) {
  let d = normalizeHeading(a) - normalizeHeading(b);
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

export function directionByName(name) {
  return DIRECTIONS.find((d) => d.name === name) || null;
}

/** 数字各位相加直到一位数 */
export function digitSum(n) {
  let s = Math.abs(Math.trunc(Number(n) || 0));
  while (s > 9) s = String(s).split('').reduce((a, c) => a + Number(c), 0);
  return s;
}

/**
 * 命卦：year 出生年（以立春为界，调用方负责），gender 'male' | 'female'
 * 男 1900–1999：10 − s；男 2000+：9 − s；女 1900–1999：s + 5；女 2000+：s + 6；
 * 结果逐位相加至一位；0 视为 9；男得 5 → 坤(2)，女得 5 → 艮(8)。s 为年份后两位数字和的一位数。
 */
export function mingGua(year, gender) {
  const y = Math.trunc(Number(year));
  if (!Number.isFinite(y)) return null;
  const s = digitSum(y % 100);
  let g = gender === 'male' ? (y < 2000 ? 10 - s : 9 - s) : y < 2000 ? s + 5 : s + 6;
  g = digitSum(g);
  if (g === 0) g = 9;
  if (g === 5) g = gender === 'male' ? 2 : 8;
  return GUA_BY_NUM[g];
}

export function guaInfo(gua) {
  return GUA[gua] ? { name: gua, ...GUA[gua] } : null;
}
export function guaGroup(gua) {
  return GUA[gua] ? GUA[gua].group : null;
}

/** 某命卦在某方位的星 */
export function starFor(gua, dirName) {
  const table = EIGHT_HOUSE[gua];
  if (!table) return null;
  return Object.keys(table).find((k) => table[k] === dirName) || null;
}

/** 八方位 → 星位（带吉凶），自北顺时针 */
export function houseMap(gua) {
  return DIRECTIONS.map((d) => {
    const star = starFor(gua, d.name);
    return { ...d, star, ...(STARS8[star] || {}) };
  });
}

export function luckyDirections(gua) {
  return houseMap(gua)
    .filter((x) => ['great', 'good'].includes(x.tone))
    .sort((a, b) => a.rank - b.rank)
    .map((x) => x.name);
}

/** 按吉凶把方位分成两组（吉：great/good；凶：warn/bad），有 rank 的按 rank 排，否则保持原序 */
export function splitByTone(items) {
  const lucky = (x) => x.tone === 'great' || x.tone === 'good';
  const byRank = (a, b) => (a.rank ?? 0) - (b.rank ?? 0);
  return {
    lucky: items.filter(lucky).sort(byRank),
    unlucky: items.filter((x) => !lucky(x)).sort(byRank),
  };
}

/** 年紫白入中星：2024→3 2025→2 2026→1 2027→9 2018→9 1999→1 */
export function annualCenter(year) {
  const m = (((Math.trunc(year) - 2000) % 9) + 9) % 9;
  return 9 - m;
}

/** 九宫飞星：返回 { center, palaces:[{...direction, star, ...NINE_STARS[star]}] } */
export function annualStars(year) {
  const center = annualCenter(year);
  const starAt = (palace) => ((((center - 5 + palace - 1) % 9) + 9) % 9) + 1;
  const palaces = DIRECTIONS.map((d) => {
    const star = starAt(d.palace);
    const info = NINE_STARS[star];
    return { ...d, star, starName: info.name, short: info.short, tone: info.tone, meaning: info.meaning, advice: info.advice };
  });
  return { year, center, centerInfo: NINE_STARS[center], palaces };
}

/** 3×3 展示顺序（上北下南）：NW N NE / W 中 E / SW S SE */
export const GRID_ORDER = ['NW', 'N', 'NE', 'W', 'C', 'E', 'SW', 'S', 'SE'];

/** 把方位数组排成 3×3（中宫由 centerCell 提供） */
export function toGrid(items, centerCell) {
  const byId = Object.fromEntries(items.map((it) => [it.id, it]));
  return GRID_ORDER.map((id) => (id === 'C' ? { id: 'C', ...centerCell } : byId[id]));
}

export function compassShareText({ heading, mountain, direction, gua, star }) {
  const lines = [`【罗盘】朝向 ${Math.round(heading)}° · ${mountain}山 · ${direction.full}（${direction.gua} ${direction.symbol}）`];
  if (gua && star) lines.push(`对 ${gua}命 而言此方为「${star}」· ${STARS8[star].label}`);
  lines.push('—— 来感觉 · 玄学占卜');
  return lines.join('\n');
}
