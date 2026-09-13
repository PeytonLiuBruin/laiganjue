import { test } from 'node:test';
import assert from 'node:assert/strict';
import { random, randomInt, pick, shuffle, weightedPick, seeded, dailyRng, hashString, dateKey } from '../src/core/rng.js';

test('random in [0,1)', () => {
  for (let i = 0; i < 1000; i++) {
    const r = random();
    assert.ok(r >= 0 && r < 1);
  }
});

test('randomInt inclusive bounds', () => {
  const rnd = seeded(1);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) seen.add(randomInt(1, 6, rnd));
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6]);
});

test('seeded is deterministic', () => {
  const a = seeded('abc');
  const b = seeded('abc');
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
  const c = seeded('abd');
  assert.notEqual(seeded('abc')(), c());
});

test('shuffle keeps elements, does not mutate', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(arr, seeded(3));
  assert.deepEqual(arr, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(out.slice().sort((x, y) => x - y), arr);
});

test('weightedPick respects weights', () => {
  const rnd = seeded(42);
  const items = [{ k: 'a', w: 9 }, { k: 'b', w: 1 }];
  let a = 0;
  for (let i = 0; i < 5000; i++) if (weightedPick(items, (it) => it.w, rnd).k === 'a') a++;
  assert.ok(a / 5000 > 0.86 && a / 5000 < 0.94, String(a / 5000));
});

test('pick on empty → undefined', () => {
  assert.equal(pick([]), undefined);
});

test('dailyRng stable within a date, differs across dates/salt', () => {
  const d1 = new Date(2026, 8, 13);
  const d2 = new Date(2026, 8, 14);
  assert.equal(dailyRng('x', d1)(), dailyRng('x', d1)());
  assert.notEqual(dailyRng('x', d1)(), dailyRng('x', d2)());
  assert.notEqual(dailyRng('x', d1)(), dailyRng('y', d1)());
  assert.equal(dateKey(d1), '2026-09-13');
});

test('hashString stable', () => {
  assert.equal(hashString('来感觉'), hashString('来感觉'));
  assert.notEqual(hashString('a'), hashString('b'));
});
