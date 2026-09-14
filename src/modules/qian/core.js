// 灵签 · 纯逻辑（无 DOM、无 window）。可直接被 node --test 测试，也可整体搬到小程序。
import { random } from '../../core/rng.js';
import { LOTS, LEVELS, LEVEL_QUOTA, ITEM_KEYS } from './data.js';

/* ------------------------------ 抽签 ------------------------------ */

/** 均匀抽取一支签。rnd 可注入（seeded）以便测试；lots 默认为全部签。 */
export function drawLot(rnd = random, lots = LOTS) {
  const r = rnd();
  const i = Math.min(lots.length - 1, Math.max(0, Math.floor(r * lots.length)));
  return lots[i];
}

/** 按签号取签（1 起） */
export function getLot(no, lots = LOTS) {
  return lots.find((l) => l.no === no) || null;
}

/* ------------------------------ 等级 ------------------------------ */

const LEVEL_MAP = Object.fromEntries(LEVELS.map((l) => [l.id, l]));

/** 等级元数据：{id, seal, tone, badge, brief, rank} */
export function levelMeta(level) {
  return LEVEL_MAP[level] || null;
}

/** 印章二字（上上 → 「上上」…）。未知等级回落为「签」 */
export function levelSeal(level) {
  const m = levelMeta(level);
  return m ? m.seal : '签';
}

/** 等级音色：great | good | fair | neutral | low | bad */
export function levelTone(level) {
  const m = levelMeta(level);
  return m ? m.tone : 'neutral';
}

/** 各等级数量统计 */
export function levelCounts(lots = LOTS) {
  const c = {};
  for (const l of LEVELS) c[l.id] = 0;
  for (const lot of lots) c[lot.level] = (c[lot.level] || 0) + 1;
  return c;
}

/* ------------------------------ 签号 ------------------------------ */

const DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/**
 * 签号 → 传统写法：1 一 / 10 十 / 11 十一 / 20 廿 / 23 廿三 / 30 卅 / 35 卅五 / 40 四十 / 47 四十七 / 64 六十四
 */
