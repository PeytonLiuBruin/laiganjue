import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  segmentAt,
  angleForSegment,
  boundaryCrossings,
  boundaries,
  normalizeDeg,
  simulateSpin,
  omegaFromIntensity,
  randomOmega,
  normalizeFlick,
  fitLabel,
  paletteFor,
  parsePreset,
  isSpinnable,
  remaining,
  pushHistory,
  streakOf,
  briefNote,
  speedFromOmega,
  SPIN_FRICTION,
  CUSTOM_MAX,
  CUSTOM_ITEM_MAX,
} from '../src/modules/wheel/core.js';
import { PRESETS, CUSTOM, CUSTOM_TEMPLATES, PALETTES, REASONS, VERSES, LAST_ONE, FLAPPER_LINES, CAP_LINES, WEAK_FLICK, BUSY_LINES, MILESTONES, getPreset } from '../src/modules/wheel/data.js';
import { seeded } from '../src/core/rng.js';

/* ------------------------------ 角度 / 扇区 ------------------------------ */
test('normalizeDeg 归一到 [0,360)', () => {
  assert.equal(normalizeDeg(0), 0);
  assert.equal(normalizeDeg(360), 0);
  assert.equal(normalizeDeg(-90), 270);
  assert.equal(normalizeDeg(725), 5);
  assert.ok(Math.abs(normalizeDeg(-0.5) - 359.5) < 1e-9);
});

test('segmentAt: n=8 基本角度 0/90/180/359.9/720+/负角', () => {
  const n = 8; // step 45, 扇区 0 覆盖 [-22.5, 22.5)
  assert.equal(segmentAt(0, n), 0);
  // 顺时针转 90°：原本在 9 点钟方向（自身角 270°，下标 6）的扇区来到顶部
  assert.equal(segmentAt(90, n), 6);
  assert.equal(segmentAt(180, n), 4);
  assert.equal(segmentAt(270, n), 2);
  assert.equal(segmentAt(359.9, n), 0);
  assert.equal(segmentAt(720, n), 0);
  assert.equal(segmentAt(720 + 90, n), 6);
  assert.equal(segmentAt(-90, n), 2);
  assert.equal(segmentAt(45, n), 7);
  assert.equal(segmentAt(-45, n), 1);
});

test('segmentAt: 边界左闭右开（自身角 +half 归下一扇区，-half 归本扇区）', () => {
  const n = 8;
  // 转盘转 -22.5° → 指针下自身角 = 22.5 = +half → 扇区 1
  assert.equal(segmentAt(-22.5, n), 1);
  // 转盘转 +22.5° → 指针下自身角 = 337.5 = -half → 扇区 0
  assert.equal(segmentAt(22.5, n), 0);
  // 略过一点
  assert.equal(segmentAt(-22.4, n), 0);
  assert.equal(segmentAt(-22.6, n), 1);
});

test('segmentAt: n=1 总是 0；n=2、n=6、n=16 覆盖全部下标', () => {
  for (const a of [0, 10, 180, 359, -720.5]) assert.equal(segmentAt(a, 1), 0);
  assert.equal(segmentAt(0, 2), 0);
  assert.equal(segmentAt(180, 2), 1);
  assert.equal(segmentAt(-180, 2), 1);
  for (const n of [2, 3, 6, 7, 10, 16]) {
    const seen = new Set();
    for (let a = 0; a < 360; a += 0.5) seen.add(segmentAt(a, n));
    assert.equal(seen.size, n, `n=${n} 应覆盖全部扇区`);
  }
});

test('segmentAt 与 angleForSegment 互逆', () => {
  const rnd = seeded('wheel');
  for (let n = 1; n <= 16; n++) {
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 5; k++) {
        const a = angleForSegment(i, n, rnd());
        assert.ok(a >= 0 && a < 360);
        assert.equal(segmentAt(a, n), i, `n=${n} i=${i} a=${a}`);
        assert.equal(segmentAt(a + 720, n), i);
        assert.equal(segmentAt(a - 360, n), i);
      }
    }
  }
});

