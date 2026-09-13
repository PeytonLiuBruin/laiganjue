// 卢恩符文 · 纯逻辑（无 DOM）。可直接搬到小程序。
// 抽符 / 今日符文 / 校验 / 结果模型 / 会话状态机。所有文案来自 data.js。
import { random, shuffle, dailyRng, dateKey } from '../../core/rng.js';
import { RUNES, NON_REVERSIBLE, SPREADS, TONE, AETTS, UI_TEXT } from './data.js';

export { RUNES, SPREADS, NON_REVERSIBLE };

const NON_REV_SET = new Set(NON_REVERSIBLE);
const AETT_NAMES = Object.values(AETTS).map((a) => a.name);

/** 按 id 找符文 */
export function runeById(id) {
  return RUNES.find((r) => r.id === id) || null;
}

/** 按 id 找牌阵；找不到回退到单符 */
export function getSpread(id) {
  return SPREADS.find((s) => s.id === id) || SPREADS[0];
}

/**
 * 校验数据完整性：24 枚、id/name/zh 唯一、path 非空且只含直线命令、
 * 不可逆列表与 reversible 标记一致、三族各 8 枚、文案长度在规格范围内。
 * → { ok, errors: string[] }
 */
export function validateRunes(runes = RUNES) {
  const errors = [];
  if (runes.length !== 24) errors.push(`应为 24 枚，实际 ${runes.length}`);
  const uniq = (key) => {
    const seen = new Set();
    for (const r of runes) {
      const v = r[key];
      if (!v) errors.push(`${r.id || '?'} 缺少 ${key}`);
      else if (seen.has(v)) errors.push(`${key} 重复：${v}`);
      seen.add(v);
    }
  };
  uniq('id');
  uniq('name');
  uniq('zh');
  const pathRe = /^[MLHVZmlhvz0-9.\s-]+$/;
  const aettCount = {};
  for (const r of runes) {
    if (!r.path || !r.path.trim()) errors.push(`${r.id} path 为空`);
    else if (!pathRe.test(r.path)) errors.push(`${r.id} path 含非直线命令`);
    else {
      const nums = r.path.match(/-?\d+(\.\d+)?/g).map(Number);
      // 交替 x, y（V/H 单值单独检查范围）
      for (const n of nums) if (n < 0 || n > 160) errors.push(`${r.id} path 坐标越界：${n}`);
    }
    const shouldBeFixed = NON_REV_SET.has(r.id);
    if (shouldBeFixed && (r.reversible || r.rev)) errors.push(`${r.id} 应不可逆位`);
    if (!shouldBeFixed && (!r.reversible || !r.rev)) errors.push(`${r.id} 应可逆位且有 rev`);
    if (!AETT_NAMES.includes(r.aett)) errors.push(`${r.id} aett 未知：${r.aett}`);
    aettCount[r.aett] = (aettCount[r.aett] || 0) + 1;
    if (!r.up || !Array.isArray(r.up.keywords) || r.up.keywords.length !== 3) errors.push(`${r.id} up.keywords 应为 3 个`);
    if (!r.up || typeof r.up.meaning !== 'string' || r.up.meaning.length < 80 || r.up.meaning.length > 120) errors.push(`${r.id} up.meaning 长度应在 80–120`);
    if (r.rev) {
      if (!Array.isArray(r.rev.keywords) || r.rev.keywords.length < 2 || r.rev.keywords.length > 3) errors.push(`${r.id} rev.keywords 应为 2–3 个`);
      if (typeof r.rev.meaning !== 'string' || r.rev.meaning.length < 60 || r.rev.meaning.length > 90) errors.push(`${r.id} rev.meaning 长度应在 60–90`);
    }
    if (typeof r.advice !== 'string' || r.advice.length < 20 || r.advice.length > 40) errors.push(`${r.id} advice 长度应在 20–40`);
    if (!r.sound || !r.symbol || !r.line) errors.push(`${r.id} 缺少 sound/symbol/line`);
  }
  for (const name of AETT_NAMES) if ((aettCount[name] || 0) !== 8) errors.push(`${name} 应有 8 枚，实际 ${aettCount[name] || 0}`);
  if (NON_REVERSIBLE.length !== 8) errors.push('不可逆列表应为 8 枚');
  return { ok: errors.length === 0, errors };
}

/**
 * 抽 n 枚，不重复；可逆位者按 reversedRate 决定逆位，不可逆者永不逆位。
 * rnd 可注入以便测试/复现。→ [{ rune, reversed }]
 */
export function drawRunes(n, rnd = random, { reversedRate = 0.35, runes = RUNES } = {}) {
  const count = Math.max(0, Math.min(Math.floor(n) || 0, runes.length));
  const picked = shuffle(runes, rnd).slice(0, count);
  return picked.map((rune) => ({
    rune,
    reversed: !!(rune.reversible && rune.rev && rnd() < reversedRate),
  }));
}

/** 今日符文：同一天、同一枚（含正逆），跨天变化 */
export function dailyRune(date = new Date(), { runes = RUNES } = {}) {
  const rnd = dailyRng('runes', date);
  const [d] = drawRunes(1, rnd, { runes });
  return { ...d, dateKey: dateKey(date) };
}

/** 按牌阵抽符（今日符文走 dailyRune） */
export function drawForSpread(spread, rnd = random, date = new Date()) {
  if (spread.daily) return [dailyRune(date)];
  return drawRunes(spread.n, rnd);
}

/* ---------------- 结果模型 ---------------- */

