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
