import test from 'node:test';
import assert from 'node:assert/strict';
import { createStreak, dayDiff, NUDGE_QUIET_DAYS } from '../src/platform/streak.js';

function memStorage() {
  const m = new Map();
  return { get: (k, d) => (m.has(k) ? JSON.parse(m.get(k)) : d), set: (k, v) => m.set(k, JSON.stringify(v)) };
}
const at = (d, h = 12) => new Date(2026, 9, d, h).getTime();

test('本地日期相差天数', () => {
  assert.equal(dayDiff('2026-10-31', '2026-11-01'), 1);
  assert.equal(dayDiff('2026-03-07', '2026-03-09'), 2, '跨夏令时也按日历算');
  assert.equal(dayDiff('2026-10-22', '2026-10-22'), 0);
});

test('连续天数：同一天只记一次，断一天重新从 1 算', () => {
  let now = at(1);
  const s = createStreak({ storage: memStorage(), purchases: { pro: false }, now: () => now });
  assert.equal(s.days(), 0);
  assert.equal(s.visit(), 1);
  assert.equal(s.visit(), 1, '同一天重复不累加');
  now = at(2, 23); assert.equal(s.visit(), 2);
  now = at(3, 0); assert.equal(s.visit(), 3, '跨午夜就算新的一天');
  now = at(5); assert.equal(s.days(), 0, '隔了一天就断了');
  assert.equal(s.visit(), 1);
});

test('试用提示：连续第 3 天出现一次，7 天内不重复，Pro 不出现', () => {
  let now = at(1);
  const iap = { pro: false };
  const s = createStreak({ storage: memStorage(), purchases: iap, now: () => now });
  s.visit(); assert.equal(s.shouldNudge(), false);
  now = at(2); s.visit(); assert.equal(s.shouldNudge(), false, '第 2 天不提示');
  now = at(3); s.visit();
  assert.equal(s.shouldNudge(), true, '第 3 天提示');
  s.markNudged();
  assert.equal(s.shouldNudge(), false, '当天只提示一次');
  for (let d = 4; d < 3 + NUDGE_QUIET_DAYS; d++) { now = at(d); s.visit(); assert.equal(s.shouldNudge(), false, `第 ${d} 天在安静期内`); }
  now = at(3 + NUDGE_QUIET_DAYS); s.visit();
  assert.equal(s.shouldNudge(), true, '满 7 天后可以再提示');
  iap.pro = true;
  assert.equal(s.shouldNudge(), false, 'Pro 用户不提示');
});

test('今天没来过时不提示（例如只是打开了 App）', () => {
  let now = at(1);
  const s = createStreak({ storage: memStorage(), purchases: { pro: false }, now: () => now });
  for (const d of [1, 2, 3]) { now = at(d); s.visit(); }
  now = at(4);
  assert.equal(s.shouldNudge(), false);
});
