// 命理公共引擎（纯逻辑，无 DOM）：姻缘 / 财运 / 事业 三个模块共用。
// 四柱由 lunar-javascript 计算；十神、干支关系、神煞表、流年、每日稳定评分为本文件实现。
// 所有导出只返回普通对象与字符串，界面不接触 lunar 对象。
import { Solar } from './lunar.js';
import { seeded, dateKey } from './rng.js';

export const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
export const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
export const ANIMALS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];
export const ELEMENTS = ['木', '火', '土', '金', '水'];
export const STEM_ELEMENT = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
export const BRANCH_ELEMENT = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
export const GENERATES = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // 我生
export const OVERCOMES = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }; // 我克
export const GENERATED_BY = Object.fromEntries(Object.entries(GENERATES).map(([a, b]) => [b, a]));
export const OVERCOME_BY = Object.fromEntries(Object.entries(OVERCOMES).map(([a, b]) => [b, a]));

/** 地支 → 方位（八方，罗盘口径） */
export const BRANCH_DIRECTION = { 子: '正北', 丑: '东北', 寅: '东北', 卯: '正东', 辰: '东南', 巳: '东南', 午: '正南', 未: '西南', 申: '西南', 酉: '正西', 戌: '西北', 亥: '西北' };
/** 地支 → 时辰区间 */
export const BRANCH_HOURS = { 子: '23–1 点', 丑: '1–3 点', 寅: '3–5 点', 卯: '5–7 点', 辰: '7–9 点', 巳: '9–11 点', 午: '11–13 点', 未: '13–15 点', 申: '15–17 点', 酉: '17–19 点', 戌: '19–21 点', 亥: '21–23 点' };

export const isYang = (stem) => STEMS.indexOf(stem) % 2 === 0;
export const branchIndex = (b) => BRANCHES.indexOf(b);
export const animalOf = (branch) => ANIMALS[branchIndex(branch)] || '';
export const branchOfAnimal = (animal) => BRANCHES[ANIMALS.indexOf(animal)] || null;

/* ---------------------------------- 十神 ---------------------------------- */
export function tenGod(dayStem, other) {
  const de = STEM_ELEMENT[dayStem];
  const oe = STEM_ELEMENT[other];
  if (!de || !oe) return null;
  const same = isYang(dayStem) === isYang(other);
  if (de === oe) return same ? '比肩' : '劫财';
  if (GENERATES[de] === oe) return same ? '食神' : '伤官';
  if (OVERCOMES[de] === oe) return same ? '偏财' : '正财';
  if (OVERCOMES[oe] === de) return same ? '七杀' : '正官';
  return same ? '偏印' : '正印';
}
/** 十神 → 六类 */
export const TEN_GOD_GROUP = { 比肩: '比劫', 劫财: '比劫', 食神: '食伤', 伤官: '食伤', 正财: '财星', 偏财: '财星', 正官: '官杀', 七杀: '官杀', 正印: '印星', 偏印: '印星' };
/** 地支藏干（本气 / 中气 / 余气） */
export const HIDDEN_STEMS = { 子: ['癸'], 丑: ['己', '癸', '辛'], 寅: ['甲', '丙', '戊'], 卯: ['乙'], 辰: ['戊', '乙', '癸'], 巳: ['丙', '戊', '庚'], 午: ['丁', '己'], 未: ['己', '丁', '乙'], 申: ['庚', '壬', '戊'], 酉: ['辛'], 戌: ['戊', '辛', '丁'], 亥: ['壬', '甲'] };

/* ------------------------------- 干支关系 ------------------------------- */
const LIU_HE = [['子', '丑'], ['寅', '亥'], ['卯', '戌'], ['辰', '酉'], ['巳', '申'], ['午', '未']];
const SAN_HE = [['申', '子', '辰'], ['亥', '卯', '未'], ['寅', '午', '戌'], ['巳', '酉', '丑']];
const LIU_CHONG = [['子', '午'], ['丑', '未'], ['寅', '申'], ['卯', '酉'], ['辰', '戌'], ['巳', '亥']];
const LIU_HAI = [['子', '未'], ['丑', '午'], ['寅', '巳'], ['卯', '辰'], ['申', '亥'], ['酉', '戌']];
const XING = [['寅', '巳'], ['巳', '申'], ['寅', '申'], ['丑', '未'], ['未', '戌'], ['丑', '戌'], ['子', '卯']];
const ZI_XING = ['辰', '午', '酉', '亥'];
const pairIn = (list, a, b) => list.some((p) => p.includes(a) && p.includes(b) && a !== b);

