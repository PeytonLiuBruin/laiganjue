// 转盘 · 纯逻辑（无 DOM）。可直接搬到小程序。
//
// 角度约定（全文统一）：
//   - 转盘旋转角 angleDeg：顺时针为正（与 CSS rotate() 一致），可为任意实数（累计角，不取模）。
//   - 指针固定在顶部 12 点方向。
//   - 扇区在"转盘自身坐标"里等分：扇区 i 的中心在 i * step（从顶部顺时针量），
//     扇区 0 覆盖 [-half, +half)，扇区 1 覆盖 [half, 3*half)，依此类推（左闭右开）。
//   - 转盘顺时针转过 θ 后，指针所指的"转盘自身角" = (-θ) mod 360。
import { random } from '../../core/rng.js';

export const TAU = Math.PI * 2;
export const DEG = 180 / Math.PI;

/** 把任意角度归一到 [0, 360) */
export function normalizeDeg(a) {
  const r = a % 360;
  return r < 0 ? r + 360 : r === 0 ? 0 : r;
}

/**
 * 指针所指的扇区下标。
 * @param {number} angleDeg 转盘当前旋转角（顺时针正，任意实数）
 * @param {number} n 扇区数（≥1）
 */
export function segmentAt(angleDeg, n) {
  if (!Number.isFinite(angleDeg) || !Number.isInteger(n) || n < 1) return 0;
  if (n === 1) return 0;
  const step = 360 / n;
  const half = step / 2;
  const local = normalizeDeg(-angleDeg); // 指针下方的转盘自身角
  // 处理浮点误差：贴着边界 1e-9 以内按边界算
  const idx = Math.floor((local + half + 1e-9) / step);
  return ((idx % n) + n) % n;
}

/**
 * 反向：给出让扇区 i 停在指针下的旋转角（[0,360)），offset01 ∈ [0,1) 控制落在扇区内的位置（0.5 = 正中）。
 * 为避免正好压线，实际只用扇区宽度的中间 84%。
 */
export function angleForSegment(i, n, offset01 = 0.5) {
  if (!Number.isInteger(n) || n < 1) return 0;
  const step = 360 / n;
  const o = Math.min(0.9999, Math.max(0, offset01));
  const within = (o - 0.5) * 0.84 * step; // -0.42 step .. +0.42 step
  const local = i * step + within;
  return normalizeDeg(-local);
}

/** 扇区边界（转盘自身角，度），共 n 条：half, half+step, … */
export function boundaries(n) {
  const step = 360 / n;
  const out = [];
  for (let k = 0; k < n; k++) out.push(normalizeDeg(step / 2 + k * step));
  return out;
}

/**
 * 从旋转角 a0 到 a1（连续变化），指针跨过了多少条扇区边界。
 * 用累计角做 floor 差值，天然支持跨多圈与反向。
 */
export function boundaryCrossings(a0, a1, n) {
  if (!Number.isInteger(n) || n < 2) return 0;
  const step = 360 / n;
  const half = step / 2;
  const f = (a) => Math.floor((-a + half) / step);
  return Math.abs(f(a1) - f(a0));
}

/* ------------------------------ 旋转物理 ------------------------------ */
/**
 * 摩擦模型：ω' = -(k·ω + c)。k 是粘滞摩擦（越大越快"泄力"），c 是恒定摩擦（保证最终真的停下，不会无限拖尾）。
 * 闭式解：
 *   ω(t) = (ω0 + c/k)·e^{-kt} − c/k
 *   T    = ln(1 + ω0·k/c) / k                      （ω 降到 0 的时刻）
 *   θ(t) = (ω0 + c/k)(1 − e^{-kt})/k − c·t/k
 *   θ(T) = (ω0 − c·T)/k
 * ω 单位 rad/s，t 单位秒；返回值统一换成 度 / 毫秒 方便 UI。
 */
export const DEFAULT_FRICTION = { k: 1.0, c: 0.5 };

function normFriction(friction) {
  if (typeof friction === 'number' && friction > 0) return { k: friction, c: DEFAULT_FRICTION.c };
  if (friction && typeof friction === 'object') {
    const k = Number(friction.k) > 0 ? Number(friction.k) : DEFAULT_FRICTION.k;
    const c = Number(friction.c) > 0 ? Number(friction.c) : DEFAULT_FRICTION.c;
    return { k, c };
  }
  return { ...DEFAULT_FRICTION };
}

/**
 * 纯函数：给定初角速度 omega0(rad/s, 可负=逆时针) 与摩擦，返回
 * { angle: 总旋转角(度, 带符号), duration: 时长(ms), turns: 圈数, angleAt(tMs), omegaAt(tMs) }
 */
export function simulateSpin(omega0, friction = DEFAULT_FRICTION) {
  const { k, c } = normFriction(friction);
  const w0 = Number(omega0) || 0;
  const sign = w0 < 0 ? -1 : 1;
  const w = Math.abs(w0);
  if (w < 1e-6) {
    return { angle: 0, duration: 0, turns: 0, k, c, angleAt: () => 0, omegaAt: () => 0 };
  }
  const T = Math.log(1 + (w * k) / c) / k; // 秒
  const A = w + c / k;
  const thetaAt = (t) => {
    // t 秒 → 弧度
    if (t <= 0) return 0;
    if (t >= T) return (w - c * T) / k;
    return (A * (1 - Math.exp(-k * t))) / k - (c * t) / k;
  };
  const omegaAtSec = (t) => {
    if (t <= 0) return w;
    if (t >= T) return 0;
    return A * Math.exp(-k * t) - c / k;
  };
  const totalRad = thetaAt(T);
  return {
    angle: sign * totalRad * DEG,
    duration: Math.round(T * 1000),
    turns: (totalRad * DEG) / 360,
    k,
    c,
    /** t 毫秒时已转过的角度（度，带符号） */
    angleAt: (tMs) => sign * thetaAt(tMs / 1000) * DEG,
    /** t 毫秒时的角速度（rad/s，带符号） */
    omegaAt: (tMs) => sign * omegaAtSec(tMs / 1000),
  };
}

