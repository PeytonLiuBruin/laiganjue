import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RUNES,
  SPREADS,
  NON_REVERSIBLE,
  validateRunes,
  drawRunes,
  dailyRune,
  drawForSpread,
  getSpread,
  interpret,
  shareText,
  toneKey,
  overallText,
  initState,
  reduceState,
  packDraw,
  unpackDraw,
  runeById,
} from '../src/modules/runes/core.js';
import { AETTS, TONE, UI_TEXT, SPREAD_CHIPS, shakeLevel } from '../src/modules/runes/data.js';
import { seeded } from '../src/core/rng.js';

const ORDER = 'Fehu Uruz Thurisaz Ansuz Raidho Kenaz Gebo Wunjo Hagalaz Nauthiz Isa Jera Eihwaz Perthro Algiz Sowilo Tiwaz Berkano Ehwaz Mannaz Laguz Ingwaz Dagaz Othala'.split(' ');

test('validateRunes: 数据完整、24 枚、唯一、不可逆列表正确', () => {
  const v = validateRunes();
  assert.deepEqual(v.errors, []);
  assert.equal(v.ok, true);
  assert.equal(RUNES.length, 24);
  assert.deepEqual(
    RUNES.map((r) => r.name),
    ORDER,
    '古弗萨克顺序',
  );
  const fixed = RUNES.filter((r) => !r.reversible).map((r) => r.id);
  assert.deepEqual(fixed.sort(), [...NON_REVERSIBLE].sort());
  assert.equal(fixed.length, 8);
  assert.equal(RUNES.filter((r) => r.reversible).length, 16);
});

test('validateRunes: 能发现坏数据', () => {
  const bad = RUNES.map((r) => ({ ...r }));
  bad[0].path = 'M10 10 C 20 20 30 30 40 40';
  bad[1].name = bad[2].name;
  bad[6].reversible = true;
  const v = validateRunes(bad);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /非直线/.test(e)));
  assert.ok(v.errors.some((e) => /重复/.test(e)));
  assert.ok(v.errors.some((e) => /gebo 应不可逆位/.test(e)));
  assert.ok(validateRunes(RUNES.slice(0, 23)).errors.some((e) => /24/.test(e)));
});

test('每枚 path 只含直线命令且在 0 0 100 160 视野内', () => {
  for (const r of RUNES) {
    assert.match(r.path, /^[MLHVZ0-9.\s-]+$/, r.id);
    // 所有 M/L 点对都在盒内
    const pairs = r.path.match(/[ML]\s*(-?\d+)\s+(-?\d+)/g) || [];
    for (const p of pairs) {
      const [, x, y] = p.match(/[ML]\s*(-?\d+)\s+(-?\d+)/);
      assert.ok(+x >= 0 && +x <= 100, `${r.id} x=${x}`);
      assert.ok(+y >= 0 && +y <= 160, `${r.id} y=${y}`);
    }
    assert.ok(pairs.length >= 1, r.id + ' 至少一段');
  }
});

test('文案：无占位词、无乱码、长度符合规格、三族各 8 枚', () => {
  const banned = /TODO|待补|示例|lorem|xxx|�/i;
  const count = {};
  for (const r of RUNES) {
    const all = [r.zh, r.symbol, r.line, r.advice, r.up.meaning, ...r.up.keywords, ...(r.rev ? [r.rev.meaning, ...r.rev.keywords] : [])].join('');
    assert.doesNotMatch(all, banned, r.id);
    assert.ok(r.up.meaning.length >= 80 && r.up.meaning.length <= 120, `${r.id} up ${r.up.meaning.length}`);
    if (r.rev) assert.ok(r.rev.meaning.length >= 60 && r.rev.meaning.length <= 90, `${r.id} rev ${r.rev.meaning.length}`);
    assert.ok(r.advice.length >= 20 && r.advice.length <= 40, `${r.id} advice ${r.advice.length}`);
    assert.equal(r.up.keywords.length, 3);
    if (r.rev) assert.ok(r.rev.keywords.length >= 2 && r.rev.keywords.length <= 3);
    count[r.aett] = (count[r.aett] || 0) + 1;
  }
  assert.deepEqual(count, { 弗雷之族: 8, 海姆达尔之族: 8, 提尔之族: 8 });
  assert.deepEqual(Object.values(AETTS).map((a) => a.name), Object.keys(count));
});