/** 三合局：地支所属的三合组 */
export function sanHeGroup(branch) {
  return SAN_HE.find((g) => g.includes(branch)) || null;
}

/**
 * 两地支的关系（对称）：
 * liuhe 六合 · sanhe 三合 · same 同支 · zixing 自刑（同支且为辰午酉亥）· chong 六冲 · hai 六害 · xing 相刑 · none 平
 */
export function branchRelation(a, b) {
  if (!BRANCHES.includes(a) || !BRANCHES.includes(b)) return 'none';
  if (a === b) return ZI_XING.includes(a) ? 'zixing' : 'same';
  if (pairIn(LIU_HE, a, b)) return 'liuhe';
  if (pairIn(LIU_CHONG, a, b)) return 'chong';
  if (sanHeGroup(a)?.includes(b)) return 'sanhe';
  if (pairIn(XING, a, b)) return 'xing'; // 寅巳既刑又害，以刑为重
  if (pairIn(LIU_HAI, a, b)) return 'hai';
  return 'none';
}
export const BRANCH_RELATION_NAME = { liuhe: '六合', sanhe: '三合', same: '同气', zixing: '自刑', chong: '相冲', hai: '相害', xing: '相刑', none: '平和' };

const STEM_HE = [['甲', '己'], ['乙', '庚'], ['丙', '辛'], ['丁', '壬'], ['戊', '癸']];
const STEM_CHONG = [['甲', '庚'], ['乙', '辛'], ['丙', '壬'], ['丁', '癸']];
/**
 * 两天干的关系（对称）：he 五合 · same 同干 · sheng 相生 · chong 相冲 · ke 相克 · peer 同五行
 */
export function stemRelation(a, b) {
  if (!STEM_ELEMENT[a] || !STEM_ELEMENT[b]) return 'peer';
  if (a === b) return 'same';
  if (pairIn(STEM_HE, a, b)) return 'he';
  if (pairIn(STEM_CHONG, a, b)) return 'chong';
  const ea = STEM_ELEMENT[a];
  const eb = STEM_ELEMENT[b];
  if (ea === eb) return 'peer';
  if (GENERATES[ea] === eb || GENERATES[eb] === ea) return 'sheng';
  return 'ke';
}
export const STEM_RELATION_NAME = { he: '天干五合', same: '同干', peer: '同气', sheng: '相生', chong: '相冲', ke: '相克' };

/** 五行关系：same 同 · generates 我生 · generatedBy 生我 · overcomes 我克 · overcomeBy 克我 */
export function elementRelation(a, b) {
  if (a === b) return 'same';
  if (GENERATES[a] === b) return 'generates';
  if (GENERATES[b] === a) return 'generatedBy';
  if (OVERCOMES[a] === b) return 'overcomes';
  return 'overcomeBy';
}

