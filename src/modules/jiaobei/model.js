// A small, real 3D mesh renderer. The crescent has a flat cut face and a curved
// wooden back; both use the same vertices. No WebGL dependency or external model.
import { motionCurve } from '../../core/motion.js';
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TAU = Math.PI * 2;
export const FIRST_IMPACT = 0.4;

export function createBlockMesh(segments = 36, bands = 12) {
  const faces = [];
  const point = (i, j, flat) => {
    const angle = -Math.PI / 2 + Math.PI * i / segments;
    const x = Math.sin(angle), w = Math.cos(angle), v = j / bands;
    return [x * 1.2, w * (0.1 + 0.8 * v) - 0.38, flat ? 0.09 : -0.055 - Math.sin(Math.PI * v) * w * 0.44];
  };
  for (let i = 0; i < segments; i++) for (let j = 0; j < bands; j++) {
    for (const flat of [false, true]) {
      const p = [point(i, j, flat), point(i + 1, j, flat), point(i + 1, j + 1, flat), point(i, j + 1, flat)];
      if (flat) p.reverse();
      faces.push({ points: p, flat, grain: Math.sin(i * 0.78 + j * 0.31) * 0.025 });
    }
  }
  // The cut face sits above the curved back: these narrow rim faces make the
  // material thickness visible even when the flat face is pointing upward.
  for (let i = 0; i < segments; i++) for (const j of [0, bands]) {
    faces.push({ points: [point(i, j, true), point(i + 1, j, true), point(i + 1, j, false), point(i, j, false)], flat: false, grain: 0 });
  }
  return faces;
}

export function tossPose(t, { side = 1, power = 1, face = 'flat', spread = 68, height = 145, start = null } = {}) {
  const endRot = face === 'round' ? Math.PI : face === 'stand' ? Math.PI / 2 : 0;
  const f = clamp(t, 0, 1);
  const flight = Math.min(f / FIRST_IMPACT, 1);
  const roll = clamp((f - FIRST_IMPACT) / (1 - FIRST_IMPACT), 0, 1);
  const decay = (1 - roll) ** 2;
  const startRot = start?.rx ?? 0.18;
  const finishRot = TAU * (Math.floor(startRot / TAU) + 2 + Math.round(power)) + endRot;
  const landingRot = finishRot - TAU * 0.75;
  // Two smaller parabolic hops, followed by a long, diminishing roll on the floor.
  const hop = roll < 0.18 ? [roll / 0.18, 0.15] : roll < 0.32 ? [(roll - 0.18) / 0.14, 0.045] : [0, 0];
  const lift = f < FIRST_IMPACT ? 4 * height * flight * (1 - flight) : 4 * height * hop[1] * hop[0] * (1 - hop[0]);
  const impactX = side * Math.max(0, spread - 18);
  const rocking = Math.sin(roll * Math.PI * 8) * decay;
  return {
    x: f < FIRST_IMPACT ? (start?.x ?? side * 61) * (1 - flight) + impactX * flight : impactX * decay + side * spread * (1 - decay),
    y: (start?.y ?? 0) * (1 - flight) - lift - Math.abs(rocking) * 3,
    rx: f < FIRST_IMPACT ? startRot * (1 - flight) + landingRot * flight : finishRot + motionCurve(f, [[.4, -270], [.508, -160], [.68, -68], [.81, -58], [.95, 6], [1, 0]]) * Math.PI / 180,
    rz: (start?.rz ?? side * 0.3) * (1 - flight) - side * 0.3 * flight + Math.sin(flight * Math.PI) * side * 0.9 + rocking * side * 0.26,
    ry: (start?.ry ?? 0) * (1 - flight) + Math.sin(flight * Math.PI) * side * 0.55 + rocking * side * 0.22,
  };
}

