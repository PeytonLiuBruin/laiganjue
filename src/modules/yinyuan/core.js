// 姻缘 · 纯逻辑（无 DOM）：正缘档案（夫妻宫 / 配偶星 / 红鸾天喜流年 / 桃花位 / 今日桃花）与合婚配对评分。
import { fourPillars, branchRelation, stemRelation, taoHua, hongLuan, tianXi, upcomingYears, dailyIndex, dailyPick, tenGod, animalOf, BRANCH_DIRECTION, ELEMENTS, TEN_GOD_GROUP } from '../../core/destiny.js';
import { SPOUSE_PALACE, SPOUSE_STAR, MATCH_LEVELS, DAILY_LOVE, LOVE_TIPS, YEAR_NOTES, ZODIAC_REL, PALACE_REL, STEM_REL, COMPLEMENT, SHARE_SIGN } from './data.js';

/* ------------------------------ 正缘档案 ------------------------------ */
/**
 * loveProfile(birth, now) → 单人姻缘档案。所有字段为普通对象与字符串。
 */
export function loveProfile(birth, now = new Date()) {
  const c = fourPillars(birth);
  const female = c.gender === 'female';
  const [mainStar, altStar] = female ? ['正官', '七杀'] : ['正财', '偏财'];
  const main = c.gods[mainStar] || 0;
  const alt = c.gods[altStar] || 0;
  const starType = main && alt ? 'both' : main ? 'main' : alt ? 'alt' : 'none';
  const palace = c.dayBranch;
  const hl = hongLuan(c.yearBranch);
  const tx = tianXi(c.yearBranch);
  const th = taoHua(c.yearBranch);
  const thDay = taoHua(c.dayBranch);
  const hasTaoHua = c.branches.some((b, i) => (i !== 0 && b === th) || (i !== 2 && b === thDay));
  const years = upcomingYears(now.getFullYear(), 12).map((y) => {
    const rel = branchRelation(y.zhi, palace);
    const tags = [];
    if (y.zhi === hl) tags.push('hongLuan');
    if (y.zhi === tx) tags.push('tianXi');
    if (y.zhi === th) tags.push('taoHua');
    if (rel === 'liuhe' || rel === 'sanhe') tags.push('palaceHe');
    if (rel === 'chong') tags.push('palaceChong');
    const spouse = TEN_GOD_GROUP[tenGod(c.dayStem, y.gan)] === (female ? '官杀' : '财星');
    if (spouse) tags.push('spouseStar');
    return { ...y, tags, note: tags.map((t) => YEAR_NOTES[t].short).join(' · ') };
  });
  const highlights = years.filter((y) => y.tags.includes('hongLuan') || y.tags.includes('tianXi'));
  const nextLove = highlights[0] || years.find((y) => y.tags.includes('palaceHe') || y.tags.includes('spouseStar')) || null;

  // 今日桃花：日支与夫妻宫的关系 + 今日天干是否配偶星
  const today = fourPillars({ y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate(), hour: 12 });
  const relToday = branchRelation(today.dayBranch, palace);
  const godToday = tenGod(c.dayStem, today.dayStem);
  let bias = { liuhe: 12, sanhe: 8, same: 3, zixing: -3, none: 0, hai: -6, xing: -6, chong: -10 }[relToday] || 0;
  if (TEN_GOD_GROUP[godToday] === (female ? '官杀' : '财星')) bias += 8;
  if (TEN_GOD_GROUP[godToday] === '比劫') bias -= 4;
  if (today.dayBranch === th || today.dayBranch === thDay) bias += 6;
  const key = c.pillars.map((p) => p.ganZhi).join('');
  const { index, stars } = dailyIndex('love|' + key, now, bias);
  const daily = { index, stars, ...DAILY_LOVE[stars - 1], tip: dailyPick(LOVE_TIPS, 'love-tip|' + key, now), relToday, godToday };

  return {
    chart: c,
    female,
    palace,
    palaceText: SPOUSE_PALACE[palace],
    star: { type: starType, main, alt, mainStar, altStar, text: SPOUSE_STAR[female ? 'female' : 'male'][starType] },
    hongLuan: hl,
    tianXi: tx,
    taoHua: th,
    taoHuaDirection: BRANCH_DIRECTION[th],
    hasTaoHua,
    years,
    highlights,
    nextLove,
    daily,
  };
}

/* ------------------------------ 合婚配对 ------------------------------ */
const ZODIAC_SCORE = { liuhe: 22, sanhe: 18, none: 10, same: 8, zixing: 3, hai: 0, xing: -3, chong: -8 };
const PALACE_SCORE = { liuhe: 16, sanhe: 13, none: 8, same: 7, zixing: 3, hai: 1, xing: -2, chong: -6 };
const STEM_SCORE = { he: 16, sheng: 12, same: 8, peer: 7, ke: 5, chong: 1 };
const RAW_MIN = -8 - 6 + 1 + 0;
const RAW_MAX = 22 + 16 + 16 + 18;

