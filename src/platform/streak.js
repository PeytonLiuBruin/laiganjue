// 连续使用天数与温和的试用提示（monetization.md 第 4 节第 4 条）。
// 每次得出结果时记一次「今天来过」。连续第 3 天起，在结果条底部出现一次年度试用提示，7 天内不重复，Pro 不出现。
//
// createStreak({ storage, purchases, now }) →
//   visit()        记下今天来过，返回连续天数
//   days()         当前连续天数（今天或昨天来过才算连续）
//   shouldNudge()  这次结果要不要出现试用提示（不改变状态）
//   markNudged()   记下已经提示过
import { dayKey } from './quota.js';

export const NUDGE_AFTER_DAYS = 3;
export const NUDGE_QUIET_DAYS = 7;
const DAY = 86400000;

/** 两个本地日期键之间相差几天（按本地日历，不受夏令时影响）。 */
export function dayDiff(a, b) {
  const [ya, ma, da] = a.split('-').map(Number), [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DAY);
}

export function createStreak({ storage, purchases, now = () => Date.now() } = {}) {
  const load = () => {
    const s = storage?.get('streak', null);
    return s && typeof s.last === 'string' ? s : { last: null, count: 0, nudged: null };
  };
  function days() {
    const s = load();
    if (!s.last) return 0;
    const gap = dayDiff(s.last, dayKey(now()));
    return gap <= 1 ? s.count : 0;
  }
  function visit() {
    const s = load(), today = dayKey(now());
    if (s.last === today) return s.count;
    const gap = s.last ? dayDiff(s.last, today) : Infinity;
    const next = { ...s, last: today, count: gap === 1 ? s.count + 1 : 1 };
    storage?.set('streak', next);
    return next.count;
  }
  function shouldNudge() {
    if (purchases?.pro) return false;
    const s = load();
    if (s.last !== dayKey(now()) || s.count < NUDGE_AFTER_DAYS) return false;
    return !s.nudged || dayDiff(s.nudged, dayKey(now())) >= NUDGE_QUIET_DAYS;
  }
  function markNudged() {
    storage?.set('streak', { ...load(), nudged: dayKey(now()) });
  }
  return { visit, days, shouldNudge, markNudged };
}
