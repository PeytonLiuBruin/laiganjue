// 事业 · 纯逻辑（无 DOM）：今日事业（贵人方位 / 吉时 / 宜忌 + 命理修正）、事业签、事业格局（官印食伤财比 / 贵人 / 驿马 / 文昌 / 流年）。
import { fourPillars, dayLuck, dailyIndex, dailyPick, tenGod, TEN_GOD_GROUP, tianYiGuiRen, yiMa, wenChang, animalOf, BRANCH_DIRECTION, BRANCH_HOURS, upcomingYears, hourBranchIndex } from '../../core/destiny.js';
import { weightedPick } from '../../core/rng.js';
import { CAREER_SIGNS, CAREER_TYPES, DAILY_CAREER, CAREER_TIPS, TODAY_RELATION, YEAR_NOTES, CAREER_YI, CAREER_JI, GUIREN_TEXT, YIMA_TEXT, WENCHANG_TEXT, STRENGTH_TEXT, SHARE_SIGN } from './data.js';

/* ------------------------------ 今日事业 ------------------------------ */
export function todayCareer(birth, now = new Date()) {
  const day = dayLuck(now);
  const nowIdx = hourBranchIndex(now);
  const daytime = nowIdx >= 3 && nowIdx <= 8; // 卯至申（5–17 点）用阳贵，其余用阴贵
  const gui = { yang: day.positions.yangGui, yin: day.positions.yinGui, now: daytime ? day.positions.yangGui : day.positions.yinGui, label: daytime ? '阳贵' : '阴贵' };
  const allLucky = day.hours.filter((x) => x.lucky);
  const luckyHours = allLucky.filter((x) => x.index >= nowIdx).concat(allLucky.filter((x) => x.index < nowIdx));
  const current = day.hours[nowIdx];
  const nextLucky = luckyHours[0] || null;
  const yi = day.yi.filter((x) => CAREER_YI.includes(x));
  const ji = day.ji.filter((x) => CAREER_JI.includes(x));
  let bias = Math.max(-8, Math.min(8, yi.length * 2 - ji.length * 3));
  let chart = null;
  let relation = null;
  const notes = [];
  if (birth) {
    chart = fourPillars(birth);
    const god = tenGod(chart.dayStem, day.dayGan);
    const group = TEN_GOD_GROUP[god];
    relation = { god, group, ...TODAY_RELATION[group] };
    bias += { 官杀: 12, 印星: 8, 财星: 4, 食伤: 2, 比劫: -6 }[group] || 0;
    if (tianYiGuiRen(chart.dayStem).includes(day.dayZhi)) { bias += 8; notes.push('今日地支逢你的天乙贵人，遇事有人相助。'); }
    if (day.dayZhi === wenChang(chart.dayStem)) { bias += 5; notes.push('今日为你的文昌日，宜学习、考试、动笔。'); }
    if (day.dayZhi === yiMa(chart.yearBranch)) notes.push('今日逢驿马，宜外出走动、跑外勤。');
  }
  const key = chart ? chart.pillars.map((p) => p.ganZhi).join('') : 'anon';
  const { index, stars } = dailyIndex('career|' + key, now, bias);
  return {
    day,
    chart,
    relation,
    notes,
    index,
    stars,
    level: DAILY_CAREER[stars - 1],
    tip: dailyPick(CAREER_TIPS, 'career-tip|' + key, now),
    gui,
    luckyHours,
    current,
    nextLucky,
    yi,
    ji,
  };
}

/** 摇一支事业签（上签权重 3，中签 4，下签 2） */
export function drawSign(rnd = Math.random) {
  return weightedPick(CAREER_SIGNS, (s) => ({ 上: 3, 中: 4, 下: 2 })[s.level] || 1, rnd);
}
export function signByNo(no) {
  return CAREER_SIGNS.find((s) => s.no === Number(no)) || null;
}

/* ------------------------------ 事业格局 ------------------------------ */
const GROUP_ORDER = ['官杀', '印星', '食伤', '财星', '比劫'];

