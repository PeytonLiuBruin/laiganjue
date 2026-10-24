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
