// 六爻 · 纯逻辑（无 DOM）。金钱课：三枚铜钱掷六次成卦。可直接搬到小程序。
//
// 约定：
//   - 一枚铜钱：字面(阳) 记 3，花面(阴) 记 2。三枚之和 6/7/8/9。
//   - 6 = 老阴（×，动，阴变阳）7 = 少阳（—）8 = 少阴（- -）9 = 老阳（○，动，阳变阴）
//   - 六爻数组一律"自下而上"：index 0 = 初爻，index 5 = 上爻。
//   - 阴阳位用 1(阳) / 0(阴) 表示；六位拼成字符串（自下而上）即查表键。
import { random } from '../../core/rng.js';
import { HEXAGRAMS, TRIGRAMS, LINE_POSITIONS, MOVING_RULES } from './data.js';

export const COIN = { ZI: 3, HUA: 2 }; // 字 / 花

/** 四种爻 */
export const LINE_KIND = {
  6: { value: 6, name: '老阴', yang: false, moving: true, mark: '×', glyph: '- -', desc: '阴极而动，将变为阳' },
  7: { value: 7, name: '少阳', yang: true, moving: false, mark: '', glyph: '—', desc: '阳而安静' },
  8: { value: 8, name: '少阴', yang: false, moving: false, mark: '', glyph: '- -', desc: '阴而安静' },
  9: { value: 9, name: '老阳', yang: true, moving: true, mark: '○', glyph: '—', desc: '阳极而动，将变为阴' },
};

/* ------------------------------------------------------------------ */
/* 八卦 / 六十四卦查表                                                  */
/* ------------------------------------------------------------------ */

/** 八经卦：键 → 三位阴阳（自下而上） */
const TRIGRAM_KEYS = Object.keys(TRIGRAMS); // qian dui li zhen xun kan gen kun
const TRIGRAM_BY_BITS = {};
for (const k of TRIGRAM_KEYS) TRIGRAM_BY_BITS[TRIGRAMS[k].bits] = k;

/**
 * 文王卦序表：KING_WEN[上卦][下卦] = 卦序。
 * 行为上卦，列为下卦，列序：乾 兑 离 震 巽 坎 艮 坤。
 */
const ORDER = ['qian', 'dui', 'li', 'zhen', 'xun', 'kan', 'gen', 'kun'];
const TABLE = [
  /* 上乾 */ [1, 10, 13, 25, 44, 6, 33, 12],
  /* 上兑 */ [43, 58, 49, 17, 28, 47, 31, 45],
  /* 上离 */ [14, 38, 30, 21, 50, 64, 56, 35],
  /* 上震 */ [34, 54, 55, 51, 32, 40, 62, 16],
  /* 上巽 */ [9, 61, 37, 42, 57, 59, 53, 20],
  /* 上坎 */ [5, 60, 63, 3, 48, 29, 39, 8],
  /* 上艮 */ [26, 41, 22, 27, 18, 4, 52, 23],
  /* 上坤 */ [11, 19, 36, 24, 46, 7, 15, 2],
];
export const KING_WEN = {};
const BITS_BY_NO = new Array(65).fill(null);
ORDER.forEach((up, i) => {
  KING_WEN[up] = {};
  ORDER.forEach((lo, j) => {
    const no = TABLE[i][j];
    KING_WEN[up][lo] = no;
    BITS_BY_NO[no] = TRIGRAMS[lo].bits + TRIGRAMS[up].bits; // 自下而上：下卦三位 + 上卦三位
  });
});
const NO_BY_BITS = {};
for (let no = 1; no <= 64; no++) NO_BY_BITS[BITS_BY_NO[no]] = no;

/** 卦序 → Unicode 卦符 ䷀…䷿ */
export function symbolOf(no) {
  return String.fromCodePoint(0x4dc0 + no - 1);
}

/** 卦序 → 六位阴阳字符串（自下而上） */
export function bitsOf(no) {
  return BITS_BY_NO[no];
}

