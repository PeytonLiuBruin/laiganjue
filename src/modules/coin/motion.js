// Coin motion in scene coordinates. The remaining spin is spent on the floor,
// so the selected face becomes readable only as the rolling motion dies away.
export const COIN_IMPACTS = [0.4, 0.55, 0.68, 0.84];
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
    rx: t < 0.4 ? start + (target - 240 - start) * flight : target - 240 * decay + rocking * 32,
    ry: t < 0.4 ? Math.sin(flight * Math.PI) * 14 : rocking * 18,
    rz: wobble * (1 - flight) + endWobble * flight + rocking * 12,
    shadowScale: 1 - lift / Math.max(1, height) * 0.42,
    shadowOpacity: 0.52 - lift / Math.max(1, height) * 0.35,
  };
}
