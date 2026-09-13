import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COIN,
  LINE_KIND,
  KING_WEN,
  coinsToLine,
  tossCoins,
  lineInfo,
  lineName,
  positionName,
  symbolOf,
  bitsOf,
  trigramFromLines,
  getHexagram,
  hexagramFromLines,
  changedHexagram,
  movingRule,
  buildReading,
  luckLabel,
  initSession,
  reduceSession,
  sessionValues,
  formatShareText,
  formatBrief,
} from '../src/modules/liuyao/core.js';
import { HEXAGRAMS, TRIGRAMS, LINE_POSITIONS, MOVING_RULES, UI } from '../src/modules/liuyao/data.js';
import { seeded } from '../src/core/rng.js';

/* ------------------------------ 铜钱 → 爻 ------------------------------ */
test('coinsToLine：字=3 花=2，三枚之和 6/7/8/9', () => {
  assert.equal(coinsToLine([2, 2, 2]), 6); // 三花 老阴
  assert.equal(coinsToLine([3, 2, 2]), 7); // 一字两花 少阳
  assert.equal(coinsToLine([3, 3, 2]), 8); // 两字一花 少阴
  assert.equal(coinsToLine([2, 3, 3]), 8);
  assert.equal(coinsToLine([3, 3, 3]), 9); // 三字 老阳
  assert.throws(() => coinsToLine([3, 3]));
  assert.throws(() => coinsToLine([1, 2, 3]));
  assert.equal(COIN.ZI, 3);
  assert.equal(COIN.HUA, 2);
});

test('LINE_KIND：老阴×动 / 少阳静 / 少阴静 / 老阳○动', () => {
  assert.deepEqual([LINE_KIND[6].yang, LINE_KIND[6].moving, LINE_KIND[6].mark], [false, true, '×']);
  assert.deepEqual([LINE_KIND[7].yang, LINE_KIND[7].moving, LINE_KIND[7].mark], [true, false, '']);
  assert.deepEqual([LINE_KIND[8].yang, LINE_KIND[8].moving, LINE_KIND[8].mark], [false, false, '']);
  assert.deepEqual([LINE_KIND[9].yang, LINE_KIND[9].moving, LINE_KIND[9].mark], [true, true, '○']);
  assert.equal(lineInfo(9).name, '老阳');
  assert.throws(() => lineInfo(5));
});

test('tossCoins：分布 6:7:8:9 ≈ 1:3:3:1', () => {
  const rnd = seeded('liuyao');
  const n = 24000;
  const t = { 6: 0, 7: 0, 8: 0, 9: 0 };
  for (let i = 0; i < n; i++) {
    const r = tossCoins(rnd);
    assert.equal(r.coins.length, 3);
    assert.equal(r.value, r.coins.reduce((a, b) => a + b, 0));
    t[r.value]++;
  }
  assert.ok(Math.abs(t[6] / n - 1 / 8) < 0.015, 'old yin ~12.5%: ' + t[6] / n);
  assert.ok(Math.abs(t[7] / n - 3 / 8) < 0.02, 'young yang ~37.5%: ' + t[7] / n);
  assert.ok(Math.abs(t[8] / n - 3 / 8) < 0.02, 'young yin ~37.5%: ' + t[8] / n);
  assert.ok(Math.abs(t[9] / n - 1 / 8) < 0.015, 'old yang ~12.5%: ' + t[9] / n);
});

/* ------------------------------ 八卦 / 六十四卦 ------------------------------ */
test('symbolOf：䷀ 乾 … ䷿ 未济', () => {
  assert.equal(symbolOf(1), '䷀');
  assert.equal(symbolOf(2), '䷁');
  assert.equal(symbolOf(3), '䷂');
  assert.equal(symbolOf(64), '䷿');
  assert.equal(symbolOf(1), String.fromCodePoint(0x4dc0));
});

test('trigramFromLines：八经卦', () => {
  assert.equal(trigramFromLines('111').name, '乾');
  assert.equal(trigramFromLines('000').name, '坤');
  assert.equal(trigramFromLines([1, 0, 0]).name, '震');
  assert.equal(trigramFromLines([0, 1, 1]).name, '巽');
  assert.equal(trigramFromLines([0, 1, 0]).name, '坎');
  assert.equal(trigramFromLines([1, 0, 1]).name, '离');
  assert.equal(trigramFromLines([0, 0, 1]).name, '艮');
  assert.equal(trigramFromLines([1, 1, 0]).name, '兑');
  assert.equal(trigramFromLines('010').nature, '水');
});

