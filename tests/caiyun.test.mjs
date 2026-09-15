import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayWealth, drawSign, signByNo, wealthChart, shareToday, shareChart } from '../src/modules/caiyun/core.js';
import { WEALTH_SIGNS, WEALTH_TYPES, DAILY_WEALTH, WEALTH_TIPS, TODAY_RELATION, YEAR_NOTES, TREASURY_TEXT, LU_TEXT, STRENGTH_TEXT, UI } from '../src/modules/caiyun/data.js';
import { seeded } from '../src/core/rng.js';

const len = (s) => [...String(s)].length;
const clean = (s) => !/[A-Za-z]|TODO|xxx|示例/.test(s) && !/["']/.test(s);
const A = { y: 1995, m: 6, d: 18, hour: 14, gender: 'male' };
const NOW = new Date(2026, 8, 15, 10);

test('今日财运：无生辰也能算，含财神方位、十二时辰、宜忌、五档', () => {
  const t = todayWealth(null, NOW);
  assert.equal(t.chart, null);
  assert.equal(t.relation, null);
  assert.equal(t.positions.cai, '正南');
  assert.equal(t.day.hours.length, 12);
  assert.ok(t.luckyHours.length >= 1);
  assert.ok(t.current && t.current.zhi === '巳');
  assert.ok(t.nextLucky);
  assert.ok(t.stars >= 1 && t.stars <= 5 && t.index >= 30 && t.index <= 99);
  assert.equal(t.level, DAILY_WEALTH[t.stars - 1]);
  assert.ok(WEALTH_TIPS.includes(t.tip));
  assert.ok(t.ji.includes('开市'));
});

test('今日财运：有生辰时给出今日十神关系，且同日稳定', () => {
  const t = todayWealth(A, NOW);
  assert.ok(t.chart && t.chart.dayStem === '庚');
  assert.equal(t.relation.god, '食神'); // 庚见壬
  assert.equal(t.relation.group, '食伤');
  assert.equal(t.relation.title, TODAY_RELATION['食伤'].title);
  assert.deepEqual(t.notes, []); // 壬辰日：辰既非庚之禄神（申），也非财星木之库（未）
  const t2 = todayWealth(A, new Date(2026, 8, 18, 10)); // 乙未日：未为木库 → 财库开
  assert.equal(t2.day.dayGanZhi, '乙未');
  assert.ok(t2.notes.some((n) => n.includes('财库')));
  assert.equal(t2.relation.god, '正财');
  assert.equal(todayWealth(A, NOW).index, t.index);
});

test('摇签：权重抽取覆盖上中下三档，编号可查', () => {
  const rnd = seeded('caiyun');
  const seen = { 上: 0, 中: 0, 下: 0 };
  for (let i = 0; i < 3000; i++) seen[drawSign(rnd).level]++;
  assert.ok(seen.上 > seen.下, JSON.stringify(seen));
  assert.ok(seen.中 > seen.下);
  assert.ok(seen.下 > 200);
  assert.equal(signByNo(1).title, '金玉满堂');
  assert.equal(signByNo(99), null);
});

test('我的财库：庚金日主 → 财星木、财库未；1995-06-18 未时命带财库；类型正财型', () => {
  const w = wealthChart(A, NOW);
  assert.equal(w.wealthEl, '木');
  assert.deepEqual(w.treasury, ['未']);
  assert.equal(w.hasTreasury, true);
  assert.equal(w.lu, '申');
  assert.equal(w.hasLu, false);
  assert.equal(w.luDirection, '西南');
  assert.equal(w.zheng, 1);
  assert.equal(w.pian, 0);
  assert.equal(w.type.key, 'zheng');
  assert.equal(w.starsKey, 'zheng');
  assert.equal(w.years.length, 10);
  assert.ok(w.years.every((y) => typeof y.note === 'string'));
  // 2028 戊申 → 戊为庚之偏印；2034 甲寅 → 甲为偏财；2035 乙卯 → 乙为正财
  const y2034 = w.years.find((y) => y.year === 2034);
  assert.ok(y2034.tags.includes('piancai'));
  const y2035 = w.years.find((y) => y.year === 2035);
  assert.ok(y2035.tags.includes('zhengcai'));
  assert.ok(w.highlights.length >= 2);
  assert.ok(w.nextYear);
  assert.equal(w.strengthText, STRENGTH_TEXT[w.chart.strength]);
});

test('我的财库：无财星时按食伤 / 比劫 / 印星 / 官杀择类型，七类文案齐全', () => {
  for (const k of ['zheng', 'pian', 'mixed', 'shishang', 'bijie', 'yin', 'guan']) {
    const t = WEALTH_TYPES[k];
    assert.ok(t && t.name && t.title && t.text && t.advice && t.suits, k);
    assert.ok(len(t.text) <= 120 && len(t.advice) <= 60 && clean(t.text) && clean(t.advice), k);
  }
  const types = new Set();
  for (let i = 0; i < 80; i++) types.add(wealthChart({ y: 1975 + i % 30, m: 1 + (i * 5) % 12, d: 1 + (i * 7) % 28, hour: -1, gender: i % 2 ? 'male' : 'female' }, NOW).type.key);
  assert.ok(types.size >= 4, '类型分布：' + [...types]);
});

test('文案预算：24 支签，题 4 字、印 1 字、签文两句各 ≤ 12 字、解 ≤ 120、劝 ≤ 60，无英文直引号', () => {
  assert.equal(WEALTH_SIGNS.length, 24);
  const nos = new Set(WEALTH_SIGNS.map((s) => s.no));
  assert.equal(nos.size, 24);
  for (const s of WEALTH_SIGNS) {
    assert.equal(len(s.title), 4, s.title);
    assert.equal(len(s.seal), 1, s.title);
    assert.ok(['上', '中', '下'].includes(s.level));
    const lines = s.verse.split('\n');
    assert.equal(lines.length, 2, s.title);
    for (const l of lines) assert.ok(len(l) <= 12 && clean(l), l);
    assert.ok(len(s.meaning) <= 120 && clean(s.meaning), s.title + ' meaning');
    assert.ok(len(s.advice) <= 60 && clean(s.advice), s.title + ' advice');
  }
  assert.equal(WEALTH_SIGNS.filter((s) => s.level === '上').length, 8);
  assert.equal(WEALTH_SIGNS.filter((s) => s.level === '下').length, 6);
  for (const d of DAILY_WEALTH) { assert.equal(len(d.seal), 1); assert.ok(len(d.title) <= 8 && len(d.text) <= 120 && clean(d.text)); }
  for (const t of WEALTH_TIPS) assert.ok(len(t) <= 18 && clean(t), t);
  for (const r of Object.values(TODAY_RELATION)) assert.ok(len(r.text) <= 80 && clean(r.text));
  for (const n of Object.values(YEAR_NOTES)) assert.ok(len(n.short) <= 4 && len(n.text) <= 60);
  for (const t of [...Object.values(TREASURY_TEXT), ...Object.values(LU_TEXT)]) assert.ok(len(t.text) <= 120 && clean(t.text));
  for (const v of Object.values(UI.stageHint)) assert.ok(len(v) <= 18);
});

test('分享文案含签名', () => {
  const t = todayWealth(A, NOW);
  const s = shareToday(t, signByNo(3), NOW);
  assert.ok(s.includes('来感觉') && s.includes('财神') && s.includes('瓜熟蒂落'));
  const w = wealthChart(A, NOW);
  assert.ok(shareChart(w).includes('正财型'));
});
