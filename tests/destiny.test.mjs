import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fourPillars, tenGod, branchRelation, stemRelation, elementRelation, taoHua, hongLuan, tianXi, tianYiGuiRen, wenChang, luShen, yiMa, treasuryOf,
  yearGanZhi, upcomingYears, dayLuck, dailyIndex, dailyPick, hourBranchIndex, animalOf, BRANCHES, STEMS, BRANCH_DIRECTION, BRANCH_HOURS, HIDDEN_STEMS,
} from '../src/core/destiny.js';

test('四柱：1995-06-18 14:30 男 → 乙亥 壬午 庚辰 癸未', () => {
  const c = fourPillars({ y: 1995, m: 6, d: 18, hour: 14, gender: 'male' });
  assert.deepEqual(c.pillars.map((p) => p.ganZhi), ['乙亥', '壬午', '庚辰', '癸未']);
  assert.equal(c.dayStem, '庚');
  assert.equal(c.dayBranch, '辰');
  assert.equal(c.yearBranch, '亥');
  assert.equal(c.animal, '猪');
  assert.equal(c.dayElement, '金');
  assert.equal(c.hasHour, true);
  assert.equal(c.pillars[0].tenGod, '正财'); // 庚见乙
  assert.equal(c.pillars[1].tenGod, '食神'); // 庚见壬
  assert.equal(c.pillars[3].tenGod, '伤官'); // 庚见癸
  const sum = Object.values(c.elements).reduce((a, b) => a + b, 0);
  assert.equal(sum, 8);
});

test('四柱：不知时辰 → 三柱，六字', () => {
  const c = fourPillars({ y: 2000, m: 1, d: 1, hour: -1, gender: 'female' });
  assert.equal(c.pillars.length, 3);
  assert.equal(c.hasHour, false);
  assert.equal(c.pillars[2].ganZhi, '戊午');
  assert.equal(Object.values(c.elements).reduce((a, b) => a + b, 0), 6);
  assert.equal(c.gender, 'female');
});

test('十神：庚日主', () => {
  assert.equal(tenGod('庚', '庚'), '比肩');
  assert.equal(tenGod('庚', '辛'), '劫财');
  assert.equal(tenGod('庚', '壬'), '食神');
  assert.equal(tenGod('庚', '癸'), '伤官');
  assert.equal(tenGod('庚', '甲'), '偏财');
  assert.equal(tenGod('庚', '乙'), '正财');
  assert.equal(tenGod('庚', '丙'), '七杀');
  assert.equal(tenGod('庚', '丁'), '正官');
  assert.equal(tenGod('庚', '戊'), '偏印');
  assert.equal(tenGod('庚', '己'), '正印');
  assert.equal(tenGod('X', '己'), null);
});

test('地支关系：六合 / 三合 / 冲 / 害 / 刑 / 自刑 / 同 / 平，且对称', () => {
  assert.equal(branchRelation('子', '丑'), 'liuhe');
  assert.equal(branchRelation('午', '未'), 'liuhe');
  assert.equal(branchRelation('申', '子'), 'sanhe');
  assert.equal(branchRelation('巳', '丑'), 'sanhe');
  assert.equal(branchRelation('子', '午'), 'chong');
  assert.equal(branchRelation('子', '未'), 'hai');
  assert.equal(branchRelation('子', '卯'), 'xing');
  assert.equal(branchRelation('寅', '巳'), 'xing');
  assert.equal(branchRelation('辰', '辰'), 'zixing');
  assert.equal(branchRelation('子', '子'), 'same');
  assert.equal(branchRelation('子', '寅'), 'none');
  for (const a of BRANCHES) for (const b of BRANCHES) assert.equal(branchRelation(a, b), branchRelation(b, a), a + b);
});

test('天干关系：五合 / 冲 / 生 / 克 / 同气 / 同干，且对称', () => {
  assert.equal(stemRelation('甲', '己'), 'he');
  assert.equal(stemRelation('戊', '癸'), 'he');
  assert.equal(stemRelation('甲', '庚'), 'chong');
  assert.equal(stemRelation('甲', '丙'), 'sheng');
  assert.equal(stemRelation('甲', '壬'), 'sheng');
  assert.equal(stemRelation('甲', '戊'), 'ke');
  assert.equal(stemRelation('甲', '乙'), 'peer');
  assert.equal(stemRelation('甲', '甲'), 'same');
  for (const a of STEMS) for (const b of STEMS) assert.equal(stemRelation(a, b), stemRelation(b, a), a + b);
});

