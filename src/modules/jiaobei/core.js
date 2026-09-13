// 筊杯 · 纯逻辑（无 DOM）。可直接搬到小程序。
// 一枚筊杯有两面：flat(平面/阳) 与 round(凸面/阴)。
// 两枚组合：一平一凸=圣杯(允)，两平=笑杯(笑)，两凸=阴杯(否)。极小概率"立筊"。
import { random, chance } from '../../core/rng.js';

export const FACE = { FLAT: 'flat', ROUND: 'round' };
export const OUTCOME = { SHENG: 'sheng', XIAO: 'xiao', YIN: 'yin', LI: 'li' };

/** 掷一次。rnd 可注入以便测试。standChance 立筊概率 */
export function throwJiaobei(rnd = random, { standChance = 1 / 300 } = {}) {
  if (chance(standChance, rnd)) {
    const other = rnd() < 0.5 ? FACE.FLAT : FACE.ROUND;
    return { a: 'stand', b: other, outcome: OUTCOME.LI };
  }
  const a = rnd() < 0.5 ? FACE.FLAT : FACE.ROUND;
  const b = rnd() < 0.5 ? FACE.FLAT : FACE.ROUND;
  return { a, b, outcome: judge(a, b) };
}

/** 由两面判定结果 */
export function judge(a, b) {
  if (a === 'stand' || b === 'stand') return OUTCOME.LI;
  if (a !== b) return OUTCOME.SHENG;
  return a === FACE.FLAT ? OUTCOME.XIAO : OUTCOME.YIN;
}

/**
 * 连掷三圣杯 会话归约：
 * state = { throws: [], done: false, success: false }
 * 规则：连续三次圣杯 → 成功；出现阴杯 → 失败（结束）；笑杯 → 计数清零，继续。
 */
export function initSession() {
  return { throws: [], streak: 0, done: false, success: false };
}

export function reduceSession(state, result) {
  if (state.done) return state;
  const throws = state.throws.concat([result]);
  if (result.outcome === OUTCOME.LI) return { throws, streak: 3, done: true, success: true, miracle: true };
  if (result.outcome === OUTCOME.SHENG) {
    const streak = state.streak + 1;
    return { throws, streak, done: streak >= 3, success: streak >= 3 };
  }
  if (result.outcome === OUTCOME.YIN) return { throws, streak: 0, done: true, success: false };
  // 笑杯：从头再来
  return { throws, streak: 0, done: false, success: false };
}

/** 统计一组投掷 */
export function tally(throws) {
  const t = { sheng: 0, xiao: 0, yin: 0, li: 0 };
  for (const r of throws) t[r.outcome]++;
  return t;
}
