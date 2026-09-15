// 财运 · 纯逻辑（无 DOM）：今日财运（黄历财神 / 吉时 / 宜忌 + 命理修正）、财运签、我的财库（财星 / 财库 / 禄神 / 类型 / 流年）。
import { fourPillars, dayLuck, dailyIndex, dailyPick, tenGod, TEN_GOD_GROUP, luShen, treasuryOf, OVERCOMES, BRANCH_DIRECTION, BRANCH_HOURS, upcomingYears, hourBranchIndex } from '../../core/destiny.js';
import { weightedPick } from '../../core/rng.js';
import { WEALTH_SIGNS, WEALTH_TYPES, DAILY_WEALTH, WEALTH_TIPS, TODAY_RELATION, YEAR_NOTES, WEALTH_YI, WEALTH_JI, TREASURY_TEXT, LU_TEXT, STRENGTH_TEXT, SHARE_SIGN } from './data.js';

/* ------------------------------ 今日财运 ------------------------------ */
/**
 * todayWealth(birth | null, now) → 当日财运。有生辰时按日主与今日天干的十神关系修正指数。
 */
export function todayWealth(birth, now = new Date()) {
  const day = dayLuck(now);
  const nowIdx = hourBranchIndex(now);
  const allLucky = day.hours.filter((x) => x.lucky);
  // 先列还没过去的吉时，再列已过去的
  const luckyHours = allLucky.filter((x) => x.index >= nowIdx).concat(allLucky.filter((x) => x.index < nowIdx));
  const current = day.hours[nowIdx];
  const nextLucky = luckyHours[0] || null;
  const yi = day.yi.filter((x) => WEALTH_YI.includes(x));
  const ji = day.ji.filter((x) => WEALTH_JI.includes(x));
  let bias = Math.max(-8, Math.min(8, yi.length * 2 - ji.length * 3));
  let chart = null;
  let relation = null;
  let notes = [];
  if (birth) {
    chart = fourPillars(birth);
    const god = tenGod(chart.dayStem, day.dayGan);
    const group = TEN_GOD_GROUP[god];
    relation = { god, group, ...TODAY_RELATION[group] };
    bias += { 财星: 14, 食伤: 6, 官杀: 0, 印星: -2, 比劫: -10 }[group] || 0;
    if (day.dayZhi === luShen(chart.dayStem)) { bias += 8; notes.push('今日地支逢你的禄神，衣禄有加。'); }
    if (treasuryOf(OVERCOMES[chart.dayElement]).includes(day.dayZhi)) { bias += 6; notes.push('今日地支正是你的财库，钱能进能留。'); }
  }
  const key = chart ? chart.pillars.map((p) => p.ganZhi).join('') : 'anon';
  const { index, stars } = dailyIndex('wealth|' + key, now, bias);
  return {
    day,
    chart,
    relation,
    notes,
    index,
    stars,
    level: DAILY_WEALTH[stars - 1],
    tip: dailyPick(WEALTH_TIPS, 'wealth-tip|' + key, now),
    positions: day.positions,
    luckyHours,
    current,
    nextLucky,
    yi,
    ji,
  };
}

/** 摇一支财运签（上签权重 3，中签 4，下签 2） */
export function drawSign(rnd = Math.random) {
  return weightedPick(WEALTH_SIGNS, (s) => ({ 上: 3, 中: 4, 下: 2 })[s.level] || 1, rnd);
}
export function signByNo(no) {
  return WEALTH_SIGNS.find((s) => s.no === Number(no)) || null;
}

/* ------------------------------ 我的财库 ------------------------------ */
export function wealthChart(birth, now = new Date()) {
  const c = fourPillars(birth);
  const wealthEl = OVERCOMES[c.dayElement];
  const zheng = c.gods['正财'] || 0;
  const pian = c.gods['偏财'] || 0;
  const treasury = treasuryOf(wealthEl);
  const hasTreasury = c.branches.some((b) => treasury.includes(b));
  const lu = luShen(c.dayStem);
  const hasLu = c.branches.includes(lu);
  const g = c.groups;
  let typeKey;
  if (zheng && pian) typeKey = 'mixed';
  else if (zheng) typeKey = 'zheng';
  else if (pian) typeKey = 'pian';
  else {
    const order = [['食伤', 'shishang'], ['比劫', 'bijie'], ['印星', 'yin'], ['官杀', 'guan']];
    order.sort((a, b) => g[b[0]] - g[a[0]]);
    typeKey = order[0][1];
  }
  const years = upcomingYears(now.getFullYear(), 10).map((y) => {
    const god = tenGod(c.dayStem, y.gan);
    const group = TEN_GOD_GROUP[god];
    const tags = [];
    if (god === '正财') tags.push('zhengcai');
    if (god === '偏财') tags.push('piancai');
    if (treasury.includes(y.zhi)) tags.push('treasury');
    if (y.zhi === lu) tags.push('lu');
    if (group === '比劫') tags.push('bijie');
    return { ...y, god, tags, note: tags.map((t) => YEAR_NOTES[t].short).join(' · ') };
  });
  const highlights = years.filter((y) => y.tags.some((t) => t === 'zhengcai' || t === 'piancai' || t === 'treasury'));
  const starsKey = zheng && pian ? 'both' : zheng ? 'zheng' : pian ? 'pian' : 'none';
  return {
    chart: c,
    wealthEl,
    zheng,
    pian,
    starsKey,
    treasury,
    hasTreasury,
    treasuryText: TREASURY_TEXT[hasTreasury ? 'has' : 'none'],
    lu,
    hasLu,
    luDirection: BRANCH_DIRECTION[lu],
    luHours: BRANCH_HOURS[lu],
    luText: LU_TEXT[hasLu ? 'has' : 'none'],
    type: WEALTH_TYPES[typeKey],
    strengthText: STRENGTH_TEXT[c.strength],
    years,
    highlights,
    nextYear: highlights[0] || years.find((y) => y.tags.includes('lu')) || null,
  };
}

/* -------------------------------- 分享 -------------------------------- */
const starText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

export function shareToday(t, sign, now = new Date()) {
  const hours = t.luckyHours.slice(0, 3).map((x) => `${x.zhi}时`).join(' ');
  return [
    `【今日财运】${formatDate(now)} · ${starText(t.stars)} ${t.level.title}`,
    `财神${t.positions.cai} · 求财吉时 ${hours || '宜守'}`,
    sign ? `财运签 · ${sign.level}签「${sign.title}」：${sign.verse.replace('\n', '，')}` : '',
    SHARE_SIGN,
  ].filter(Boolean).join('\n');
}

export function shareChart(w) {
  const next = w.nextYear ? `${w.nextYear.year} ${w.nextYear.ganZhi}年（${w.nextYear.note}）` : '静待';
  return [
    `【我的财库】${w.chart.animal}命 · 日主 ${w.chart.dayStem}${w.chart.dayElement} · ${w.type.name}`,
    `${w.treasuryText.title} · ${w.luText.title}（${w.luDirection}）`,
    `下一个财年：${next}`,
    SHARE_SIGN,
  ].join('\n');
}

export function formatDate(date = new Date()) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 时辰 → 「寅时 3–5 点」 */
export function hourLabel(x) {
  return `${x.zhi}时 ${BRANCH_HOURS[x.zhi]}`;
}