/* --------------------------------- 神煞 --------------------------------- */
const BY_SANHE = (table) => (branch) => {
  const g = sanHeGroup(branch);
  return g ? table[g[0]] : null;
};
/** 咸池桃花（按年支或日支）：申子辰在酉 · 寅午戌在卯 · 亥卯未在子 · 巳酉丑在午 */
export const taoHua = BY_SANHE({ 申: '酉', 亥: '子', 寅: '卯', 巳: '午' });
/** 驿马：申子辰在寅 · 寅午戌在申 · 巳酉丑在亥 · 亥卯未在巳 */
export const yiMa = BY_SANHE({ 申: '寅', 寅: '申', 巳: '亥', 亥: '巳' });
/** 红鸾（按年支）：子卯 丑寅 寅丑 卯子 辰亥 巳戌 午酉 未申 申未 酉午 戌巳 亥辰 */
const HONG_LUAN = { 子: '卯', 丑: '寅', 寅: '丑', 卯: '子', 辰: '亥', 巳: '戌', 午: '酉', 未: '申', 申: '未', 酉: '午', 戌: '巳', 亥: '辰' };
export const hongLuan = (yearBranch) => HONG_LUAN[yearBranch] || null;
/** 天喜：与红鸾相冲之支 */
export const tianXi = (yearBranch) => (HONG_LUAN[yearBranch] ? BRANCHES[(branchIndex(HONG_LUAN[yearBranch]) + 6) % 12] : null);
/** 天乙贵人（按日干）：甲戊庚牛羊 · 乙己鼠猴乡 · 丙丁猪鸡位 · 壬癸兔蛇藏 · 六辛逢马虎 */
const TIAN_YI = { 甲: ['丑', '未'], 戊: ['丑', '未'], 庚: ['丑', '未'], 乙: ['子', '申'], 己: ['子', '申'], 丙: ['亥', '酉'], 丁: ['亥', '酉'], 壬: ['卯', '巳'], 癸: ['卯', '巳'], 辛: ['午', '寅'] };
export const tianYiGuiRen = (dayStem) => TIAN_YI[dayStem] || [];
/** 文昌（按日干）：甲巳 乙午 丙申 丁酉 戊申 己酉 庚亥 辛子 壬寅 癸卯 */
const WEN_CHANG = { 甲: '巳', 乙: '午', 丙: '申', 丁: '酉', 戊: '申', 己: '酉', 庚: '亥', 辛: '子', 壬: '寅', 癸: '卯' };
export const wenChang = (dayStem) => WEN_CHANG[dayStem] || null;
/** 禄神（按日干）：甲寅 乙卯 丙巳 丁午 戊巳 己午 庚申 辛酉 壬亥 癸子 */
const LU_SHEN = { 甲: '寅', 乙: '卯', 丙: '巳', 丁: '午', 戊: '巳', 己: '午', 庚: '申', 辛: '酉', 壬: '亥', 癸: '子' };
export const luShen = (dayStem) => LU_SHEN[dayStem] || null;
/** 墓库：木库未 · 火库戌 · 金库丑 · 水库辰 · 土寄四库 */
const TREASURY = { 木: ['未'], 火: ['戌'], 金: ['丑'], 水: ['辰'], 土: ['辰', '戌', '丑', '未'] };
export const treasuryOf = (element) => TREASURY[element] || [];

/* --------------------------------- 四柱 --------------------------------- */
/**
 * 排四柱。hour 为时辰代表小时（0,2,…,22），null / -1 为不知道（时柱缺省）。
 * 返回：{ pillars:[{key,label,gan,zhi,ganZhi,tenGod}], dayStem, dayBranch, dayElement, yearBranch, animal, elements, gender, hasHour }
 */
