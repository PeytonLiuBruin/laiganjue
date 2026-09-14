// 星座 · 纯逻辑（无 DOM）。可被 node --test 直接测试，可原样搬到小程序。
// - signFromDate(m, d)              公历月日 → 星座
// - animalFromYmd(y, m, d)          公历年月日 → 生肖（春节分界，用 lunar 计算）
// - dailyFortune(key, date, opts)   当日稳定的运势（星级 / 幸运色 / 数字 / 速配 / 一句 / 宜忌）
// - taiSuiRelation(branch, yearBranch)  与太岁的关系（值 / 冲 / 刑 / 害 / 破 / 三合 / 六合 / 平）
// - signFortune / animalFortune     组合成界面直接可用的结果
import { dailyRng, randomInt, pick, weightedPick, dateKey } from '../../core/rng.js';
import { lunarFromYmd, lunarFromDate } from '../../core/lunar.js';
import { SIGNS, ANIMALS, BRANCHES, BRANCH_ELEMENT, COLORS, QUOTES, YI, JI, KEYWORDS, ASPECT_TEXT, OVERALL_LEVELS, OVERALL_VERSES, TAISUI } from './data.js';

export { BRANCHES };

/* ------------------------------ 查找 ------------------------------ */
export function signById(id) {
  return SIGNS.find((s) => s.id === id) || null;
}
export function signByShort(short) {
  return SIGNS.find((s) => s.short === short || s.name === short) || null;
}
export function animalById(id) {
  return ANIMALS.find((a) => a.id === id) || null;
}
export function animalByName(name) {
  return ANIMALS.find((a) => a.name === name) || null;
}
export function animalByBranch(branch) {
  return ANIMALS.find((a) => a.glyph === branch) || null;
}
export function branchIndex(branch) {
  return BRANCHES.indexOf(branch);
}

/* ------------------------------ 星座判定 ------------------------------ */
/** 公历 m 月 d 日 → 星座对象。摩羯跨年（12.22–1.19）。 */
export function signFromDate(m, d) {
  const md = m * 100 + d;
  for (const s of SIGNS) {
    const a = s.start[0] * 100 + s.start[1];
    const b = s.end[0] * 100 + s.end[1];
    if (a <= b) {
      if (md >= a && md <= b) return s;
    } else if (md >= a || md <= b) {
      return s;
    }
  }
  return SIGNS[0];
}

/** 今天太阳是否正在该星座（生日月） */
export function isSunInSign(sign, date = new Date()) {
  return signFromDate(date.getMonth() + 1, date.getDate()).id === sign.id;
}

/* ------------------------------ 生肖判定（春节分界） ------------------------------ */
/** 公历年月日 → 生肖对象（附 ganzhi 干支年）。月日缺省取年中，避免春节歧义。 */
export function animalFromYmd(y, m = 6, d = 15) {
  const lunar = lunarFromYmd(y, m, d);
  const animal = animalByName(lunar.getYearShengXiao());
  return { ...animal, ganzhi: lunar.getYearInGanZhi(), branch: lunar.getYearZhi(), lunarYear: lunar.getYear() };
}
export const animalFromYear = animalFromYmd;

