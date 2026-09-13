// 黄历 · 纯逻辑（无 DOM）。所有农历/干支数据来自 core/lunar.js（lunar-javascript），
// 这里把它整理成 UI 可直接消费的纯字符串/数组结构，可原样搬到小程序。
import { Solar } from '../../core/lunar.js';
import { dailyRng, pick, dateKey } from '../../core/rng.js';
import {
  QUOTES,
  TIAN_SHEN,
  ZHI_XING,
  XIU,
  PENG_ZU,
  HOURS,
  RATINGS,
  YIJI_TERMS,
  JI_SHEN,
  JI_SHEN_FALLBACK,
  XIONG_SHA,
  XIONG_SHA_FALLBACK,
  LIU_YAO,
} from './data.js';

export const MIN_YEAR = 1901;
export const MAX_YEAR = 2099;
export const ZHI = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const pad2 = (n) => String(n).padStart(2, '0');

/* ------------------------------ 日期工具 ------------------------------ */
/** 本地日期 → 'YYYY-MM-DD' */
export const toKey = (date) => dateKey(date);

/** 'YYYY-MM-DD' → 本地正午的 Date（避免时区/夏令时把日期挪走）；非法返回 null */
export function fromKey(key) {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(key || '').trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}

/** 平移 n 天（跨月 / 跨年 / 闰年由 Date 自己处理），保留时分 */
export function shiftDay(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n, date.getHours(), date.getMinutes(), date.getSeconds());
}

export function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** 两个日期相差的天数（b - a，按本地日历日） */
export function dayDiff(a, b) {
  const A = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const B = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((B - A) / 86400000);
}

/** 日期是否在黄历支持范围内 */
export function inRange(date) {
  const y = date.getFullYear();
  return y >= MIN_YEAR && y <= MAX_YEAR;
}

/** 相对今天的说法：今天 / 明天 / 后天 / 昨天 / 前天 / N 天后 / N 天前 */
export function relativeLabel(date, today = new Date()) {
  const n = dayDiff(today, date);
  if (n === 0) return '今天';
  if (n === 1) return '明天';
  if (n === 2) return '后天';
  if (n === -1) return '昨天';
  if (n === -2) return '前天';
  return n > 0 ? `${n} 天后` : `${-n} 天前`;
}

/** 当前时辰下标 0–11（子=0，23:00–00:59 都算子时） */
export function hourIndex(date = new Date()) {
  return Math.floor(((date.getHours() + 1) % 24) / 2);
}

/* ------------------------------ 每日一言 ------------------------------ */
/** 同一天稳定抽取一句 */
export function dailyQuote(date = new Date()) {
  return pick(QUOTES, dailyRng('almanac-quote', date));
}

/* ------------------------------ 构建一天 ------------------------------ */
function hourRange(i) {
  if (i === 0) return '23:00–00:59';
  return `${pad2(2 * i - 1)}:00–${pad2(2 * i)}:59`;
}

function timeEntry(t, i) {
  return {
    index: i,
    zhi: ZHI[i],
    name: HOURS[i].name,
    ganZhi: t.getGanZhi(),
    tianShen: t.getTianShen(),
    tianShenType: t.getTianShenType(),
    luck: t.getTianShenLuck(),
    range: hourRange(i),
    yi: t.getYi().slice(),
    ji: t.getJi().slice(),
    xi: t.getPositionXiDesc(),
    cai: t.getPositionCaiDesc(),
    fu: t.getPositionFuDesc(),
    chong: t.getChongDesc(),
    sha: t.getSha(),
  };
}

/**
 * buildDay(date) → 结构化的一天。所有字段都是字符串 / 数组 / 普通对象，UI 不接触 lunar 对象。
 */
