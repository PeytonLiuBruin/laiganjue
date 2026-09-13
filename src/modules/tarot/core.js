// 塔罗 · 纯逻辑（无 DOM）。可直接搬到小程序，可被 node --test 测试。
import { random, shuffle, dailyRng, hashString, dateKey } from '../../core/rng.js';
import { MAJORS, MINORS, SUITS, SUIT_ORDER, RANK_LABELS, RANK_EN, MINOR_TONE, SPREADS, SYNTH, TEXT } from './data.js';

/* ------------------------------ 牌库 ------------------------------ */
let DECK_CACHE = null;

/** 78 张全牌（不可变；每次返回浅拷贝数组，卡对象共享） */
export function buildDeck() {
  if (!DECK_CACHE) {
    const majors = MAJORS.map((m) => ({
      id: 'M' + m.no,
      arcana: 'major',
      no: m.no,
      roman: m.roman,
      name: m.name,
      en: m.en,
      glyph: m.glyph,
      seal: m.seal,
      tone: m.tone,
      keywords: m.keywords,
      up: m.up,
      rev: m.rev,
      love: m.love,
      career: m.career,
      advice: m.advice,
      verse: m.verse,
    }));
    const minors = [];
    for (const suit of SUIT_ORDER) {
      const s = SUITS[suit];
      MINORS[suit].forEach((c, i) => {
        const rank = i + 1;
        minors.push({
          id: `${suit[0].toUpperCase()}${rank}`,
          arcana: 'minor',
          suit,
          rank,
          rankLabel: RANK_LABELS[rank],
          name: s.name + RANK_LABELS[rank],
          en: `${RANK_EN[rank]} of ${s.en}`,
          court: rank >= 11,
          element: s.element,
          seal: s.element,
          tone: MINOR_TONE[suit][i],
          keywords: { up: c.k, rev: c.r },
          up: c.up,
          rev: c.rev,
        });
      });
    }
    DECK_CACHE = Object.freeze(majors.concat(minors).map((c) => Object.freeze(c)));
  }
  return DECK_CACHE.slice();
}

export function cardById(id) {
  return buildDeck().find((c) => c.id === id) || null;
}

/** 洗牌（Fisher–Yates，返回新数组） */
export function shuffleDeck(deck, rnd = random) {
  return shuffle(deck, rnd);
}

/**
 * 从牌堆抽 n 张（不重复）。rnd 可注入。
 * → [{ card, reversed }]
 */
export function drawCards(deck, n, rnd = random, { reversedRate = 0.3 } = {}) {
  const pool = shuffleDeck(deck, rnd);
  const count = Math.max(0, Math.min(n, pool.length));
  const out = [];
  for (let i = 0; i < count; i++) out.push({ card: pool[i], reversed: rnd() < reversedRate });
  return out;
}

/** 取顶牌一张（用于逐张抽牌的界面流程）→ { draw, rest } */
export function takeTop(deck, rnd = random, { reversedRate = 0.3 } = {}) {
  if (!deck.length) return { draw: null, rest: [] };
  const [card, ...rest] = deck;
  return { draw: { card, reversed: rnd() < reversedRate }, rest };
}

/** 每日一牌：同一天同一张（含正逆位） */
export function dailyCard(date = new Date(), { reversedRate = 0.3 } = {}) {
  const rnd = dailyRng('tarot', date);
  const [d] = drawCards(buildDeck(), 1, rnd, { reversedRate });
  return { ...d, dateKey: dateKey(date) };
}

/* ------------------------------ 牌阵 ------------------------------ */
export { SPREADS };
export function getSpread(id) {
  return SPREADS.find((s) => s.id === id) || SPREADS[0];
}

/* ------------------------------ 会话状态机 ------------------------------ */
/**
 * session = { spreadId, deck(剩余，已洗), draws:[{card,reversed,flipped}], shuffles, done }
 */
export function initSession(spreadId = 'single', rnd = random) {
  return { spreadId, deck: shuffleDeck(buildDeck(), rnd), draws: [], shuffles: 0 };
}

export function shuffleSession(s, rnd = random) {
  return { ...s, deck: shuffleDeck(s.deck, rnd), shuffles: s.shuffles + 1 };
}

export function isFull(s) {
  return s.draws.length >= getSpread(s.spreadId).positions.length;
}

export function allFlipped(s) {
  return s.draws.length > 0 && s.draws.every((d) => d.flipped);
}

export function isDone(s) {
  return isFull(s) && allFlipped(s);
}

/** 抽下一张（牌阵满则原样返回）。每日一牌时抽的是当日固定牌。 */
export function drawNext(s, rnd = random, { reversedRate = 0.3, date = new Date() } = {}) {
  if (isFull(s)) return s;
  const spread = getSpread(s.spreadId);
  if (spread.daily) {
    const d = dailyCard(date, { reversedRate });
    return { ...s, draws: s.draws.concat([{ card: d.card, reversed: d.reversed, flipped: false }]) };
  }
  const { draw, rest } = takeTop(s.deck, rnd, { reversedRate });
  if (!draw) return s;
  return { ...s, deck: rest, draws: s.draws.concat([{ ...draw, flipped: false }]) };
}

export function flipCard(s, idx) {
  if (!s.draws[idx] || s.draws[idx].flipped) return s;
  const draws = s.draws.slice();
  draws[idx] = { ...draws[idx], flipped: true };
  return { ...s, draws };
}

/* ------------------------------ 解读文本 ------------------------------ */
/** 有效倾向：逆位取反并减弱 */
export function effectiveTone(draw) {
  const t = draw.card.tone || 0;
  return draw.reversed ? -t * 0.6 : t;
}