/** 摇晃强度(m/s²，约 13–40) → 初角速度(rad/s)。rnd 注入以便测试。 */
export function omegaFromIntensity(intensity, rnd = random) {
  const x = Number(intensity);
  const i = Number.isFinite(x) ? Math.max(13, Math.min(40, x)) : 22;
  const base = 15 + (i - 13) * 0.42; // 15 … 26.3
  const jitter = 0.92 + rnd() * 0.16; // ±8%
  return base * jitter;
}

/** 按钮"转一下"的随机初速 */
export function randomOmega(rnd = random) {
  return 17 + rnd() * 8; // 17 … 25 rad/s
}

/**
 * 手指松开时的角速度处理：
 *  - |ω| < deadzone：视为没甩（只是拖了一下），返回 null
 *  - |ω| < min：太轻，补到 [min, min+3]，boosted=true（UI 提示"加点力"）
 *  - 否则乘上一点顺手的增益，并限幅
 */
export function normalizeFlick(omega, rnd = random, { deadzone = 0.8, min = 6, gain = 1.35, max = 40 } = {}) {
  const w = Number(omega) || 0;
  const a = Math.abs(w);
  if (a < deadzone) return null;
  const sign = w < 0 ? -1 : 1;
  if (a < min) return { omega: sign * (min + rnd() * 3), boosted: true };
  return { omega: sign * Math.min(max, a * gain), boosted: false };
}

/* ------------------------------ 扇区文字排版 ------------------------------ */
/**
 * 文字沿半径排（每字直立、从外向内叠放）。radial 是可用径向长度（viewBox 单位）。
 * 返回 { text, fontSize, truncated }。
 */
export function fitLabel(label, { radial = 112, maxFont = 28, minFont = 13, gap = 1.08, bigFont = 34 } = {}) {
  const raw = String(label ?? '').trim();
  const chars = Array.from(raw);
  if (!chars.length) return { text: '', fontSize: maxFont, truncated: false };
  const cap = chars.length <= 2 ? bigFont : maxFont;
  let fs = Math.min(cap, radial / (chars.length * gap));
  if (fs >= minFont) return { text: raw, fontSize: round1(fs), truncated: false };
  // 缩不下去了：截断 + 省略号
  const maxChars = Math.max(1, Math.floor(radial / (minFont * gap)));
  const kept = chars.slice(0, Math.max(1, maxChars - 1)).join('') + '…';
  fs = Math.min(cap, radial / (Array.from(kept).length * gap));
  return { text: kept, fontSize: round1(Math.max(minFont, fs)), truncated: true };
}
const round1 = (x) => Math.round(x * 10) / 10;

/**
 * 给 n 个扇区分配调色板下标（0..len-1），保证相邻（含首尾）不同色。
 * len ≥ 3 时对任意 n ≥ 2 都成立；n=1 返回 [0]。
 */
export function paletteFor(n, len = 4) {
  if (!Number.isInteger(n) || n < 1) return [];
  const L = Math.max(2, len | 0);
  const out = [];
  for (let i = 0; i < n; i++) out.push(i % L);
  if (n >= 3 && out[n - 1] === out[0]) {
    const prev = out[n - 2];
    for (let c = 0; c < L; c++) {
      if (c !== out[0] && c !== prev) {
        out[n - 1] = c;
        break;
      }
    }
  }
  return out;
}

/* ------------------------------ 自定义解析 ------------------------------ */
export const CUSTOM_MIN = 2;
export const CUSTOM_MAX = 16;
export const CUSTOM_ITEM_MAX = 12;

/**
 * 自定义文本 → 候选数组：按行切分；若只有一行则再按 、，,/｜| 切分。
 * 去首尾空白、去空行、去重（保留首次出现）、每项最多 12 字（超出截断）、最多 16 项。
 */
export function parsePreset(text) {
  let lines = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (lines.length === 1 && /[、，,/｜|]/.test(lines[0])) {
    lines = lines[0]
      .split(/[、，,/｜|]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const seen = new Set();
  const out = [];
  for (const raw of lines) {
    const s = Array.from(raw).slice(0, CUSTOM_ITEM_MAX).join('');
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= CUSTOM_MAX) break;
  }
  return out;
}

/** 自定义是否可转 */
export function isSpinnable(items) {
  return Array.isArray(items) && items.length >= CUSTOM_MIN;
}

/* ------------------------------ 候选 / 历史 ------------------------------ */
/** 过滤掉被"去掉"的项（按 label 匹配） */
export function remaining(items, removed) {
  const set = removed instanceof Set ? removed : new Set(removed || []);
  return items.filter((it) => !set.has(typeof it === 'string' ? it : it.label));
}

/** 追加历史并截断到 max 条（最新在后） */
export function pushHistory(list, label, max = 8) {
  return (Array.isArray(list) ? list : []).concat([label]).slice(-max);
}

/** 最近 k 次是否同一结果（"三连"彩蛋） */
export function streakOf(list, label) {
  if (!Array.isArray(list)) return 0;
  let n = 0;
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i] !== label) break;
    n++;
  }
  return n;
}