export function buildDay(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const solar = Solar.fromYmd(y, m, d);
  const lunar = solar.getLunar();

  const yi = lunar.getDayYi().slice();
  const ji = lunar.getDayJi().slice();
  const allBad = ji.includes('诸事不宜') || yi.includes('诸事不宜');

  const next = lunar.getNextJieQi(true);
  const prev = lunar.getPrevJieQi(true);
  const nextSolar = next.getSolar();
  const nextDate = new Date(nextSolar.getYear(), nextSolar.getMonth() - 1, nextSolar.getDay(), 12);
  const jieqi = lunar.getJieQi() || '';

  const times = lunar.getTimes();
  const hours = [];
  for (let i = 0; i < 12; i++) hours.push(timeEntry(times[i], i));
  const lateZi = times[12] ? { ...timeEntry(times[12], 0), range: '23:00–23:59', name: '晚子' } : null;

  const festivals = [...lunar.getFestivals(), ...solar.getFestivals()];
  const otherFestivals = [...lunar.getOtherFestivals(), ...solar.getOtherFestivals()];

  const xiuFull = `${lunar.getXiu()}${lunar.getZheng()}${lunar.getAnimal()}`;
  const tianShenName = lunar.getDayTianShen();
  const shuJiu = lunar.getShuJiu();
  const fu = lunar.getFu();
  const monthText = `${lunar.getMonthInChinese()}月`;
  const dayText = lunar.getDayInChinese();

  return {
    key: toKey(date),
    solar: {
      year: y,
      month: m,
      day: d,
      week: WEEK[solar.getWeek()],
      weekText: `星期${WEEK[solar.getWeek()]}`,
      weekIndex: solar.getWeek(),
      text: `${y}年${m}月${d}日`,
      isWeekend: solar.getWeek() === 0 || solar.getWeek() === 6,
    },
    lunar: {
      yearText: `${lunar.getYearInGanZhi()}年`,
      yearChinese: lunar.getYearInChinese(),
      monthText,
      dayText,
      text: `${monthText}${dayText}`,
      yearGanZhi: lunar.getYearInGanZhi(),
      monthGanZhi: lunar.getMonthInGanZhi(),
      dayGanZhi: lunar.getDayInGanZhi(),
      dayGan: lunar.getDayGan(),
      dayZhi: lunar.getDayZhi(),
      zodiac: lunar.getYearShengXiao(),
      dayZodiac: lunar.getDayShengXiao(),
      isLeap: lunar.getMonth() < 0,
    },
    xingzuo: `${solar.getXingZuo()}座`,
    jieqi,
    nextJieqi: { name: next.getName(), key: toKey(nextDate), days: dayDiff(new Date(y, m - 1, d, 12), nextDate) },
    prevJieqi: prev.getName(),
    festivals,
    otherFestivals,
    yi,
    ji,
    allBad,
    jiShen: lunar.getDayJiShen().slice(),
    xiongSha: lunar.getDayXiongSha().slice(),
    tianShen: { name: tianShenName, type: lunar.getDayTianShenType(), luck: lunar.getDayTianShenLuck() },
    zhiXing: lunar.getZhiXing(),
    xiu: {
      name: lunar.getXiu(),
      zheng: lunar.getZheng(),
      animal: lunar.getAnimal(),
      full: xiuFull,
      luck: lunar.getXiuLuck(),
      gong: lunar.getGong(),
      shou: lunar.getShou(),
      song: lunar.getXiuSong(),
    },
    naYin: { day: lunar.getDayNaYin(), month: lunar.getMonthNaYin(), year: lunar.getYearNaYin() },
    pengZu: [lunar.getPengZuGan(), lunar.getPengZuZhi()],
    chong: {
      zhi: lunar.getDayChong(),
      ganZhi: `${lunar.getDayChongGan()}${lunar.getDayChong()}`,
      shengXiao: lunar.getDayChongShengXiao(),
      desc: lunar.getDayChongDesc(),
    },
    sha: lunar.getDaySha(),
    positions: {
      xi: { gua: lunar.getDayPositionXi(), desc: lunar.getDayPositionXiDesc() },
      cai: { gua: lunar.getDayPositionCai(), desc: lunar.getDayPositionCaiDesc() },
      fu: { gua: lunar.getDayPositionFu(), desc: lunar.getDayPositionFuDesc() },
      yangGui: { gua: lunar.getDayPositionYangGui(), desc: lunar.getDayPositionYangGuiDesc() },
      yinGui: { gua: lunar.getDayPositionYinGui(), desc: lunar.getDayPositionYinGuiDesc() },
      tai: { gua: '', desc: lunar.getDayPositionTai() },
    },
    hours,
    lateZi,
    yueXiang: lunar.getYueXiang(),
    wuHou: lunar.getWuHou(),
    hou: lunar.getHou(),
    shuJiu: shuJiu ? shuJiu.toString() : '',
    fu: fu ? fu.toString() : '',
    liuYao: lunar.getLiuYao(),
    lu: lunar.getDayLu(),
    taiSui: lunar.getDayPositionTaiSuiDesc(),
  };
}

/* ------------------------------ 评级 / 解读 ------------------------------ */
const GOOD_ZHI_XING = new Set(['成', '开', '定', '满']);
const BAD_ZHI_XING = new Set(['破', '闭']);

