import { springRotation, rotationError } from '../../core/throw-physics.js';
import { axisAngle, multiply, faceUp, unit } from '../../core/solids.js';

export const DICE_WAKE = 5.5;
const KEEP_MOVING = 2.8, QUIET_MS = 320;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// A live input session has no playback deadline. Every sample supplies force;
// only a quiet interval starts the final roll, which new motion can interrupt.
export function createDiceShake(objects, { now = 0, chooseValues, duration = 1300 } = {}) {
  const bodies = objects.map((o, i) => ({
    o, homeX: o.homeX ?? o.x, homeY: o.homeY ?? o.y,
    vx: 0, vy: 0, vz: 0, w: [0, 0, 0], seed: i,
    radius: o.size * Math.max(...o.mesh.flatMap(f => f.points.map(p => Math.hypot(...p)))),
  }));
  let phase = 'shaking', last = now, lastActive = now, inputAt = now;
  let input = [0, 0, 0], direction = null, lastKick = -Infinity, held = false;
  let settlingAt = null, release = [], values = null, lastContact = -Infinity;

  function feed({ ax = 0, ay = 0, az = 0, t = last, holding = false } = {}) {
    if (![ax, ay, az, t].every(Number.isFinite) || phase === 'settled') return;
    input = [ax, ay, az].map(v => clamp(v, -30, 30)); inputAt = t; held = holding;
    const mag = Math.hypot(...input);
    if (mag > KEEP_MOVING) {
      lastActive = t;
      if (phase === 'settling') { phase = 'shaking'; settlingAt = null; values = null; }
    }
    if (mag >= DICE_WAKE) {
      const next = unit(input);
      const reversed = !direction || next.reduce((s, v, i) => s + v * direction[i], 0) < -.2;
      if (reversed && t - lastKick > 90) {
        bodies.forEach(b => { b.vz = Math.max(b.vz, (105 + mag * 3) * (1 + b.seed * .035)); });
        lastKick = t;
      }
      direction = next;
    }
  }

  function endInput(t = last) { held = false; input = [0, 0, 0]; inputAt = t; lastActive = t; }

  function advance(now) {
    const dt = clamp((now - last) / 1000, 0, .04); last = now;
    if (phase === 'settled') return { phase, values, impact: 0 };
    if (phase === 'shaking' && !held && now - lastActive >= QUIET_MS) {
      phase = 'settling'; settlingAt = now; values = chooseValues();
      release = bodies.map((b, i) => ({ q: [...b.o.q], w: [...b.w], target: faceUp(b.o.mesh, values[i]) }));
    }
    const freshness = clamp(1 - (now - inputAt - 60) / 100, 0, 1);
    const [ax, ay, az] = input.map(v => v * freshness);
    const mag = Math.hypot(ax, ay, az);
    const progress = phase === 'settling' ? clamp((now - settlingAt) / duration, 0, 1) : 0;
    let impact = 0;

    for (const b of bodies) {
      const o = b.o, driving = phase === 'shaking', force = driving ? 1 : 0;
      b.vx += (-ax * 48 * force - b.vx * 5 - (o.x - b.homeX) * 10 * force) * dt;
      b.vy += (ay * 32 * force - b.vy * 5 - (o.y - b.homeY) * 10 * force) * dt;
      o.x += b.vx * dt; o.y += b.vy * dt;
      const xLimit = 160 - b.radius;
      const bx = clamp(o.x, Math.max(-xLimit, b.homeX - 35), Math.min(xLimit, b.homeX + 35));
      const by = clamp(o.y, Math.max(-50, b.homeY - 22), Math.min(76, b.homeY + 22));
      if (bx !== o.x) { impact = Math.max(impact, Math.abs(b.vx) / 240); b.vx *= -.45; o.x = bx; }
      if (by !== o.y) { impact = Math.max(impact, Math.abs(b.vy) / 240); b.vy *= -.45; o.y = by; }
      b.vz -= 950 * dt; o.lift += b.vz * dt;
      if (o.lift < 0) {
        if (b.vz < -55) impact = Math.max(impact, -b.vz / 260);
        o.lift = 0; b.vz = Math.abs(b.vz) > 35 ? -b.vz * .3 : 0;
      }
      if (driving) {
        const sign = b.seed % 2 ? 1 : -1;
        const spin = [ay * .36 + mag * .38 * sign, -ax * .55 + az * .25, (ax + ay) * .18 * sign];
        const response = 1 - Math.exp(-(mag > KEEP_MOVING ? 9 : 2.5) * dt);
        b.w = b.w.map((v, i) => v + (spin[i] - v) * response);
        o.q = unit(multiply(axisAngle(b.w, Math.hypot(...b.w) * dt), o.q));
      } else {
        const next = springRotation(o.q, b.w, release[b.seed].target, dt, 85, 14);
        o.q = next.q; b.w = next.w;
      }
    }

    // Resolve contact between neighbouring dice without moving the whole tray.
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j], dx = b.o.x - a.o.x, dy = b.o.y - a.o.y;
      const distance = Math.hypot(dx, dy), minimum = (a.radius + b.radius) * .79;
      if (distance > .01 && distance < minimum) {
        const nx = dx / distance, ny = dy / distance, push = (minimum - distance) / 2;
        a.o.x -= nx * push; a.o.y -= ny * push; b.o.x += nx * push; b.o.y += ny * push;
        const speed = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (speed < 0) {
          a.vx += speed * .65 * nx; a.vy += speed * .65 * ny;
          b.vx -= speed * .65 * nx; b.vy -= speed * .65 * ny;
          impact = Math.max(impact, -speed / 220);
        }
      }
    }
    if (phase === 'settling' && progress >= 1 && bodies.every((b,i) => b.o.lift < .05 && rotationError(b.o.q, release[i].target).angle < .006)) {
      phase = 'settled'; bodies.forEach((b, i) => { b.o.q = release[i].target; b.o.lift = 0; });
    }
    if (impact < .15 || now - lastContact < 100) impact = 0;
    else lastContact = now;
    return { phase, values: phase === 'settled' ? values : null, impact: Math.min(1, impact) };
  }
  return { feed, endInput, advance, get phase() { return phase; } };
}