test('boundaries 返回 n 条边界，首条为 half', () => {
  assert.deepEqual(boundaries(4), [45, 135, 225, 315]);
  assert.equal(boundaries(8).length, 8);
});

test('boundaryCrossings：跨边界计数，支持多圈与反向', () => {
  const n = 8;
  assert.equal(boundaryCrossings(0, 10, n), 0);
  assert.equal(boundaryCrossings(0, 30, n), 1); // 跨过 22.5
  assert.equal(boundaryCrossings(0, 360, n), 8);
  assert.equal(boundaryCrossings(0, 720, n), 16);
  assert.equal(boundaryCrossings(30, 0, n), 1);
  assert.equal(boundaryCrossings(0, -360, n), 8);
  assert.equal(boundaryCrossings(0, 90, 1), 0);
  // 拆成小步累加 == 一次算（a 从 0 走到 1001）
  let acc = 0;
  for (let a = 0; a < 1000; a += 7) acc += boundaryCrossings(a, a + 7, 10);
  assert.equal(acc, boundaryCrossings(0, 1001, 10));
});

/* ------------------------------ 旋转物理 ------------------------------ */
test('simulateSpin：正向、时长与角度合理，闭式解首尾一致', () => {
  const s = simulateSpin(20);
  assert.ok(s.angle > 0);
  assert.ok(s.duration > 1500 && s.duration < 6000, 'duration=' + s.duration);
  assert.ok(s.turns > 1.5 && s.turns < 8, 'turns=' + s.turns);
  assert.equal(s.angleAt(0), 0);
  assert.ok(Math.abs(s.angleAt(s.duration) - s.angle) < 1e-6);
  assert.ok(Math.abs(s.angleAt(s.duration + 5000) - s.angle) < 1e-9);
  assert.ok(Math.abs(s.omegaAt(0) - 20) < 1e-9);
  assert.ok(Math.abs(s.omegaAt(s.duration)) < 1e-3);
  // 单调递增、速度单调递减
  let prevA = -1;
  let prevW = Infinity;
  for (let t = 0; t <= s.duration; t += 50) {
    const a = s.angleAt(t);
    const w = s.omegaAt(t);
    assert.ok(a >= prevA);
    assert.ok(w <= prevW + 1e-9);
    prevA = a;
    prevW = w;
  }
});

test('simulateSpin：初速越大转得越久越远；负初速镜像；0 初速不转', () => {
  const a = simulateSpin(10);
  const b = simulateSpin(25);
  assert.ok(b.angle > a.angle && b.duration > a.duration);
  const neg = simulateSpin(-25);
  assert.ok(Math.abs(neg.angle + b.angle) < 1e-9);
  assert.equal(neg.duration, b.duration);
  assert.ok(neg.angleAt(500) < 0);
  const zero = simulateSpin(0);
  assert.equal(zero.angle, 0);
  assert.equal(zero.duration, 0);
});

test('simulateSpin：摩擦可传数字或对象，摩擦越大越快停', () => {
  const soft = simulateSpin(20, 0.6);
  const hard = simulateSpin(20, 2);
  assert.ok(hard.duration < soft.duration && hard.angle < soft.angle);
  const obj = simulateSpin(20, { k: 1, c: 0.5 });
  const def = simulateSpin(20);
  assert.equal(obj.duration, def.duration);
  const bogus = simulateSpin(20, { k: -1, c: 'x' });
  assert.equal(bogus.duration, def.duration);
});

test('omegaFromIntensity / randomOmega / normalizeFlick 范围', () => {
  const rnd = seeded(3);
  for (const i of [0, 13, 20, 25, 40, 99, NaN]) {
    const w = omegaFromIntensity(i, rnd);
    assert.ok(w >= 13 && w <= 29, `intensity ${i} → ${w}`);
  }
  assert.ok(omegaFromIntensity(40, () => 0.5) > omegaFromIntensity(13, () => 0.5));
  for (let k = 0; k < 20; k++) {
    const w = randomOmega(rnd);
    assert.ok(w >= 17 && w <= 25);
  }
  assert.equal(normalizeFlick(0.2, rnd), null);
  const weak = normalizeFlick(-3, rnd);
  assert.equal(weak.boosted, true);
  assert.ok(weak.omega <= -6 && weak.omega >= -9);
  const strong = normalizeFlick(12, rnd);
  assert.equal(strong.boosted, false);
  assert.ok(Math.abs(strong.omega - 12 * 1.35) < 1e-9);
  assert.equal(normalizeFlick(1000, rnd).omega, 40);
});