export function careerChart(birth, now = new Date()) {
  const c = fourPillars(birth);
  const g = c.groups;
  const top = GROUP_ORDER.slice().sort((a, b) => g[b] - g[a] || GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b))[0];
  let typeKey = { 官杀: 'guan', 印星: 'yin', 食伤: 'shishang', 财星: 'cai', 比劫: 'bijie' }[top];
  if (top === '官杀' && (c.gods['七杀'] || 0) > (c.gods['正官'] || 0)) typeKey = 'sha';
  const guiBranches = tianYiGuiRen(c.dayStem);
  const guiAnimals = guiBranches.map(animalOf);
  const others = c.branches.filter((_, i) => i !== 2); // 贵人 / 文昌看日干，落在年月时支即算命带
  const hasGuiRen = others.some((b) => guiBranches.includes(b));
  const wc = wenChang(c.dayStem);
  const hasWenChang = others.includes(wc);
  const ym = yiMa(c.yearBranch);
  const hasYiMa = c.branches.filter((_, i) => i !== 0).includes(ym);
  const years = upcomingYears(now.getFullYear(), 10).map((y) => {
    const god = tenGod(c.dayStem, y.gan);
    const group = TEN_GOD_GROUP[god];
    const tags = [];
    if (god === '正官') tags.push('zhengguan');
    if (god === '七杀') tags.push('qisha');
    if (group === '印星') tags.push('yin');
    if (guiBranches.includes(y.zhi)) tags.push('guiren');
    if (y.zhi === ym) tags.push('yima');
    if (y.zhi === wc) tags.push('wenchang');
    if (group === '比劫') tags.push('bijie');
    return { ...y, god, tags, note: tags.map((t) => YEAR_NOTES[t].short).join(' · ') };
  });
  const highlights = years.filter((y) => y.tags.some((t) => ['zhengguan', 'qisha', 'yin', 'guiren'].includes(t)));
  return {
    chart: c,
    type: CAREER_TYPES[typeKey],
    groups: g,
    guiBranches,
    guiAnimals,
    guiDirections: guiBranches.map((b) => BRANCH_DIRECTION[b]),
    hasGuiRen,
    guiText: GUIREN_TEXT[hasGuiRen ? 'has' : 'none'],
    guiLine: GUIREN_TEXT.line.replace('{branches}', guiBranches.join('、')).replace('{animals}', guiAnimals.join('、')),
    yiMa: ym,
    hasYiMa,
    yiMaText: YIMA_TEXT[hasYiMa ? 'has' : 'none'],
    wenChang: wc,
    wenChangDirection: BRANCH_DIRECTION[wc],
    hasWenChang,
    wenChangText: WENCHANG_TEXT[hasWenChang ? 'has' : 'none'],
    strengthText: STRENGTH_TEXT[c.strength],
    years,
    highlights,
    nextYear: highlights[0] || years.find((y) => y.tags.includes('yima') || y.tags.includes('wenchang')) || null,
  };
}

/* -------------------------------- 分享 -------------------------------- */
const starText = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

export function shareToday(t, sign, now = new Date()) {
  const hours = t.luckyHours.slice(0, 3).map((x) => `${x.zhi}时`).join(' ');
  return [
    `【今日事业】${formatDate(now)} · ${starText(t.stars)} ${t.level.title}`,
    `贵人${t.gui.now}（${t.gui.label}）· 面谈吉时 ${hours || '宜缓'}`,
    sign ? `事业签 · ${sign.level}签「${sign.title}」：${sign.verse.replace('\n', '，')}` : '',
    SHARE_SIGN,
  ].filter(Boolean).join('\n');
}

export function shareChart(w) {
  const next = w.nextYear ? `${w.nextYear.year} ${w.nextYear.ganZhi}年（${w.nextYear.note}）` : '静待';
  return [
    `【事业格局】${w.chart.animal}命 · 日主 ${w.chart.dayStem}${w.chart.dayElement} · ${w.type.name} · ${w.type.title}`,
    `贵人属相：${w.guiAnimals.join('、')} · ${w.yiMaText.title} · ${w.wenChangText.title}`,
    `下一个机遇年：${next}`,
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
