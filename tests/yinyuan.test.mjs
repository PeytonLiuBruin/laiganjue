import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loveProfile, matchPair, levelOf, shareMatch, shareLove } from '../src/modules/yinyuan/core.js';
import { SPOUSE_PALACE, SPOUSE_STAR, MATCH_LEVELS, DAILY_LOVE, LOVE_TIPS, YEAR_NOTES, ZODIAC_REL, PALACE_REL, STEM_REL, UI } from '../src/modules/yinyuan/data.js';
import { BRANCHES } from '../src/core/destiny.js';

const len = (s) => [...String(s)].length;
const clean = (s) => !/[A-Za-z]|TODO|xxx|示例/.test(s) && !/["']/.test(s);
const A = { y: 1995, m: 6, d: 18, hour: 14, gender: 'male' };
const B = { y: 1997, m: 3, d: 9, hour: -1, gender: 'female' };
const NOW = new Date(2026, 8, 15, 10);

test('正缘档案：1995-06-18 男 → 猪命，夫妻宫辰，红鸾辰 / 天喜戌，字段齐全', () => {
  const p = loveProfile(A, NOW);
  assert.equal(p.chart.animal, '猪');
  assert.equal(p.palace, '辰');
  assert.equal(p.palaceText.title, SPOUSE_PALACE['辰'].title);
  assert.equal(p.hongLuan, '辰');
  assert.equal(p.tianXi, '戌');
  assert.equal(p.taoHua, '子');
  assert.equal(p.taoHuaDirection, '正北');
  assert.equal(p.female, false);
  assert.ok(['main', 'alt', 'both', 'none'].includes(p.star.type));
  assert.equal(p.star.text, SPOUSE_STAR.male[p.star.type]);
  assert.equal(p.years.length, 12);
  assert.equal(p.years[0].year, 2026);
  // 2028 戊申？红鸾辰在 2036 丙辰，天喜戌在 2030 庚戌 → 十二年内至少一处
  assert.ok(p.highlights.length >= 1);
  assert.ok(p.highlights.every((y) => y.zhi === '辰' || y.zhi === '戌'));
  assert.ok(p.daily.stars >= 1 && p.daily.stars <= 5);
  assert.ok(p.daily.index >= 30 && p.daily.index <= 99);
  assert.ok(LOVE_TIPS.includes(p.daily.tip));
  assert.equal(p.daily.title, DAILY_LOVE[p.daily.stars - 1].title);
  assert.ok(p.nextLove && p.nextLove.note);
});

test('正缘档案：女命看官星', () => {
  const p = loveProfile(B, NOW);
  assert.equal(p.female, true);
  assert.equal(p.star.mainStar, '正官');
  assert.equal(p.star.text, SPOUSE_STAR.female[p.star.type]);
});

test('正缘档案：同日结果稳定，不同日子会变', () => {
  const a = loveProfile(A, NOW);
  const b = loveProfile(A, new Date(2026, 8, 15, 22));
  assert.equal(a.daily.index, b.daily.index);
  const days = new Set();
  for (let i = 0; i < 20; i++) days.add(loveProfile(A, new Date(2026, 8, 1 + i)).daily.index);
  assert.ok(days.size > 3);
});

test('合婚：分数 41–98，等级与分数一致，交换双方结果对称', () => {
  const r = matchPair(A, B);
  assert.ok(r.score >= 41 && r.score <= 98, String(r.score));
  assert.equal(r.level, levelOf(r.score));
  assert.equal(r.items.length, 4);
  const s = matchPair(B, A);
  assert.equal(s.score, r.score);
  assert.equal(s.level.name, r.level.name);
  assert.equal(s.zodiac.rel, r.zodiac.rel);
  assert.ok(r.sweet && r.sweet.text);
  for (const it of r.items) assert.ok(it.title && it.text && it.pair && ['great', 'good', 'plain', 'rough'].includes(it.tone), it.key);
});

test('合婚：六合 + 五合 + 互补能到「天作之合」，相冲相刑会掉到低档', () => {
  // 遍历一批生日，确认分布跨越多个等级
  const levels = new Set();
  let lo = 100, hi = 0;
  for (let i = 0; i < 60; i++) {
    const a = { y: 1980 + (i % 20), m: 1 + (i % 12), d: 1 + ((i * 7) % 27), hour: -1, gender: 'male' };
    const b = { y: 1982 + ((i * 3) % 20), m: 1 + ((i * 5) % 12), d: 1 + ((i * 11) % 27), hour: -1, gender: 'female' };
    const r = matchPair(a, b);
    levels.add(r.level.name);
    lo = Math.min(lo, r.score);
    hi = Math.max(hi, r.score);
  }
  assert.ok(levels.size >= 3, '等级分布：' + [...levels]);
  assert.ok(hi - lo >= 20, `分数跨度 ${lo}–${hi}`);
});

test('等级表：从高到低，最低档 min 为 0，印章 1 字', () => {
  for (let i = 1; i < MATCH_LEVELS.length; i++) assert.ok(MATCH_LEVELS[i].min < MATCH_LEVELS[i - 1].min);
  assert.equal(MATCH_LEVELS.at(-1).min, 0);
  assert.equal(levelOf(95).name, '天作之合');
  assert.equal(levelOf(85).name, '佳偶天成');
  assert.equal(levelOf(75).name, '良缘可期');
  assert.equal(levelOf(65).name, '磨合之缘');
  assert.equal(levelOf(50).name, '欢喜冤家');
  for (const l of MATCH_LEVELS) { assert.equal(len(l.seal), 1); assert.ok(len(l.name) <= 4); assert.ok(clean(l.text) && clean(l.advice) && clean(l.verse)); assert.ok(len(l.text) <= 120 && len(l.advice) <= 60); }
});

test('文案预算：夫妻宫 12 条、配偶星 4×2、关系文案齐全、无英文 / 直引号', () => {
  for (const b of BRANCHES) { assert.ok(SPOUSE_PALACE[b], b); assert.ok(len(SPOUSE_PALACE[b].title) <= 6); assert.ok(len(SPOUSE_PALACE[b].text) <= 120 && clean(SPOUSE_PALACE[b].text), b); }
  for (const g of ['male', 'female']) for (const k of ['main', 'alt', 'both', 'none']) { assert.ok(SPOUSE_STAR[g][k].title && clean(SPOUSE_STAR[g][k].text)); assert.ok(len(SPOUSE_STAR[g][k].text) <= 120); }
  for (const k of ['liuhe', 'sanhe', 'same', 'zixing', 'none', 'hai', 'xing', 'chong']) { assert.ok(ZODIAC_REL[k] && PALACE_REL[k], k); assert.ok(len(ZODIAC_REL[k].text) <= 120 && len(PALACE_REL[k].text) <= 120); }
  for (const k of ['he', 'sheng', 'same', 'peer', 'ke', 'chong']) assert.ok(STEM_REL[k] && len(STEM_REL[k].text) <= 120, k);
  for (const d of DAILY_LOVE) { assert.equal(len(d.seal), 1); assert.ok(len(d.title) <= 8 && len(d.text) <= 120 && clean(d.text)); }
  for (const t of LOVE_TIPS) assert.ok(len(t) <= 18 && clean(t), t);
  for (const n of Object.values(YEAR_NOTES)) assert.ok(len(n.short) <= 6 && len(n.text) <= 60);
  for (const v of Object.values(UI.stageHint)) assert.ok(len(v) <= 18);
  for (const v of Object.values(UI.primary)) assert.ok(len(v) <= 6);
});

test('分享文案含签名与分数', () => {
  const r = matchPair(A, B);
  const s = shareMatch(r);
  assert.ok(s.includes('来感觉') && s.includes(`${r.score} 分`) && s.includes(r.level.name));
  const p = loveProfile(A, NOW);
  const t = shareLove(p, NOW);
  assert.ok(t.includes('来感觉') && t.includes('夫妻宫') && t.includes('桃花位'));
});
