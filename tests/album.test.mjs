import test from 'node:test';
import assert from 'node:assert/strict';
import { ALBUM_TOTAL, normalizeAlbum, collectLot, backfillAlbum, albumStats } from '../src/modules/qian/album.js';
import { LOTS } from '../src/modules/qian/data.js';

test('收集册总数等于签数', () => {
  assert.equal(ALBUM_TOTAL, LOTS.length);
  assert.equal(albumStats({}).count, 0);
  assert.equal(albumStats({}).total, LOTS.length);
});

test('第一次收到是新签，再抽到只加次数，不改原对象', () => {
  const a0 = {};
  const r1 = collectLot(a0, 5, '2026-10-24');
  assert.equal(r1.fresh, true);
  assert.deepEqual(a0, {});
  const r2 = collectLot(r1.album, 5, '2026-10-25');
  assert.equal(r2.fresh, false);
  assert.deepEqual(r2.album[5], { first: '2026-10-24', times: 2 });
  assert.equal(albumStats(r2.album).count, 1);
});

test('清洗存档：去掉不存在的签号与坏数据', () => {
  const a = normalizeAlbum({ 1: { first: '2026-10-01', times: 3 }, 999: { times: 1 }, x: 1, 2: null });
  assert.deepEqual(Object.keys(a).sort(), ['1', '2']);
  assert.equal(a[2].times, 1);
  assert.deepEqual(normalizeAlbum(null), {});
  assert.deepEqual(normalizeAlbum('坏'), {});
});

test('旧历史补录，已收的不重复计次', () => {
  const a = backfillAlbum({ 3: { first: 'a', times: 2 } }, [{ no: 3, date: 'b' }, { no: 4, date: '2026-10-20' }, { no: 4, date: 'c' }, { no: 999 }]);
  assert.deepEqual(a[3], { first: 'a', times: 2 });
  assert.deepEqual(a[4], { first: '2026-10-20', times: 1 });
  assert.equal(a[999], undefined);
});

test('按等级统计，集齐时 complete', () => {
  let a = {};
  for (const l of LOTS) a = collectLot(a, l.no).album;
  const s = albumStats(a);
  assert.equal(s.complete, true);
  assert.equal(s.byLevel.reduce((n, x) => n + x.total, 0), LOTS.length);
  assert.ok(s.byLevel.every((x) => x.have === x.total));
});

import { MILESTONES, badgeOf, crossedMilestone, completedLevel } from '../src/modules/qian/album.js';
import { drawBadge } from '../src/ui/share-card.js';

test('徽章：按已收数量取最高一档，档位递增且最后一档等于总数', () => {
  assert.equal(badgeOf(0), null);
  assert.equal(badgeOf(7), null);
  assert.equal(badgeOf(8).name, '初窥');
  assert.equal(badgeOf(31).name, '入门');
  assert.equal(badgeOf(32).name, '半册');
  assert.equal(badgeOf(64).name, '圆满');
  for (let i = 1; i < MILESTONES.length; i++) assert.ok(MILESTONES[i].at > MILESTONES[i - 1].at && MILESTONES[i].stars >= MILESTONES[i - 1].stars);
  assert.equal(MILESTONES.at(-1).at, ALBUM_TOTAL);
});

test('跨过里程碑：只在刚到档位那一支返回，之后不重复', () => {
  assert.equal(crossedMilestone(7, 8).id, 'chu');
  assert.equal(crossedMilestone(8, 9), null);
  assert.equal(crossedMilestone(15, 16).id, 'ru');
  assert.equal(crossedMilestone(63, 64).id, 'man');
  assert.equal(crossedMilestone(3, 4), null);
});

test('集齐某一等级：只在补上最后一支时返回该等级', () => {
  const top = LOTS.filter((l) => l.level === '上上').map((l) => l.no);
  let album = {};
  for (const no of top.slice(0, -1)) album = collectLot(album, no).album;
  const before = album, after = collectLot(album, top.at(-1)).album;
  assert.equal(completedLevel(before, after), '上上');
  assert.equal(completedLevel(after, collectLot(after, top[0]).album), null);
  const other = LOTS.find((l) => l.level !== '上上').no;
  assert.equal(completedLevel(before, collectLot(before, other).album), null);
});

test('分享卡徽章：右端对齐、画出「签册 · 名字」与首字圆章', () => {
  const texts = [];
  const g = new Proxy({ measureText: (s) => ({ width: [...s].length * 30 }), fillText: (s, x) => texts.push([s, x]), createRadialGradient: () => ({ addColorStop() {} }) }, {
    get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; },
  });
  const w = drawBadge(g, '半册', 900, 107);
  assert.ok(w > 0 && 900 - w > 0);
  assert.deepEqual(texts.map((x) => x[0]), ['半', '签册 · 半册']);
  assert.ok(texts[1][1] + 6 * 30 <= 900, '文字不超出右端');
});