export function lotNumeral(n) {
  n = Math.floor(Number(n) || 0);
  if (n <= 0) return DIGITS[0];
  if (n < 10) return DIGITS[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const onesStr = ones ? DIGITS[ones] : '';
  if (tens === 1) return '十' + onesStr;
  if (tens === 2) return '廿' + onesStr;
  if (tens === 3) return '卅' + onesStr;
  return DIGITS[tens] + '十' + onesStr;
}

/** 「第廿三签」 */
export function lotLabel(lotOrNo) {
  const no = typeof lotOrNo === 'number' ? lotOrNo : lotOrNo && lotOrNo.no;
  return `第${lotNumeral(no)}签`;
}

/* ------------------------------ 签诗排版 ------------------------------ */

/**
 * 四句七言加标点：「句一，句二。\n句三，句四。」
 * sep 可改为 ' ' 等（分享文本用）
 */
export function formatPoem(poem, { sep = '\n' } = {}) {
  const lines = (poem || []).map((s) => String(s));
  const out = [];
  for (let i = 0; i < lines.length; i += 2) {
    const a = lines[i];
    const b = lines[i + 1];
    out.push(b != null ? `${a}，${b}。` : `${a}。`);
  }
  return out.join(sep);
}

/**
 * 四句各占一行，逗号/句号交替：「句一，」「句二。」「句三，」「句四。」
 * 窄屏抽屉里用，保证每行 ≤ 8 字，不会在句中折行。
 */
export function formatPoemLines(poem, { sep = '\n' } = {}) {
  return (poem || []).map((s, i) => `${String(s)}${i % 2 ? '。' : '，'}`).join(sep);
}

/* ------------------------------ 校验 ------------------------------ */

const HAN = /^\p{Script=Han}+$/u;
const PLACEHOLDER = /(TODO|待补|示例|占位|lorem|xxx)/i;
const len = (s) => Array.from(String(s ?? '')).length;

/**
 * 校验签库，返回问题描述数组（为空即合格）。
 * 检查：数量 ≥ 64、签号 1..n 连续且唯一、四句七言（纯汉字）、等级合法、
 * 字段非空、解曰 80–140 字、六项分述齐全且各 6–14 字、无占位文字、等级配额达标。
 */
export function validateLots(lots) {
  const problems = [];
  if (!Array.isArray(lots)) return ['LOTS 不是数组'];
  if (lots.length < 64) problems.push(`签数不足：${lots.length} < 64`);

  const seen = new Set();
  const titles = new Set();
  lots.forEach((lot, idx) => {
    const tag = `#${lot && lot.no != null ? lot.no : 'idx' + idx}`;
    if (!lot || typeof lot !== 'object') {
      problems.push(`${tag} 不是对象`);
      return;
    }
    if (!Number.isInteger(lot.no) || lot.no !== idx + 1) problems.push(`${tag} 签号不连续（应为 ${idx + 1}）`);
    if (seen.has(lot.no)) problems.push(`${tag} 签号重复`);
    seen.add(lot.no);

    if (!LEVEL_MAP[lot.level]) problems.push(`${tag} 等级非法：${lot.level}`);

    if (!lot.title || !len(lot.title)) problems.push(`${tag} 缺少典故标题`);
    else if (titles.has(lot.title)) problems.push(`${tag} 典故标题重复：${lot.title}`);
    titles.add(lot.title);

    if (!Array.isArray(lot.poem) || lot.poem.length !== 4) problems.push(`${tag} 签诗须四句`);
    else {
      lot.poem.forEach((line, i) => {
        if (len(line) !== 7) problems.push(`${tag} 第 ${i + 1} 句非七言：「${line}」(${len(line)})`);
        else if (!HAN.test(line)) problems.push(`${tag} 第 ${i + 1} 句含非汉字：「${line}」`);
      });
    }

    if (!lot.gist || len(lot.gist) < 4) problems.push(`${tag} 签语过短`);
    const el = len(lot.explain);
    if (!lot.explain) problems.push(`${tag} 缺少解曰`);
    else if (el < 80 || el > 140) problems.push(`${tag} 解曰字数 ${el} 不在 80–140`);

    if (!lot.items || typeof lot.items !== 'object') problems.push(`${tag} 缺少分述`);
    else {
      for (const k of ITEM_KEYS) {
        const v = lot.items[k];
        const l = len(v);
        if (!v) problems.push(`${tag} 分述缺「${k}」`);
        else if (l < 6 || l > 14) problems.push(`${tag} 分述「${k}」字数 ${l} 不在 6–14：${v}`);
      }
      const extra = Object.keys(lot.items).filter((k) => !ITEM_KEYS.includes(k));
      if (extra.length) problems.push(`${tag} 分述含未知项：${extra.join(',')}`);
    }

    const blob = [lot.title, lot.gist, lot.explain, ...(lot.poem || []), ...Object.values(lot.items || {})].join('|');
    if (PLACEHOLDER.test(blob)) problems.push(`${tag} 含占位文字`);
  });

  const counts = levelCounts(lots);
  for (const [lv, q] of Object.entries(LEVEL_QUOTA)) {
    if ((counts[lv] || 0) < q) problems.push(`等级「${lv}」数量 ${counts[lv] || 0} 少于配额 ${q}`);
  }
  return problems;
}

/* ------------------------------ 摇签计量（屏幕手势） ------------------------------ */

/**
 * 左右来回拖动的"摇动计量器"：统计方向反转次数，每次反转前的单程位移 ≥ minSwing 才算一次有效摆动。
 * push(x) → { swings, progress 0–1, done, leg(当前单程位移，带方向), distance }
 */
export function createShakeMeter({ need = 5, minSwing = 16, deadband = 4 } = {}) {
  let prev = null;
  let dir = 0;
  let start = 0; // 当前单程起点
  let extreme = 0; // 当前单程已到达的最远点
  let swings = 0;
  let distance = 0;

  const state = () => ({
    swings,
    progress: Math.min(1, swings / need),
    done: swings >= need,
    leg: prev == null ? 0 : prev - start,
    distance,
  });

  return {
    push(x) {
      x = Number(x) || 0;
      if (prev == null) {
        prev = extreme = start = x;
        return state();
      }
      distance += Math.abs(x - prev);
      prev = x;
      if (dir === 0) {
        if (Math.abs(x - start) >= deadband) {
          dir = Math.sign(x - start);
          extreme = x;
        }
        return state();
      }
      if ((x - extreme) * dir > 0) {
        extreme = x; // 仍在同一方向前进
        return state();
      }
      if ((extreme - x) * dir >= deadband) {
        // 有效反转
        if (Math.abs(extreme - start) >= minSwing) swings++;
        start = extreme;
        dir = -dir;
        extreme = x;
      }
      return state();
    },
    reset() {
      prev = null;
      dir = 0;
      start = extreme = 0;
      swings = 0;
      distance = 0;
    },
    get state() {
      return state();
    },
  };
}

/* ------------------------------ 历史 / 彩蛋 ------------------------------ */

/** 追加历史（最近 max 条） */
export function pushHistory(history, entry, max = 10) {
  return (history || []).concat([entry]).slice(-max);
}

/** 连续 n 次（含本次）摇出同一签 → 「此签与你有缘」 */
export function isFated(history, no, n = 3) {
  const h = history || [];
  if (n <= 1) return true;
  if (h.length < n - 1) return false;
  return h.slice(-(n - 1)).every((it) => (typeof it === 'number' ? it : it && it.no) === no);
}

/** 体感强度 → 是否"摇得太急落两支"（强度极大时的小概率彩蛋） */
export function shouldDoubleDrop(intensity, rnd = random, { threshold = 34, p = 0.35 } = {}) {
  if (!(intensity >= threshold)) return false;
  return rnd() < p;
}

/* ------------------------------ 分享文本 ------------------------------ */

export function shareText(lot, question = '') {
  if (!lot) return '';
  const q = question && question.trim() ? `问：${question.trim()}\n` : '';
  return `【灵签】${lotLabel(lot)} · ${lot.title} · ${lot.level}\n${q}${formatPoem(lot.poem)}\n签语：${lot.gist}\n—— 来感觉 · 玄学占卜`;
}
