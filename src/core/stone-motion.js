// A stone leaves the bag with momentum, falls under gravity, then loses energy
// at each cloth contact. The landing point is determined by its initial velocity.
export function stoneFlight(dx, dy, tilt = 0, duration = 2.1) {
  const step = 1 / 120, gravity = 920, initialHeight = 48, initialVelocity = 155, drag = 8;
  const firstHit = (initialVelocity + Math.sqrt(initialVelocity ** 2 + 2 * gravity * initialHeight)) / gravity;
  const travelTime = firstHit + 1 / drag;
  const samples = [], impacts = [];
  let height = initialHeight, velocity = initialVelocity, angle = tilt - 175, spin = 230, contact = false;
  for (let t = 0; t <= duration + step / 2; t += step) {
    const travel = (Math.min(t, firstHit) + (t > firstHit ? (1 - Math.exp(-drag * (t - firstHit))) / drag : 0)) / travelTime;
    samples.push({ offset: Math.min(1, t / duration), x: dx * (1 - travel), y: (dy + initialHeight) * (1 - travel) - height, height, angle });
    if (height > 0 || velocity > 0) {
      velocity -= gravity * step;
      height += velocity * step;
      if (height <= 0) {
        const strength = Math.min(1, Math.abs(velocity) / 340);
        height = 0;
        if (strength > .06) impacts.push({ time: Math.min(duration, t + step), strength });
        velocity = Math.abs(velocity) > 24 ? -velocity * .28 : 0;
        spin *= .52;
        contact = true;
      }
    }
    if (contact) spin += ((tilt - angle) * 68 - spin * 13) * step;
    angle += spin * step;
  }
  samples.push({ offset: 1, x: 0, y: 0, height: 0, angle: tilt });
  return { samples, impacts, duration };
}