export function keywordsOf(draw) {
  return draw.reversed ? draw.card.keywords.rev : draw.card.keywords.up;
}

export function meaningOf(draw) {
  return draw.reversed ? draw.card.rev : draw.card.up;
}

/** 「愚者（逆位）— 关键词 · 解读」 */
export function describeDraw(draw) {
  const tag = draw.reversed ? `（${TEXT.reversed}）` : '';
  return `${draw.card.name}${tag}— ${keywordsOf(draw).join(' / ')} · ${meaningOf(draw)}`;
}

/** 统计一组抽牌 */
export function analyze(draws) {
  const n = draws.length;
  const majors = draws.filter((d) => d.card.arcana === 'major').length;
  const reversed = draws.filter((d) => d.reversed).length;
  const courts = draws.filter((d) => d.card.court).length;
  const suits = {};
  for (const d of draws) if (d.card.suit) suits[d.card.suit] = (suits[d.card.suit] || 0) + 1;
  let dominant = null;
  for (const [suit, c] of Object.entries(suits)) {
    if (c >= 2 || (n === 1 && c === 1)) dominant = suit;
  }
  const tones = draws.map(effectiveTone);
  const mood = n ? tones.reduce((a, b) => a + b, 0) / n : 0;
  return { n, majors, reversed, courts, suits, dominant, tones, mood };
}

/** 稳定选变体：同一组牌 → 同一句 */
function variant(list, seed) {
  if (!Array.isArray(list)) return list;
  return list[hashString(seed) % list.length];
}

/**
 * 综合语（纯函数）：基于大牌比例 / 主导花色 / 正逆比例 / 牌阵关系拼句。
 * 模板总数 ≥ 12，见 data.js SYNTH。
 */
export function synthesize(spreadId, draws) {
  if (!draws || !draws.length) return '';
  const st = analyze(draws);
  const seed = spreadId + '|' + draws.map((d) => d.card.id + (d.reversed ? 'r' : 'u')).join(',');
  const parts = [];

  // 1. 大牌比例
  if (st.n === 1) parts.push(variant(st.majors ? SYNTH.major.single_major : SYNTH.major.single_minor, seed + 'M'));
  else if (st.majors === st.n) parts.push(variant(SYNTH.major.all, seed + 'M'));
  else if (st.majors * 2 > st.n) parts.push(variant(SYNTH.major.most, seed + 'M'));
  else if (st.majors > 0) parts.push(variant(SYNTH.major.some, seed + 'M'));
  else parts.push(variant(SYNTH.major.none, seed + 'M'));

  // 2. 牌阵关系
  const t = st.tones;
  if (spreadId === 'time' && st.n === 3) {
    const delta = t[2] - t[0];
    parts.push(delta > 0.5 ? SYNTH.spread.time.rising : delta < -0.5 ? SYNTH.spread.time.falling : SYNTH.spread.time.flat);
  } else if (spreadId === 'relation' && st.n === 3) {
    const delta = t[0] - t[1];
    parts.push(delta > 0.5 ? SYNTH.spread.relation.you : delta < -0.5 ? SYNTH.spread.relation.them : SYNTH.spread.relation.even);
  } else if (spreadId === 'choice' && st.n === 3) {
    const delta = t[0] - t[1];
    parts.push(delta > 0.5 ? SYNTH.spread.choice.a : delta < -0.5 ? SYNTH.spread.choice.b : SYNTH.spread.choice.tie);
  }

  // 3. 元素 / 宫廷
  if (st.dominant) parts.push(SYNTH.element[st.dominant]);
  else if (st.n > 1 && st.majors < st.n) parts.push(SYNTH.element.mixed);
  if (st.courts >= 2) parts.push(SYNTH.element.court);

  // 4. 逆位比例
  if (st.n > 1) {
    if (st.reversed === 0) parts.push(SYNTH.reversed.none);
    else if (st.reversed === st.n) parts.push(SYNTH.reversed.all);
    else if (st.reversed * 2 > st.n) parts.push(SYNTH.reversed.most);
    else parts.push(SYNTH.reversed.some);
  }

  // 5. 整体气息
  const mood = st.mood > 0.6 ? 'good' : st.mood < -0.6 ? 'bad' : 'neutral';
  parts.push(variant(SYNTH.tone[mood], seed + 'T'));
  return parts.join('');
}

/** 模板计数（供测试校验 ≥ 12） */
export function countSynthTemplates() {
  let n = 0;
  const walk = (v) => {
    if (typeof v === 'string') n++;
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(SYNTH);
  return n;
}

/** 单张牌的印章字 / 多张牌用牌阵印章 */
export function sealFor(spreadId, draws) {
  if (draws.length === 1) return draws[0].card.seal;
  return getSpread(spreadId).seal;
}

/** 分享文本 */
export function shareText(spreadId, draws, { question = '' } = {}) {
  const spread = getSpread(spreadId);
  const lines = [`【塔罗 · ${spread.name}】${question ? '问：' + question : ''}`.trim()];
  draws.forEach((d, i) => {
    const pos = spread.positions[i];
    const tag = d.reversed ? `（${TEXT.reversed}）` : '';
    lines.push(`${pos ? pos.label + ' · ' : ''}${d.card.name}${tag}— ${keywordsOf(d).join(' / ')}`);
  });
  lines.push(`${TEXT.synthesisLabel}：${synthesize(spreadId, draws)}`);
  lines.push('—— 来感觉 · 玄学占卜');
  return lines.join('\n');
}

/** 罗马数字（供牌面显示自检） */
export function toRoman(n) {
  if (n === 0) return '0';
  const map = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of map) while (n >= v) (s += r), (n -= v);
  return s;
}
