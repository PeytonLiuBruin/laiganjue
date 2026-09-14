import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDay,
  shiftDay,
  hourIndex,
  dailyQuote,
  dayRating,
  summarize,
  findGoodDay,
  relativeLabel,
  shareText,
  toKey,
  fromKey,
  dayDiff,
  pengZuPlain,
  termMeaning,
  jiShenMeaning,
  xiongShaMeaning,
  ZHI,
} from '../src/modules/almanac/core.js';
import { QUOTES, TIAN_SHEN, ZHI_XING, XIU, PENG_ZU, HOURS, POSITIONS, YIJI_TERMS, JI_SHEN, XIONG_SHA, RATINGS, PICK_TERMS, LIU_YAO, DIRECTION_DEG, GLOSSARY, TEXT } from '../src/modules/almanac/data.js';
import { Solar } from '../src/core/lunar.js';

const d = (y, m, day, h = 12, mi = 0) => new Date(y, m - 1, day, h, mi);

test('buildDay 2026-09-13：庚寅日、属马、丙午年八月初三、青龙黄道、建除执、星日马', () => {
  const day = buildDay(d(2026, 9, 13));
  assert.equal(day.key, '2026-09-13');
  assert.equal(day.lunar.dayGanZhi, '庚寅');
  assert.equal(day.lunar.zodiac, '马');
  assert.equal(day.lunar.yearGanZhi, '丙午');
  assert.equal(day.lunar.monthGanZhi, '丁酉');
  assert.equal(day.lunar.text, '八月初三');
  assert.equal(day.solar.weekText, '星期日');
  assert.equal(day.xingzuo, '处女座');
  assert.deepEqual(day.tianShen, { name: '青龙', type: '黄道', luck: '吉' });
  assert.equal(day.zhiXing, '执');
  assert.equal(day.xiu.full, '星日马');
  assert.equal(day.xiu.luck, '凶');
  assert.equal(day.naYin.day, '松柏木');
  assert.equal(day.chong.shengXiao, '猴');
  assert.equal(day.sha, '北');
  assert.equal(day.positions.cai.desc, '正东');
  assert.equal(day.positions.xi.desc, '西北');
  assert.deepEqual(day.nextJieqi, { name: '秋分', key: '2026-09-23', days: 10 });
  assert.equal(day.allBad, true, '忌 诸事不宜 → allBad');
  assert.ok(day.ji.includes('诸事不宜'));
});