/** 三位阴阳（自下而上，数组或字符串）→ 八经卦对象 */
export function trigramFromLines(lines) {
  const bits = normalizeBits(lines, 3);
  const key = TRIGRAM_BY_BITS[bits];
  if (!key) return null;
  return { key, ...TRIGRAMS[key], bits };
}

/** 取得一卦的完整信息（含符号、上下卦、全名） */
export function getHexagram(no) {
  const d = HEXAGRAMS[no - 1];
  if (!d) return null;
  const bits = BITS_BY_NO[no];
  const lower = trigramFromLines(bits.slice(0, 3));
  const upper = trigramFromLines(bits.slice(3));
  const pure = lower.key === upper.key;
  const fullName = pure ? `${upper.name}为${upper.nature}` : `${upper.nature}${lower.nature}${d.name}`;
  return { ...d, no, symbol: symbolOf(no), bits, upper, lower, pure, fullName };
}

/**
 * 六位阴阳（自下而上）→ 卦。lines 可为：
 *   - 1/0 或 true/false 数组
 *   - 6/7/8/9 爻值数组（按阴阳取）
 *   - '111000' 字符串
 */
export function hexagramFromLines(lines) {
  const bits = normalizeBits(lines, 6);
  const no = NO_BY_BITS[bits];
  return no ? getHexagram(no) : null;
}

function normalizeBits(lines, len) {
  let arr = typeof lines === 'string' ? lines.split('') : Array.from(lines);
  if (arr.length !== len) throw new Error(`需要 ${len} 位阴阳，收到 ${arr.length} 位`);
  arr = arr.map((v) => {
    if (v === true || v === 1 || v === '1') return '1';
    if (v === false || v === 0 || v === '0') return '0';
    if (LINE_KIND[v]) return LINE_KIND[v].yang ? '1' : '0';
    throw new Error('非法爻位值: ' + v);
  });
  return arr.join('');
}

/* ------------------------------------------------------------------ */
/* 掷钱                                                                  */
/* ------------------------------------------------------------------ */

/** 三枚铜钱面值（2/3）之和 → 6/7/8/9 */
export function coinsToLine(coins) {
  if (!Array.isArray(coins) || coins.length !== 3) throw new Error('需要三枚铜钱');
  const sum = coins.reduce((s, c) => {
    if (c !== COIN.ZI && c !== COIN.HUA) throw new Error('铜钱面值只能是 2(花) 或 3(字)');
    return s + c;
  }, 0);
  return sum;
}

/** 掷一次三枚铜钱。rnd 可注入以便复现 */
export function tossCoins(rnd = random) {
  const coins = [0, 0, 0].map(() => (rnd() < 0.5 ? COIN.ZI : COIN.HUA));
  const value = coinsToLine(coins);
  return { coins, value, ...LINE_KIND[value] };
}

/** 爻值信息 */
export function lineInfo(value) {
  const k = LINE_KIND[value];
  if (!k) throw new Error('非法爻值: ' + value);
  return { ...k };
}

/** 爻名：初九 / 六二 / 九三 … 上六 */
export function lineName(index, value) {
  const yang = LINE_KIND[value] ? LINE_KIND[value].yang : !!value;
  const num = yang ? '九' : '六';
  if (index === 0) return `初${num}`;
  if (index === 5) return `上${num}`;
  return `${num}${['', '二', '三', '四', '五'][index]}`;
}

/** 爻位序名：初爻 二爻 … 上爻 */
export function positionName(index) {
  return LINE_POSITIONS[index].short;
}

/* ------------------------------------------------------------------ */
/* 成卦                                                                  */
/* ------------------------------------------------------------------ */

/** 动爻翻转后的变卦；无动爻返回 null */
export function changedHexagram(values) {
  if (values.length !== 6) throw new Error('需要六爻');
  const moving = values.map((v) => LINE_KIND[v].moving);
  if (!moving.some(Boolean)) return null;
  const bits = values.map((v, i) => {
    const yang = LINE_KIND[v].yang;
    return (moving[i] ? !yang : yang) ? '1' : '0';
  });
  return hexagramFromLines(bits);
}