export function fourPillars({ y, m, d, hour = -1, gender = 'male' } = {}) {
  const hasHour = hour != null && Number(hour) >= 0;
  const hh = hasHour ? Number(hour) : 12;
  const solar = Solar.fromYmdHms(Number(y), Number(m), Number(d), hh, 30, 0);
  const lunar = solar.getLunar();
  const bz = lunar.getEightChar();
  const dayStem = bz.getDayGan();
  const make = (key, label, gan, zhi) => ({ key, label, gan, zhi, ganZhi: gan + zhi, tenGod: key === 'day' ? '日主' : tenGod(dayStem, gan), hidden: HIDDEN_STEMS[zhi].map((s) => ({ stem: s, tenGod: tenGod(dayStem, s) })) });
  const pillars = [make('year', '年', bz.getYearGan(), bz.getYearZhi()), make('month', '月', bz.getMonthGan(), bz.getMonthZhi()), make('day', '日', bz.getDayGan(), bz.getDayZhi())];
  if (hasHour) pillars.push(make('time', '时', bz.getTimeGan(), bz.getTimeZhi()));
  const elements = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  for (const p of pillars) {
    elements[STEM_ELEMENT[p.gan]]++;
    elements[BRANCH_ELEMENT[p.zhi]]++;
  }
  const groups = { 比劫: 0, 食伤: 0, 财星: 0, 官杀: 0, 印星: 0 };
  const gods = {};
  for (const p of pillars) {
    if (p.key !== 'day') { groups[TEN_GOD_GROUP[p.tenGod]]++; gods[p.tenGod] = (gods[p.tenGod] || 0) + 1; }
    // 藏干只计本气，避免中气余气把格局冲淡
    const main = p.hidden[0];
    groups[TEN_GOD_GROUP[main.tenGod]]++;
    gods[main.tenGod] = (gods[main.tenGod] || 0) + 1;
  }
  const dayElement = STEM_ELEMENT[dayStem];
  const total = pillars.length * 2;
  const support = elements[dayElement] + elements[GENERATED_BY[dayElement]];
  const strength = support / total >= 0.5 ? 'strong' : support / total <= 0.25 ? 'weak' : 'balanced';
  return {
    input: { y: Number(y), m: Number(m), d: Number(d), hour: hasHour ? Number(hour) : -1, gender },
    hasHour,
    gender: gender === 'female' ? 'female' : 'male',
    pillars,
    branches: pillars.map((p) => p.zhi),
    stems: pillars.map((p) => p.gan),
    dayStem,
    dayBranch: bz.getDayZhi(),
    dayElement,
    dayYang: isYang(dayStem),
    yearBranch: bz.getYearZhi(),
    yearStem: bz.getYearGan(),
    animal: animalOf(bz.getYearZhi()),
    elements,
    missing: ELEMENTS.filter((e) => elements[e] === 0),
    dominant: ELEMENTS.slice().sort((a, b) => elements[b] - elements[a])[0],
    groups,
    gods,
    strength,
    lunarText: `${lunar.getYearInGanZhi()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
  };
}

/* --------------------------------- 流年 --------------------------------- */
/** 公历年份 → 干支（以年份计，不细分立春） */
export function yearGanZhi(year) {
  const n = ((Math.trunc(year) - 4) % 60 + 60) % 60;
  return { gan: STEMS[n % 10], zhi: BRANCHES[n % 12], ganZhi: STEMS[n % 10] + BRANCHES[n % 12], animal: ANIMALS[n % 12] };
}
/** 从 fromYear 起 n 年的流年列表 */
export function upcomingYears(fromYear, n = 10) {
  return Array.from({ length: n }, (_, i) => ({ year: fromYear + i, ...yearGanZhi(fromYear + i) }));
}

/* -------------------------------- 每日 -------------------------------- */
const HOUR_RANGE = ['23:00–00:59', '01:00–02:59', '03:00–04:59', '05:00–06:59', '07:00–08:59', '09:00–10:59', '11:00–12:59', '13:00–14:59', '15:00–16:59', '17:00–18:59', '19:00–20:59', '21:00–22:59'];
/**
 * 当日吉神方位、宜忌、十二时辰吉凶与财神方位。
 */
export function dayLuck(date = new Date()) {
  const solar = Solar.fromDate(date);
  const lunar = solar.getLunar();
  const seen = new Set();
  const hours = [];
  for (const t of lunar.getTimes()) {
    const zhi = t.getZhi();
    if (seen.has(zhi)) continue;
    seen.add(zhi);
    hours.push({ zhi, index: branchIndex(zhi), ganZhi: t.getGanZhi(), lucky: t.getTianShenLuck() === '吉', tianShen: t.getTianShen(), cai: t.getPositionCaiDesc(), xi: t.getPositionXiDesc(), range: HOUR_RANGE[branchIndex(zhi)] });
  }
  hours.sort((a, b) => a.index - b.index);
  return {
    key: dateKey(date),
    dayGan: lunar.getDayGan(),
    dayZhi: lunar.getDayZhi(),
    dayGanZhi: lunar.getDayInGanZhi(),
    yearGanZhi: lunar.getYearInGanZhiByLiChun(),
    lunarText: `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    positions: { cai: lunar.getDayPositionCaiDesc(), xi: lunar.getDayPositionXiDesc(), fu: lunar.getDayPositionFuDesc(), yangGui: lunar.getDayPositionYangGuiDesc(), yinGui: lunar.getDayPositionYinGuiDesc() },
    yi: lunar.getDayYi().slice(),
    ji: lunar.getDayJi().slice(),
    hours,
  };
}

/** 当前时辰序号（子=0 … 亥=11） */
export function hourBranchIndex(date = new Date()) {
  return Math.floor(((date.getHours() + 1) % 24) / 2);
}

/**
 * 当日稳定评分：同一天、同一 salt 结果不变。bias 为 −30…+30 的命理修正。返回 { index: 30–99, stars: 1–5 }
 */
export function dailyIndex(salt, date = new Date(), bias = 0) {
  const rnd = seeded(`${dateKey(date)}|${salt}`);
  const base = 48 + rnd() * 40 + (rnd() - 0.5) * 8;
  const index = Math.round(Math.max(30, Math.min(99, base + bias)));
  const stars = index >= 88 ? 5 : index >= 75 ? 4 : index >= 60 ? 3 : index >= 48 ? 2 : 1;
  return { index, stars };
}

/** 从数组里按当日稳定随机取一项 */
export function dailyPick(arr, salt, date = new Date()) {
  const rnd = seeded(`${dateKey(date)}|${salt}|pick`);
  return arr[Math.floor(rnd() * arr.length)];
}

export function padDate(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export function daysInMonth(y, m) {
  return new Date(Number(y), Number(m), 0).getDate();
}