/** 今日气象 1–5（黄道 / 宿吉凶 / 建除 / 诸事不宜 综合）。黑道日最高「平」，诸事不宜最高「慎」 */
export function dayRating(day) {
  const huang = day.tianShen.luck === '吉';
  let score = 3;
  score += huang ? 1 : -1;
  if (day.xiu.luck === '吉') score += 1;
  if (GOOD_ZHI_XING.has(day.zhiXing)) score += 1;
  if (BAD_ZHI_XING.has(day.zhiXing)) score -= 1;
  if (day.allBad) score -= 1;
  if (!huang) score = Math.min(score, 3);
  if (day.allBad) score = Math.min(score, 2);
  score = Math.max(1, Math.min(5, score));
  return { score, ...RATINGS[score] };
}

/** 一段自动生成的白话总评 */
export function summarize(day) {
  const ts = TIAN_SHEN[day.tianShen.name];
  const zx = ZHI_XING[day.zhiXing];
  const xiu = XIU[day.xiu.full];
  const parts = [];
  parts.push(`今日${day.tianShen.name}值日，属${day.tianShen.type}${day.tianShen.luck === '吉' ? '吉日' : '之日'}。${ts ? ts.text : ''}`);
  parts.push(`建除逢「${day.zhiXing}」：${zx ? zx.text : ''}`);
  parts.push(`${day.xiu.full}当值，${day.xiu.luck}宿。${xiu || ''}`);
  if (day.allBad) parts.push('宜忌栏写着「诸事不宜」——不是不能动，而是别开新头，守成、休息、整理都算顺应天时。');
  return parts.join('');
}

/** 彭祖百忌两句的白话 */
export function pengZuPlain(day) {
  return [PENG_ZU[day.lunar.dayGan] || '', PENG_ZU[day.lunar.dayZhi] || ''];
}

/** 名词解释：宜忌 / 吉神 / 凶煞 */
export function termMeaning(term) {
  return YIJI_TERMS[term] || '';
}
export function jiShenMeaning(name) {
  return JI_SHEN[name] || JI_SHEN_FALLBACK;
}
export function xiongShaMeaning(name) {
  return XIONG_SHA[name] || XIONG_SHA_FALLBACK;
}
export function liuYaoMeaning(name) {
  return LIU_YAO[name] || '';
}

/* ------------------------------ 择日 ------------------------------ */
/**
 * 从 from 之后第一天起找最近的「宜 term」且非诸事不宜的日子。
 * 返回 { date, day, daysAhead } 或 null。
 */
export function findGoodDay(term, from = new Date(), { maxDays = 180, preferGood = true } = {}) {
  let fallback = null;
  for (let i = 1; i <= maxDays; i++) {
    const date = shiftDay(from, i);
    if (!inRange(date)) break;
    const day = buildDay(date);
    if (day.allBad || !day.yi.includes(term) || day.ji.includes(term)) continue;
    if (!preferGood || day.tianShen.luck === '吉') return { date, day, daysAhead: i };
    if (!fallback) fallback = { date, day, daysAhead: i };
    // 黄道日优先，但最多多等 7 天，否则用最近的
    if (fallback && i - fallback.daysAhead >= 7) return fallback;
  }
  return fallback;
}

/* ------------------------------ 分享文案 ------------------------------ */
export function shareText(day, quote = dailyQuote(fromKey(day.key) || new Date())) {
  const yi = day.yi.length ? day.yi.join(' ') : '无';
  const ji = day.ji.length ? day.ji.join(' ') : '无';
  const tags = [day.jieqi, ...day.festivals].filter(Boolean).join(' · ');
  return [
    `【黄历】${day.solar.text} ${day.solar.weekText}${tags ? ' · ' + tags : ''}`,
    `${day.lunar.yearText}${day.lunar.text} · ${day.lunar.monthGanZhi}月 ${day.lunar.dayGanZhi}日 · 属${day.lunar.zodiac}`,
    `宜：${yi}`,
    `忌：${ji}`,
    `值神${day.tianShen.name}（${day.tianShen.type}${day.tianShen.luck}）· 冲${day.chong.shengXiao}煞${day.sha} · ${day.xiu.full}${day.xiu.luck}`,
    `喜神${day.positions.xi.desc} · 财神${day.positions.cai.desc} · 福神${day.positions.fu.desc}`,
    `「${quote.text}」—— ${quote.source}`,
    '—— 来感觉 · 玄学占卜',
  ].join('\n');
}