test('界面节奏：按钮 / 摇一摇 / 拨动的一转在 4–6 秒内停下，2.5–5.5 圈', () => {
  const rnd = seeded('pace');
  for (let i = 0; i < 30; i++) {
    for (const w of [randomOmega(rnd), omegaFromIntensity(13 + rnd() * 27, rnd), normalizeFlick(6 + rnd() * 34, rnd).omega]) {
      const s = simulateSpin(speedFromOmega(w), SPIN_FRICTION);
      assert.ok(s.duration >= 4000 && s.duration <= 6000, `omega ${w} → ${s.duration}ms`);
      assert.ok(s.turns >= 1.7 && s.turns <= 5.5, `omega ${w} → ${s.turns} turns`);
    }
  }
  // 太轻也有下限，太猛也有上限；方向保留
  assert.equal(speedFromOmega(0.5), 9);
  assert.equal(speedFromOmega(1000), 24);
  assert.equal(speedFromOmega(-1000), -24);
  assert.ok(speedFromOmega(20) > speedFromOmega(15));
});

test('briefNote：≤ 40 字原样返回，超长按句读截到 40 字以内且以句号收尾', () => {
  assert.equal(briefNote('众口难调时的万能答案。锅一开，天下太平。'), '众口难调时的万能答案。锅一开，天下太平。');
  const long = '万事顺遂之象。今天遇见的好运不必客气，笑着接住就是；别忘了顺手也分一点给身边的人。';
  const b = briefNote(long);
  assert.ok(Array.from(b).length <= 40, b);
  assert.ok(b.startsWith('万事顺遂之象。'));
  assert.ok(b.endsWith('。'));
  assert.ok(!b.endsWith('；'));
  // 单句就超长：硬截 + 省略号
  const hard = briefNote('一'.repeat(60));
  assert.ok(Array.from(hard).length <= 40 && hard.endsWith('…'));
  assert.equal(briefNote(''), '');
  assert.equal(briefNote(null), '');
  // 今日运势全部解语都能摘成一句
  for (const it of getPreset('fortune').items) {
    const s = briefNote(it.note);
    assert.ok(s.length >= 6 && Array.from(s).length <= 40, `${it.label}: ${s}`);
  }
});

/* ------------------------------ 文字排版 / 调色 ------------------------------ */
test('fitLabel：短标签不动，1–2 字放大，过长缩小或截断加省略号', () => {
  const s = fitLabel('火锅');
  assert.equal(s.text, '火锅');
  assert.equal(s.truncated, false);
  assert.ok(s.fontSize > fitLabel('轻食沙拉').fontSize);
  const four = fitLabel('轻食沙拉');
  assert.equal(four.text, '轻食沙拉');
  assert.ok(four.fontSize >= 13 && four.fontSize <= 28);
  const long = fitLabel('这是一个非常非常长的选项');
  assert.ok(long.truncated);
  assert.ok(long.text.endsWith('…'));
  assert.ok(Array.from(long.text).length <= 8);
  assert.ok(long.fontSize >= 13);
  assert.equal(fitLabel('').text, '');
  assert.equal(fitLabel('  面  ').text, '面');
});

test('paletteFor：相邻（含首尾）不同色', () => {
  for (const len of [3, 4]) {
    for (let n = 2; n <= 16; n++) {
      const p = paletteFor(n, len);
      assert.equal(p.length, n);
      for (let i = 0; i < n; i++) {
        assert.ok(p[i] >= 0 && p[i] < len);
        assert.notEqual(p[i], p[(i + 1) % n], `len=${len} n=${n} i=${i} → ${p.join(',')}`);
      }
    }
  }
  assert.deepEqual(paletteFor(1), [0]);
  assert.deepEqual(paletteFor(0), []);
});

