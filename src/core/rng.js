// 随机数工具（纯函数，无平台依赖）。
// - 真随机：crypto.getRandomValues 优先，回退 Math.random
// - 可复现随机：mulberry32 种子随机（"今日运势"这类需要一天内稳定的结果）
// - 字符串哈希：cyrb53

let cryptoObj = null;
try {
  cryptoObj = typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues ? globalThis.crypto : null;
} catch {
  cryptoObj = null;
}

/** [0,1) 真随机 */
export function random() {
  if (cryptoObj) {
    const u = new Uint32Array(1);
    cryptoObj.getRandomValues(u);
    return u[0] / 4294967296;
  }
  return Math.random();
}

/** 整数 [min, max] 闭区间 */
export function randomInt(min, max, rnd = random) {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  return lo + Math.floor(rnd() * (hi - lo + 1));
}

/** 随机取一个元素 */
export function pick(arr, rnd = random) {
  if (!arr || !arr.length) return undefined;
  return arr[Math.floor(rnd() * arr.length)];
}

/** 不重复取 n 个 */
export function pickMany(arr, n, rnd = random) {
  return shuffle(arr, rnd).slice(0, Math.max(0, Math.min(n, arr.length)));
}

/** Fisher–Yates，返回新数组 */
export function shuffle(arr, rnd = random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** 按权重抽取：items 数组，weightOf(item) 返回权重 */
export function weightedPick(items, weightOf, rnd = random) {
  let total = 0;
  const ws = items.map((it) => {
    const w = Math.max(0, Number(weightOf(it)) || 0);
    total += w;
    return w;
  });
  if (total <= 0) return pick(items, rnd);
  let r = rnd() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r < 0) return items[i];
  }
  return items[items.length - 1];
}

/** 概率判定 */
export function chance(p, rnd = random) {
  return rnd() < p;
}

/** cyrb53 字符串哈希 → 32 位无符号整数 */
export function hashString(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0) * 4294967296 + (h1 >>> 0);
}

/** mulberry32 种子随机数生成器，返回 () => [0,1) */
export function seeded(seed) {
  let a = (typeof seed === 'string' ? hashString(seed) : Number(seed) || 0) >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 本地日期 → 'YYYY-MM-DD' */
export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 当日稳定的随机源：同一天、同一个 salt → 同一序列 */
export function dailyRng(salt = '', date = new Date()) {
  return seeded(`${dateKey(date)}|${salt}`);
}
