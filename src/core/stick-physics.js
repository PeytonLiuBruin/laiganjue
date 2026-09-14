// A small fixed-step simulation. Y is up. The tube is a driven spring; each
// stick retains its velocity inside it. Once clear of the rim/hole the SAME
// stick becomes a free, length-constrained rod with two table contacts.
export const STICK_STEP = 1 / 120;
export const STICK_FLOOR = -122;
const G = 700;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const noise = n => Math.sin(n * 127.1 + 311.7) * .5 + .5;
const point = (tube, x, y) => [tube.x + x * Math.cos(tube.r) - y * Math.sin(tube.r), tube.y + x * Math.sin(tube.r) + y * Math.cos(tube.r)];

export function createStickPhysics({ kind = 'qian', seed = 1 } = {}) {
  const closed = kind === 'omikuji', half = closed ? 70 : 56;
  const tube = { x: -38, y: STICK_FLOOR + half + 4, r: 0, vx: 0, vy: 0, w: 0 };
  const home = { x: tube.x, y: tube.y };
  const bodies = Array.from({ length: closed ? 21 : 23 }, (_, i) => ({
    id: i, x: (i % 7 - 3) * 8.8, z: (Math.floor(i / 7) - 1) * 10,
    length: closed ? 119 : 133 + noise(i + seed) * 9,
    u: 0, vu: 0, r: (noise(i * 3 + seed) - .5) * .10, w: 0,
    free: false, ends: null,
  }));
  // A rear centre stick fits the Japanese outlet; it remains occluded until
  // its tip passes through the hole, not a second element revealed by CSS.
  const chosen = bodies[closed ? 10 : 12];
  if (closed) { chosen.x = 0; chosen.z = 0; chosen.r = 0; }
  let phase = 'idle', time = 0, accumulator = 0, input = { ax: 0, ay: 0, at: -10 };
  let live = false, automatic = false, started = 0, lastActive = 0, preparation = 0, quiet = 0, releasedAt = 0;
  let contacts = [], settled = 0, strength = 1;
  const impact = (speed, source = 'bundle') => { if (speed > 28) contacts.push({ speed, source }); };

  function feed({ ax = 0, ay = 0, az = 0 } = {}) {
    if (![ax, ay, az].every(Number.isFinite)) return;
    input = { ax: clamp(ax, -24, 24), ay: clamp(ay + az * .35, -24, 24), at: time };
    if (Math.hypot(ax, ay, az) > 3) {
      lastActive = time;
      if (phase === 'preparing' && live) { phase = 'shaking'; preparation = 0; }
    }
  }
  function begin({ power = 1, continuous = false, replay = true } = {}) {
    if (phase !== 'idle') return false;
    live = continuous; automatic = replay && !continuous; started = time; lastActive = time;
    strength = clamp(power, .7, 1.35); phase = 'shaking'; return true;
  }
  function pose(b) {
    if (b.free) {
      const [a, c] = b.ends;
      return { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2, r: Math.atan2(-(c.x - a.x), c.y - a.y), z: b.z };
    }
    const [x, y] = point(tube, b.x, -half + 5 + b.u + b.length / 2);
    return { x, y, r: tube.r + b.r, z: b.z };
  }
  function detach(b) {
    const p = pose(b), dx = -Math.sin(p.r) * b.length / 2, dy = Math.cos(p.r) * b.length / 2;
    const vx = tube.vx - Math.sin(tube.r) * b.vu, vy = tube.vy + Math.cos(tube.r) * b.vu;
    const w = tube.w + (closed ? 1.0 : -1.25);
    b.ends = [-1, 1].map(s => ({ x: p.x + dx * s, y: p.y + dy * s, vx: vx - dy * s * w, vy: vy + dx * s * w }));
    b.free = true; phase = 'falling'; releasedAt = time;
  }
  function stepRod(b, dt) {
    const old = b.ends.map(p => ({ ...p }));
    for (const p of b.ends) { p.vy -= G * dt; p.vx *= Math.exp(-.35 * dt); p.x += p.vx * dt; p.y += p.vy * dt; }
    const touches = [false, false];
    for (let n = 0; n < 14; n++) {
      const [a, c] = b.ends, dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 1;
      const correction = (d - b.length) / d * .5;
      a.x += dx * correction; a.y += dy * correction; c.x -= dx * correction; c.y -= dy * correction;
      b.ends.forEach((p, i) => {
        if (p.y < STICK_FLOOR + 3) { p.y = STICK_FLOOR + 3; touches[i] = true; }
        p.x = clamp(p.x, -157, 157);
      });
    }
    b.ends.forEach((p, i) => {
      p.vx = (p.x - old[i].x) / dt; p.vy = (p.y - old[i].y) / dt;
      if (touches[i]) {
        if (old[i].vy < -28) impact(-old[i].vy, 'table');
        p.vy = old[i].vy < -45 ? -old[i].vy * .23 : Math.max(0, p.vy);
        p.vx *= Math.exp(-12 * dt);
      }
    });
    const energy = Math.max(...b.ends.map(p => Math.hypot(p.vx, p.vy)));
    const grounded = b.ends.every(p => p.y < STICK_FLOOR + 3.2);
    settled = grounded && energy < 3 ? settled + dt : 0;
    if (settled > .28) { phase = 'settled'; b.ends.forEach(p => { p.vx = p.vy = 0; }); }
  }
  function step(dt) {
    time += dt;
    let ax = input.ax, ay = input.ay;
    if (time - input.at > .12) { ax *= Math.exp(-(time - input.at - .12) * 18); ay *= Math.exp(-(time - input.at - .12) * 18); }
    if (phase === 'shaking') {
      if (automatic && time - started < 1.15) {
        const t = time - started, envelope = Math.min(1, t * 9) * Math.min(1, (1.15 - t) * 7);
        ax = (Math.sin(t * 17) * 14 + Math.sin(t * 27 + seed) * 3) * envelope * strength;
        ay = Math.sin(t * 19 + .8) * 8 * envelope; lastActive = time;
      }
      quiet = time - lastActive;
      if ((!live && !automatic || quiet > .34) && time - started > .12) { phase = 'preparing'; preparation = time; }
    }
    let target = { x: home.x - ax * 1.15, y: home.y + Math.abs(ay) * .7 + Math.abs(ax) * .3, r: clamp(-ax * .022, -.32, .32) };
    if (phase === 'preparing' || phase === 'ejecting') {
      target = closed ? { x: -8, y: 88, r: -.25 } : { x: -46, y: home.y + 14, r: -.28 };
    } else if (chosen.free) {
      const linger = time - releasedAt < .55;
      target = closed && linger ? { x: -8, y: 88, r: -.25 } : { x: closed ? -120 : -58, y: home.y, r: 0 };
    }
    const accelerationX = (target.x - tube.x) * 125 - tube.vx * 19;
    const accelerationY = (target.y - tube.y) * 100 - tube.vy * 18;
    tube.vx += accelerationX * dt; tube.vy += accelerationY * dt;
    tube.w += ((target.r - tube.r) * 95 - tube.w * 13) * dt;
    tube.x += tube.vx * dt; tube.y += tube.vy * dt; tube.r += tube.w * dt;
    if (phase === 'preparing' && time - preparation > (closed ? .65 : .32)) {
      phase = 'ejecting';
      if (!closed) {
        chosen.vu = 455; // The final upward shake supplies the release impulse.
        bodies.filter(b => b !== chosen).forEach((b, i) => { b.vu += 65 + noise(i + seed) * 65; });
      }
    }
    for (const b of bodies) {
      if (b.free) { if (phase !== 'settled') stepRod(b, dt); continue; }
      const exiting = b === chosen && phase === 'ejecting';
      b.w += (-b.r * 90 - b.w * 5 - accelerationX * .009 + tube.w * (1 + noise(b.id))) * dt;
      b.r = clamp(b.r + b.w * dt, -.13, .13);
      // Closed tubes constrain orientation while the rod slides through a hole.
      if (closed && b === chosen) b.r = 0;
      b.vu += (-G * Math.cos(tube.r) - accelerationY) * dt;
      b.u += b.vu * dt;
      if (!exiting || !closed) {
        if (b.u < 0) { impact(-b.vu); b.u = 0; b.vu = b.vu < -40 ? -b.vu * (.16 + noise(b.id) * .14) : 0; }
      }
      if (!exiting && b.u > (closed ? 8 : 40)) { b.u = closed ? 8 : 40; b.vu = -Math.abs(b.vu) * .22; }
      if (exiting && (closed ? -half + 5 + b.u + b.length < -half - 2 : -half + 5 + b.u > half + 3)) detach(b);
    }
    // Adjacent rods exchange angular momentum rather than moving as a single fan.
    for (let i = 1; i < bodies.length; i++) {
      const a = bodies[i - 1], b = bodies[i];
      if (a.free || b.free || a.z !== b.z) continue;
      const overlap = 5 - (b.x - a.x - Math.sin(b.r) * 60 + Math.sin(a.r) * 60);
      if (overlap > 0) { const impulse = overlap * .022; a.w += impulse; b.w -= impulse; impact(overlap * 5); }
    }
  }
  function advance(seconds) {
    contacts = []; accumulator += clamp(seconds, 0, .08);
    while (accumulator + 1e-9 >= STICK_STEP) { step(STICK_STEP); accumulator -= STICK_STEP; }
    return { phase, contacts, selected: chosen, time, tube, bodies };
  }
  return { feed, begin, advance, pose, tube, bodies, selected: chosen, half, kind,
    get phase() { return phase; }, get time() { return time; } };
}