test('buildDay：字段全为字符串 / 数组 / 普通对象，不泄露 lunar 对象', () => {
  const day = buildDay(d(2026, 9, 13));
  const walk = (v, path) => {
    if (v == null) return;
    const t = typeof v;
    if (t === 'string' || t === 'number' || t === 'boolean') return;
    if (Array.isArray(v)) return v.forEach((x, i) => walk(x, `${path}[${i}]`));
    assert.equal(Object.getPrototypeOf(v), Object.prototype, `${path} 应为普通对象`);
    for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(day, 'day');
});

test('buildDay：十二时辰 12 格 + 晚子，子时排首位，值神吉凶来自 lunar', () => {
  const day = buildDay(d(2026, 9, 13));
  assert.equal(day.hours.length, 12);
  assert.deepEqual(
    day.hours.map((x) => x.zhi),
    ZHI,
  );
  assert.equal(day.hours[0].range, '23:00–00:59');
  assert.equal(day.hours[1].range, '01:00–02:59');
  assert.equal(day.hours[11].range, '21:00–22:59');
  assert.equal(day.hours[0].tianShen, '青龙');
  assert.equal(day.hours[5].tianShen, '天德');
  assert.equal(day.hours[5].luck, '吉');
  assert.equal(day.hours[6].tianShen, '白虎');
  assert.equal(day.hours[6].luck, '凶');
  assert.ok(day.lateZi && day.lateZi.name === '晚子' && day.lateZi.tianShen === '司命');
  for (const hr of day.hours) {
    assert.ok(['吉', '凶'].includes(hr.luck));
    assert.ok(Array.isArray(hr.yi) && Array.isArray(hr.ji));
    assert.equal(hr.name, HOURS[hr.index].name);
  }
});

test('buildDay 2026-02-17：正月初一 · 春节 · 丙午马年', () => {
  const day = buildDay(d(2026, 2, 17));
  assert.equal(day.lunar.text, '正月初一');
  assert.equal(day.lunar.yearGanZhi, '丙午');
  assert.equal(day.lunar.zodiac, '马');
  assert.ok(day.festivals.includes('春节'));
});

test('buildDay：节气日 / 闰月 / 数九 / 伏天', () => {
  assert.equal(buildDay(d(2026, 9, 23)).jieqi, '秋分');
  assert.equal(buildDay(d(2026, 9, 23)).nextJieqi.name, '寒露');
  const leap = buildDay(d(2020, 5, 23));
  assert.equal(leap.lunar.monthText, '闰四月');
  assert.equal(leap.lunar.isLeap, true);
  assert.equal(buildDay(d(2026, 1, 10)).shuJiu, '三九');
  assert.equal(buildDay(d(2026, 7, 25)).fu, '中伏');
  assert.equal(buildDay(d(2026, 9, 13)).shuJiu, '');
});

test('shiftDay：跨月 / 跨年 / 闰年 / 负数，且保留时分', () => {
  assert.equal(toKey(shiftDay(d(2026, 12, 31), 1)), '2027-01-01');
  assert.equal(toKey(shiftDay(d(2026, 1, 1), -1)), '2025-12-31');
  assert.equal(toKey(shiftDay(d(2026, 2, 28), 1)), '2026-03-01');
  assert.equal(toKey(shiftDay(d(2024, 2, 28), 1)), '2024-02-29');
  assert.equal(toKey(shiftDay(d(2024, 3, 1), -1)), '2024-02-29');
  assert.equal(toKey(shiftDay(d(2026, 9, 13), 30)), '2026-10-13');
  assert.equal(toKey(shiftDay(d(2026, 9, 13), -400)), '2025-08-09');
  const t = shiftDay(d(2026, 9, 13, 23, 30), 1);
  assert.equal(t.getHours(), 23);
  assert.equal(t.getMinutes(), 30);
  assert.equal(dayDiff(d(2026, 12, 31), d(2027, 1, 1)), 1);
  assert.equal(dayDiff(d(2026, 9, 13), d(2026, 9, 10)), -3);
});

test('hourIndex：23:30 → 子(0)，0:30 → 子，1:00 → 丑，12:00 → 午，22:59 → 亥', () => {
  assert.equal(hourIndex(d(2026, 9, 13, 23, 30)), 0);
  assert.equal(hourIndex(d(2026, 9, 13, 0, 30)), 0);
  assert.equal(hourIndex(d(2026, 9, 13, 0, 59)), 0);
  assert.equal(hourIndex(d(2026, 9, 13, 1, 0)), 1);
  assert.equal(hourIndex(d(2026, 9, 13, 2, 59)), 1);
  assert.equal(hourIndex(d(2026, 9, 13, 12, 0)), 6);
  assert.equal(hourIndex(d(2026, 9, 13, 22, 59)), 11);
  assert.equal(hourIndex(d(2026, 9, 13, 21, 0)), 11);
  assert.equal(ZHI[hourIndex(d(2026, 9, 13, 9, 30))], '巳');
});

test('dailyQuote：同一天任何时刻一致；跨日有变化；来自 QUOTES', () => {
  const a = dailyQuote(d(2026, 9, 13, 0, 1));
  const b = dailyQuote(d(2026, 9, 13, 23, 59));
  assert.deepEqual(a, b);
  assert.ok(QUOTES.includes(a));
  const set = new Set();
  for (let i = 0; i < 40; i++) set.add(dailyQuote(shiftDay(d(2026, 9, 13), i)).text);
  assert.ok(set.size >= 12, '40 天内至少 12 句不同：' + set.size);
});

test('QUOTES：40 句以上，有出处，无重复，无占位文字', () => {
  assert.ok(QUOTES.length >= 40, 'quotes: ' + QUOTES.length);
  const texts = new Set(QUOTES.map((q) => q.text));
  assert.equal(texts.size, QUOTES.length, '无重复');
  for (const q of QUOTES) {
    assert.ok(q.text.length >= 6 && q.source.length >= 2, JSON.stringify(q));
    assert.ok(!/TODO|待补|示例|xxx|\?\?/i.test(q.text + q.source));
  }
});

test('data 完整性：值神 12 / 建除 12 / 二十八宿 28 / 彭祖 22 / 时辰 12 / 方位 6 / 评级 5', () => {
  assert.equal(Object.keys(TIAN_SHEN).length, 12);
  assert.equal(Object.values(TIAN_SHEN).filter((t) => t.type === '黄道').length, 6);
  assert.equal(Object.keys(ZHI_XING).length, 12);
  assert.equal(Object.keys(XIU).length, 28);
  assert.equal(Object.keys(PENG_ZU).length, 22);
  assert.equal(HOURS.length, 12);
  assert.deepEqual(
    HOURS.map((x) => x.zhi),
    ZHI,
  );
  assert.equal(POSITIONS.length, 6);
  assert.equal(Object.keys(RATINGS).length, 5);
  assert.equal(Object.keys(LIU_YAO).length, 6);
  assert.equal(Object.keys(DIRECTION_DEG).length, 8);
  assert.ok(PICK_TERMS.length >= 8);
  for (const t of PICK_TERMS) assert.ok(YIJI_TERMS[t.value], '择日事项须有词汇解释：' + t.value);
});

test('data 覆盖：lunar 十年内产出的值神 / 建除 / 星宿 / 宜忌 / 吉神 / 凶煞 / 六曜 全部有解释', () => {
  const start = Solar.fromYmd(2020, 1, 1);
  const seen = { ts: new Set(), zx: new Set(), xiu: new Set(), terms: new Set(), js: new Set(), xs: new Set(), ly: new Set() };
  for (let i = 0; i < 3653; i++) {
    const l = start.next(i).getLunar();
    seen.ts.add(l.getDayTianShen());
    seen.zx.add(l.getZhiXing());
    seen.xiu.add(`${l.getXiu()}${l.getZheng()}${l.getAnimal()}`);
    seen.ly.add(l.getLiuYao());
    l.getDayYi().forEach((t) => seen.terms.add(t));
    l.getDayJi().forEach((t) => seen.terms.add(t));
    l.getDayJiShen().forEach((t) => seen.js.add(t));
    l.getDayXiongSha().forEach((t) => seen.xs.add(t));
  }
  for (const t of seen.ts) assert.ok(TIAN_SHEN[t], '值神缺解释：' + t);
  for (const t of seen.zx) assert.ok(ZHI_XING[t], '建除缺解释：' + t);
  for (const t of seen.xiu) assert.ok(XIU[t], '星宿缺解释：' + t);
  for (const t of seen.ly) assert.ok(LIU_YAO[t], '六曜缺解释：' + t);
  for (const t of seen.terms) assert.ok(YIJI_TERMS[t], '宜忌词缺解释：' + t);
  for (const t of seen.js) assert.ok(JI_SHEN[t], '吉神缺解释：' + t);
  for (const t of seen.xs) assert.ok(XIONG_SHA[t], '凶煞缺解释：' + t);
  assert.ok(seen.terms.size > 100);
});

test('文案质量：无占位符 / 无乱码 / 不为空', () => {
  const all = [
    ...Object.values(TIAN_SHEN).map((t) => t.text),
    ...Object.values(ZHI_XING).map((t) => t.text),
    ...Object.values(XIU),
    ...Object.values(PENG_ZU),
    ...HOURS.map((x) => x.text),
    ...POSITIONS.map((x) => x.text),
    ...Object.values(YIJI_TERMS),
    ...Object.values(JI_SHEN),
    ...Object.values(XIONG_SHA),
    ...Object.values(RATINGS).map((r) => r.text),
  ];
  for (const s of all) {
    assert.ok(typeof s === 'string' && s.trim().length >= 2, JSON.stringify(s));
    assert.ok(!/TODO|待补|示例|lorem|�/i.test(s), '占位/乱码：' + s);
  }
});

test('dayRating：1–5 之间；黄道吉日 + 吉宿 + 成开定满 → 高分；诸事不宜拉低', () => {
  const r = dayRating(buildDay(d(2026, 9, 13)));
  assert.ok(r.score >= 1 && r.score <= 5);
  assert.equal(r.label, RATINGS[r.score].label);
  const scores = new Set();
  for (let i = 0; i < 120; i++) {
    const day = buildDay(shiftDay(d(2026, 1, 1), i));
    const x = dayRating(day);
    assert.ok(x.score >= 1 && x.score <= 5);
    assert.ok(x.seal.length >= 1 && x.seal.length <= 2);
    scores.add(x.score);
    if (day.allBad) assert.ok(x.score <= 2, '诸事不宜不应高分：' + day.key);
    if (day.tianShen.luck !== '吉') assert.ok(x.score <= 3, '黑道日不应评吉：' + day.key);
    if (x.score >= 4) assert.equal(day.tianShen.luck, '吉');
  }
  assert.ok(scores.size >= 3, '评分应有分布：' + [...scores]);
});

test('summarize / pengZuPlain / 词义查询', () => {
  const day = buildDay(d(2026, 9, 13));
  const s = summarize(day);
  assert.ok(s.includes('青龙') && s.includes('执') && s.includes('星日马') && s.includes('诸事不宜'));
  const [g, z] = pengZuPlain(day);
  assert.ok(g.startsWith('庚日') && z.startsWith('寅日'));
  assert.ok(termMeaning('嫁娶').length > 2);
  assert.equal(termMeaning('不存在的词'), '');
  assert.ok(jiShenMeaning('月德').includes('德'));
  assert.ok(jiShenMeaning('无名吉神').length > 2, '未知吉神有兜底文案');
  assert.ok(xiongShaMeaning('劫煞').length > 2);
  assert.ok(xiongShaMeaning('无名凶煞').length > 2);
});

test('findGoodDay：找到的日子确实宜此事、非诸事不宜、不在忌中', () => {
  for (const term of ['嫁娶', '开市', '出行', '移徙']) {
    const r = findGoodDay(term, d(2026, 9, 13));
    assert.ok(r, term);
    assert.ok(r.daysAhead >= 1 && r.daysAhead <= 180);
    assert.ok(r.day.yi.includes(term), `${term} @ ${r.day.key}: ${r.day.yi}`);
    assert.ok(!r.day.ji.includes(term));
    assert.equal(r.day.allBad, false);
    assert.equal(toKey(r.date), r.day.key);
    assert.equal(dayDiff(d(2026, 9, 13), r.date), r.daysAhead);
  }
  assert.equal(findGoodDay('不存在的事项', d(2026, 9, 13), { maxDays: 30 }), null);
});

test('relativeLabel / toKey / fromKey', () => {
  const today = d(2026, 9, 13);
  assert.equal(relativeLabel(today, today), '今天');
  assert.equal(relativeLabel(d(2026, 9, 14), today), '明天');
  assert.equal(relativeLabel(d(2026, 9, 15), today), '后天');
  assert.equal(relativeLabel(d(2026, 9, 12), today), '昨天');
  assert.equal(relativeLabel(d(2026, 9, 11), today), '前天');
  assert.equal(relativeLabel(d(2026, 10, 1), today), '18 天后');
  assert.equal(relativeLabel(d(2026, 9, 1), today), '12 天前');
  assert.equal(toKey(d(2026, 1, 5)), '2026-01-05');
  assert.equal(toKey(fromKey('2026-02-17')), '2026-02-17');
  assert.equal(fromKey('2026-02-30'), null);
  assert.equal(fromKey('abc'), null);
  assert.equal(fromKey(''), null);
});

test('shareText：含日期、农历、宜忌、值神、一言与署名', () => {
  const day = buildDay(d(2026, 9, 13));
  const q = dailyQuote(d(2026, 9, 13));
  const t = shareText(day, q);
  assert.ok(t.includes('2026年9月13日') && t.includes('星期日'));
  assert.ok(t.includes('八月初三') && t.includes('庚寅'));
  assert.ok(t.includes('宜：') && t.includes('忌：诸事不宜'));
  assert.ok(t.includes('青龙') && t.includes(q.text));
  assert.ok(t.endsWith('来感觉 · 玄学占卜'));
});

test('界面文案：操作提示一句 ≤ 18 字且动词开头；纸面与细目的名目都有一句解释；无占位符', () => {
  assert.ok(TEXT.hint.replace(/[\s·，。]/g, '').length <= 18, TEXT.hint);
  assert.ok(/^(横滑|滑动|左右滑|点|摇|撕)/.test(TEXT.hint), '动词开头：' + TEXT.hint);
  assert.ok(TEXT.tear.length <= 4 && TEXT.readPrefix.length <= 2 && TEXT.readFar.length <= 6);
  for (const k of ['冲煞', '值神', '建除', '星宿', '纳音', '彭祖百忌', '吉神方位', '时辰', '吉神宜趋', '凶神宜忌', '月相物候']) {
    assert.ok(GLOSSARY[k] && GLOSSARY[k].length >= 8, '名目缺解释：' + k);
  }
  for (const [k, v] of Object.entries(TEXT)) {
    assert.ok(typeof v === 'string' && v.trim().length >= 2, k);
    assert.ok(!/TODO|待补|示例|xxx|[A-Za-z]/.test(v), '占位或英文残留：' + k + ' = ' + v);
  }
  for (const r of Object.values(RATINGS)) assert.ok(r.label.length <= 2 && r.text.length <= 40, '评级一句话 ≤ 40 字：' + r.text);
});