/** 依动爻数量决定断卦规则 */
export function movingRule(movingCount) {
  if (movingCount === 0) return MOVING_RULES.none;
  if (movingCount === 1) return MOVING_RULES.one;
  if (movingCount === 6) return MOVING_RULES.all;
  return MOVING_RULES.multi;
}

/**
 * 由六个爻值（自下而上）生成完整解读。
 * → { values, lines:[{index, value, name, kind, yang, moving, mark, position}], ben, bian, moving:[index], rule, focus }
 */
export function buildReading(values) {
  if (!Array.isArray(values) || values.length !== 6) throw new Error('需要六爻');
  const lines = values.map((v, i) => ({
    index: i,
    value: v,
    name: lineName(i, v),
    kind: LINE_KIND[v].name,
    yang: LINE_KIND[v].yang,
    moving: LINE_KIND[v].moving,
    mark: LINE_KIND[v].mark,
    position: LINE_POSITIONS[i],
  }));
  const ben = hexagramFromLines(values);
  const bian = changedHexagram(values);
  const moving = lines.filter((l) => l.moving).map((l) => l.index);
  const rule = movingRule(moving.length);
  // 主看哪一卦：无动/一动看本卦；六动看变卦；多动兼看，仍以本卦为题
  const focus = moving.length === 6 && bian ? bian : ben;
  return { values: values.slice(), lines, ben, bian, moving, rule, focus };
}

/** 吉凶等级 → 印章字 / 徽记 */
export function luckLabel(luck) {
  const n = Math.max(1, Math.min(5, Math.round(luck)));
  const stars = '★'.repeat(n) + '☆'.repeat(5 - n);
  const map = { 5: { seal: '大吉', word: '大吉' }, 4: { seal: '吉', word: '吉' }, 3: { seal: '平', word: '平' }, 2: { seal: '慎', word: '慎' }, 1: { seal: '凶', word: '凶' } };
  return { luck: n, stars, ...map[n], badge: `${stars} · ${map[n].word}` };
}

/* ------------------------------------------------------------------ */
/* 会话状态机：六掷成卦                                                  */
/* ------------------------------------------------------------------ */

export function initSession() {
  return { tosses: [], done: false };
}

/** 加入一掷；满六掷即 done。done 后再喂不变 */
export function reduceSession(state, toss) {
  if (state.done) return state;
  const tosses = state.tosses.concat([toss]);
  return { tosses, done: tosses.length >= 6 };
}

export function sessionValues(state) {
  return state.tosses.map((t) => t.value);
}

/* ------------------------------------------------------------------ */
/* 文本                                                                  */
/* ------------------------------------------------------------------ */

/** 分享文案 */
export function formatShareText(reading, { question = '', date = '' } = {}) {
  const { ben, bian, moving, lines } = reading;
  const parts = ['【六爻】'];
  if (question) parts.push(`问：${question}`);
  if (date) parts.push(`${date}起卦`);
  parts.push(`本卦 ${ben.symbol} ${ben.fullName}（上${ben.upper.name}下${ben.lower.name}）`);
  parts.push(`卦辞：${ben.guaci}`);
  if (moving.length) {
    parts.push(`动爻：${moving.map((i) => lines[i].name).join('、')}`);
    if (bian) parts.push(`变卦 ${bian.symbol} ${bian.fullName} — ${bian.gist}`);
  } else parts.push('六爻皆静，以本卦断');
  parts.push(ben.gist);
  parts.push('—— 来感觉 · 玄学占卜');
  return parts.join('\n');
}

/** 一行简记（历史用）：䷂ 屯 → 比 */
export function formatBrief(reading) {
  const { ben, bian } = reading;
  return bian ? `${ben.symbol} ${ben.name}→${bian.name}` : `${ben.symbol} ${ben.name}`;
}
