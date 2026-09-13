// 御神签 · 纯逻辑（无 DOM）。可被 node --test 直接测试，可原样搬到小程序。
import { random, weightedPick, pick } from '../../core/rng.js';
import { LEVELS, LOTS, ITEM_KEYS, TEXT, cnNumber } from './data.js';

export { LEVELS, LOTS, ITEM_KEYS, cnNumber };

export const LEVEL_MAP = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

/** 等级权重总和（规格：100） */
export function totalWeight(levels = LEVELS) {
  return levels.reduce((s, l) => s + (Number(l.weight) || 0), 0);
}

/** 取等级对象；传入 id 或对象皆可 */
export function levelOf(x) {
  if (!x) return null;
  return typeof x === 'string' ? LEVEL_MAP[x] || null : x;
}

/** 是否凶系 */
export function isBad(x) {
  const l = levelOf(x);
  return !!(l && l.bad);
}

/** 按权重抽等级。rnd 可注入以便测试 */
export function pickLevel(rnd = random, levels = LEVELS) {
  return weightedPick(levels, (l) => l.weight, rnd);
}

/** 某等级下的全部签 */
export function lotsOfLevel(levelId, lots = LOTS) {
  return lots.filter((l) => l.level === levelId);
}

/**
 * 抽签：先按权重抽等级，再在该等级内均匀抽签。
 * 若该等级无签（数据缺失），退回全体均匀抽取。
 */
export function pickLot(rnd = random, { levels = LEVELS, lots = LOTS } = {}) {
  const level = pickLevel(rnd, levels);
  const pool = lotsOfLevel(level.id, lots);
  return pool.length ? pick(pool, rnd) : pick(lots, rnd);
}

/** 按番号取签（'第十二番' 或 12） */
export function lotByNo(no, lots = LOTS) {
  if (typeof no === 'number') return lots.find((l) => l.n === no) || null;
  return lots.find((l) => l.no === no) || null;
}

/* ------------------------------ 数据校验 ------------------------------ */
const len = (s) => Array.from(String(s || '')).length;
const PLACEHOLDER = /TODO|待补|示例|占位|xxx|＋＋|\?\?/i;

/**
 * 校验签库：≥50 支、番号唯一、和歌 4 行（每行 5–9 字）、12 项齐全（每项 6–14 字）、总运 60–100 字、
 * 每个等级至少 1 签、不含占位文字。返回 { ok, errors: string[] }
 */
export function validateLots(lots = LOTS, levels = LEVELS) {
  const errors = [];
  if (lots.length < 50) errors.push(`签数不足：${lots.length} < 50`);
  const nos = new Set();
  const wakaSeen = new Set();
  const perLevel = Object.fromEntries(levels.map((l) => [l.id, 0]));
  for (const lot of lots) {
    const tag = lot.no || `#${lot.n}`;
    if (!lot.no || nos.has(lot.no)) errors.push(`${tag}: 番号缺失或重复`);
    nos.add(lot.no);
    if (!(lot.level in perLevel)) errors.push(`${tag}: 未知等级 ${lot.level}`);
    else perLevel[lot.level]++;
    if (!Array.isArray(lot.waka) || lot.waka.length !== 4) errors.push(`${tag}: 和歌应为 4 行`);
    else {
      lot.waka.forEach((line, i) => {
        const n = len(line);
        if (n < 5 || n > 9) errors.push(`${tag}: 和歌第 ${i + 1} 行 ${n} 字（应 5–9）`);
      });
      const key = lot.waka.join('/');
      if (wakaSeen.has(key)) errors.push(`${tag}: 和歌与他签重复`);
      wakaSeen.add(key);
    }
    const sn = len(lot.summary);
    if (sn < 60 || sn > 100) errors.push(`${tag}: 总运 ${sn} 字（应 60–100）`);
    if (!lot.items || typeof lot.items !== 'object') errors.push(`${tag}: 缺 items`);
    else {
      for (const k of ITEM_KEYS) {
        const v = lot.items[k];
        if (!v) {
          errors.push(`${tag}: 缺项目「${k}」`);
          continue;
        }
        const n = len(v);
        if (n < 6 || n > 14) errors.push(`${tag}: 「${k}」${n} 字（应 6–14）`);
      }
      const extra = Object.keys(lot.items).filter((k) => !ITEM_KEYS.includes(k));
      if (extra.length) errors.push(`${tag}: 多余项目 ${extra.join(',')}`);
    }
    const all = [lot.summary, ...(lot.waka || []), ...Object.values(lot.items || {})].join(' ');
    if (PLACEHOLDER.test(all)) errors.push(`${tag}: 含占位文字`);
  }
  for (const [id, n] of Object.entries(perLevel)) if (n < 1) errors.push(`等级 ${id} 没有签`);
  if (totalWeight(levels) !== 100) errors.push(`等级权重和 ${totalWeight(levels)} ≠ 100`);
  return { ok: errors.length === 0, errors };
}