export function createJiaobeiScene(canvas, ctx) {
  const c = canvas.getContext('2d');
  const mesh = createBlockMesh();
  let poses = [{ x: -61, y: 0, rx: 0.18, ry: 0, rz: -0.3 }, { x: 61, y: 0, rx: 0.18, ry: 0, rz: 0.3 }];
  let landed = poses.map((p) => ({ ...p }));
  let width = 360, height = 340, alive = true, frame = 0, pending = null, active = false, lean = 0;
  const rotate = ([x, y, z], rx, ry, rz) => {
    let yy = y * Math.cos(rx) - z * Math.sin(rx), zz = y * Math.sin(rx) + z * Math.cos(rx);
    let xx = x * Math.cos(ry) + zz * Math.sin(ry); zz = -x * Math.sin(ry) + zz * Math.cos(ry);
    return [xx * Math.cos(rz) - yy * Math.sin(rz), xx * Math.sin(rz) + yy * Math.cos(rz), zz];
  };
  function render() {
    if (!alive || !c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, width, height);
    const scale = Math.min(width / 7.4, 56);
    const ground = height * 0.70;
    poses.forEach((pose) => {
      const lift = Math.abs(pose.y);
      const sx = width / 2 + pose.x, sy = ground + 14;
      c.save();
      c.translate(sx, sy); c.scale(1 + lift / 220, 0.26);
      const shadow = c.createRadialGradient(0, 0, 0, 0, 0, scale * 1.2);
      shadow.addColorStop(0, `rgba(40,22,18,${0.24 / (1 + lift / 50)})`); shadow.addColorStop(1, 'rgba(40,22,18,0)');
      c.fillStyle = shadow; c.beginPath(); c.arc(0, 0, scale * 1.2, 0, TAU); c.fill(); c.restore();
      const faces = mesh.map((face) => {
        const points = face.points.map((p) => rotate(p, pose.rx + 0.36, pose.ry + lean, pose.rz));
        const a = points[0], b = points[1], d = points[3];
        const u = b.map((v, i) => v - a[i]), v = d.map((n, i) => n - a[i]);
        const normal = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
        const n = Math.hypot(...normal) || 1;
        const light = Math.abs((-0.3 * normal[0] - 0.6 * normal[1] + 0.74 * normal[2]) / n);
        return { ...face, points, depth: points.reduce((s, p) => s + p[2], 0) / 4, light };
      }).sort((a, b) => a.depth - b.depth);
      faces.forEach((face) => {
        c.beginPath();
        face.points.forEach((p, i) => {
          const perspective = 1 + p[2] * 0.065;
          const x = width / 2 + pose.x + p[0] * scale * perspective;
          const y = ground + pose.y + p[1] * scale * perspective;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        });
        c.closePath();
        const light = 0.6 + face.light * 0.42 + face.grain;
        const base = face.flat ? [182, 89, 60] : [137, 42, 31];
        c.fillStyle = `rgb(${base.map((v) => Math.round(v * light)).join(',')})`;
        c.strokeStyle = c.fillStyle; c.lineWidth = 0.45; c.fill(); c.stroke();
      });
    });
  }
  const resize = () => {
    const rect = canvas.getBoundingClientRect(); width = rect.width; height = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr); render();
  };
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  function rest() { poses = landed.map((p) => ({ ...p })); render(); }
  function reset() { landed = [{ x: -61, y: 0, rx: 0.18, ry: 0, rz: -0.3 }, { x: 61, y: 0, rx: 0.18, ry: 0, rz: 0.3 }]; rest(); }
  function preview(dx = 0, dy = 0) {
    if (active) return;
    poses = [-1, 1].map((side) => ({ x: side * 61 + clamp(dx * 0.25, -22, 22), y: clamp(dy * 0.4, -44, 10), rx: 0.18 + clamp(-dy / 180, 0, 0.4), ry: dx / 280, rz: side * 0.3 + dx / 360 })); render();
  }
  function toss(result, intensity, onPhase = () => {}) {
    let lastPhase = null;
    active = true;
    const power = clamp(intensity / 20, 0.65, 1.65);
    const total = ctx.platform.prefersReducedMotion ? 160 : 3400 + power * 360;
    const starts = poses.map((p) => ({ ...p }));
    let elapsed = 0, previous = null;
    const impacts = [0, 0];
    canvas.dataset.power = power.toFixed(2);
    return new Promise((resolve) => {
      pending = resolve;
      function tick(now) {
        if (!alive) return;
        // Hidden tabs pause the ritual so returning users still see the landing.
        if (previous !== null && !document.hidden) elapsed += Math.min(40, now - previous);
        previous = now;
        poses = [result.a, result.b].map((face, i) => {
          const delay = ctx.platform.prefersReducedMotion ? 0 : i * 180;
          const t = ctx.platform.prefersReducedMotion ? 1 : clamp((elapsed - delay) / total, 0, 1);
          const thresholds = [FIRST_IMPACT, 0.508, 0.592, 0.95];
          if (t >= thresholds[impacts[i]]) {
            ctx.sound.play(impacts[i] ? 'tick' : 'clack');
            ctx.haptic.impact([1, .55, .25, .15][impacts[i]]); impacts[i]++;
          }
          if (i === 1) {
            const phase = t < FIRST_IMPACT ? 'flight' : t < .68 ? 'rolling' : t < 1 ? 'settling' : 'settled';
            canvas.dataset.phase = phase;
            if (phase !== lastPhase) { lastPhase = phase; onPhase(phase); }
          }
          return tossPose(t, { side: i ? 1 : -1, face, power, start: starts[i], spread: Math.min(width * 0.22, 82), height: ctx.platform.prefersReducedMotion ? 0 : Math.max(30, height * 0.70 - scaleClearance()) * (0.68 + power * 0.16) });
        });
        render();
        if (elapsed < total + (ctx.platform.prefersReducedMotion ? 0 : 180)) frame = requestAnimationFrame(tick);
        else { active = false; landed = poses.map((p) => ({ ...p })); pending = null; canvas.dataset.faces = `${result.a},${result.b}`; resolve(true); }
      }
      frame = requestAnimationFrame(tick);
    });
  }
  const scaleClearance = () => Math.min(width / 7.4, 56) * 1.6 + 46;
  function dispose() { alive = false; cancelAnimationFrame(frame); observer.disconnect(); pending?.(false); pending = null; }
  return { toss, preview, rest, reset, tilt(value) { if (!active) { lean = clamp(value, -0.15, 0.15); render(); } }, dispose };
}