/* ------------------------------ 自定义解析 ------------------------------ */
test('parsePreset：去空行、去首尾空白、去重、上限 16、每项 ≤ 12 字', () => {
  const items = parsePreset('  火锅 \n\n烧烤\r\n火锅\n  \n日料  ');
  assert.deepEqual(items, ['火锅', '烧烤', '日料']);
  const many = parsePreset(Array.from({ length: 30 }, (_, i) => '项' + i).join('\n'));
  assert.equal(many.length, CUSTOM_MAX);
  const long = parsePreset('一二三四五六七八九十十一十二十三十四\n短');
  assert.equal(Array.from(long[0]).length, CUSTOM_ITEM_MAX);
  assert.equal(long[1], '短');
  // 截断后重复也去重
  assert.deepEqual(parsePreset('一二三四五六七八九十十一AAA\n一二三四五六七八九十十一BBB'), ['一二三四五六七八九十十一']);
  assert.deepEqual(parsePreset(''), []);
  assert.deepEqual(parsePreset(null), []);
  assert.deepEqual(parsePreset('   \n \n'), []);
});

test('parsePreset：单行时按 、，,/｜| 切分', () => {
  assert.deepEqual(parsePreset('火锅、烧烤，日料,面/饺子｜川菜|粤菜'), ['火锅', '烧烤', '日料', '面', '饺子', '川菜', '粤菜']);
  // 多行时不再切分（保留行内的顿号）
  assert.deepEqual(parsePreset('火锅、烧烤\n日料'), ['火锅、烧烤', '日料']);
});

test('isSpinnable：至少两项', () => {
  assert.equal(isSpinnable([]), false);
  assert.equal(isSpinnable(['a']), false);
  assert.equal(isSpinnable(['a', 'b']), true);
  assert.equal(isSpinnable(null), false);
});

/* ------------------------------ 候选 / 历史 ------------------------------ */
test('remaining / pushHistory / streakOf', () => {
  const items = [{ label: 'a' }, { label: 'b' }, { label: 'c' }];
  assert.deepEqual(
    remaining(items, new Set(['b'])).map((x) => x.label),
    ['a', 'c'],
  );
  assert.deepEqual(remaining(['a', 'b'], ['a']), ['b']);
  let h = [];
  for (let i = 0; i < 12; i++) h = pushHistory(h, 'x' + i, 8);
  assert.equal(h.length, 8);
  assert.equal(h[7], 'x11');
  assert.equal(h[0], 'x4');
  assert.equal(streakOf(['a', 'b', 'b'], 'b'), 2);
  assert.equal(streakOf(['a', 'b', 'b'], 'a'), 0);
  assert.equal(streakOf([], 'a'), 0);
  assert.equal(streakOf(null, 'a'), 0);
});

/* ------------------------------ 内容数据 ------------------------------ */
const BAD_WORDS = /TODO|待补|示例|占位|lorem|xxx/i;