test('hexagramFromLines：规格锚点', () => {
  // 全阳=乾(1)、全阴=坤(2)
  assert.equal(hexagramFromLines('111111').no, 1);
  assert.equal(hexagramFromLines([0, 0, 0, 0, 0, 0]).no, 2);
  // 下震上坎=屯(3)
  const zhun = hexagramFromLines('100010');
  assert.equal(zhun.no, 3);
  assert.equal(zhun.name, '屯');
  assert.equal(zhun.fullName, '水雷屯');
  assert.equal(zhun.lower.name, '震');
  assert.equal(zhun.upper.name, '坎');
  // 下乾上坤=泰(11)、下坤上乾=否(12)
  assert.equal(hexagramFromLines('111000').no, 11);
  assert.equal(hexagramFromLines('000111').no, 12);
  // 下离上坎=既济(63)、下坎上离=未济(64)
  assert.equal(hexagramFromLines('101010').no, 63);
  assert.equal(hexagramFromLines('010101').no, 64);
  // 需(5) 为水天需：上坎下乾；下坎上乾 则为天水讼(6)
  assert.equal(hexagramFromLines('111010').no, 5);
  assert.equal(hexagramFromLines('111010').fullName, '水天需');
  assert.equal(hexagramFromLines('010111').no, 6);
  assert.equal(hexagramFromLines('010111').fullName, '天水讼');
  // 接受 6/7/8/9 爻值
  assert.equal(hexagramFromLines([9, 7, 7, 7, 7, 7]).no, 1);
  assert.equal(hexagramFromLines([6, 8, 8, 8, 8, 8]).no, 2);
  assert.throws(() => hexagramFromLines('11111'));
});

test('KING_WEN 表：64 卦一一对应、无重复，与 data 的上下卦一致', () => {
  const seen = new Set();
  for (const up of Object.keys(KING_WEN)) {
    for (const lo of Object.keys(KING_WEN[up])) {
      const no = KING_WEN[up][lo];
      assert.ok(no >= 1 && no <= 64);
      assert.ok(!seen.has(no), '重复卦序 ' + no);
      seen.add(no);
      const hex = getHexagram(no);
      assert.equal(hex.upper.key, up, `卦 ${no} 上卦`);
      assert.equal(hex.lower.key, lo, `卦 ${no} 下卦`);
      assert.equal(hex.upper.name, HEXAGRAMS[no - 1].upper, `data 卦 ${no} upper`);
      assert.equal(hex.lower.name, HEXAGRAMS[no - 1].lower, `data 卦 ${no} lower`);
    }
  }
  assert.equal(seen.size, 64);
  for (let no = 1; no <= 64; no++) {
    assert.equal(hexagramFromLines(bitsOf(no)).no, no);
    assert.equal(getHexagram(no).symbol, symbolOf(no));
  }
});

test('八纯卦全名为「X为Y」，其余为「上下+名」', () => {
  assert.equal(getHexagram(1).fullName, '乾为天');
  assert.equal(getHexagram(2).fullName, '坤为地');
  assert.equal(getHexagram(29).fullName, '坎为水');
  assert.equal(getHexagram(30).fullName, '离为火');
  assert.equal(getHexagram(51).fullName, '震为雷');
  assert.equal(getHexagram(52).fullName, '艮为山');
  assert.equal(getHexagram(57).fullName, '巽为风');
  assert.equal(getHexagram(58).fullName, '兑为泽');
  assert.equal(getHexagram(11).fullName, '地天泰');
  assert.equal(getHexagram(63).fullName, '水火既济');
  assert.equal(getHexagram(21).fullName, '火雷噬嗑');
});

