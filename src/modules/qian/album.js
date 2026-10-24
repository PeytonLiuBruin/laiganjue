// 签纸收集册 · 纯逻辑（无 DOM）。每支抽到过的灵签收进册子，记下第一次抽到的日期与次数。
// 存储形状：{ [签号]: { first: 'YYYY-MM-DD', times: n } }，旧版只有最近 8 条历史，打开时补录进来。
import { LOTS, LEVELS } from './data.js';

export const ALBUM_TOTAL = LOTS.length;

/** 清洗存档：只保留存在的签号，次数至少 1。 */
export function normalizeAlbum(raw, lots = LOTS) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  const valid = new Set(lots.map((l) => l.no));
  for (const [k, v] of Object.entries(raw)) {
    const no = Number(k);
    if (!valid.has(no)) continue;
    out[no] = { first: typeof v?.first === 'string' ? v.first : '', times: Math.max(1, Math.floor(Number(v?.times) || 1)) };
  }
  return out;
}

/** 收进一支签，返回 { album, fresh }。fresh 为 true 表示第一次收到这支。不改动传入对象。 */
export function collectLot(album, no, date = '') {
  const prev = album[no];
  const next = { ...album, [no]: prev ? { ...prev, times: prev.times + 1 } : { first: date, times: 1 } };
  return { album: next, fresh: !prev };
}

/** 把旧的最近历史补录进册子（已收过的不加次数）。 */
export function backfillAlbum(album, history = []) {
  let next = album;
  for (const x of history || []) {
    if (x && !next[x.no] && LOTS.some((l) => l.no === x.no)) next = { ...next, [x.no]: { first: x.date || '', times: 1 } };
  }
  return next;
}

/** 统计：已收多少支、各等级收了多少 / 共多少。 */
export function albumStats(album, lots = LOTS) {
  const byLevel = LEVELS.map((l) => ({ id: l.id, tone: l.tone, have: 0, total: 0 }));
  const idx = Object.fromEntries(byLevel.map((x, i) => [x.id, i]));
  let count = 0;
  for (const lot of lots) {
    const row = byLevel[idx[lot.level]];
    if (!row) continue;
    row.total++;
    if (album[lot.no]) { row.have++; count++; }
  }
  return { count, total: lots.length, byLevel, complete: count === lots.length };
}

// 里程碑：集到一定数量点亮一枚签册徽章。奖励只是看得见的荣誉（徽章印在所有分享卡上、结果金星加量），
// 不送任何付费内容，免得和内购冲突。
export const MILESTONES = [
  { at: 8, id: 'chu', name: '初窥', stars: 24 },
  { at: 16, id: 'ru', name: '入门', stars: 30 },
  { at: 32, id: 'ban', name: '半册', stars: 36 },
  { at: 48, id: 'tong', name: '通达', stars: 42 },
  { at: 64, id: 'man', name: '圆满', stars: 54 },
];

/** 已收数量对应的最高徽章，没到第一档返回 null。 */
export function badgeOf(count, list = MILESTONES) {
  let got = null;
  for (const m of list) if (count >= m.at) got = m;
  return got;
}

/** 从 prev 支收到 next 支时新跨过的里程碑（一次只会跨一档，防御起见取最高的）。 */
export function crossedMilestone(prevCount, nextCount, list = MILESTONES) {
  const a = badgeOf(prevCount, list), b = badgeOf(nextCount, list);
  return b && b !== a ? b : null;
}

/** 收进这支签后刚好集齐的等级（如「上上」），没有返回 null。 */
export function completedLevel(prevAlbum, nextAlbum, lots = LOTS) {
  const before = albumStats(prevAlbum, lots).byLevel, after = albumStats(nextAlbum, lots).byLevel;
  const hit = after.find((x, i) => x.total && x.have === x.total && before[i].have < before[i].total);
  return hit ? hit.id : null;
}