/** 当前农历年信息 */
export function currentLunarYear(date = new Date()) {
  const lunar = lunarFromDate(date);
  return {
    ganzhi: lunar.getYearInGanZhi(),
    branch: lunar.getYearZhi(),
    animal: lunar.getYearShengXiao(),
    year: lunar.getYear(),
    lunarText: `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
  };
}

/* ------------------------------ 太岁关系 ------------------------------ */
const CHONG = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];
const HAI = [['子', '未'], ['丑', '午'], ['寅', '巳'], ['卯', '辰'], ['申', '亥'], ['酉', '戌']];
const PO = [['子', '酉'], ['丑', '辰'], ['寅', '亥'], ['卯', '午'], ['巳', '申'], ['未', '戌']];
const LIUHE = [['子', '丑'], ['寅', '亥'], ['卯', '戌'], ['辰', '酉'], ['巳', '申'], ['午', '未']];
const SANHE = [['申', '子', '辰'], ['亥', '卯', '未'], ['寅', '午', '戌'], ['巳', '酉', '丑']];
const XING_GROUPS = [['寅', '巳', '申'], ['丑', '戌', '未'], ['子', '卯']];
const XING_SELF = ['午', '酉', '亥', '辰'];

const inPair = (pairs, a, b) => pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
const inGroup = (groups, a, b) => a !== b && groups.some((g) => g.includes(a) && g.includes(b));

/** 优先级：值 > 冲 > 刑 > 害 > 破 > 三合 > 六合 > 平（与民间运程书的通行说法一致） */
export const RELATION_ORDER = ['benming', 'chong', 'xing', 'hai', 'po', 'sanhe', 'liuhe'];

/**
 * taiSuiRelation('午', '午') → { primary:'benming', all:['benming','xing'] }
 * 返回全部命中的关系（按优先级排序）；无任何关系时 primary='ping'。
 */
export function taiSuiRelation(animalBranch, yearBranch) {
  const a = animalBranch;
  const y = yearBranch;
  const all = [];
  if (a === y) all.push('benming');
  if (inPair(CHONG, a, y)) all.push('chong');
  if (inGroup(XING_GROUPS, a, y) || (a === y && XING_SELF.includes(a))) all.push('xing');
  if (inPair(HAI, a, y)) all.push('hai');
  if (inPair(PO, a, y)) all.push('po');
  if (inGroup(SANHE, a, y)) all.push('sanhe');
  if (inPair(LIUHE, a, y)) all.push('liuhe');
  all.sort((p, q) => RELATION_ORDER.indexOf(p) - RELATION_ORDER.indexOf(q));
  return { primary: all[0] || 'ping', all: all.length ? all : ['ping'] };
}

/** 本年运势：某生肖在 date 所在农历年里的太岁关系 + 文案 */
export function yearFortune(animal, date = new Date()) {
  const year = currentLunarYear(date);
  const rel = taiSuiRelation(animal.glyph, year.branch);
  const info = TAISUI[rel.primary];
  const extra = rel.all.slice(1).map((k) => TAISUI[k].short);
  return { year, relation: rel, name: info.name, short: info.short, tone: info.tone, text: info.text, advice: info.advice, extra };
}

/* ------------------------------ 每日运势 ------------------------------ */
const STAR_WEIGHTS = { 1: 5, 2: 15, 3: 30, 4: 32, 5: 18 };
const LEVELS = [1, 2, 3, 4, 5];

/**
 * dailyFortune(key, date, { pool, favored, self })
 * 同一 key 同一天结果稳定；pool 为速配候选 id 列表，favored 中的加权。
 */
export function dailyFortune(key, date = new Date(), { pool = SIGNS.map((s) => s.id), favored = [], self = null } = {}) {
  const rng = dailyRng('zodiac|' + key, date);
  const star = () => weightedPick(LEVELS, (l) => STAR_WEIGHTS[l], rng);
  const love = star();
  const career = star();
  const wealth = star();
  const health = star();
  const mean = (love + career + wealth + health) / 4;
  const overall = Math.max(1, Math.min(5, Math.round(mean + (rng() - 0.5) * 0.9)));
  const color = COLORS[randomInt(0, COLORS.length - 1, rng)];
  const number = randomInt(1, 99, rng);
  const candidates = pool.filter((id) => id !== self);
  const match = candidates.length ? weightedPick(candidates, (id) => (favored.includes(id) ? 3 : 1), rng) : null;
  const quote = pick(QUOTES, rng);
  const yi = pick(YI, rng);
  const ji = pick(JI, rng);
  const k1 = pick(KEYWORDS, rng);
  let k2 = pick(KEYWORDS, rng);
  if (k2 === k1) k2 = KEYWORDS[(KEYWORDS.indexOf(k1) + 7) % KEYWORDS.length];
  const text = {
    love: pick(ASPECT_TEXT.love[love], rng),
    career: pick(ASPECT_TEXT.career[career], rng),
    wealth: pick(ASPECT_TEXT.wealth[wealth], rng),
    health: pick(ASPECT_TEXT.health[health], rng),
  };
  const level = OVERALL_LEVELS[overall];
  const verse = pick(OVERALL_VERSES[overall], rng);
  return {
    key,
    date: dateKey(date),
    overall,
    love,
    career,
    wealth,
    health,
    color,
    number,
    match,
    quote,
    yi,
    ji,
    keywords: [k1, k2],
    text,
    verse,
    seal: level.seal,
    label: level.label,
    tone: level.tone,
    sound: level.sound,
    summary: level.summary,
  };
}

/** 星座今日运势（速配从其余 11 个星座中取，传统相配者加权） */
export function signFortune(sign, date = new Date()) {
  const favored = sign.match.map((s) => signByShort(s)).filter(Boolean).map((s) => s.id);
  const f = dailyFortune(sign.id, date, { pool: SIGNS.map((s) => s.id), favored, self: sign.id });
  return { ...f, kind: 'sign', sign, matchSign: signById(f.match), sunIn: isSunInSign(sign, date) };
}

/** 生肖今日运势 + 本年运势 */
export function animalFortune(animal, date = new Date()) {
  const favored = animal.match.map((n) => animalByName(n)).filter(Boolean).map((a) => a.id);
  const f = dailyFortune('sx-' + animal.name, date, { pool: ANIMALS.map((a) => a.id), favored, self: animal.id });
  return { ...f, kind: 'animal', animal, matchAnimal: animalById(f.match), year: yearFortune(animal, date), element: BRANCH_ELEMENT[animal.glyph] };
}

/* ------------------------------ 文本工具 ------------------------------ */
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
export function formatDate(date = new Date()) {
  return `${date.getMonth() + 1}月${date.getDate()}日 · 星期${WEEK[date.getDay()]}`;
}
export function starText(n, max = 5) {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));
}

/** 分享文案（纯字符串） */
export function shareText(f) {
  const isSign = f.kind === 'sign';
  const title = isSign ? f.sign.name : `属${f.animal.name}`;
  const matchName = isSign ? f.matchSign && f.matchSign.short : f.matchAnimal && f.matchAnimal.name;
  const lines = [
    `【${isSign ? '星座' : '生肖'}运势】${title} · ${formatDate(new Date(f.date + 'T12:00:00'))} · ${f.label}`,
    `综合 ${starText(f.overall)}`,
    `爱情 ${starText(f.love)}  事业 ${starText(f.career)}`,
    `财运 ${starText(f.wealth)}  健康 ${starText(f.health)}`,
    `幸运色 ${f.color.name} · 幸运数字 ${f.number}${matchName ? ` · 速配 ${matchName}` : ''}`,
    `今日一句：${f.quote}`,
    `宜 ${f.yi} · 忌 ${f.ji}`,
  ];
  if (!isSign && f.year) lines.push(`${f.year.year.ganzhi}年 · ${f.year.short}：${f.year.advice}`);
  lines.push('—— 来感觉 · 玄学占卜');
  return lines.join('\n');
}

/** 相邻星座 / 生肖（左右滑切换用） */
export function stepIn(list, id, step) {
  const i = Math.max(0, list.findIndex((x) => x.id === id));
  return list[(i + step + list.length) % list.length];
}

/** 地支环上第 i 格应吸附到的角度（度），使选中者位于 12 点方向 */
export function ringAngleFor(index) {
  return -index * 30;
}
/** 由角度（度）反推最近的格 */
export function ringIndexFor(deg) {
  return ((Math.round(-deg / 30) % 12) + 12) % 12;
}
