import { random, seeded } from '../../core/rng.js';

export const MIN_OPTIONS = 2, MAX_OPTIONS = 6, MAX_LABEL = 12;
export const DEFAULT_OPTIONS = ['做', '不做', '再想想'];
export const BOARD = Object.freeze({ width: 360, height: 490, left: 18, right: 342, floor: 470, dividerY: 410, ballRadius: 7.5 });
const STEP = 1 / 240, GRAVITY = 320;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function parseOptions(text) {
  const labels = String(text ?? '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (labels.length < MIN_OPTIONS) return { labels, error: '至少填写 2 个选项' };
  if (labels.length > MAX_OPTIONS) return { labels, error: '最多放 6 个选项' };
  if (labels.some(s => [...s].length > MAX_LABEL)) return { labels, error: '每个选项最多 12 个字' };
  return { labels, error: '' };
}

export function makeBoard(count = 3) {
  if (!Number.isInteger(count) || count < MIN_OPTIONS || count > MAX_OPTIONS) throw new RangeError('Choose 2–6 slots');
  const pins = [];
  for (let row = 0; row < 10; row++) {
    const n = row % 2 ? 8 : 9;
    for (let col = 0; col < n; col++) pins.push({ x: 40 + col * 35 + (row % 2) * 17.5, y: 78 + row * 33, r: 4, row });
  }
  const slotWidth = (BOARD.right - BOARD.left) / count;
  const dividers = Array.from({ length: count - 1 }, (_, i) => BOARD.left + slotWidth * (i + 1));
  return { ...BOARD, count, slotWidth, pins, dividers };
}

// One rigid ball, fixed timesteps, circular pegs, rounded dividers and a floor.
// Every deflection is a contact impulse. No target slot or user input is read.
export function createPlinkoPhysics(board, { x = 180, vx = 35, vy = 0, angle = 0 } = {}) {
  const r = board.ballRadius;
  const ball = { x: clamp(x, board.left + r, board.right - r), y: 30, vx, vy, angle };
  let time = 0, accumulator = 0, rest = 0, phase = 'falling', result = null, contacts = [];
  let pinHits = 0;
  function contact(x, y, radius, restitution, kind, index = -1) {
    const dx = ball.x - x, dy = ball.y - y, distance = Math.hypot(dx, dy), limit = r + radius;
    if (distance >= limit) return;
    const nx = distance > 1e-9 ? dx / distance : 1, ny = distance > 1e-9 ? dy / distance : 0;
    ball.x = x + nx * (limit + .001); ball.y = y + ny * (limit + .001);
    const normalSpeed = ball.vx * nx + ball.vy * ny;
    if (normalSpeed >= 0) return;
    ball.vx -= (1 + restitution) * normalSpeed * nx;
    ball.vy -= (1 + restitution) * normalSpeed * ny;
    ball.vx *= .985; ball.vy *= .985;
    if (-normalSpeed > 12) {
      contacts.push({ kind, index, x, y, speed: -normalSpeed, time });
      if (kind === 'pin') pinHits++;
    }
  }
  function step() {
    if (phase === 'settled') return;
    time += STEP;
    ball.vy += GRAVITY * STEP;
    ball.vx *= Math.exp(-.065 * STEP);
    ball.x += ball.vx * STEP; ball.y += ball.vy * STEP;
    ball.angle += ball.vx / r * STEP;
    for (let i = 0; i < board.pins.length; i++) {
      const p = board.pins[i];
      if (Math.abs(ball.y - p.y) < r + p.r) contact(p.x, p.y, p.r, .73, 'pin', i);
    }
    for (let i = 0; i < board.dividers.length; i++) {
      contact(board.dividers[i], clamp(ball.y, board.dividerY, board.floor), 2.8, .48, 'divider', i);
    }
    const minX = board.left + r, maxX = board.right - r;
    if (ball.x < minX || ball.x > maxX) {
      ball.x = clamp(ball.x, minX, maxX); const speed = Math.abs(ball.vx); ball.vx *= -.66;
      if (speed > 12) contacts.push({ kind: 'wall', x: ball.x, y: ball.y, speed, time });
    }
    if (ball.y > board.floor - r) {
      ball.y = board.floor - r;
      if (ball.vy > 14) {
        contacts.push({ kind: 'floor', x: ball.x, y: board.floor, speed: ball.vy, time });
        ball.vy *= -.34; ball.vx *= .72;
      } else ball.vy = 0;
      ball.vx *= Math.exp(-13 * STEP);
    }
    phase = ball.y > board.dividerY + r ? 'landing' : 'falling';
    rest = ball.y >= board.floor - r - .05 && Math.abs(ball.vy) < 2 && Math.abs(ball.vx) < 1 ? rest + STEP : 0;
    if (rest > .32) {
      phase = 'settled'; ball.vx = ball.vy = 0;
      result = clamp(Math.floor((ball.x - board.left) / board.slotWidth), 0, board.count - 1);
    }
  }
  function advance(seconds) {
    contacts = [];
    accumulator += clamp(Number.isFinite(seconds) ? seconds : 0, 0, .1);
    while (accumulator + 1e-10 >= STEP && phase !== 'settled') { step(); accumulator -= STEP; }
    return { ball: { ...ball }, time, phase, result, contacts, pinHits };
  }
  return { advance, get ball() { return { ...ball }; }, get phase() { return phase; } };
}

export function simulateDrop(board, launch) {
  const physics = createPlinkoPhysics(board, launch), frames = [{ ...physics.ball, time: 0, phase: 'falling' }], contacts = [];
  let state;
  for (let i = 0; i < 2400; i++) {
    state = physics.advance(1 / 120);
    frames.push({ ...state.ball, time: state.time, phase: state.phase });
    contacts.push(...state.contacts);
    if (state.phase === 'settled') return { frames, contacts, duration: state.time, result: state.result, pinHits: state.pinHits };
  }
  return null;
}

// Choose a slot uniformly, then find a real, unmodified physical drop ending
// there. Playback never steers the ball, changes a contact or jumps to a slot.
// The plan is fixed before launch, so tap timing and later motion cannot reroll.
export function planDrop(count, rnd = random) {
  const board = makeBoard(count);
  const target = clamp(Math.floor(rnd() * count), 0, count - 1);
  const cosmetic = seeded(Math.floor(rnd() * 4294967296));
  for (let attempt = 0; attempt < 240; attempt++) {
    const launch = { x: 180 + (cosmetic() - .5) * 5, vx: (cosmetic() - .5) * 185, angle: cosmetic() * Math.PI * 2 };
    const drop = simulateDrop(board, launch);
    if (drop && drop.result === target && drop.pinHits >= 7) {
      const playbackDuration = 8.2 + cosmetic() * 1.6;
      return { ...drop, board, playbackDuration, attempts: attempt + 1 };
    }
  }
  throw new Error('Could not prepare a complete drop');
}

export function frameAt(plan, seconds) {
  const t = clamp(seconds, 0, plan.duration);
  let lo = 0, hi = plan.frames.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (plan.frames[mid].time <= t) lo = mid; else hi = mid; }
  const a = plan.frames[lo], b = plan.frames[hi], f = b.time > a.time ? (t - a.time) / (b.time - a.time) : 1;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, angle: a.angle + (b.angle - a.angle) * f, phase: t >= plan.duration ? 'settled' : a.phase };
}