test('drawRunes: 不重复；不可逆者永不逆位；比例可控', () => {
  const rnd = seeded('runes-draw');
  for (let i = 0; i < 400; i++) {
    const n = 1 + (i % 5);
    const d = drawRunes(n, rnd);
    assert.equal(d.length, n);
    assert.equal(new Set(d.map((x) => x.rune.id)).size, n, '不重复');
    for (const x of d) if (!x.rune.reversible) assert.equal(x.reversed, false, x.rune.id + ' 不可逆位');
  }
  // 抽满 24 枚也不重复
  const all = drawRunes(24, seeded(3));
  assert.equal(new Set(all.map((x) => x.rune.id)).size, 24);
  // n 超界收敛
  assert.equal(drawRunes(99, seeded(1)).length, 24);
  assert.equal(drawRunes(0, seeded(1)).length, 0);
  // 比例
  const none = drawRunes(24, seeded(5), { reversedRate: 0 });
  assert.ok(none.every((x) => !x.reversed));
  const allRev = drawRunes(24, seeded(5), { reversedRate: 1 });
  assert.equal(allRev.filter((x) => x.reversed).length, 16, '可逆的 16 枚全部逆位');
  // 默认 0.35：可逆者中逆位比例 ≈ 35%
  const r2 = seeded('rate');
  let rev = 0;
  let able = 0;
  for (let i = 0; i < 4000; i++) {
    const [x] = drawRunes(1, r2);
    if (x.rune.reversible) {
      able++;
      if (x.reversed) rev++;
    }
  }
  assert.ok(Math.abs(rev / able - 0.35) < 0.04, 'rate ' + rev / able);
});

test('dailyRune: 同日同符，跨日有变化', () => {
  const d1 = dailyRune(new Date(2026, 8, 13, 8, 0));
  const d2 = dailyRune(new Date(2026, 8, 13, 23, 59));
  assert.equal(d1.rune.id, d2.rune.id);
  assert.equal(d1.reversed, d2.reversed);
  assert.equal(d1.dateKey, '2026-09-13');
  const ids = new Set();
  for (let i = 0; i < 60; i++) ids.add(dailyRune(new Date(2026, 0, 1 + i)).rune.id);
  assert.ok(ids.size > 12, '两个月里至少十几种不同符文：' + ids.size);
  if (!d1.rune.reversible) assert.equal(d1.reversed, false);
});

test('SPREADS: 四种牌阵、槽位与位名一致、今日符文走 daily', () => {
  assert.equal(SPREADS.length, 4);
  assert.deepEqual(
    SPREADS.map((s) => s.id),
    ['single', 'three', 'five', 'daily'],
  );
  for (const s of SPREADS) {
    assert.equal(s.positions.length, s.n, s.id);
    assert.equal(s.layout.length, s.n, s.id);
    assert.ok(s.keyIndex >= 0 && s.keyIndex < s.n);
    for (const p of s.positions) assert.ok(p.label && p.hint);
    for (const l of s.layout) assert.ok(l.x >= 0 && l.x <= 100 && l.y >= 0 && l.y <= 100);
  }
  assert.equal(getSpread('five').n, 5);
  assert.equal(getSpread('nope').id, 'single');
  assert.equal(SPREAD_CHIPS.length, 4);
  const daily = drawForSpread(getSpread('daily'), seeded(1), new Date(2026, 8, 13));
  assert.equal(daily.length, 1);
  assert.equal(daily[0].rune.id, dailyRune(new Date(2026, 8, 13)).rune.id);
  assert.equal(drawForSpread(getSpread('five'), seeded(9)).length, 5);
});

test('interpret: 单符标题含中文名与拉丁名，多符每符一节 + 建议', () => {
  const fehu = runeById('fehu');
  const one = interpret([{ rune: fehu, reversed: true }], getSpread('single'));
  assert.equal(one.title, '菲胡 · Fehu');
  assert.equal(one.badge, UI_TEXT.reversed);
  assert.equal(one.seal, '逆');
  assert.equal(one.items.length, 1);
  assert.deepEqual(one.items[0].keywords, fehu.rev.keywords);
  assert.equal(one.items[0].meaning, fehu.rev.meaning);
  assert.equal(one.advice, fehu.advice);
  assert.equal(one.overall, null);
  assert.ok(one.verse.includes('流失') && one.verse.includes(fehu.line));

  const draw = drawRunes(3, seeded('three'), { reversedRate: 0 });
  const three = interpret(draw, getSpread('three'));
  assert.equal(three.title, '诺伦三符');
  assert.equal(three.items.length, 3);
  assert.deepEqual(
    three.items.map((it) => it.position.label),
    ['过去', '现在', '未来'],
  );
  assert.equal(three.badge, '三枚皆正');
  assert.equal(three.advice, draw[2].rune.advice, '三符以未来位给建议');
  assert.equal(three.overall, TONE.none + (draw.every((d) => d.rune.aett === draw[0].rune.aett) ? three.overall.slice(TONE.none.length) : ''));

  const five = interpret(drawRunes(5, seeded('five')), getSpread('five'));
  assert.equal(five.items.length, 5);
  assert.equal(five.adviceFrom.position.label, '建议');

  const daily = interpret([dailyRune(new Date(2026, 8, 13))], getSpread('daily'), { date: new Date(2026, 8, 13) });
  assert.ok(daily.kicker.includes('9月13日'));
  assert.equal(daily.seal, '日');
});

