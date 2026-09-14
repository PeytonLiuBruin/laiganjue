// Recognize a completed gesture, not repeated samples from one acceleration peak.
// A shake needs changes of direction; a toss needs an upward impulse. Both are
// released only after the hand settles, so the object does not leave mid-shake.
export function createMotionRecognizer() {
  let pulses = [], active = null, quietAt = null, lastAt = null, cooldown = -Infinity;
  const reset = () => { pulses = []; active = null; quietAt = null; lastAt = null; };
  function push({ ax = 0, ay = 0, az = 0, t }) {
    const mag = Math.hypot(ax, ay, az);
    if (![ax, ay, az, t, mag].every(Number.isFinite)) { reset(); return { phase: 'idle', progress: 0 }; }
    if (lastAt !== null && (t - lastAt > 300 || t < lastAt)) reset();
    lastAt = t;
    if (t < cooldown) return { phase: 'idle', progress: 0 };
    pulses = pulses.filter((p) => t - p.t < 1400);
    if (mag >= 11) {
      quietAt = null;
      const direction = [ax / mag, ay / mag, az / mag];
      const opposite = active && direction.reduce((s, v, i) => s + v * active.direction[i], 0) < -0.35;
      if (!active || (opposite && t - active.t >= 80)) {
        active = { t, mag, direction, vec: { x: ax, y: ay, z: az } };
        pulses.push(active);
      } else if (mag > active.mag) {
        Object.assign(active, { mag, direction, vec: { x: ax, y: ay, z: az } });
      }
    } else if (mag < 4) {
      active = null;
      quietAt ??= t;
    } else quietAt = null;

    let reversals = 0;
    for (let i = 1; i < pulses.length; i++) {
      if (pulses[i].direction.reduce((s, v, j) => s + v * pulses[i - 1].direction[j], 0) < -0.35) reversals++;
    }
    const upward = pulses.find((p) => p.mag >= 12 && p.direction[1] > 0.6);
    const kind = reversals >= 2 ? 'shake' : upward && pulses.length <= 2 ? 'toss' : null;
    const progress = kind ? 1 : Math.min(0.85, reversals / 2 + (pulses.length ? 0.2 : 0));
    if (quietAt !== null && t - quietAt >= 220) {
      const event = kind ? {
        type: kind, source: 'sensor', count: pulses.length,
        intensity: Math.min(40, pulses.reduce((s, p) => s + p.mag, 0) / pulses.length),
        vec: (upward || pulses[0]).vec,
      } : null;
      reset();
      if (event) cooldown = t + 900;
      return { phase: 'idle', progress: 0, event };
    }
    return { phase: kind ? 'ready' : pulses.length ? 'charging' : 'idle', progress, kind };
  }
  return { push, reset };
}
