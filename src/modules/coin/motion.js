// Coin motion in scene coordinates. The remaining spin is spent on the floor,
// so the selected face becomes readable only as the rolling motion dies away.
import { motionCurve } from '../../core/motion.js';

export const COIN_IMPACTS = [0.4, 0.55, 0.68, 0.94];
export const COIN_SETTLING = 0.7;
export function coinPose(t, { start = 0, target = 1440, height = 105, wobble = 0, endWobble = 0, drift = 20 } = {}) {
  t = Math.max(0, Math.min(1, t));
  const flight = Math.min(t / COIN_IMPACTS[0], 1);
  const roll = Math.max(0, (t - COIN_IMPACTS[0]) / (1 - COIN_IMPACTS[0]));
  const decay = (1 - roll) ** 2;
  const hop = t < 0.55 ? [(t - 0.4) / 0.15, 0.15] : t < 0.68 ? [(t - 0.55) / 0.13, 0.04] : [0, 0];
  const lift = t < 0.4 ? 4 * height * flight * (1 - flight) : 4 * height * hop[1] * hop[0] * (1 - hop[0]);
  const rocking = Math.sin(roll * Math.PI * 8) * decay;
  return {
    x: t < 0.4 ? drift * flight : drift * decay,
    y: -lift,
    rx: t < 0.4 ? start + (target - 300 - start) * flight : target + motionCurve(t, [[0.4, -300], [0.55, -155], [0.7, -62], [0.82, -54], [0.94, 8], [1, 0]]),
    ry: t < 0.4 ? Math.sin(flight * Math.PI) * 14 : rocking * 18,
    rz: wobble * (1 - flight) + endWobble * flight + rocking * 12,
    shadowScale: 1 - lift / Math.max(1, height) * 0.42,
    shadowOpacity: 0.52 - lift / Math.max(1, height) * 0.35,
  };
}

export const DICE_IMPACTS = [0.34, 0.52, 0.67, 0.92, 0.98];
export const DICE_SETTLING = 0.72;

// The last face starts on an edge, hesitates there, tips, then rocks once. The
// cube's support height is derived from its rotation, keeping corners above the
// tray even while the final number is still undecided visually.
export function dicePose(t, { start = { rx: 0, ry: 0 }, target = { rx: 1440, ry: 1080 }, power = 1, half = 26, driftX = 28, driftY = -20, startZ = 0, endZ = 16 } = {}) {
  t = Math.max(0, Math.min(1, t));
  const signX = Math.sign(target.rx - start.rx) || 1, signY = Math.sign(target.ry - start.ry) || 1;
  const rx = motionCurve(t, [[0, start.rx], [.34, target.rx - signX * 270], [.52, target.rx - signX * 140], [.72, target.rx - signX * 45], [.83, target.rx - signX * 40], [.92, target.rx], [.96, target.rx + signX * 6], [.98, target.rx - signX * 2], [1, target.rx]]);
  const ry = motionCurve(t, [[0, start.ry], [.34, target.ry - signY * 180], [.52, target.ry - signY * 65], [.72, target.ry], [1, target.ry]]);
  const hops = [[0, .34, 80 + power * 18], [.34, .52, 22 * power], [.52, .67, 7 * power]];
  const hop = hops.find(([a, b]) => t >= a && t <= b);
  const u = hop ? (t - hop[0]) / (hop[1] - hop[0]) : 0;
  const lift = hop ? 4 * hop[2] * u * (1 - u) : 0;
  const x = rx * Math.PI / 180, y = ry * Math.PI / 180;
  const support = half * (Math.abs(Math.cos(x) * Math.sin(y)) + Math.abs(Math.sin(x)) + Math.abs(Math.cos(x) * Math.cos(y)));
  const drift = motionCurve(t, [[0, 0], [.2, 1], [.34, .7], [.52, .32], [.72, .1], [1, 0]]);
  return { rx, ry, rz: motionCurve(t, [[0, startZ], [.72, endZ - 5], [1, endZ]]), x: driftX * drift, y: driftY * drift, z: support + lift, shadowScale: 1 - lift / 180, shadowOpacity: .55 - lift / 280 };
}
