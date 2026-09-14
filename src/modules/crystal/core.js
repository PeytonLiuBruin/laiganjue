// 水晶球 · 纯逻辑（无 DOM）。可被 node --test 直接测试，也可原样搬到小程序。
// 两部分：
//   1. 水晶球：三种答案池的抽取 / 权重 / 池校验 / 充能进度 / 连问彩蛋
//   2. 灵摆：结果预抽（45/40/15）+ 简易二维单摆 pendulumStep（纯函数，数值稳定）
//      + 让摆逐渐收敛为「前后摆 / 左右摆 / 画圈」三种模式的隐藏偏置力 convergenceBias
//      + 由轨迹样本反推模式的 classifySwing（用于测试与判定校验）
import { random, pick, weightedPick } from '../../core/rng.js';
import { YESNO, ORACLE, WORDS, REPEAT_EGG, REPHRASE } from './data.js';

/* ============================== 水晶球 ============================== */

export const MODE = { YESNO: 'yesno', ORACLE: 'oracle', WORD: 'word' };
export const TONE = { YES: 'yes', MAYBE: 'maybe', NO: 'no' };

/** 是非题三种语气的总权重：肯定 5 / 中立 3 / 否定 2 */
export const TONE_WEIGHT = { yes: 5, maybe: 3, no: 2 };

/** 每条是非题答案的权重 = 该语气总权重 / 该语气条数，使三组之和恰为 5:3:2 */
export function toneWeights(items = YESNO) {
  const count = {};
  for (const it of items) count[it.tone] = (count[it.tone] || 0) + 1;
  return items.map((it) => (TONE_WEIGHT[it.tone] || 0) / (count[it.tone] || 1));
}

/**
 * 抽一个答案。
 * mode: 'yesno' | 'oracle' | 'word'；rnd 可注入；opts.repeat = 同一问题连续第几次问（≥3 触发彩蛋）
 * 返回统一结构 { mode, text, note, tone?, egg? }（text 为球内展示的主文字）
 */
export function pickAnswer(mode, rnd = random, { repeat = 0 } = {}) {
  if (repeat >= 3) return { mode, text: REPEAT_EGG.text, note: REPEAT_EGG.note, tone: TONE.MAYBE, egg: true };
  if (mode === MODE.ORACLE) {
    const it = pick(ORACLE, rnd);
    return { mode, text: it.text, note: it.note };
  }
  if (mode === MODE.WORD) {
    const it = pick(WORDS, rnd);
    return { mode, text: it.char, note: it.note };
  }
  const ws = toneWeights(YESNO);
  const it = weightedPick(YESNO, (x) => ws[YESNO.indexOf(x)], rnd);
  return { mode: MODE.YESNO, text: it.text, note: it.note, tone: it.tone };
}

/** 「换个问法」建议：按语气 / 模式取一条 */
export function pickRephrase(answer, rnd = random) {
  const key = answer.mode === MODE.YESNO ? answer.tone : answer.mode;
  return pick(REPHRASE[key] || REPHRASE.maybe, rnd);
}

/** 校验答案池：条数、语气分布、重复、长度区间。返回 { ok, errors[] } */
export function validatePools() {
  const errors = [];
  if (YESNO.length !== 20) errors.push(`是非题应为 20 条，实际 ${YESNO.length}`);
  const tc = { yes: 0, maybe: 0, no: 0 };
  for (const it of YESNO) tc[it.tone] = (tc[it.tone] || 0) + 1;
  if (tc.yes !== 10 || tc.maybe !== 5 || tc.no !== 5) errors.push(`是非题语气应为 10/5/5，实际 ${tc.yes}/${tc.maybe}/${tc.no}`);
  if (ORACLE.length < 60) errors.push(`神谕应 ≥ 60 句，实际 ${ORACLE.length}`);
  if (WORDS.length < 40) errors.push(`一字应 ≥ 40 个，实际 ${WORDS.length}`);
  const dup = (arr, key, name) => {
    const seen = new Set();
    for (const it of arr) {
      const k = it[key];
      if (seen.has(k)) errors.push(`${name}重复：${k}`);
      seen.add(k);
    }
  };
  dup(YESNO, 'text', '是非题');
  dup(ORACLE, 'text', '神谕');
  dup(WORDS, 'char', '一字');
  for (const it of ORACLE) {
    const n = [...it.text].length;
    if (n < 12 || n > 24) errors.push(`神谕长度应在 12–24 字：「${it.text}」(${n})`);
    const m = [...it.note].length;
    if (m < 20 || m > 40) errors.push(`神谕注解应在 20–40 字：「${it.text}」(${m})`);
  }
  for (const it of WORDS) {
    if ([...it.char].length !== 1) errors.push(`一字应为单字：${it.char}`);
    const m = [...it.note].length;
    if (m < 30 || m > 50) errors.push(`一字解应在 30–50 字：「${it.char}」(${m})`);
  }
  return { ok: errors.length === 0, errors };
}

