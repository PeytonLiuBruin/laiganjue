import test from 'node:test';
import assert from 'node:assert/strict';
import { createReminder, planReminders, REMIND_ID_BASE, REMIND_DAYS } from '../src/platform/reminder.js';
import { createStreak } from '../src/platform/streak.js';

function memStorage() {
  const m = new Map();
  return { get: (k, d) => (m.has(k) ? JSON.parse(m.get(k)) : d), set: (k, v) => m.set(k, JSON.stringify(v)) };
}
const at = (d, h = 12) => new Date(2026, 9, d, h).getTime();
function fakeNotifier(grant = true) {
  const n = { scheduled: [], cancelled: [], asked: 0 };
  n.requestPermission = async () => { n.asked++; return grant; };
  n.schedule = async (list) => { n.scheduled = list; };
  n.cancel = async (ids) => { n.cancelled.push(ids); n.scheduled = []; };
  return n;
}

test('排期：今天没来过时今晚 9 点提醒，来过就从明晚开始', () => {
  const notYet = planReminders({ now: at(10, 15), visitedToday: false, days: 4 });
  assert.equal(notYet.length, REMIND_DAYS);
  assert.equal(notYet[0].at.getDate(), 10);
  assert.equal(notYet[0].at.getHours(), 21);
  assert.equal(notYet[0].title, '连续 4 天了', '昨天来过，今晚还能续上');
  assert.equal(notYet[1].title, '今天还没来感觉', '明晚已经断了，换成普通提醒');
  const visited = planReminders({ now: at(10, 15), visitedToday: true, days: 5 });
  assert.equal(visited.length, REMIND_DAYS - 1);
  assert.equal(visited[0].at.getDate(), 11);
  assert.equal(visited[0].id, REMIND_ID_BASE + 1);
  assert.equal(visited[0].title, '连续 5 天了');
  const late = planReminders({ now: at(10, 22), visitedToday: false, days: 2 });
  assert.equal(late[0].at.getDate(), 11, '过了 9 点不再排今晚');
  const fresh = planReminders({ now: at(10, 8), visitedToday: false, days: 0 });
  assert.ok(fresh.every((r) => r.title === '今天还没来感觉'));
  for (const r of [...notYet, ...visited]) assert.ok(!/[;；]/.test(r.title + r.body), '文案不用分号');
});

test('默认关闭：没打开时不申请权限也不排通知，网页版不可用', async () => {
  const n = fakeNotifier();
  const r = createReminder({ storage: memStorage(), notifier: n, now: () => at(10) });
  assert.equal(r.available, true);
  assert.equal(r.enabled(), false);
  assert.deepEqual(await r.sync(), []);
  assert.equal(n.asked, 0);
  const web = createReminder({ storage: memStorage(), notifier: null });
  assert.equal(web.available, false);
  assert.equal(await web.enable(), 'unavailable');
});

test('打开：权限被拒时保持关闭，同意后排期，来过后重排，关闭后取消', async () => {
  const storage = memStorage();
  let now = at(10, 15);
  const streak = createStreak({ storage, purchases: { pro: false }, now: () => now });
  const denied = createReminder({ storage, notifier: fakeNotifier(false), streak, now: () => now });
  assert.equal(await denied.enable(), 'denied');
  assert.equal(denied.enabled(), false);

  const n = fakeNotifier(true);
  const r = createReminder({ storage, notifier: n, streak, now: () => now });
  assert.equal(await r.enable(), 'on');
  assert.equal(r.enabled(), true);
  assert.equal(n.scheduled.length, REMIND_DAYS, '今天还没来，今晚也排上');
  streak.visit();
  await r.sync();
  assert.equal(n.scheduled.length, REMIND_DAYS - 1, '来过之后今晚不再提醒');
  assert.equal(n.scheduled[0].title, '连续 1 天了');
  assert.deepEqual(n.cancelled.at(-1), Array.from({ length: REMIND_DAYS }, (_, i) => REMIND_ID_BASE + i), '只取消自己这组 id');
  await r.disable();
  assert.equal(r.enabled(), false);
  assert.equal(n.scheduled.length, 0);
});
