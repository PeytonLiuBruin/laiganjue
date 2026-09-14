import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeChart, shiShen, elementRatios, naYinElement, daysInMonth, ELEMENTS } from '../src/modules/bazi/core.js';
import { DAY_MASTER, ELEMENT_INFO, SHISHEN_TEXT, TODAY_TEXT, HOURS } from '../src/modules/bazi/data.js';

test('四柱锚点：1995-06-18 14:30 → 乙亥 壬午 庚辰 癸未', () => {
  const c = computeChart({ y: 1995, m: 6, d: 18, hour: 14, gender: 'male' });
  assert.deepEqual(c.pillars.map((p) => p.ganZhi), ['乙亥', '壬午', '庚辰', '癸未']);
  assert.equal(c.dayMaster, '庚');
  assert.equal(c.dayMasterElement, '金');
  assert.equal(c.pillars[0].shiShen, '正财');
  assert.equal(c.pillars[1].shiShen, '食神');
  assert.equal(c.pillars[3].shiShen, '伤官');
  assert.equal(c.pillars[0].naYin, '山头火');
  assert.equal(c.total, 8);
  assert.equal(ELEMENTS.reduce((s, e) => s + c.elements[e], 0), 8);
});

test('时辰未知 → 三柱，合计 6', () => {
  const c = computeChart({ y: 2000, m: 1, d: 1, hour: -1, gender: 'female' });
  assert.equal(c.pillars.length, 3);
  assert.equal(c.hasHour, false);
  assert.equal(c.pillars[2].ganZhi, '戊午');
  assert.equal(ELEMENTS.reduce((s, e) => s + c.elements[e], 0), 6);
  assert.ok(['strong', 'balanced', 'weak'].includes(c.strength));
  assert.ok(c.todayRelation);
});

test('十神表（以甲为日主）', () => {
  const pairs = { 甲: '比肩', 乙: '劫财', 丙: '食神', 丁: '伤官', 戊: '偏财', 己: '正财', 庚: '七杀', 辛: '正官', 壬: '偏印', 癸: '正印' };
  for (const [k, v] of Object.entries(pairs)) assert.equal(shiShen('甲', k), v, k);
  assert.equal(shiShen('乙', '甲'), '劫财');
  assert.equal(shiShen('庚', '乙'), '正财');
  assert.equal(shiShen('庚', '癸'), '伤官');
  assert.equal(shiShen('x', '甲'), null);
});

test('工具函数', () => {
  assert.equal(naYinElement('山头火'), '火');
  assert.equal(naYinElement('白蜡金'), '金');
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2025, 2), 28);
  const c = computeChart({ y: 1988, m: 8, d: 8, hour: 8 });
  const r = elementRatios(c);
  assert.equal(r.length, 5);
  assert.ok(Math.abs(r.reduce((s, x) => s + x.ratio, 0) - 1) < 1e-9);
});

test('数据完整', () => {
  for (const s of ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']) {
    assert.ok(DAY_MASTER[s].text.length >= 80, s);
    assert.equal(DAY_MASTER[s].keywords.length, 4);
  }
  for (const e of ELEMENTS) assert.ok(ELEMENT_INFO[e].lack && ELEMENT_INFO[e].excess);
  for (const k of ['比肩', '劫财', '食神', '伤官', '偏财', '正财', '七杀', '正官', '偏印', '正印']) assert.ok(SHISHEN_TEXT[k] && TODAY_TEXT[k], k);
  assert.equal(HOURS.length, 13);
});