/** 充能进度：夹在 [0,1] */
export function chargeStep(progress, delta) {
  const p = (Number(progress) || 0) + (Number(delta) || 0);
  return Math.max(0, Math.min(1, p));
}

/** 摩擦一次带来的进度增量（intensity 0–1） */
export const RUB_GAIN = 0.09;
/** 摇一摇一次的进度增量 */
export const SHAKE_GAIN = 0.35;

/** 规范化问题文本，用于判断"同一问题连问" */
export function normalizeQuestion(q) {
  return String(q || '')
    .trim()
    .replace(/[\s?？。！!，,、；;：:]/g, '')
    .toLowerCase();
}

/**
 * 连问计数归约：state = { last, count }；返回新 state。
 * 问题为空不计数；与上次相同则 count+1，否则重置为 1。
 */
export function reduceRepeat(state, question) {
  const q = normalizeQuestion(question);
  if (!q) return { last: '', count: 0 };
  if (state && state.last === q) return { last: q, count: (state.count || 0) + 1 };
  return { last: q, count: 1 };
}

/* ============================== 灵摆 ============================== */

export const PENDULUM = { YES: 'yes', NO: 'no', UNCLEAR: 'unclear' };
export const PENDULUM_WEIGHT = { yes: 45, no: 40, unclear: 15 };

/** 先抽结果，再让动画朝该模式收敛 */
export function decidePendulum(rnd = random) {
  const keys = Object.keys(PENDULUM_WEIGHT);
  return weightedPick(keys, (k) => PENDULUM_WEIGHT[k], rnd);
}

/**
 * 单摆参数（归一化单位：位移 1 = 摆盘半径）
 * k 刚度(=ω²)，damping 阻尼，maxR 位移硬上限，maxDt 单步时间上限，amp 收敛目标振幅
 */
export const PENDULUM_PARAMS = { k: 14, damping: 0.55, maxR: 1.4, maxDt: 1 / 30, amp: 0.55 };

export function initPendulum() {
  return { x: 0, y: 0, vx: 0, vy: 0, t: 0 };
}

const fin = (v) => (Number.isFinite(v) ? v : 0);

/**
 * 推进一步（半隐式欧拉，纯函数）。
 * state {x,y,vx,vy,t}，dt 秒，bias {x,y} 外力（倾斜 / 拖拽 / 隐藏偏置之和）。
 * 位移与速度都有硬上限，任意输入下不会发散。
 */
export function pendulumStep(state, dt, bias = null, p = PENDULUM_PARAMS) {
  const h = Math.min(p.maxDt, Math.max(0, fin(dt)));
  const sx = fin(state.x);
  const sy = fin(state.y);
  if (h === 0) return { x: sx, y: sy, vx: fin(state.vx), vy: fin(state.vy), t: fin(state.t) };
  const bx = bias ? fin(bias.x) : 0;
  const by = bias ? fin(bias.y) : 0;
  let vx = fin(state.vx) + (-p.k * sx - p.damping * fin(state.vx) + bx) * h;
  let vy = fin(state.vy) + (-p.k * sy - p.damping * fin(state.vy) + by) * h;
  const vmax = p.maxR * Math.sqrt(p.k) * 2;
  const v = Math.hypot(vx, vy);
  if (v > vmax) {
    vx *= vmax / v;
    vy *= vmax / v;
  }
  let x = sx + vx * h;
  let y = sy + vy * h;
  const r = Math.hypot(x, y);
  if (r > p.maxR) {
    x *= p.maxR / r;
    y *= p.maxR / r;
    vx *= 0.5;
    vy *= 0.5;
  }
  return { x, y, vx, vy, t: fin(state.t) + h };
}

/** 角动量（x·vy − y·vx）：直线摆 ≈ 0，画圈 ≈ ±A²ω */
export function angularMomentum(s) {
  return s.x * s.vy - s.y * s.vx;
}

