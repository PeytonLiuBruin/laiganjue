// 深度解读的免费额度：每个玩法每天免费 1 次，按本机日期（本地时区）重置。
// Pro 不受限；没有 Pro 时先用当天免费次数，再用单次购买的解读次数（purchases.useCredit）。
//
// createQuota({ storage, purchases, now, free }) →
//   left(feature)      今天这个玩法还剩几次免费
//   peek(feature)      → 'pro' | 'free' | 'credit' | null（不消耗，只看下一次会用哪种）
//   take(feature)      → 同上，并真正消耗一次；null 表示需要付费
//   isUnlocked(key)    这个结果（例如某一卦、某一签）是否已经解锁过，解锁过的反复打开不再计次
//   markUnlocked(key)  记下已解锁的结果，只保留最近 UNLOCK_KEEP 个
export const FREE_PER_DAY = 1;
export const UNLOCK_KEEP = 60;

/** 本地日期键：2026-10-22。 */
export function dayKey(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function createQuota({ storage, purchases, now = () => Date.now(), free = FREE_PER_DAY } = {}) {
  function load() {
    const today = dayKey(now());
    const saved = storage?.get('quota.day', null);
    return saved && saved.day === today ? saved : { day: today, used: {} };
  }
  const left = (feature) => Math.max(0, free - (Number(load().used[feature]) || 0));
  function peek(feature) {
    if (purchases?.pro) return 'pro';
    if (left(feature) > 0) return 'free';
    if ((purchases?.credits || 0) > 0) return 'credit';
    return null;
  }
  function take(feature) {
    const kind = peek(feature);
    if (kind === 'free') {
      const s = load();
      s.used[feature] = (Number(s.used[feature]) || 0) + 1;
      storage?.set('quota.day', s);
    } else if (kind === 'credit' && !purchases.useCredit()) return null;
    return kind;
  }
  const unlockedList = () => {
    const v = storage?.get('quota.unlocked', []);
    return Array.isArray(v) ? v : [];
  };
  const isUnlocked = (key) => !!key && unlockedList().includes(String(key));
  function markUnlocked(key) {
    if (!key) return;
    const k = String(key);
    const list = unlockedList().filter((x) => x !== k);
    list.push(k);
    storage?.set('quota.unlocked', list.slice(-UNLOCK_KEEP));
  }
  return { left, peek, take, free, isUnlocked, markUnlocked };
}
