import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayCareer, drawSign, signByNo, careerChart, shareToday, shareChart } from '../src/modules/shiye/core.js';
import { CAREER_SIGNS, CAREER_TYPES, DAILY_CAREER, CAREER_TIPS, TODAY_RELATION, YEAR_NOTES, GUIREN_TEXT, YIMA_TEXT, WENCHANG_TEXT, STRENGTH_TEXT, UI } from '../src/modules/shiye/data.js';
import { seeded } from '../src/core/rng.js';

const len = (s) => [...String(s)].length;
const clean = (s) => !/[A-Za-z]|TODO|xxx|示例/.test(s) && !/["']/.test(s);
const A = { y: 1995, m: 6, d: 18, hour: 14, gender: 'male' };
const NOW = new Date(2026, 8, 15, 10);

test('今日事业：无生辰也能算；白天用阳贵、夜里用阴贵', () => {
  const t = todayCareer(null, NOW);
  assert.equal(t.chart, null);
  assert.equal(t.gui.yang, '正东');
  assert.equal(t.gui.yin, '东南');
  assert.equal(t.gui.now, '正东');
  assert.equal(t.gui.label, '阳贵');
  const night = todayCareer(null, new Date(2026, 8, 15, 21));
  assert.equal(night.gui.now, '东南');
  assert.equal(night.gui.label, '阴贵');
  assert.equal(t.day.hours.length, 12);
  assert.ok(t.stars >= 1 && t.stars <= 5);
  assert.equal(t.level, DAILY_CAREER[t.stars - 1]);
  assert.ok(CAREER_TIPS.includes(t.tip));
  assert.ok(t.yi.includes('出行'));
});

test('今日事业：有生辰时给出今日十神关系与神煞提示', () => {
  const t = todayCareer(A, NOW); // 壬辰日：庚见壬 = 食神
  assert.equal(t.relation.god, '食神');
  assert.equal(t.relation.title, TODAY_RELATION['食伤'].title);
  assert.deepEqual(t.notes, []);
  // 庚日主天乙贵人在丑未：2026-09-18 乙未日 → 贵人日
  const t2 = todayCareer(A, new Date(2026, 8, 18, 10));
  assert.equal(t2.day.dayGanZhi, '乙未');
  assert.ok(t2.notes.some((n) => n.includes('贵人')));
  assert.equal(todayCareer(A, NOW).index, t.index);
});

test('摇签：权重覆盖上中下，编号可查', () => {
  const rnd = seeded('shiye');
  const seen = { 上: 0, 中: 0, 下: 0 };
  for (let i = 0; i < 3000; i++) seen[drawSign(rnd).level]++;
  assert.ok(seen.上 > seen.下 && seen.中 > seen.下 && seen.下 > 200, JSON.stringify(seen));
  assert.equal(signByNo(1).title, '青云直上');
  assert.equal(signByNo(0), null);
});

test('事业格局：1995-06-18 庚金男 → 贵人丑未（牛羊）、命带贵人（未时）、文昌亥（年支）、驿马巳', () => {
  const w = careerChart(A, NOW);
  assert.deepEqual(w.guiBranches, ['丑', '未']);
  assert.deepEqual(w.guiAnimals, ['牛', '羊']);
  assert.equal(w.hasGuiRen, true);
  assert.equal(w.wenChang, '亥');
  assert.equal(w.hasWenChang, true);
  assert.equal(w.yiMa, '巳');
  assert.equal(w.hasYiMa, false);
  assert.ok(Object.values(CAREER_TYPES).includes(w.type));
  assert.equal(w.years.length, 10);
  // 2027 丁未：丁为庚之正官，未为贵人 → 正官年 · 贵人年
  const y2027 = w.years.find((y) => y.year === 2027);
  assert.ok(y2027.tags.includes('zhengguan') && y2027.tags.includes('guiren'), y2027.tags.join());
  assert.equal(w.nextYear.year <= 2027, true);
  assert.equal(w.strengthText, STRENGTH_TEXT[w.chart.strength]);
  assert.ok(w.guiLine.includes('牛') && w.guiLine.includes('羊'));
});

test('事业格局：六类格局都能被判到，文案齐全', () => {
  for (const k of ['guan', 'sha', 'yin', 'shishang', 'cai', 'bijie']) {
    const t = CAREER_TYPES[k];
    assert.ok(t && t.name && t.title && t.text && t.advice && t.suits, k);
    assert.ok(len(t.text) <= 120 && len(t.advice) <= 60 && clean(t.text) && clean(t.advice), k);
  }
  const types = new Set();
  for (let i = 0; i < 120; i++) types.add(careerChart({ y: 1970 + i % 35, m: 1 + (i * 5) % 12, d: 1 + (i * 7) % 28, hour: (i % 13) * 2 - 2, gender: i % 2 ? 'male' : 'female' }, NOW).type.key);
  assert.ok(types.size >= 4, '格局分布：' + [...types]);
});

test('文案预算：24 支签，题 4 字、印 1 字、签文两句各 ≤ 12 字、解 ≤ 120、劝 ≤ 60，无英文直引号', () => {
  assert.equal(CAREER_SIGNS.length, 24);
  assert.equal(new Set(CAREER_SIGNS.map((s) => s.no)).size, 24);
  for (const s of CAREER_SIGNS) {
    assert.equal(len(s.title), 4, s.title);
    assert.equal(len(s.seal), 1, s.title);
    assert.ok(['上', '中', '下'].includes(s.level));
    const lines = s.verse.split('\n');
    assert.equal(lines.length, 2, s.title);
    for (const l of lines) assert.ok(len(l) <= 12 && clean(l), l);
    assert.ok(len(s.meaning) <= 120 && clean(s.meaning), s.title + ' meaning');
    assert.ok(len(s.advice) <= 60 && clean(s.advice), s.title + ' advice');
  }
  assert.equal(CAREER_SIGNS.filter((s) => s.level === '上').length, 8);
  assert.equal(CAREER_SIGNS.filter((s) => s.level === '下').length, 6);
  for (const d of DAILY_CAREER) { assert.equal(len(d.seal), 1); assert.ok(len(d.title) <= 8 && len(d.text) <= 120 && clean(d.text)); }
  for (const t of CAREER_TIPS) assert.ok(len(t) <= 18 && clean(t), t);
  for (const r of Object.values(TODAY_RELATION)) assert.ok(len(r.text) <= 80 && clean(r.text));
  for (const n of Object.values(YEAR_NOTES)) assert.ok(len(n.short) <= 4 && len(n.text) <= 60);
  for (const t of [GUIREN_TEXT.has, GUIREN_TEXT.none, ...Object.values(YIMA_TEXT), ...Object.values(WENCHANG_TEXT)]) assert.ok(len(t.text) <= 120 && clean(t.text));
  for (const v of Object.values(UI.stageHint)) assert.ok(len(v) <= 18);
});

test('分享文案含签名', () => {
  const t = todayCareer(A, NOW);
  assert.ok(shareToday(t, signByNo(2), NOW).includes('得遇明主'));
  const w = careerChart(A, NOW);
  const s = shareChart(w);
  assert.ok(s.includes('来感觉') && s.includes('贵人属相') && s.includes('牛'));
});
