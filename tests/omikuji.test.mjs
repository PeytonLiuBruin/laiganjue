import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEVELS,
  LOTS,
  ITEM_KEYS,
  totalWeight,
  pickLevel,
  pickLot,
  lotsOfLevel,
  lotByNo,
  levelOf,
  isBad,
  validateLots,
  initRack,
  tieUp,
  untie,
  visibleKnots,
  RACK_MAX,
  drawnToday,
  markDrawn,
  PHASE,
  nextPhase,
  shareText,
  cnNumber,
  toneOf,
} from '../src/modules/omikuji/core.js';
import { TEXT } from '../src/modules/omikuji/data.js';
import { seeded } from '../src/core/rng.js';

const len = (s) => Array.from(String(s)).length;

test('LEVELS: 11 级、权重和 100、不含大凶、凶系标记正确', () => {
  assert.equal(LEVELS.length, 11);
  assert.equal(totalWeight(), 100);
  assert.ok(!LEVELS.some((l) => l.name === '大凶'));
  const w = Object.fromEntries(LEVELS.map((l) => [l.name, l.weight]));
  assert.deepEqual(w, { 大吉: 16, 吉: 30, 中吉: 10, 小吉: 10, 半吉: 6, 末吉: 8, 末小吉: 4, 凶: 12, 小凶: 2, 半凶: 1, 末凶: 1 });
  for (const l of LEVELS) {
    assert.equal(!!l.bad, l.name.includes('凶'), l.name);
    assert.ok(['gold', 'red', 'ink', 'indigo'].includes(l.tone), l.name + ' tone');
    assert.ok(l.seal && len(l.seal) <= 2, l.name + ' seal 1–2 字');
    assert.ok(l.kana && l.blurb && l.badge);
  }
  assert.equal(levelOf('daikichi').tone, 'gold');
  assert.equal(isBad('kyo'), true);
  assert.equal(isBad('kichi'), false);
  assert.equal(toneOf('suekichi'), 'ink');
});

test('pickLevel: seeded 10000 次分布近似权重（误差 < 2%）', () => {
  const rnd = seeded('omikuji-level');
  const N = 10000;
  const c = {};
  for (let i = 0; i < N; i++) {
    const l = pickLevel(rnd);
    c[l.id] = (c[l.id] || 0) + 1;
  }
  for (const l of LEVELS) {
    const got = (c[l.id] || 0) / N;
    const want = l.weight / 100;
    assert.ok(Math.abs(got - want) < 0.02, `${l.name}: ${got} vs ${want}`);
  }
});

test('pickLot: 返回签库中的签，且等级分布近似权重', () => {
  const rnd = seeded(2026);
  const N = 10000;
  const c = {};
  for (let i = 0; i < N; i++) {
    const lot = pickLot(rnd);
    assert.ok(LOTS.includes(lot), '签必须来自 LOTS');
    assert.ok(levelOf(lot.level), '等级存在');
    c[lot.level] = (c[lot.level] || 0) + 1;
  }
  for (const l of LEVELS) {
    const got = (c[l.id] || 0) / N;
    assert.ok(Math.abs(got - l.weight / 100) < 0.02, `${l.name}: ${got}`);
  }
});

test('pickLot: 等级先抽定，再在该等级内均匀抽签', () => {
  // 用只返回固定值的 rnd 验证：第一次调用抽等级，第二次调用在该等级内选签
  const seq = [0.0, 0.0];
  let i = 0;
  const rnd = () => seq[i++ % seq.length];
  const lot = pickLot(rnd);
  assert.equal(lot.level, LEVELS[0].id);
  assert.equal(lot, lotsOfLevel(LEVELS[0].id)[0]);
});

test('validateLots: ≥50 支、番号唯一、和歌 4 行、12 项齐全、每级至少 1 签', () => {
  const v = validateLots();
  assert.deepEqual(v.errors, []);
  assert.equal(v.ok, true);
  assert.ok(LOTS.length >= 50, '至少 50 支');
  assert.equal(new Set(LOTS.map((l) => l.no)).size, LOTS.length, '番号唯一');
  for (const lot of LOTS) {
    assert.equal(lot.waka.length, 4, lot.no);
    assert.deepEqual(Object.keys(lot.items), ITEM_KEYS, lot.no + ' 十二项目');
  }
  for (const l of LEVELS) assert.ok(lotsOfLevel(l.id).length >= 1, l.name + ' 至少 1 签');
});