test('toneKey / overallText', () => {
  const up = (id) => ({ rune: runeById(id), reversed: false });
  const dn = (id) => ({ rune: runeById(id), reversed: true });
  assert.equal(toneKey([up('fehu'), up('uruz'), up('gebo')]), 'none');
  assert.equal(toneKey([dn('fehu'), up('uruz'), up('gebo')]), 'few');
  assert.equal(toneKey([dn('fehu'), dn('uruz'), up('gebo')]), 'most');
  assert.equal(toneKey([dn('fehu'), dn('uruz'), dn('wunjo')]), 'all');
  const same = overallText([up('fehu'), up('uruz'), up('gebo')]);
  assert.ok(same.includes('弗雷之族'), '同族提示');
  assert.equal(overallText([up('fehu')]), null);
});

test('shareText 含符名、正逆、建议与署名', () => {
  const m = interpret([{ rune: runeById('tiwaz'), reversed: true }, { rune: runeById('isa'), reversed: false }, { rune: runeById('dagaz'), reversed: false }], getSpread('three'));
  const t = shareText(m);
  assert.ok(t.includes('提瓦兹 Tiwaz（逆位）'));
  assert.ok(t.includes('过去：') && t.includes('未来：'));
  assert.ok(t.includes('符文的建议'));
  assert.ok(t.includes(UI_TEXT.shareTail));
});

test('状态机：idle → drawn → revealed，重入无效', () => {
  let s = initState('three');
  const draw = drawRunes(3, seeded(2));
  s = reduceState(s, { type: 'flip', index: 0 });
  assert.equal(s.phase, 'idle', '未抽不能翻');
  s = reduceState(s, { type: 'draw', draw });
  assert.equal(s.phase, 'drawn');
  assert.deepEqual(s.flipped, [false, false, false]);
  const again = reduceState(s, { type: 'draw', draw });
  assert.equal(again, s, '已抽不能再抽');
  s = reduceState(s, { type: 'flip', index: 1 });
  assert.deepEqual(s.flipped, [false, true, false]);
  assert.equal(reduceState(s, { type: 'flip', index: 1 }), s, '重复翻无效');
  assert.equal(reduceState(s, { type: 'flip', index: 9 }), s, '越界无效');
  s = reduceState(s, { type: 'flip', index: 0 });
  assert.equal(s.phase, 'drawn');
  s = reduceState(s, { type: 'flip', index: 2 });
  assert.equal(s.phase, 'revealed');
  s = reduceState(s, { type: 'reset' });
  assert.equal(s.phase, 'idle');
  assert.equal(s.spreadId, 'three');
  s = reduceState(reduceState(s, { type: 'draw', draw }), { type: 'flipAll' });
  assert.equal(s.phase, 'revealed');
  assert.equal(reduceState(s, { type: 'spread', spreadId: 'five' }).spreadId, 'five');
});

test('历史打包 / 解包 往返一致', () => {
  const draw = drawRunes(5, seeded(11));
  const rec = packDraw(draw, 'five');
  assert.equal(rec.s, 'five');
  assert.equal(rec.r.length, 5);
  const back = unpackDraw(rec);
  assert.deepEqual(
    back.map((d) => [d.rune.id, d.reversed]),
    draw.map((d) => [d.rune.id, d.reversed]),
  );
  assert.deepEqual(unpackDraw({ r: [['nope', 1]] }), []);
});

test('shakeLevel 分级', () => {
  assert.equal(shakeLevel(10), 1);
  assert.equal(shakeLevel(20), 2);
  assert.equal(shakeLevel(30), 3);
});
