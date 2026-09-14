// 八字 · 纯逻辑（无 DOM）。四柱由 lunar-javascript 计算，十神 / 五行统计 / 强弱为本模块实现。
import { Solar } from '../../core/lunar.js';

export const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
export const ELEMENTS = ['木', '火', '土', '金', '水'];
export const STEM_ELEMENT = { 甲: '木', 乙: '木', 丙: '火', 丁: '火', 戊: '土', 己: '土', 庚: '金', 辛: '金', 壬: '水', 癸: '水' };
export const BRANCH_ELEMENT = { 子: '水', 丑: '土', 寅: '木', 卯: '木', 辰: '土', 巳: '火', 午: '火', 未: '土', 申: '金', 酉: '金', 戌: '土', 亥: '水' };
const GENERATES = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' }; // 我生
const OVERCOMES = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' }; // 我克
const GENERATED_BY = Object.fromEntries(Object.entries(GENERATES).map(([a, b]) => [b, a])); // 生我

export function isYang(stem) {
  return STEMS.indexOf(stem) % 2 === 0;
}

/** 十神：other 相对于 dayStem */
export function shiShen(dayStem, other) {
  if (!STEM_ELEMENT[dayStem] || !STEM_ELEMENT[other]) return null;
  const de = STEM_ELEMENT[dayStem];
  const oe = STEM_ELEMENT[other];
  const same = isYang(dayStem) === isYang(other);
  if (de === oe) return same ? '比肩' : '劫财';
  if (GENERATES[de] === oe) return same ? '食神' : '伤官';
  if (OVERCOMES[de] === oe) return same ? '偏财' : '正财';
  if (OVERCOMES[oe] === de) return same ? '七杀' : '正官';
  if (GENERATES[oe] === de) return same ? '偏印' : '正印';
  return null;
}

/** 纳音名 → 五行（取名字末字：山头火 → 火） */
export function naYinElement(naYin) {
  const last = String(naYin || '').slice(-1);
  return ELEMENTS.includes(last) ? last : null;
}

/**
 * 排盘。hour 为 HOURS 里的代表小时（0,2,…,22），null / -1 表示不知道。
 * 返回值全部为普通对象与字符串，界面不触碰 lunar 对象。
 */
export function computeChart({ y, m, d, hour = null, gender = 'male', now = new Date() }) {
  const hasHour = hour != null && Number(hour) >= 0;
  const hh = hasHour ? Number(hour) : 12;
  const solar = Solar.fromYmdHms(Number(y), Number(m), Number(d), hh, 30, 0);
  const lunar = solar.getLunar();
  const bz = lunar.getEightChar();
  const dayMaster = bz.getDayGan();
  const make = (key, label, gan, zhi, naYin, hideGan, hideShiShen, diShi) => ({
    key,
    label,
    gan,
    zhi,
    ganZhi: gan + zhi,
    ganElement: STEM_ELEMENT[gan],
    zhiElement: BRANCH_ELEMENT[zhi],
    naYin,
    naYinElement: naYinElement(naYin),
    shiShen: key === 'day' ? '日主' : shiShen(dayMaster, gan),
    hideGan: Array.from(hideGan || []),
    hideShiShen: Array.from(hideShiShen || []),
    diShi,
  });
  const pillars = [
    make('year', '年柱', bz.getYearGan(), bz.getYearZhi(), bz.getYearNaYin(), bz.getYearHideGan(), bz.getYearShiShenZhi(), bz.getYearDiShi()),
    make('month', '月柱', bz.getMonthGan(), bz.getMonthZhi(), bz.getMonthNaYin(), bz.getMonthHideGan(), bz.getMonthShiShenZhi(), bz.getMonthDiShi()),
    make('day', '日柱', bz.getDayGan(), bz.getDayZhi(), bz.getDayNaYin(), bz.getDayHideGan(), bz.getDayShiShenZhi(), bz.getDayDiShi()),
  ];
  if (hasHour) pillars.push(make('time', '时柱', bz.getTimeGan(), bz.getTimeZhi(), bz.getTimeNaYin(), bz.getTimeHideGan(), bz.getTimeShiShenZhi(), bz.getTimeDiShi()));

  const elements = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  for (const p of pillars) {
    elements[p.ganElement]++;
    elements[p.zhiElement]++;
  }
  const total = pillars.length * 2;
  const dmEl = STEM_ELEMENT[dayMaster];
  const support = elements[dmEl] + elements[GENERATED_BY[dmEl]];
  const ratio = support / total;
  const strength = ratio >= 0.5 ? 'strong' : ratio <= 0.25 ? 'weak' : 'balanced';
  const sorted = ELEMENTS.slice().sort((a, b) => elements[b] - elements[a]);
  const strong = ELEMENTS.filter((e) => elements[e] >= 3);
  const weak = ELEMENTS.filter((e) => elements[e] === 1);
  const missing = ELEMENTS.filter((e) => elements[e] === 0);
  const shiShenCount = {};
  for (const p of pillars) {
    if (p.key !== 'day') shiShenCount[p.shiShen] = (shiShenCount[p.shiShen] || 0) + 1;
    for (const s of p.hideShiShen) shiShenCount[s] = (shiShenCount[s] || 0) + 1;
  }
  const today = Solar.fromDate(now).getLunar();
  const todayGan = today.getDayGan();
  return {
    input: { y: Number(y), m: Number(m), d: Number(d), hour: hasHour ? Number(hour) : null, gender },
    hasHour,
    gender,
    pillars,
    dayMaster,
    dayMasterElement: dmEl,
    dayMasterYang: isYang(dayMaster),
    elements,
    total,
    dominant: sorted[0],
    strong,
    weak,
    missing,
    strength,
    supportRatio: ratio,
    shiShenCount,
    shengXiao: lunar.getYearShengXiao(),
    xingZuo: solar.getXingZuo(),
    mingGong: bz.getMingGong(),
    taiYuan: bz.getTaiYuan(),
    shenGong: bz.getShenGong(),
    lunarText: `${lunar.getYearInGanZhi()}年 ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    todayGan,
    todayGanZhi: today.getDayInGanZhi(),
    todayRelation: shiShen(dayMaster, todayGan),
  };
}

/** 五行条形图用：每个五行的占比 0–1 */
export function elementRatios(chart) {
  return ELEMENTS.map((e) => ({ element: e, count: chart.elements[e], ratio: chart.total ? chart.elements[e] / chart.total : 0 }));
}

/** 分享文案 */
export function shareText(chart) {
  const p = chart.pillars.map((x) => x.ganZhi).join(' ');
  return [`【八字】${chart.input.y}-${String(chart.input.m).padStart(2, '0')}-${String(chart.input.d).padStart(2, '0')}${chart.hasHour ? ` ${chart.pillars[3].zhi}时` : ''} · ${chart.gender === 'male' ? '男' : '女'}`, `四柱：${p}`, `日主 ${chart.dayMaster}${chart.dayMasterElement}（${chart.dayMasterYang ? '阳' : '阴'}）· 五行 ${ELEMENTS.map((e) => `${e}${chart.elements[e]}`).join(' ')}`, chart.missing.length ? `五行缺 ${chart.missing.join('、')}` : '五行齐全', '—— 来感觉 · 玄学占卜'].join('\n');
}

export function daysInMonth(y, m) {
  return new Date(Number(y), Number(m), 0).getDate();
}