test('validateLots: 能捕捉坏数据', () => {
  const bad = LOTS.slice(0, 49).map((l) => ({ ...l }));
  const v1 = validateLots(bad);
  assert.equal(v1.ok, false);
  assert.ok(v1.errors.some((e) => e.includes('签数不足')));
  const dup = LOTS.map((l, i) => (i === 1 ? { ...l, no: LOTS[0].no } : l));
  assert.ok(validateLots(dup).errors.some((e) => e.includes('重复')));
  const shortWaka = LOTS.map((l, i) => (i === 0 ? { ...l, waka: ['短', '短', '短', '短'] } : l));
  assert.ok(validateLots(shortWaka).errors.some((e) => e.includes('和歌')));
  const missing = LOTS.map((l, i) => (i === 0 ? { ...l, items: { ...l.items, 愿望: undefined } } : l));
  assert.ok(validateLots(missing).errors.some((e) => e.includes('愿望')));
  const placeholder = LOTS.map((l, i) => (i === 0 ? { ...l, summary: l.summary.slice(0, 55) + 'TODO 待补' } : l));
  assert.ok(validateLots(placeholder).errors.some((e) => e.includes('占位')));
});

test('内容质量：字数范围、无占位/乱码、和歌与项目不重复、等级分布合理', () => {
  const wakaSet = new Set();
  const itemSet = new Set();
  for (const lot of LOTS) {
    for (const line of lot.waka) {
      const n = len(line);
      assert.ok(n >= 5 && n <= 9, `${lot.no} 和歌「${line}」${n} 字`);
      assert.ok(!/[，。！？、；：,.!?]/.test(line), `${lot.no} 和歌不带标点`);
    }
    const key = lot.waka.join('/');
    assert.ok(!wakaSet.has(key), lot.no + ' 和歌重复');
    wakaSet.add(key);
    const sn = len(lot.summary);
    assert.ok(sn >= 60 && sn <= 100, `${lot.no} 总运 ${sn} 字`);
    for (const k of ITEM_KEYS) {
      const v = lot.items[k];
      const n = len(v);
      assert.ok(n >= 6 && n <= 14, `${lot.no}「${k}」${n} 字`);
      const ik = k + ':' + v;
      assert.ok(!itemSet.has(ik), `${lot.no}「${k}」与他签重复：${v}`);
      itemSet.add(ik);
    }
    const all = JSON.stringify(lot);
    assert.ok(!/TODO|待补|示例|占位|�/i.test(all), lot.no + ' 含占位或乱码');
  }
  // 等级分布：每级签数与权重大致相符（每支签约占 1.56%）
  const per = Object.fromEntries(LEVELS.map((l) => [l.id, lotsOfLevel(l.id).length]));
  for (const l of LEVELS) {
    const share = per[l.id] / LOTS.length;
    assert.ok(Math.abs(share - l.weight / 100) < 0.06, `${l.name} 签数 ${per[l.id]} 与权重 ${l.weight} 偏差过大`);
  }
  assert.ok(per.daikichi >= 8 && per.kichi >= 15 && per.kyo >= 5);
});

test('cnNumber / 番号', () => {
  assert.equal(cnNumber(1), '一');
  assert.equal(cnNumber(10), '十');
  assert.equal(cnNumber(12), '十二');
  assert.equal(cnNumber(20), '二十');
  assert.equal(cnNumber(21), '二十一');
  assert.equal(cnNumber(64), '六十四');
  assert.equal(LOTS[0].no, '第一番');
  assert.equal(LOTS[11].no, '第十二番');
  assert.equal(LOTS[LOTS.length - 1].no, `第${cnNumber(LOTS.length)}番`);
  assert.equal(lotByNo('第十二番').n, 12);
  assert.equal(lotByNo(64).no, '第六十四番');
  assert.equal(lotByNo('第九十九番'), null);
});