test('五行关系', () => {
  assert.equal(elementRelation('木', '火'), 'generates');
  assert.equal(elementRelation('火', '木'), 'generatedBy');
  assert.equal(elementRelation('木', '土'), 'overcomes');
  assert.equal(elementRelation('土', '木'), 'overcomeBy');
  assert.equal(elementRelation('金', '金'), 'same');
});

test('神煞表：桃花 / 红鸾 / 天喜 / 天乙贵人 / 文昌 / 禄神 / 驿马 / 库', () => {
  assert.equal(taoHua('亥'), '子');
  assert.equal(taoHua('子'), '酉');
  assert.equal(taoHua('午'), '卯');
  assert.equal(taoHua('酉'), '午');
  assert.equal(hongLuan('亥'), '辰');
  assert.equal(hongLuan('子'), '卯');
  assert.equal(tianXi('亥'), '戌');
  assert.equal(tianXi('子'), '酉');
  for (const b of BRANCHES) assert.equal((BRANCHES.indexOf(hongLuan(b)) + 6) % 12, BRANCHES.indexOf(tianXi(b)), '天喜与红鸾相冲 ' + b);
  assert.deepEqual(tianYiGuiRen('庚'), ['丑', '未']);
  assert.deepEqual(tianYiGuiRen('辛'), ['午', '寅']);
  assert.deepEqual(tianYiGuiRen('癸'), ['卯', '巳']);
  assert.equal(wenChang('庚'), '亥');
  assert.equal(wenChang('甲'), '巳');
  assert.equal(luShen('庚'), '申');
  assert.equal(luShen('癸'), '子');
  assert.equal(yiMa('亥'), '巳');
  assert.equal(yiMa('子'), '寅');
  assert.deepEqual(treasuryOf('木'), ['未']);
  assert.deepEqual(treasuryOf('水'), ['辰']);
  assert.equal(treasuryOf('土').length, 4);
  for (const b of BRANCHES) { assert.ok(BRANCH_DIRECTION[b]); assert.ok(BRANCH_HOURS[b]); assert.ok(HIDDEN_STEMS[b].length >= 1); }
});

test('流年干支：1984 甲子 · 2000 庚辰 · 2026 丙午 · 2027 丁未', () => {
  assert.equal(yearGanZhi(1984).ganZhi, '甲子');
  assert.equal(yearGanZhi(2000).ganZhi, '庚辰');
  assert.equal(yearGanZhi(2026).ganZhi, '丙午');
  assert.equal(yearGanZhi(2027).ganZhi, '丁未');
  assert.equal(yearGanZhi(2027).animal, '羊');
  const ys = upcomingYears(2026, 12);
  assert.equal(ys.length, 12);
  assert.equal(ys[11].year, 2037);
  assert.equal(animalOf('辰'), '龙');
});

test('每日：2026-09-15 壬辰日，财神正南，十二时辰按子起排', () => {
  const d = dayLuck(new Date(2026, 8, 15, 10));
  assert.equal(d.dayGanZhi, '壬辰');
  assert.equal(d.positions.cai, '正南');
  assert.equal(d.hours.length, 12);
  assert.equal(d.hours[0].zhi, '子');
  assert.equal(d.hours[2].zhi, '寅');
  assert.equal(d.hours[2].lucky, true);
  assert.ok(d.hours.some((x) => x.lucky) && d.hours.some((x) => !x.lucky));
  assert.ok(d.yi.includes('嫁娶'));
  assert.ok(d.ji.includes('开市'));
  assert.equal(hourBranchIndex(new Date(2026, 8, 15, 23, 30)), 0);
  assert.equal(hourBranchIndex(new Date(2026, 8, 15, 0, 30)), 0);
  assert.equal(hourBranchIndex(new Date(2026, 8, 15, 10, 0)), 5);
  assert.equal(hourBranchIndex(new Date(2026, 8, 15, 22, 59)), 11);
});

test('每日稳定评分：同日同盐不变，范围 30–99，星级单调', () => {
  const date = new Date(2026, 8, 15);
  const a = dailyIndex('x', date);
  const b = dailyIndex('x', date);
  assert.deepEqual(a, b);
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const r = dailyIndex('salt' + i, date, (i % 7) * 5 - 15);
    assert.ok(r.index >= 30 && r.index <= 99, String(r.index));
    assert.ok(r.stars >= 1 && r.stars <= 5);
    seen.add(r.stars);
  }
  assert.ok(seen.size >= 4, '星级应有分布：' + [...seen]);
  assert.equal(dailyIndex('y', date, 30).index >= dailyIndex('y', date, 0).index, true);
  const arr = ['a', 'b', 'c'];
  assert.equal(dailyPick(arr, 'k', date), dailyPick(arr, 'k', date));
});