/* ------------------------------ 变卦 ------------------------------ */
test('changedHexagram：老阳变阴、老阴变阳；无动爻为 null', () => {
  // 乾卦初爻老阳 → 初爻变阴 → 天风姤(44)
  const g = changedHexagram([9, 7, 7, 7, 7, 7]);
  assert.equal(g.no, 44);
  assert.equal(g.fullName, '天风姤');
  // 坤卦上爻老阴 → 上爻变阳 → 山地剥(23)
  assert.equal(changedHexagram([8, 8, 8, 8, 8, 6]).no, 23);
  // 六爻皆动：乾 → 坤
  assert.equal(changedHexagram([9, 9, 9, 9, 9, 9]).no, 2);
  assert.equal(changedHexagram([6, 6, 6, 6, 6, 6]).no, 1);
  // 泰 111000 五爻老阴 → 111010 需(5)
  assert.equal(changedHexagram([7, 7, 7, 8, 6, 8]).no, 5);
  // 无动爻
  assert.equal(changedHexagram([7, 8, 7, 8, 7, 8]), null);
  assert.throws(() => changedHexagram([7, 7, 7]));
});

test('movingRule：无动 / 一动 / 多动 / 六动', () => {
  assert.equal(movingRule(0).key, 'none');
  assert.equal(movingRule(1).key, 'one');
  assert.equal(movingRule(2).key, 'multi');
  assert.equal(movingRule(5).key, 'multi');
  assert.equal(movingRule(6).key, 'all');
});

test('lineName / positionName', () => {
  assert.equal(lineName(0, 9), '初九');
  assert.equal(lineName(0, 8), '初六');
  assert.equal(lineName(1, 8), '六二');
  assert.equal(lineName(2, 7), '九三');
  assert.equal(lineName(3, 6), '六四');
  assert.equal(lineName(4, 9), '九五');
  assert.equal(lineName(5, 7), '上九');
  assert.equal(lineName(5, 6), '上六');
  assert.equal(positionName(0), '初爻');
  assert.equal(positionName(5), '上爻');
});

test('buildReading：本卦 / 变卦 / 动爻 / 规则 / focus', () => {
  const r = buildReading([7, 9, 8, 8, 6, 7]);
  assert.equal(r.lines.length, 6);
  assert.deepEqual(r.moving, [1, 4]);
  assert.equal(r.rule.key, 'multi');
  assert.equal(r.ben.no, hexagramFromLines('110001').no); // 下兑上艮 = 山泽损(41)
  assert.equal(r.ben.no, 41);
  assert.equal(r.ben.fullName, '山泽损');
  assert.equal(r.bian.no, hexagramFromLines('100011').no); // 二爻变阴、五爻变阳 → 下震上巽 = 风雷益(42)
  assert.equal(r.bian.no, 42);
  assert.equal(r.bian.fullName, '风雷益');
  assert.equal(r.focus.no, 41);
  assert.equal(r.lines[1].name, '九二');
  assert.equal(r.lines[4].name, '六五');
  assert.equal(r.lines[4].position.short, '五爻');
  // 六爻皆动以变卦为主
  const all = buildReading([9, 9, 9, 9, 9, 9]);
  assert.equal(all.rule.key, 'all');
  assert.equal(all.focus.no, 2);
  // 静卦
  const still = buildReading([7, 7, 7, 8, 8, 8]);
  assert.equal(still.bian, null);
  assert.equal(still.rule.key, 'none');
  assert.equal(still.ben.no, 11);
});

test('luckLabel：星级与印章', () => {
  assert.equal(luckLabel(5).stars, '★★★★★');
  assert.equal(luckLabel(5).seal, '大吉');
  assert.equal(luckLabel(4).seal, '吉');
  assert.equal(luckLabel(3).seal, '平');
  assert.equal(luckLabel(2).seal, '慎');
  assert.equal(luckLabel(1).seal, '凶');
  assert.equal(luckLabel(1).stars, '★☆☆☆☆');
  assert.equal(luckLabel(9).luck, 5);
});

/* ------------------------------ 会话 ------------------------------ */
test('会话：六掷成卦，之后不再变化', () => {
  let s = initSession();
  assert.equal(s.done, false);
  const rnd = seeded(3);
  for (let i = 0; i < 6; i++) {
    s = reduceSession(s, tossCoins(rnd));
    assert.equal(s.done, i === 5);
  }
  assert.equal(s.tosses.length, 6);
  const after = reduceSession(s, tossCoins(rnd));
  assert.deepEqual(after, s);
  const values = sessionValues(s);
  assert.equal(values.length, 6);
  const r = buildReading(values);
  assert.ok(r.ben.no >= 1 && r.ben.no <= 64);
});

