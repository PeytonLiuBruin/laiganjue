// 农历 / 干支 / 节气 / 黄历宜忌 / 八字 —— 统一从这里 import，不要直接引 vendor。
// 底层为 lunar-javascript（MIT，作者 6tail，已 vendor 到 src/vendor/lunar.cjs），
// 纯 JS 无依赖，微信小程序可原样使用。
import lib from '../vendor/lunar.cjs';

export const Solar = lib.Solar;
export const Lunar = lib.Lunar;
export const EightChar = lib.EightChar;
export const NineStar = lib.NineStar;
export const LunarUtil = lib.LunarUtil;
export const SolarUtil = lib.SolarUtil;
export const LunarYear = lib.LunarYear;
export const LunarMonth = lib.LunarMonth;
export const LunarTime = lib.LunarTime;
export const HolidayUtil = lib.HolidayUtil;
export const I18n = lib.I18n;

/** JS Date → Lunar 对象 */
export function lunarFromDate(date = new Date()) {
  return Solar.fromDate(date).getLunar();
}

/** 公历 y-m-d(-h-mi) → Lunar */
export function lunarFromYmd(y, m, d, h = 0, mi = 0) {
  return Solar.fromYmdHms(y, m, d, h, mi, 0).getLunar();
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

/** 一天的黄历摘要（首页"今日"卡片与各模块共用） */
export function almanacSummary(date = new Date()) {
  const solar = Solar.fromDate(date);
  const lunar = solar.getLunar();
  return {
    solarText: `${solar.getYear()}年${solar.getMonth()}月${solar.getDay()}日`,
    week: `星期${WEEK[solar.getWeek()]}`,
    lunarText: `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    yearGanZhi: lunar.getYearInGanZhi(),
    monthGanZhi: lunar.getMonthInGanZhi(),
    dayGanZhi: lunar.getDayInGanZhi(),
    zodiac: lunar.getYearShengXiao(),
    yi: lunar.getDayYi(),
    ji: lunar.getDayJi(),
    chong: lunar.getDayChongDesc(),
    sha: lunar.getDaySha(),
    jieqi: lunar.getJieQi() || '',
    nextJieqi: lunar.getNextJieQi(),
    festivals: [...lunar.getFestivals(), ...solar.getFestivals()],
    xingzuo: solar.getXingZuo(),
    zhiXing: lunar.getZhiXing(),
    xiu: `${lunar.getXiu()}${lunar.getZheng()}${lunar.getAnimal()}`,
    xiShen: lunar.getDayPositionXiDesc(),
    caiShen: lunar.getDayPositionCaiDesc(),
    fuShen: lunar.getDayPositionFuDesc(),
    pengZu: [lunar.getPengZuGan(), lunar.getPengZuZhi()],
    lunar,
    solar,
  };
}
