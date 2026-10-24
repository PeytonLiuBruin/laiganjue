// 断签提醒：用户在设置里主动打开后，晚上 9 点还没来过时，发一条本地通知（不联网、不走推送服务器）。
// 本地通知没法在触发那一刻判断「今天来没来过」，所以反过来做：每次来过（出结果）或打开 App 时，
// 取消旧的，重新排未来 7 天每晚 9 点各一条，今天已经来过就跳过今天。连续 7 天没打开 App 后不再打扰。
//
// createReminder({ storage, notifier, streak, now }) →
//   available      当前环境能否发本地通知（网页版为 false，设置页不显示开关）
//   enabled()      用户是否打开了提醒（默认关闭）
//   enable()       申请通知权限并打开 → 'on' | 'denied' | 'unavailable'
//   disable()      关闭并取消已排的通知
//   sync()         按当前连续天数重新排通知（每次出结果、回到 App 时调用）
//
// notifier 由原生外壳提供：{ requestPermission() → bool, schedule([{ id, title, body, at }]), cancel(ids) }
import { dayKey } from './quota.js';

export const REMIND_HOUR = 21;
export const REMIND_DAYS = 7;
export const REMIND_ID_BASE = 7100; // 7100 到 7106，取消时按这组 id 精确取消，不影响别的通知

/** 某天本地时间的 hour 点整。 */
function atHour(ms, addDays, hour) {
  const d = new Date(ms);
  d.setDate(d.getDate() + addDays);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/**
 * 未来几晚的提醒文案与时间（纯函数，便于测试）。
 * visitedToday：今天已经出过结果。days：当前连续天数（今天或昨天来过才算）。
 */
export function planReminders({ now, visitedToday, days, hour = REMIND_HOUR, count = REMIND_DAYS }) {
  const list = [];
  for (let i = 0; i < count; i++) {
    const at = atHour(now, i, hour);
    if (i === 0 && (visitedToday || at.getTime() <= now)) continue;
    // 第 i 晚触发时距离最后一次来过隔了几天：今天来过则隔 i 天，否则隔 i + 1 天（昨天来过）或更久
    const gap = visitedToday ? i : i + 1;
    const alive = days > 0 && gap === 1; // 昨天来过、今天还没来：还能续上
    list.push({
      id: REMIND_ID_BASE + i,
      at,
      title: alive ? `连续 ${days} 天了` : '今天还没来感觉',
      body: alive ? '今晚来抽一签就能续上，别让连续天数断在这里' : '抽一支今日签，看看今天的运气',
    });
  }
  return list;
}

export function createReminder({ storage, notifier, streak, now = () => Date.now() } = {}) {
  const available = Boolean(notifier);
  const ids = Array.from({ length: REMIND_DAYS }, (_, i) => REMIND_ID_BASE + i);
  const enabled = () => available && storage?.get('reminder.on', false) === true;

  async function sync() {
    if (!enabled()) return [];
    const t = now();
    const raw = storage?.get('streak', null);
    const visitedToday = raw?.last === dayKey(t);
    const plan = planReminders({ now: t, visitedToday, days: streak?.days() || 0 });
    try {
      await notifier.cancel(ids);
      if (plan.length) await notifier.schedule(plan);
    } catch (e) {
      console.error('[reminder]', e);
    }
    return plan;
  }

  async function enable() {
    if (!available) return 'unavailable';
    let ok = false;
    try { ok = await notifier.requestPermission(); } catch { ok = false; }
    if (!ok) {
      storage?.set('reminder.on', false);
      return 'denied';
    }
    storage?.set('reminder.on', true);
    await sync();
    return 'on';
  }

  async function disable() {
    storage?.set('reminder.on', false);
    if (!available) return;
    try { await notifier.cancel(ids); } catch (e) { console.error('[reminder]', e); }
  }

  return { available, enabled, enable, disable, sync };
}