test('formatShareText / formatBrief', () => {
  const r = buildReading([9, 7, 7, 7, 7, 7]);
  const t = formatShareText(r, { question: '这份工作值得接吗', date: '庚寅日 亥时' });
  assert.match(t, /六爻/);
  assert.match(t, /问：这份工作值得接吗/);
  assert.match(t, /乾为天/);
  assert.match(t, /初九/);
  assert.match(t, /天风姤/);
  assert.match(t, /来感觉/);
  assert.equal(formatBrief(r), '䷀ 乾→姤');
  const still = buildReading([7, 7, 7, 8, 8, 8]);
  assert.equal(formatBrief(still), '䷊ 泰');
  assert.match(formatShareText(still), /六爻皆静/);
});

/* ------------------------------ 模块入口 ------------------------------ */
test('index.js / view.js 在 Node 中可 import（顶层不触碰 DOM）', async () => {
  const mod = await import('../src/modules/liuyao/index.js');
  assert.equal(mod.default.id, 'liuyao');
  assert.equal(typeof mod.default.mount, 'function');
});

/* ------------------------------ 内容质量 ------------------------------ */
test('data：64 卦字段完整、长度达标、无占位文字', () => {
  assert.equal(HEXAGRAMS.length, 64);
  const names = new Set();
  const bad = /TODO|待补|示例|占位|xxx|\?\?|�/i;
  const len = (s) => Array.from(s.replace(/[，。、；：！？「」“”…—·]/g, '')).length;
  HEXAGRAMS.forEach((hx, i) => {
    assert.equal(hx.no, i + 1);
    assert.ok(hx.name && !names.has(hx.name), '卦名重复/缺失 ' + hx.no);
    names.add(hx.name);
    for (const k of ['guaci', 'xiang', 'gist', 'meaning', 'career', 'love', 'wealth', 'health']) {
      assert.equal(typeof hx[k], 'string', `${hx.no} ${k}`);
      assert.ok(hx[k].length > 0, `${hx.no} ${k} 为空`);
      assert.ok(!bad.test(hx[k]), `${hx.no} ${k} 含占位文字`);
    }
    assert.ok(['乾', '坤', '震', '巽', '坎', '离', '艮', '兑'].includes(hx.upper), hx.no + ' upper');
    assert.ok(['乾', '坤', '震', '巽', '坎', '离', '艮', '兑'].includes(hx.lower), hx.no + ' lower');
    assert.ok(Number.isInteger(hx.luck) && hx.luck >= 1 && hx.luck <= 5, hx.no + ' luck');
    const m = len(hx.meaning);
    assert.ok(m >= 80 && m <= 160, `${hx.no} ${hx.name} meaning 长度 ${m}`);
    for (const k of ['career', 'love', 'wealth', 'health']) {
      const l = len(hx[k]);
      assert.ok(l >= 10 && l <= 32, `${hx.no} ${hx.name} ${k} 长度 ${l}`);
    }
    assert.ok(len(hx.gist) >= 12 && len(hx.gist) <= 40, `${hx.no} gist 长度`);
  });
  // 吉凶分布：不应全是同一档
  const dist = HEXAGRAMS.reduce((a, hx) => ((a[hx.luck] = (a[hx.luck] || 0) + 1), a), {});
  assert.ok(Object.keys(dist).length >= 4, '吉凶分级应有层次');
});

test('data：八卦 / 爻位 / 动爻规则 / 文案', () => {
  assert.equal(Object.keys(TRIGRAMS).length, 8);
  const bits = new Set(Object.values(TRIGRAMS).map((t) => t.bits));
  assert.equal(bits.size, 8);
  assert.equal(LINE_POSITIONS.length, 6);
  for (const p of LINE_POSITIONS) {
    const l = Array.from(p.text.replace(/[，。、；：！？“”…—·]/g, '')).length;
    assert.ok(l >= 40 && l <= 80, `${p.short} 释义长度 ${l}`);
  }
  assert.deepEqual(Object.keys(MOVING_RULES).sort(), ['all', 'multi', 'none', 'one']);
  for (const r of Object.values(MOVING_RULES)) assert.ok(r.title && r.text.length > 20);
  assert.equal(UI.coinFront.join(''), '乾隆通宝');
  assert.equal(UI.faceNames[3], '字');
  assert.equal(UI.faceNames[2], '花');
});