/**
 * 隐藏偏置力：让摆逐渐收敛到 target 模式。
 * yes = 前后摆（y 轴），no = 左右摆（x 轴），unclear = 画圈。
 * strength 0–1 用于慢慢"接管"（前 1 秒让用户的动作先自然发挥）。
 */
export function convergenceBias(s, target, strength = 1, p = PENDULUM_PARAMS) {
  const g = Math.max(0, Math.min(1, fin(strength)));
  if (g === 0) return { x: 0, y: 0 };
  const w = Math.sqrt(p.k);
  const A = p.amp;
  const L = angularMomentum(s);
  let fx = 0;
  let fy = 0;
  if (target === PENDULUM.UNCLEAR) {
    // 切向力把角动量推到圆周运动的值；径向能量泵把振幅推到 A
    const Lt = A * A * w;
    const c = 6 * g * (Lt - L);
    fx += c * -s.y;
    fy += c * s.x;
    const E = s.vx * s.vx + s.vy * s.vy + p.k * (s.x * s.x + s.y * s.y);
    const At = Math.sqrt(E) / w;
    const pump = 3 * g * (A - At);
    fx += pump * s.vx;
    fy += pump * s.vy;
  } else {
    const alongY = target === PENDULUM.YES;
    const u = alongY ? s.y : s.x;
    const vu = alongY ? s.vy : s.vx;
    const vo = alongY ? s.vx : s.vy;
    const Au = Math.sqrt(u * u + (vu * vu) / p.k);
    const pump = 7 * g * (A - Au) * vu; // 主轴：不足则泵入能量，过大则压
    const kill = -3.5 * g * vo; // 副轴：额外阻尼
    const c = -4 * g * L; // 消除旋转
    const rx = c * -s.y;
    const ry = c * s.x;
    if (alongY) {
      fx += kill + rx;
      fy += pump + ry;
    } else {
      fx += pump + rx;
      fy += kill + ry;
    }
  }
  return { x: fx, y: fy };
}

/**
 * 由一段轨迹样本判断摆动模式：
 * 圆度 = |平均角动量| / (ω · 平均 r²)，圆 ≈ 1，直线 ≈ 0；圆度 > 0.6 判为画圈，否则看哪个轴的方差大。
 */
export function classifySwing(samples, p = PENDULUM_PARAMS) {
  if (!samples || !samples.length) return PENDULUM.UNCLEAR;
  const w = Math.sqrt(p.k);
  let sxx = 0;
  let syy = 0;
  let sL = 0;
  let sr2 = 0;
  for (const s of samples) {
    sxx += s.x * s.x;
    syy += s.y * s.y;
    sL += angularMomentum(s);
    sr2 += s.x * s.x + s.y * s.y;
  }
  if (sr2 < 1e-6) return PENDULUM.UNCLEAR;
  const circ = Math.abs(sL) / (w * sr2);
  if (circ > 0.6) return PENDULUM.UNCLEAR;
  return syy >= sxx ? PENDULUM.YES : PENDULUM.NO;
}

/**
 * 一次完整的"问"：从初速度开始，加入随机扰动与逐渐增强的收敛偏置，模拟 duration 秒。
 * 返回 { final, samples(最后 1 秒), decided: classifySwing(...) }。供测试与无 DOM 场景使用。
 */
export function simulateAsk(target, rnd = random, { duration = 4.5, dt = 1 / 60, kick = 1.6, noise = 0.35, p = PENDULUM_PARAMS } = {}) {
  const ang = rnd() * Math.PI * 2;
  let s = { x: 0, y: 0, vx: Math.cos(ang) * kick, vy: Math.sin(ang) * kick, t: 0 };
  const samples = [];
  const steps = Math.round(duration / dt);
  for (let i = 0; i < steps; i++) {
    const t = i * dt;
    const ramp = Math.max(0, Math.min(1, (t - 0.6) / 1.4));
    const cb = convergenceBias(s, target, ramp, p);
    const fade = 1 - t / duration;
    const bias = { x: cb.x + (rnd() - 0.5) * 2 * noise * fade, y: cb.y + (rnd() - 0.5) * 2 * noise * fade };
    s = pendulumStep(s, dt, bias, p);
    if (t > duration - 1) samples.push(s);
  }
  return { final: s, samples, decided: classifySwing(samples, p) };
}

/** 摆盘上应发光的标签：yes → 上下「是」，no → 左右「否」，unclear → 圆周「不明」 */
export function pendulumLabel(result) {
  return result === PENDULUM.YES ? '是' : result === PENDULUM.NO ? '否' : '不明';
}