/** 中文数字（1–5 足够） */
const CN_NUM = ['零', '一', '两', '三', '四', '五'];

/** 逆位比例 → 合参语气 key */
export function toneKey(draw) {
  const rev = draw.filter((d) => d.reversed).length;
  if (rev === 0) return 'none';
  if (rev === draw.length) return 'all';
  return rev * 2 > draw.length ? 'most' : 'few';
}

/** 多符合参文案：语气 + 同族提示 */
export function overallText(draw) {
  if (draw.length < 2) return null;
  const parts = [TONE[toneKey(draw)]];
  const aett = draw[0].rune.aett;
  if (draw.every((d) => d.rune.aett === aett)) {
    const info = Object.values(AETTS).find((a) => a.name === aett);
    if (info) parts.push(TONE.sameAett.replace('{aett}', aett).replace('{theme}', info.theme));
  }
  return parts.join('');
}

/** 单枚的关键词 / 释义（按正逆位） */
export function readingOf(d) {
  const src = d.reversed && d.rune.rev ? d.rune.rev : d.rune.up;
  return { keywords: src.keywords, meaning: src.meaning };
}

/** 月日文案 */
export function dateLabel(date = new Date()) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * 把一次抽符整理为结果卡模型（纯数据，view 负责渲染）。
 * → { spreadId, kicker, title, sub, badge, seal, verse, items:[{position, rune, reversed, keywords, meaning}], overall, advice, footer }
 */
export function interpret(draw, spread, { date = new Date() } = {}) {
  const items = draw.map((d, i) => ({
    position: spread.positions[i] || { key: 'p' + i, label: `第${CN_NUM[i + 1] || i + 1}枚`, hint: '' },
    rune: d.rune,
    reversed: d.reversed,
    ...readingOf(d),
  }));
  const key = items[Math.min(spread.keyIndex ?? items.length - 1, items.length - 1)];
  const revCount = items.filter((it) => it.reversed).length;
  const single = items.length === 1;
  const only = items[0];

  const kicker = spread.daily ? `${spread.name} · ${dateLabel(date)}` : `${spread.name} · ${spread.short || spread.kicker}`;
  const title = single ? `${only.rune.zh} · ${only.rune.name}` : spread.name;
  const sub = single ? `${only.rune.aett} · ${only.rune.symbol}` : items.map((it) => (it.reversed ? '逆·' : '') + it.rune.zh).join(' · ');
  const badge = single
    ? only.reversed ? UI_TEXT.reversed : UI_TEXT.upright
    : revCount === 0
      ? `${CN_NUM[items.length]}枚皆正`
      : `${CN_NUM[revCount]}枚逆位`;
  const seal = spread.daily ? '日' : single ? (only.reversed ? '逆' : '正') : CN_NUM[items.length];
  const verse = single ? `${only.keywords.join(' · ')}\n${only.rune.line}` : `${items.map((it) => it.keywords[0]).join(' · ')}\n${key.rune.line}`;

  return {
    spreadId: spread.id,
    spreadName: spread.name,
    kicker,
    title,
    sub,
    badge,
    seal,
    verse,
    items,
    overall: overallText(draw),
    advice: key.rune.advice,
    adviceFrom: single ? null : key,
    footer: UI_TEXT.footer,
    date: dateKey(date),
  };
}

/** 分享文本 */
export function shareText(model) {
  const lines = [`【卢恩符文 · ${model.spreadName}】`];
  for (const it of model.items) {
    const pos = model.items.length > 1 ? `${it.position.label}：` : '';
    lines.push(`${pos}${it.rune.zh} ${it.rune.name}${it.reversed ? '（逆位）' : ''} — ${it.keywords.join(' · ')}`);
  }
  if (model.items.length === 1) lines.push(model.items[0].meaning);
  else if (model.overall) lines.push(model.overall);
  lines.push(`符文的建议：${model.advice}`);
  lines.push(UI_TEXT.shareTail);
  return lines.join('\n');
}

/* ---------------- 会话状态机 ---------------- */
// phase: idle（袋中）→ drawn（滚出，背面朝上）→ revealed（全部翻开）
export function initState(spreadId = 'single') {
  return { phase: 'idle', spreadId, draw: [], flipped: [] };
}

export function reduceState(state, action) {
  switch (action.type) {
    case 'spread':
      return initState(action.spreadId);
    case 'draw':
      if (state.phase !== 'idle') return state;
      return { ...state, phase: 'drawn', draw: action.draw, flipped: action.draw.map(() => false) };
    case 'flip': {
      if (state.phase !== 'drawn') return state;
      if (action.index < 0 || action.index >= state.flipped.length || state.flipped[action.index]) return state;
      const flipped = state.flipped.slice();
      flipped[action.index] = true;
      return { ...state, flipped, phase: flipped.every(Boolean) ? 'revealed' : 'drawn' };
    }
    case 'flipAll':
      if (state.phase !== 'drawn') return state;
      return { ...state, flipped: state.flipped.map(() => true), phase: 'revealed' };
    case 'reset':
      return initState(state.spreadId);
    default:
      return state;
  }
}

/** 历史记录压缩：只存 id 与正逆 */
export function packDraw(draw, spreadId) {
  return { s: spreadId, r: draw.map((d) => [d.rune.id, d.reversed ? 1 : 0]), t: Date.now() };
}
export function unpackDraw(rec) {
  return (rec.r || []).map(([id, rev]) => ({ rune: runeById(id), reversed: !!rev })).filter((d) => d.rune);
}
