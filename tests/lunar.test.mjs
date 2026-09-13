import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Solar, lunarFromYmd, almanacSummary } from '../src/core/lunar.js';

test('日柱锚点：1900-01-01 甲戌, 1949-10-01 甲子, 2000-01-01 戊午', () => {
  assert.equal(lunarFromYmd(1900, 1, 1).getDayInGanZhi(), '甲戌');
  assert.equal(lunarFromYmd(1949, 10, 1).getDayInGanZhi(), '甲子');
  assert.equal(lunarFromYmd(2000, 1, 1).getDayInGanZhi(), '戊午');
});

test('春节锚点', () => {
  const cases = [
    [2023, 1, 22, '癸卯'],
    [2024, 2, 10, '甲辰'],
    [2025, 1, 29, '乙巳'],
    [2026, 2, 17, '丙午'],
    [2000, 2, 5, '庚辰'],
  ];
  for (const [y, m, d, gz] of cases) {
    const l = lunarFromYmd(y, m, d);
    assert.equal(l.getMonth(), 1, `${y} month`);
    assert.equal(l.getDay(), 1, `${y} day`);
    assert.equal(l.getYearInGanZhi(), gz, `${y} ganzhi`);
  }
});

test('闰月：2020-05-23 为闰四月初一', () => {
  const l = lunarFromYmd(2020, 5, 23);
  assert.equal(l.getMonth(), -4);
  assert.equal(l.getDay(), 1);
  assert.equal(l.getMonthInChinese(), '闰四');
});

test('节气：2026-09-23 秋分', () => {
  assert.equal(lunarFromYmd(2026, 9, 23).getJieQi(), '秋分');
});

test('八字：以 1995-06-18 14:30 为例', () => {
  const bz = Solar.fromYmdHms(1995, 6, 18, 14, 30, 0).getLunar().getEightChar();
  assert.equal(bz.getYear(), '乙亥');
  assert.equal(bz.getMonth(), '壬午');
  assert.equal(bz.getDay(), '庚辰');
  assert.equal(bz.getTime(), '癸未');
});

test('almanacSummary 字段齐全', () => {
  const a = almanacSummary(new Date(2026, 8, 13));
  assert.equal(a.dayGanZhi, '庚寅');
  assert.ok(Array.isArray(a.yi) && Array.isArray(a.ji));
  assert.ok(a.lunarText.includes('月'));
  assert.equal(a.zodiac, '马');
  assert.ok(a.xiShen && a.caiShen && a.fuShen);
});