/* ------------------------------ 结绳架 ------------------------------ */
export const RACK_MAX = 12;

/** 结绳架状态：{ tied: 累计结签数, list: 最近若干张 { no, level, date } } */
export function initRack() {
  return { tied: 0, list: [] };
}

/** 结签：计数 +1，记录一条（列表最多保留 RACK_MAX * 2 条） */
export function tieUp(rack, entry = {}) {
  const r = rack && typeof rack === 'object' ? rack : initRack();
  const list = (r.list || []).concat([{ no: entry.no || '', level: entry.level || '', date: entry.date || '' }]).slice(-RACK_MAX * 2);
  return { tied: (Number(r.tied) || 0) + 1, list };
}

/** 解签：取下最近一张；空架不变 */
export function untie(rack) {
  const r = rack && typeof rack === 'object' ? rack : initRack();
  const tied = Number(r.tied) || 0;
  if (tied <= 0) return { tied: 0, list: [] };
  return { tied: tied - 1, list: (r.list || []).slice(0, -1) };
}

/** 架上可见的纸条（最多 RACK_MAX 张，最近的在后） */
export function visibleKnots(rack) {
  const r = rack && typeof rack === 'object' ? rack : initRack();
  const tied = Math.max(0, Number(r.tied) || 0);
  const list = (r.list || []).slice(-RACK_MAX);
  // 计数多于记录（旧版本数据）时用空条补齐
  while (list.length < Math.min(tied, RACK_MAX)) list.unshift({ no: '', level: '', date: '' });
  return list;
}

/* ------------------------------ 今日记录 ------------------------------ */
/** daily = { date: 'YYYY-MM-DD', count } */
export function drawnToday(daily, dateKey) {
  return !!(daily && daily.date === dateKey && Number(daily.count) > 0);
}

export function markDrawn(daily, dateKey) {
  const same = daily && daily.date === dateKey;
  return { date: dateKey, count: same ? (Number(daily.count) || 0) + 1 : 1 };
}

/* ------------------------------ 流程状态机 ------------------------------ */
// idle → shaking → stick → paper → idle
export const PHASE = { IDLE: 'idle', SHAKING: 'shaking', STICK: 'stick', PAPER: 'paper' };
const TRANSITIONS = {
  idle: { shake: 'shaking' },
  shaking: { out: 'stick', reset: 'idle' },
  stick: { draw: 'paper', reset: 'idle' },
  paper: { reset: 'idle' },
};

/** 返回下一阶段；非法动作返回 null */
export function nextPhase(phase, action) {
  const t = TRANSITIONS[phase];
  return (t && t[action]) || null;
}

/* ------------------------------ 分享文本 ------------------------------ */
export function shareText(lot, { title = TEXT.shareTitle, footer = TEXT.shareFooter } = {}) {
  const level = levelOf(lot.level);
  const items = ITEM_KEYS.slice(0, 4)
    .map((k) => `${k}：${lot.items[k]}`)
    .join('　');
  return [`${title}${lot.no} · ${level ? level.name : ''}`, lot.waka.join(' / '), lot.summary, items, footer].join('\n');
}

/** 等级色调 → CSS 类名后缀 */
export function toneOf(x) {
  const l = levelOf(x);
  return l ? l.tone : 'ink';
}
