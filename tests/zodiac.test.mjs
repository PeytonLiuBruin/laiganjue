import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signFromDate, dailyFortune, taiSuiRelation, animalFromYmd, signFortune, animalFortune, shareText, stepIn } from '../src/modules/zodiac/core.js';
import { SIGNS, ANIMALS, QUOTES, COLORS } from '../src/modules/zodiac/data.js';

test('星座日期边界', () => {
  const s = (m, d) => signFromDate(m, d).short;
  assert.equal(s(3, 21), '白羊');
  assert.equal(s(4, 19), '白羊');
  assert.equal(s(4, 20), '金牛');
  assert.equal(s(12, 22), '摩羯');
  assert.equal(s(1, 19), '摩羯');
  assert.equal(s(1, 20), '水瓶');
  assert.equal(s(2, 18), '水瓶');
  assert.equal(s(2, 19), '双鱼');
});

test('每日运势稳定且在范围内', () => {
  const d1 = new Date(2026, 8, 14);
  const d2 = new Date(2026, 8, 15);
  const a = dailyFortune('aries', d1);
  const b = dailyFortune('aries', d1);
  assert.deepEqual(a, b);
  assert.notDeepEqual(dailyFortune('aries', d2), a);
  for (const k of ['overall', 'love', 'career', 'wealth', 'health']) assert.ok(a[k] >= 1 && a[k] <= 5, k);
  assert.ok(a.number >= 1 && a.number <= 99);
  assert.ok(COLORS.includes(a.color));
  assert.ok(QUOTES.includes(a.quote));
});

test('太岁关系', () => {
  assert.equal(taiSuiRelation('午', '午').primary, 'benming');
  assert.equal(taiSuiRelation('子', '午').primary, 'chong');
  assert.equal(taiSuiRelation('丑', '午').primary, 'hai');
  assert.equal(taiSuiRelation('寅', '午').primary, 'sanhe');
  assert.equal(taiSuiRelation('未', '午').primary, 'liuhe');
  assert.equal(taiSuiRelation('申', '午').primary, 'ping');
  assert.equal(taiSuiRelation('鼠' === '鼠' ? '子' : '', '子').primary, 'benming');
});

test('生肖以春节为界', () => {
  assert.equal(animalFromYmd(2026, 1, 20).name, '蛇');
  assert.equal(animalFromYmd(2026, 2, 20).name, '马');
  assert.equal(animalFromYmd(2000, 6, 1).name, '龙');
});

test('组合结果与分享文案', () => {
  const sf = signFortune(SIGNS[0], new Date(2026, 8, 14));
  assert.equal(sf.kind, 'sign');
  assert.ok(sf.matchSign && sf.matchSign.id !== SIGNS[0].id);
  const af = animalFortune(ANIMALS[6], new Date(2026, 8, 14));
  assert.equal(af.kind, 'animal');
  assert.equal(af.year.relation.primary, 'benming');
  assert.ok(shareText(sf).includes('星座运势'));
  assert.ok(shareText(af).includes('生肖运势'));
  assert.equal(stepIn(SIGNS, 'aries', 1).id, SIGNS[1].id);
  assert.equal(stepIn(SIGNS, 'aries', -1).id, SIGNS[11].id);
});
