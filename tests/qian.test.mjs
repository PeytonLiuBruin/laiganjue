import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  drawLot,
  getLot,
  levelSeal,
  levelMeta,
  levelTone,
  levelCounts,
  lotNumeral,
  lotLabel,
  formatPoem,
  formatPoemLines,
  validateLots,
  createShakeMeter,
  pushHistory,
  isFated,
  shouldDoubleDrop,
  shareText,
} from '../src/modules/qian/core.js';
import { LOTS, LEVELS, LEVEL_QUOTA, ITEM_KEYS } from '../src/modules/qian/data.js';
import { seeded } from '../src/core/rng.js';

/* ---------------- 数据 ---------------- */

test('validateLots(LOTS) 为空：数量、编号、七言、字段、字数、配额全部合格', () => {
  const problems = validateLots(LOTS);
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('至少 64 支，签号 1..n 连续唯一', () => {
  assert.ok(LOTS.length >= 64);
  LOTS.forEach((l, i) => assert.equal(l.no, i + 1));
  assert.equal(new Set(LOTS.map((l) => l.no)).size, LOTS.length);
});

test('每个等级都有签，且数量恰为规格配额', () => {
  const c = levelCounts(LOTS);
  for (const lv of LEVELS) assert.ok(c[lv.id] > 0, lv.id + ' 无签');
  assert.deepEqual(c, LEVEL_QUOTA);
  assert.equal(Object.values(LEVEL_QUOTA).reduce((a, b) => a + b, 0), 64);
});

test('每支签四句七言、纯汉字，无重复签诗', () => {
  const seen = new Set();
  for (const lot of LOTS) {
    assert.equal(lot.poem.length, 4);
    for (const line of lot.poem) {
      assert.equal(Array.from(line).length, 7, `${lot.no} ${line}`);
      assert.match(line, /^\p{Script=Han}+$/u);
    }
    const key = lot.poem.join('');
    assert.ok(!seen.has(key), '签诗重复 ' + lot.no);
    seen.add(key);
  }
});

test('六项分述齐全，无占位文字', () => {
  for (const lot of LOTS) {
    assert.deepEqual(Object.keys(lot.items).sort(), [...ITEM_KEYS].sort());
    const blob = JSON.stringify(lot);
    assert.doesNotMatch(blob, /TODO|待补|示例|占位/);
  }
});

test('下下签解曰都给出路（含转折/出路词汇），不恐吓', () => {
  const bad = LOTS.filter((l) => l.level === '下下');
  assert.equal(bad.length, LEVEL_QUOTA['下下']);
  for (const l of bad) {
    assert.match(l.explain, /出路|但|起点|渡船|忍|自由|停|学/, l.no + ' 下下签缺出路');
    assert.doesNotMatch(l.explain + l.gist, /必死|绝望|无救|完了/);
  }
});

/* ---------------- 抽签 ---------------- */

test('drawLot 均匀：seeded 抽 64000 次，每支约 1000 次，偏差 < 15%', () => {
  const rnd = seeded('qian-uniform');
  const n = LOTS.length * 1000;
  const hit = new Map();
  for (let i = 0; i < n; i++) {
    const lot = drawLot(rnd);
    hit.set(lot.no, (hit.get(lot.no) || 0) + 1);
  }
  assert.equal(hit.size, LOTS.length, '每支签都应被抽到');
  for (const [no, c] of hit) assert.ok(Math.abs(c - 1000) < 150, `#${no} 抽到 ${c} 次`);
});

test('drawLot 边界：rnd=0 → 第一支，rnd→1 → 最后一支；不同 seed 序列不同', () => {
  assert.equal(drawLot(() => 0).no, 1);
  assert.equal(drawLot(() => 0.999999).no, LOTS.length);
  assert.equal(drawLot(() => 1).no, LOTS.length); // 防越界
  const a = Array.from({ length: 10 }, () => drawLot(seeded('a')).no);
  const b = Array.from({ length: 10 }, () => drawLot(seeded('b')).no);
  assert.notDeepEqual(a, b);
  assert.deepEqual(a, Array.from({ length: 10 }, () => drawLot(seeded('a')).no), 'seeded 可复现');
});

test('drawLot 等级分布与配额比例一致', () => {
  const rnd = seeded(42);
  const n = 32000;
  const c = {};
  for (let i = 0; i < n; i++) {
    const lv = drawLot(rnd).level;
    c[lv] = (c[lv] || 0) + 1;
  }
  for (const [lv, q] of Object.entries(LEVEL_QUOTA)) {
    const expect = (q / 64) * n;
    assert.ok(Math.abs(c[lv] - expect) / expect < 0.12, `${lv} ${c[lv]} vs ${expect}`);
  }
});

test('getLot 按签号取签', () => {
  assert.equal(getLot(1).title, LOTS[0].title);
  assert.equal(getLot(64).no, 64);
  assert.equal(getLot(999), null);
});

/* ---------------- 等级 ---------------- */

test('levelSeal：每个等级印章恰为 2 字，未知等级回落', () => {
  for (const lv of LEVELS) {
    assert.equal(Array.from(levelSeal(lv.id)).length, 2);
    assert.equal(levelSeal(lv.id), lv.id);
  }
  assert.equal(levelSeal('不存在'), '签');
  assert.equal(levelMeta('上上').tone, 'great');
  assert.equal(levelTone('下下'), 'bad');
  assert.equal(levelTone('???'), 'neutral');
});

test('等级 rank 由高到低单调', () => {
  for (let i = 1; i < LEVELS.length; i++) assert.ok(LEVELS[i - 1].rank > LEVELS[i].rank);
});

/* ---------------- 签号写法 ---------------- */

test('lotNumeral / lotLabel 传统写法', () => {
  const cases = { 1: '一', 9: '九', 10: '十', 11: '十一', 19: '十九', 20: '廿', 23: '廿三', 30: '卅', 35: '卅五', 40: '四十', 47: '四十七', 60: '六十', 64: '六十四' };
  for (const [n, s] of Object.entries(cases)) assert.equal(lotNumeral(Number(n)), s);
  assert.equal(lotLabel(23), '第廿三签');
  assert.equal(lotLabel(getLot(1)), '第一签');
  assert.equal(lotNumeral(0), '零');
});

/* ---------------- 排版 / 分享 ---------------- */

test('formatPoem 两句一行，加逗号句号', () => {
  const s = formatPoem(['甲甲甲甲甲甲甲', '乙乙乙乙乙乙乙', '丙丙丙丙丙丙丙', '丁丁丁丁丁丁丁']);
  assert.equal(s, '甲甲甲甲甲甲甲，乙乙乙乙乙乙乙。\n丙丙丙丙丙丙丙，丁丁丁丁丁丁丁。');
  assert.equal(formatPoem(['一一一一一一一']), '一一一一一一一。');
  assert.equal(formatPoem([]), '');
});

test('formatPoemLines 四句各占一行，逗号句号交替，每行恰 8 字', () => {
  const s = formatPoemLines(['甲甲甲甲甲甲甲', '乙乙乙乙乙乙乙', '丙丙丙丙丙丙丙', '丁丁丁丁丁丁丁']);
  assert.equal(s, '甲甲甲甲甲甲甲，\n乙乙乙乙乙乙乙。\n丙丙丙丙丙丙丙，\n丁丁丁丁丁丁丁。');
  for (const lot of LOTS) for (const line of formatPoemLines(lot.poem).split('\n')) assert.equal(Array.from(line).length, 8, lot.no + ' ' + line);
  assert.equal(formatPoemLines([]), '');
});

test('shareText 含签号、典故、等级、签诗与所问', () => {
  const lot = getLot(23);
  const t = shareText(lot, ' 换工作吗 ');
  assert.match(t, /【灵签】第廿三签/);
  assert.match(t, new RegExp(lot.title));
  assert.match(t, /问：换工作吗/);
  assert.match(t, new RegExp(lot.poem[0]));
  assert.doesNotMatch(shareText(lot), /问：/);
  assert.equal(shareText(null), '');
});

/* ---------------- 摇签计量 ---------------- */

test('createShakeMeter：左右来回拖动累计有效摆动直到 done', () => {
  const m = createShakeMeter({ need: 5, minSwing: 16 });
  // 0→40→0→40→0→40→0：六个单程，五次反转（最后一程尚未反转不计）
  const path = [0, 20, 40, 20, 0, 20, 40, 20, 0, 20, 40, 20, 0];
  let s;
  for (const x of path) s = m.push(x);
  assert.equal(s.swings, 5);
  assert.ok(s.done, `swings=${s.swings}`);
  assert.equal(s.progress, 1);
  assert.ok(s.distance > 0);
});

test('createShakeMeter：单向拖动不计摆动；微小抖动不计；reset 清零', () => {
  const m = createShakeMeter({ need: 5, minSwing: 16 });
  let s;
  for (let x = 0; x <= 300; x += 10) s = m.push(x);
  assert.equal(s.swings, 0);
  assert.equal(s.done, false);
  assert.ok(s.leg > 0, '单程位移应为正');
  // 微小来回（< minSwing）不计
  const m2 = createShakeMeter({ need: 3, minSwing: 16, deadband: 4 });
  for (const x of [0, 6, 0, 6, 0, 6, 0, 6]) s = m2.push(x);
  assert.equal(s.swings, 0);
  m.reset();
  assert.equal(m.state.swings, 0);
  assert.equal(m.state.leg, 0);
});

/* ---------------- 历史 / 彩蛋 ---------------- */

test('pushHistory 保留最近 10 条', () => {
  let h = [];
  for (let i = 1; i <= 15; i++) h = pushHistory(h, { no: i, level: '中平' });
  assert.equal(h.length, 10);
  assert.equal(h[0].no, 6);
  assert.equal(h[9].no, 15);
});

test('isFated：连续三次同一签才算有缘', () => {
  assert.equal(isFated([{ no: 5 }, { no: 5 }], 5), true);
  assert.equal(isFated([{ no: 4 }, { no: 5 }], 5), false);
  assert.equal(isFated([{ no: 5 }], 5), false);
  assert.equal(isFated([], 5), false);
  assert.equal(isFated([1, 7, 7], 7), true);
  assert.equal(isFated([{ no: 5 }, { no: 5 }, { no: 5 }], 5, 4), true);
});

test('shouldDoubleDrop：强度不足永不触发，强度极大按概率触发', () => {
  for (let i = 0; i < 200; i++) assert.equal(shouldDoubleDrop(25, seeded(i)), false);
  const rnd = seeded('double');
  let hits = 0;
  for (let i = 0; i < 2000; i++) if (shouldDoubleDrop(40, rnd)) hits++;
  assert.ok(hits > 500 && hits < 900, 'hits=' + hits);
});

/* ---------------- 校验器本身 ---------------- */

test('validateLots 能识别坏数据', () => {
  const broken = JSON.parse(JSON.stringify(LOTS));
  broken[2].poem[1] = '只有六个字啊';
  broken[3].no = 99;
  broken[4].explain = '太短';
  broken[5].items.求财 = '短';
  broken[6].level = '超吉';
  broken[7].title = 'TODO';
  const p = validateLots(broken);
  assert.ok(p.some((s) => /非七言/.test(s)));
  assert.ok(p.some((s) => /签号不连续/.test(s)));
  assert.ok(p.some((s) => /解曰字数/.test(s)));
  assert.ok(p.some((s) => /分述「求财」字数/.test(s)));
  assert.ok(p.some((s) => /等级非法/.test(s)));
  assert.ok(p.some((s) => /占位文字/.test(s)));
  assert.ok(validateLots(LOTS.slice(0, 10)).some((s) => /签数不足/.test(s)));
  assert.deepEqual(validateLots('x'), ['LOTS 不是数组']);
});