test('结绳架：tieUp / untie / visibleKnots', () => {
  let r = initRack();
  assert.deepEqual(r, { tied: 0, list: [] });
  r = untie(r);
  assert.equal(r.tied, 0, '空架解签不为负');
  for (let i = 1; i <= 15; i++) r = tieUp(r, { no: `第${cnNumber(i)}番`, level: 'kyo', date: '2026-09-13' });
  assert.equal(r.tied, 15);
  const vis = visibleKnots(r);
  assert.equal(vis.length, RACK_MAX, '最多显示 12 张');
  assert.equal(vis[vis.length - 1].no, '第十五番', '最近的在最后');
  assert.equal(vis[0].no, '第四番');
  r = untie(r);
  assert.equal(r.tied, 14);
  assert.equal(visibleKnots(r)[visibleKnots(r).length - 1].no, '第十四番');
  // 旧版本数据（只有计数）也能补齐
  const legacy = visibleKnots({ tied: 3 });
  assert.equal(legacy.length, 3);
  // 不可变
  const a = initRack();
  const b = tieUp(a, { no: '第一番', level: 'kyo' });
  assert.equal(a.tied, 0);
  assert.equal(b.tied, 1);
  assert.equal(untie(null).tied, 0);
});

test('今日记录：drawnToday / markDrawn', () => {
  assert.equal(drawnToday(null, '2026-09-13'), false);
  let d = markDrawn(null, '2026-09-13');
  assert.deepEqual(d, { date: '2026-09-13', count: 1 });
  assert.equal(drawnToday(d, '2026-09-13'), true);
  assert.equal(drawnToday(d, '2026-09-14'), false);
  d = markDrawn(d, '2026-09-13');
  assert.equal(d.count, 2);
  d = markDrawn(d, '2026-09-14');
  assert.deepEqual(d, { date: '2026-09-14', count: 1 });
});

test('流程状态机：idle → shaking → stick → paper → idle', () => {
  assert.equal(nextPhase(PHASE.IDLE, 'shake'), PHASE.SHAKING);
  assert.equal(nextPhase(PHASE.SHAKING, 'out'), PHASE.STICK);
  assert.equal(nextPhase(PHASE.STICK, 'draw'), PHASE.PAPER);
  assert.equal(nextPhase(PHASE.PAPER, 'reset'), PHASE.IDLE);
  assert.equal(nextPhase(PHASE.STICK, 'reset'), PHASE.IDLE);
  // 非法动作
  assert.equal(nextPhase(PHASE.IDLE, 'draw'), null);
  assert.equal(nextPhase(PHASE.PAPER, 'shake'), null);
  assert.equal(nextPhase(PHASE.SHAKING, 'shake'), null);
  assert.equal(nextPhase('nope', 'shake'), null);
});

test('shareText 含番号、等级、和歌与总运', () => {
  const lot = lotByNo(1);
  const t = shareText(lot);
  assert.ok(t.startsWith(TEXT.shareTitle + '第一番 · 大吉'));
  assert.ok(t.includes(lot.waka[0]) && t.includes(lot.waka[3]));
  assert.ok(t.includes(lot.summary));
  assert.ok(t.includes('愿望：'));
  assert.ok(t.endsWith(TEXT.shareFooter));
});

test('界面文案齐全、无占位', () => {
  const need = ['hintIdle', 'hintStick', 'hintPaper', 'gestureHint', 'btnShake', 'btnDraw', 'btnAgain', 'btnTie', 'btnTakeHome', 'dailyToast', 'noteBad', 'noteGood', 'tieDone', 'takeHomeDone'];
  for (const k of need) assert.ok(typeof TEXT[k] === 'string' && TEXT[k].length > 0, k);
  assert.ok(TEXT.noteBad.includes('一日一签为佳'));
  assert.ok(TEXT.dailyToast.includes('一日一签'));
  assert.ok(TEXT.tieDone.includes('厄运留在神社'));
  assert.ok(Array.isArray(TEXT.howto) && TEXT.howto.length >= 4);
  assert.ok(!/TODO|待补|示例/.test(JSON.stringify(TEXT)));
});
