import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mingGua, guaGroup, houseMap, annualCenter, annualStars, directionAt, mountainAt, digitSum, luckyDirections, toGrid } from '../src/modules/fengshui/core.js';
import { EIGHT_HOUSE, DIRECTIONS, STARS8, NINE_STARS } from '../src/modules/fengshui/data.js';

test('命卦经典用例', () => {
  assert.equal(mingGua(1985, 'male'), '乾');
  assert.equal(mingGua(1985, 'female'), '离');
  assert.equal(mingGua(1990, 'male'), '坎');
  assert.equal(mingGua(1990, 'female'), '艮');
  assert.equal(mingGua(2000, 'male'), '离');
  assert.equal(mingGua(2000, 'female'), '乾');
  assert.equal(mingGua(1978, 'male'), '巽');
  assert.equal(mingGua(1978, 'female'), '坤');
  assert.equal(mingGua(1955, 'male'), '离');
});

test('东西四命分组', () => {
  for (const g of ['坎', '离', '震', '巽']) assert.equal(guaGroup(g), 'east');
  for (const g of ['乾', '坤', '艮', '兑']) assert.equal(guaGroup(g), 'west');
});

test('八宅表：每卦八星覆盖八方且不重复；伏位在本卦方位', () => {
  const names = DIRECTIONS.map((d) => d.name).sort();
  for (const [gua, row] of Object.entries(EIGHT_HOUSE)) {
    const dirs = Object.values(row).sort();
    assert.deepEqual(dirs, names, gua);
    assert.equal(Object.keys(row).length, 8);
    const own = DIRECTIONS.find((d) => d.gua === gua).name;
    assert.equal(row['伏位'], own, `${gua} 伏位应在 ${own}`);
  }
  const map = houseMap('坎');
  assert.equal(map.find((d) => d.name === '东南').star, '生气');
  assert.equal(map.find((d) => d.name === '西').star, '祸害');
  assert.deepEqual(luckyDirections('坎').sort(), ['东', '东南', '北', '南'].sort());
});

test('年紫白入中星', () => {
  assert.equal(annualCenter(2024), 3);
  assert.equal(annualCenter(2025), 2);
  assert.equal(annualCenter(2026), 1);
  assert.equal(annualCenter(2027), 9);
  assert.equal(annualCenter(2018), 9);
  assert.equal(annualCenter(1999), 1);
  assert.equal(annualCenter(2004), 5);
});

test('2026 九宫飞星', () => {
  const { palaces, center } = annualStars(2026);
  assert.equal(center, 1);
  const at = (name) => palaces.find((p) => p.name === name).star;
  assert.equal(at('西北'), 2);
  assert.equal(at('西'), 3);
  assert.equal(at('东北'), 4);
  assert.equal(at('南'), 5);
  assert.equal(at('北'), 6);
  assert.equal(at('西南'), 7);
  assert.equal(at('东'), 8);
  assert.equal(at('东南'), 9);
  const grid = toGrid(palaces, { star: center });
  assert.equal(grid.length, 9);
  assert.equal(grid[4].star, 1);
});

test('方位与二十四山', () => {
  assert.equal(directionAt(123).name, '东南');
  assert.equal(directionAt(123).gua, '巽');
  assert.equal(directionAt(359).name, '北');
  assert.equal(directionAt(-45).name, '西北');
  assert.equal(mountainAt(0), '子');
  assert.equal(mountainAt(7.4), '子');
  assert.equal(mountainAt(7.6), '癸');
  assert.equal(mountainAt(180), '午');
  assert.equal(mountainAt(90), '卯');
  assert.equal(digitSum(1990 % 100), 9);
  assert.equal(digitSum(0), 0);
});

test('数据完整：八星与九星文案齐全', () => {
  for (const s of Object.values(STARS8)) for (const k of ['text', 'use', 'avoid', 'label', 'tone']) assert.ok(s[k]);
  for (let i = 1; i <= 9; i++) for (const k of ['name', 'meaning', 'advice', 'tone']) assert.ok(NINE_STARS[i][k]);
});