test('预设数据：项数 2–16，标签/解语非空且无重复、无占位词', () => {
  assert.ok(PRESETS.length >= 6);
  const ids = new Set();
  for (const p of PRESETS) {
    assert.ok(p.id && p.name && p.hint && p.palette, p.id);
    // 舞台下方唯一的一句操作提示：≤ 18 字，同时点到「拨」与「摇」，不以标点结尾
    assert.ok(Array.from(p.hint).length <= 18, `${p.id} hint 过长：${p.hint}`);
    assert.ok(/拨/.test(p.hint) && /摇/.test(p.hint), `${p.id} hint 应同时提到拨与摇`);
    assert.ok(!/[。！？]$/.test(p.hint), p.hint);
    assert.ok(!ids.has(p.id));
    ids.add(p.id);
    assert.ok(PALETTES[p.palette], `palette ${p.palette} 不存在`);
    assert.ok(p.items.length >= 2 && p.items.length <= 16, `${p.id} 项数 ${p.items.length}`);
    const labels = new Set();
    for (const it of p.items) {
      assert.ok(it.label && it.label.trim(), `${p.id} 有空标签`);
      assert.ok(Array.from(it.label).length <= 12, `${p.id} 标签过长：${it.label}`);
      assert.ok(!labels.has(it.label), `${p.id} 重复标签 ${it.label}`);
      labels.add(it.label);
      assert.ok(it.note && it.note.length >= 6, `${p.id}/${it.label} 解语过短`);
      assert.ok(!BAD_WORDS.test(it.label + it.note + (it.text || '')), `${p.id}/${it.label} 含占位词`);
    }
    assert.ok(Array.isArray(p.reasons) && p.reasons.length >= 3, `${p.id} reasons`);
    assert.ok(Array.isArray(p.verses) && p.verses.length >= 3, `${p.id} verses`);
    for (const s of [...p.reasons, ...p.verses]) assert.ok(s && !BAD_WORDS.test(s));
  }
});

test('今日运势 8 档齐全且每档带印与语气；真心话 8–10 题各有完整问题', () => {
  const f = getPreset('fortune');
  assert.deepEqual(
    f.items.map((x) => x.label),
    ['大吉', '中吉', '小吉', '吉', '末吉', '平', '小凶', '凶'],
  );
  for (const it of f.items) {
    assert.ok(it.seal && Array.from(it.seal).length <= 2);
    assert.ok(['good', 'neutral', 'bad'].includes(it.tone));
  }
  const eat = getPreset('eat');
  assert.deepEqual(
    eat.items.map((x) => x.label),
    ['火锅', '烧烤', '日料', '轻食沙拉', '面', '饺子', '川菜', '粤菜', '自己做', '随便'],
  );
  assert.equal(getPreset('doit').items.length, 6);
  assert.equal(getPreset('go').items.length, 8);
  assert.equal(getPreset('tonight').items.length, 8);
  const t = getPreset('truth');
  assert.ok(t.items.length >= 8 && t.items.length <= 10);
  for (const it of t.items) {
    assert.ok(it.text && it.text.length >= 8, it.label);
    assert.ok(Array.from(it.label).length <= 4);
  }
  assert.equal(getPreset('nope').id, 'fortune');
  assert.equal(getPreset('custom').id, 'custom');
});

test('调色板只用 CSS 变量；半透明色配 --text，实色配 --accent-ink', () => {
  for (const [name, pal] of Object.entries(PALETTES)) {
    assert.ok(pal.length >= 3, name);
    for (const sw of pal) {
      assert.match(sw.fill, /^var\(--[a-z0-9-]+\)$/);
      assert.match(sw.text, /^var\(--[a-z0-9-]+\)$/);
      assert.ok(sw.op > 0 && sw.op <= 1);
      if (sw.op <= 0.3) assert.equal(sw.text, 'var(--text)');
    }
  }
});

test('自定义模板可解析且可转；杂项文案池非空无占位词', () => {
  for (const t of CUSTOM_TEMPLATES) {
    assert.ok(t.name);
    assert.ok(isSpinnable(parsePreset(t.text)), t.name);
  }
  assert.ok(CUSTOM.seal && CUSTOM.emptyLabel && CUSTOM.textPlaceholder);
  assert.ok(Array.from(CUSTOM.hint).length <= 18 && /拨/.test(CUSTOM.hint) && /摇/.test(CUSTOM.hint));
  for (const pool of [REASONS, VERSES, LAST_ONE, FLAPPER_LINES, CAP_LINES, WEAK_FLICK, BUSY_LINES, MILESTONES, CUSTOM.reasons, CUSTOM.verses]) {
    assert.ok(pool.length >= 3);
    for (const s of pool) assert.ok(typeof s === 'string' && s.length >= 4 && !BAD_WORDS.test(s));
  }
  assert.equal(new Set(REASONS).size, REASONS.length);
});