function complementOf(a, b) {
  // a 缺的五行，b 有两个以上 → 互补一项
  return a.missing.filter((e) => b.elements[e] >= 2);
}

export function levelOf(score) {
  return MATCH_LEVELS.find((l) => score >= l.min) || MATCH_LEVELS[MATCH_LEVELS.length - 1];
}

/**
 * matchPair(a, b) → { score, level, zodiac, palace, stems, complement, a, b, sweet, rough }
 * 分数对称：交换双方结果一致。
 */
export function matchPair(a, b) {
  const A = fourPillars(a);
  const B = fourPillars(b);
  const zr = branchRelation(A.yearBranch, B.yearBranch);
  const pr = branchRelation(A.dayBranch, B.dayBranch);
  const sr = stemRelation(A.dayStem, B.dayStem);
  const compAB = complementOf(A, B);
  const compBA = complementOf(B, A);
  const compScore = Math.min(9, compAB.length * 3) + Math.min(9, compBA.length * 3);
  const raw = ZODIAC_SCORE[zr] + PALACE_SCORE[pr] + STEM_SCORE[sr] + compScore;
  const score = Math.round(50 + ((raw - 0) * 48) / RAW_MAX);
  const clamped = Math.max(41, Math.min(98, score));
  const level = levelOf(clamped);
  const items = [
    { key: 'zodiac', label: '生肖', rel: zr, tone: toneOf(ZODIAC_SCORE[zr], 22), title: ZODIAC_REL[zr].title, text: ZODIAC_REL[zr].text.replace('{a}', A.animal).replace('{b}', B.animal), pair: `${A.animal} × ${B.animal}` },
    { key: 'palace', label: '夫妻宫', rel: pr, tone: toneOf(PALACE_SCORE[pr], 16), title: PALACE_REL[pr].title, text: PALACE_REL[pr].text, pair: `${A.dayBranch} × ${B.dayBranch}` },
    { key: 'stems', label: '日主', rel: sr, tone: toneOf(STEM_SCORE[sr], 16), title: STEM_REL[sr].title, text: STEM_REL[sr].text.replace('{a}', A.dayStem + A.dayElement).replace('{b}', B.dayStem + B.dayElement), pair: `${A.dayStem}${A.dayElement} × ${B.dayStem}${B.dayElement}` },
    { key: 'complement', label: '五行', tone: compScore >= 9 ? 'great' : compScore >= 3 ? 'good' : 'plain', title: compScore ? COMPLEMENT.some.title : COMPLEMENT.none.title, text: complementText(A, B, compAB, compBA), pair: `${compAB.length + compBA.length} 处互补` },
  ];
  const sweet = items.slice().sort((x, y) => rank(y.tone) - rank(x.tone))[0];
  const rough = items.slice().sort((x, y) => rank(x.tone) - rank(y.tone))[0];
  return { a: A, b: B, score: clamped, raw, level, items, sweet, rough: rank(rough.tone) <= 1 ? rough : null, zodiac: items[0], palace: items[1], stems: items[2], complement: items[3] };
}

function toneOf(v, max) {
  if (v >= max * 0.8) return 'great';
  if (v >= max * 0.45) return 'good';
  if (v >= 0) return 'plain';
  return 'rough';
}
const rank = (tone) => ({ rough: 0, plain: 1, good: 2, great: 3 })[tone] ?? 1;

function complementText(A, B, compAB, compBA) {
  const parts = [];
  if (compAB.length) parts.push(COMPLEMENT.line.replace('{who}', '你').replace('{e}', compAB.join('、')).replace('{other}', '对方'));
  if (compBA.length) parts.push(COMPLEMENT.line.replace('{who}', '对方').replace('{e}', compBA.join('、')).replace('{other}', '你'));
  if (!parts.length) return COMPLEMENT.none.text;
  return parts.join('') + COMPLEMENT.some.text;
}

/* -------------------------------- 分享 -------------------------------- */
export function shareMatch(r) {
  return [
    `【合婚】${r.a.animal} × ${r.b.animal} · 缘分 ${r.score} 分 · ${r.level.name}`,
    `生肖${ZODIAC_REL[r.zodiac.rel].title} · 夫妻宫${PALACE_REL[r.palace.rel].title} · 日主${STEM_REL[r.stems.rel].title}`,
    r.level.verse,
    SHARE_SIGN,
  ].join('\n');
}

export function shareLove(p, now = new Date()) {
  const next = p.nextLove ? `${p.nextLove.year} ${p.nextLove.ganZhi}年（${p.nextLove.note}）` : '静待时机';
  return [
    `【正缘】${p.chart.animal}命 · 夫妻宫 ${p.palace} · ${p.palaceText.title}`,
    `今日桃花 ${'★'.repeat(p.daily.stars)}${'☆'.repeat(5 - p.daily.stars)} · ${p.daily.title}`,
    `下一个感情节点：${next}`,
    `桃花位 ${p.taoHuaDirection}`,
    SHARE_SIGN,
  ].join('\n');
}

export function formatDate(date = new Date()) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export { animalOf, ELEMENTS };
