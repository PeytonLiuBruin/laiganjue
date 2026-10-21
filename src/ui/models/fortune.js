// 姻缘 · 事业 · 财富 的六件器物：同心结、红线、官印、青云梯、摇钱树、财库。
// 风格化手游画风：圆润造型、饱和但柔和的配色、本色轮廓、金属高光，动作带回弹。
// 状态约定：active 时按 time（本次动作开始后的秒数）播放动作，revealed 后停在落定姿态，
// revealMix 由渲染器平滑过渡，用来淡入光效与文字。
import { lathe, torus, box, sphere, deform, halfCylinder, transformed, rotate, axisAngle, add, clamp, ease } from './geometry.js';
import { edgeColor, rgb } from './painter.js';
const TAU = Math.PI * 2;
const C = {
  red: '#e8493c', redDeep: '#c73a33', pink: '#ff9aa8',
  gold: '#f4b740', goldDeep: '#d98a1f', cream: '#fff5df',
  jade: '#56c896', jadeLight: '#86e0b8', wood: '#c07a3e', woodDeep: '#9c5b2b', rope: '#efc982',
  leaf: '#6cc84f', leafDeep: '#3f9e47', cloud: '#ffffff', paper: '#fff3d6',
  chest: '#d9473a', chestDeep: '#a8322c', inside: '#5c2420',
};
const cache = new Map();
const cached = (key, build) => { if (!cache.has(key)) cache.set(key, build()); return cache.get(key); };
const shift = (mesh, p) => transformed(mesh, undefined, p);
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const scaleAbout = (mesh, o, k) => mesh.map(f => ({ ...f, points: f.points.map(pt => add(o, pt.map((v, i) => (v - o[i]) * (Array.isArray(k) ? k[i] : k)))) }));
const wobble = (s, time, amount = 1) => s.active ? Math.sin(time * 14) * Math.exp(-time * 1.1) * amount : 0;
const settle = (s, time, duration = 1.4) => s.active ? ease(time / duration) : s.revealed ? 1 : 0;
// 回弹：略微越过终点再落回，卡通动作的弹性。
const backOut = t => { t = clamp(t); const k = 1.7; return 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2; };
const idleBob = (time, s, amp = 3) => s.active ? 0 : Math.sin(time * 2) * amp;

function sparkles(p, center, spread, mix, time, count = 5, color = '#ffe08a') {
  if (mix <= .02) return;
  for (let i = 0; i < count; i++) {
    const a = i * 2.399 + time * .5, r = spread * (.6 + (i % 3) * .18);
    const tw = .5 + .5 * Math.sin(time * 3.2 + i * 1.9);
    p.sparkle(add(center, [Math.cos(a) * r, Math.sin(a) * r * .75, 24]), (6 + (i % 2) * 5) * tw, color, mix * (.55 + .45 * tw));
  }
}

/* 方孔铜钱：带外缘的金币，正面画出方孔与四个钱文刻痕。 */
function coin(p, center, rotation, r = 12) {
  p.mesh(transformed(cached('coin' + r, () => lathe([[0, -1.5], [r - 2.2, -1.5], [r - 2.2, -2.5], [r, -2.5], [r + .9, 0], [r, 2.5], [r - 2.2, 2.5], [r - 2.2, 1.5], [0, 1.5]], C.gold, 24)), rotation, center));
  const up = rotate([0, 1, 0], rotation), facing = p.view(up)[2];
  if (Math.abs(facing) < .2) return;
  const side = facing > 0 ? 1.6 : -1.6, s = r * .3;
  const onFace = (x, z) => add(center, rotate([x, side, z], rotation));
  p.face([[-s, -s], [s, -s], [s, s], [-s, s]].map(([x, z]) => onFace(x, z)), '#7c4312', { stroke: '#d98a1f', width: 1.2 });
  if (r >= 11 && Math.abs(facing) > .45) for (const [x, z] of [[0, -r * .62], [0, r * .62], [-r * .62, 0], [r * .62, 0]]) {
    const w = r * .09;
    p.face([[x - w, z - w], [x + w, z - w], [x + w, z + w], [x - w, z + w]].map(([a, b]) => onFace(a, b)), '#c27a1c');
  }
}

/* 流苏：上窄下宽的丝穗，横向明暗、细丝纹理、金色束口。 */
function tassel(p, top, length, sway, color = C.red, width = 11) {
  const a = p.project(top), b = p.project(add(top, [sway, -length, 0])), c = p.c, s = a[3];
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const w0 = 3.5 * s, w1 = width * s;
  c.save();
  c.beginPath();
  c.moveTo(a[0] + nx * w0, a[1] + ny * w0);
  c.lineTo(b[0] + nx * w1, b[1] + ny * w1);
  c.quadraticCurveTo(b[0] + dx / L * 5 * s, b[1] + dy / L * 5 * s, b[0] - nx * w1, b[1] - ny * w1);
  c.lineTo(a[0] - nx * w0, a[1] - ny * w0);
  c.closePath();
  c.lineJoin = 'round'; c.lineWidth = p.ow; c.strokeStyle = edgeColor(color); c.stroke();
  const base = rgb(color);
  const g = c.createLinearGradient(b[0] + nx * w1, b[1] + ny * w1, b[0] - nx * w1, b[1] - ny * w1);
  g.addColorStop(0, `rgb(${base.map(v => Math.min(255, v * 1.12 + 12)).join(',')})`); g.addColorStop(.55, color); g.addColorStop(1, `rgb(${base.map(v => v * .66).join(',')})`);
  c.fillStyle = g; c.fill(); c.clip();
  c.strokeStyle = `rgba(${base.map(v => v * .5).join(',')},.45)`; c.lineWidth = .8 * s;
  for (let i = -4; i <= 4; i++) { const k = i / 4; c.beginPath(); c.moveTo(a[0] + nx * w0 * k, a[1] + ny * w0 * k); c.lineTo(b[0] + nx * w1 * k, b[1] + ny * w1 * k); c.stroke(); }
  c.restore();
  p.mesh(shift(cached('tassel-cap', () => lathe([[0, -5], [6, -4], [6.5, 3], [3, 6], [0, 6.5]], C.gold, 18)), top));
}

/* 同心结：两只相扣的红环镶金线，中间方胜，下挂玉珠与流苏。摇动时左右甩，结成后弹一下，亮出「缘」字金章。 */
export function drawKnot(p, s, time) {
  const mix = s.revealMix || 0, swing = wobble(s, time, .6), bob = idleBob(time, s);
  const pop = s.revealed ? 1 + .12 * Math.sin(Math.min(1, mix) * Math.PI) : 1;
  const center = [0, 34 + bob, 0], q = axisAngle([0, 0, 1], swing * .35);
  p.shadow([0, -128, 0], 82, .15);
  if (mix > .02) p.glow(center, 130, C.pink, mix * .32);
  const rings = cached('knot-rings', () => {
    const ring = (dx, tilt, color) => {
      const r = axisAngle([0, 1, 0], tilt), front = rotate([0, 0, 8.6], r);
      return [...transformed(torus(34, 9, color, r, 56), undefined, [dx, 0, 0]), ...transformed(torus(34, 1.9, C.gold, r, 56), undefined, add([dx, 0, 0], front))];
    };
    return [...ring(-20, .38, C.red), ...ring(20, -.38, C.redDeep)];
  });
  p.mesh(scaleAbout(transformed(rings, q, center), center, pop));
  const at = local => add(center, rotate(local, q));
  p.mesh(transformed(cached('knot-diamond', () => [
    ...transformed(box(30, 30, 8, C.gold), axisAngle([0, 0, 1], Math.PI / 4)),
    ...transformed(box(24, 24, 12, C.red), axisAngle([0, 0, 1], Math.PI / 4)),
  ]), q, at([0, -42, 6])));
  p.blob(at([0, -42, 13]), 4.5, C.gold);
  p.line([at([0, -60, 6]), at([0, -66, 6])], C.red, 3);
  p.mesh(shift(cached('knot-bead', () => sphere(8.5, C.jade, 20, 8)), at([0, -72, 6])));
  tassel(p, at([0, -84, 6]), 50, swing * 30, C.red, 12);
  if (mix > .02) {
    const k = backOut(mix), m = at([0, 0, 44]);
    p.blob(m, 25 * k, C.gold);
    p.blob(add(m, [0, 0, 2]), 19 * k, C.red, { outlined: false, shine: false, shade: .8 });
    p.text('缘', add(m, [0, 0, 4]), { size: 24 * k, color: C.cream, weight: 800, stroke: '#8c2a22' });
  }
  sparkles(p, center, 72, mix, time, 6);
}

/* 红线：两枚刻谷纹的玉璧，红线由松到紧、绷直回弹，中央冒出红心，小心形缓缓上飘。 */
function heart(p, at, size, alpha = 1) {
  const pt = p.project(at), r = size * pt[3], c = p.c;
  if (r < .8 || alpha <= 0) return;
  c.save(); c.globalAlpha = alpha; c.translate(pt[0], pt[1]);
  c.beginPath();
  c.moveTo(0, r * .92);
  c.bezierCurveTo(-r * 1.35, r * .05, -r * 1.05, -r * 1.1, 0, -r * .42);
  c.bezierCurveTo(r * 1.05, -r * 1.1, r * 1.35, r * .05, 0, r * .92);
  c.closePath();
  c.lineJoin = 'round'; c.lineWidth = Math.max(1.4, p.ow * Math.min(1, r / 12)); c.strokeStyle = edgeColor(C.red); c.stroke();
  const g = c.createRadialGradient(-r * .35, -r * .35, r * .05, 0, 0, r * 1.2);
  g.addColorStop(0, '#ff8f86'); g.addColorStop(.5, C.red); g.addColorStop(1, '#b02f33');
  c.fillStyle = g; c.fill();
  c.fillStyle = 'rgba(255,250,240,.8)'; c.beginPath(); c.ellipse(-r * .45, -r * .4, r * .2, r * .11, -.7, 0, TAU); c.fill();
  c.restore();
}
export function drawThread(p, s, time) {
  const t = settle(s, time, 1.5), mix = s.revealMix || 0, bob = idleBob(time, s, 2.5);
  const bi = cached('bi', () => transformed([
    ...lathe([[15, -5], [38, -6], [44, -2], [44, 2], [38, 6], [15, 5], [13, 0], [15, -5]], C.jade, 40),
    ...transformed(torus(44, 1.8, C.gold, axisAngle([1, 0, 0], -Math.PI / 2), 48), undefined, [0, 0, 0]),
  ], axisAngle([1, 0, 0], Math.PI / 2)));
  const ends = [];
  for (const x of [-100, 100]) {
    const y = -4 + (x < 0 ? bob : -bob), r = axisAngle([0, 1, 0], x < 0 ? .42 : -.42), o = [x, y, 0];
    p.shadow([x, -104, 0], 52, .14);
    p.mesh(transformed(bi, r, o));
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU + .26, rr = i % 2 ? 23 : 32;
      p.blob(add(o, rotate([Math.cos(a) * rr, Math.sin(a) * rr, 6.4], r)), 2.6, C.jadeLight, { outlined: false, shine: false, shade: .78 });
    }
    ends.push(add(o, rotate([x < 0 ? 14 : -14, 22, 6], r)));
  }
  const late = Math.max(0, time - 1.2), snap = s.active && time > 1.2 ? Math.sin(late * 18) * Math.exp(-late * 5) * 9 : 0;
  const sag = 64 * (1 - t) + 4 + wobble(s, time, 6) + snap;
  const curve = Array.from({ length: 33 }, (_, i) => {
    const u = i / 32, base = lerp3(ends[0], ends[1], u);
    return add(base, [0, -Math.sin(u * Math.PI) * sag, Math.sin(u * Math.PI) * 10]);
  });
  p.line(curve, C.red, 4.5);
  const mid = curve[16];
  if (mix > .02) p.glow(mid, 90, C.pink, mix * .32);
  if (t > .7) heart(p, add(mid, [0, 5, 12]), 16 * backOut(clamp((t - .7) / .3)));
  if (mix > .02) {
    for (let i = 0; i < 3; i++) {
      const k = (time * .35 + i / 3) % 1;
      heart(p, add(mid, [(i - 1) * 34 + Math.sin(k * TAU + i) * 6, 26 + k * 70, 14]), 6 + (i % 2) * 2, mix * Math.sin(k * Math.PI));
    }
    p.text('囍', [0, 84, 0], { size: 40 * backOut(mix), color: C.red, weight: 800, stroke: C.cream, depth: false });
  }
  sparkles(p, add(mid, [0, 24, 0]), 64, mix, time, 4);
}

/* 官印：玉质印身、金色印钮挂红穗，抬起蓄力后重重落下，压扁再弹回，在卷轴上盖出朱红印文。 */
export function drawSeal(p, s, time) {
  const mix = s.revealMix || 0;
  let lift = 0, squash = 1;
  if (s.active) {
    const up = clamp(time / .55), down = clamp((time - .7) / .25);
    lift = time < .7 ? ease(up) * 70 : (1 - down * down) * 70;
    if (time > .95) { const k = Math.exp(-(time - .95) * 7); squash = 1 - Math.sin((time - .95) * 20) * .15 * k; }
  } else lift = (s.revealed ? 56 : 4) + idleBob(time, { active: false }, 3);
  p.shadow([0, -110, 0], 150, .12);
  p.mesh(cached('seal-paper', () => shift(box(226, 4, 136, C.paper), [0, -104, 0])));
  p.line([[-100, -101.8, -58], [100, -101.8, -58], [100, -101.8, 58], [-100, -101.8, 58], [-100, -101.8, -58]], '#efcf9c', 1.4, 1, { outlined: false });
  for (const x of [-116, 116]) {
    p.mesh(shift(cached('seal-roll', () => transformed(lathe([[0, -72], [8, -72], [8, 72], [0, 72]], C.wood, 18), axisAngle([1, 0, 0], Math.PI / 2))), [x, -100, 0]));
    for (const z of [-76, 76]) p.blob([x, -100, z], 7, C.gold);
  }
  if (s.revealed || mix > .02) {
    const a = Math.max(mix, s.revealed ? .3 : 0), k = backOut(a), h = 40 * k, y = -101.6;
    p.face([[-h, y, -h], [h, y, -h], [h, y, h], [-h, y, h]], '#d93a2e', { opacity: a });
    const i = h - 5;
    p.face([[-i, y, -i], [i, y, -i], [i, y, i], [-i, y, i]], 'rgba(0,0,0,0)', { stroke: C.cream, width: 1.6, opacity: a });
    p.text(s.level === '上' ? '大吉' : '官印', [0, y + .2, 0], { size: (s.level === '上' ? 28 : 25) * k, color: C.cream, u: [1, 0, 0], v: [0, 0, -1], weight: 800, alpha: a, stroke: null, depth: false });
  }
  const at = [0, -66 + lift, 0];
  p.shadow([0, -102, 0], 56 - lift * .2, .22);
  const body = cached('seal-body', () => [
    ...box(84, 52, 84, C.jade),
    ...shift(box(74, 6, 74, C.jadeLight), [0, 29, 0]),
    ...shift(box(90, 10, 90, C.gold), [0, -27, 0]),
    ...shift(box(86, 5, 86, C.gold), [0, 25, 0]),
    ...shift(lathe([[0, 0], [14, 0], [12, 8], [0, 9]], C.gold, 22), [0, 31, 0]),
    ...shift(deform(sphere(20, C.gold, 24, 10), v => [v[0], Math.max(v[1], -2) * .72, v[2]]), [0, 42, 0]),
  ]);
  const k = [2 - squash, squash, 2 - squash];
  p.mesh(scaleAbout(shift(body, at), at, k));
  const ringAt = add(at, [0, 62 * squash, 0]);
  p.mesh(shift(cached('seal-ring', () => torus(10, 3.4, C.goldDeep, [0, 0, 0, 1], 28)), ringAt));
  const carve = 36, fz = 42.2 * (2 - squash);
  p.line([[-carve, -18, fz], [carve, -18, fz], [carve, 18, fz], [-carve, 18, fz], [-carve, -18, fz]].map(v => add(at, [v[0] * (2 - squash), v[1] * squash, v[2]])), '#3c9a6e', 1.3, 1, { outlined: false });
  const cordEnd = add(at, [54 * (2 - squash), 18 * squash, 14]);
  p.line([add(ringAt, [4, -9, 2]), add(ringAt, [26, -14, 8]), cordEnd], C.red, 2.6);
  tassel(p, cordEnd, 38, 4 + wobble(s, time, 10), C.red, 8);
  if (mix > .02) p.glow([0, -96, 0], 96, C.gold, mix * .24);
  sparkles(p, [0, -64, 0], 96, mix, time, 6);
}

/* 青云梯：粗木梯麻绳扎结，伸进蓬松白云。排盘时横档逐级变金并弹一下，顶端亮起金星。 */
export function drawLadder(p, s, time) {
  const t = settle(s, time, 1.8), mix = s.revealMix || 0, rungs = 7;
  const q = axisAngle([0, 1, 0], -.36);
  const base = [-14, -118, 0], top = [34, 78, -24];
  const along = u => lerp3(base, top, u);
  const at = (u, side) => rotate(add(along(u), [side * 30, 0, 0]), q);
  p.shadow([0, -122, 0], 90, .15);
  const cloudAt = rotate(top, q), drift = Math.sin(time * .8) * 4;
  const cloud = (x, y, z, r) => p.blob(add(cloudAt, [x + drift, y, z]), r, C.cloud, { edge: '#a3a0d2', shade: .84, shine: false });
  if (mix > .02) p.glow(add(cloudAt, [0, 20, 0]), 120, '#ffd27a', mix * .4);
  for (const [x, y, z, r] of [[-46, 14, -16, 22], [-20, 30, -10, 28], [16, 32, -12, 30], [48, 16, -18, 22]]) cloud(x, y, z, r);
  p.line([at(0, -1), at(1.03, -1)], C.woodDeep, 10);
  p.line([at(0, 1), at(1.03, 1)], C.woodDeep, 10);
  for (let i = 0; i < rungs; i++) {
    const u = (i + .6) / (rungs + .4), lit = clamp(t * rungs - i);
    const hop = lit > 0 && lit < 1 ? Math.sin(lit * Math.PI) * 5 : 0, gold = lit >= 1 || (lit > 0 && !s.active);
    const l = add(at(u, -1), [0, hop, 0]), r = add(at(u, 1), [0, hop, 0]);
    p.line([l, r], gold ? C.gold : C.wood, 7);
    for (const e of [l, r]) p.line([add(e, [-4, 4, 6]), add(e, [4, -4, 6])], C.rope, 2.2, 1, { outlined: false });
    if (lit > 0 && lit < 1) p.sparkle(add(rotate(along(u), q), [0, 10 + hop, 24]), 11);
  }
  for (const [x, y, z, r] of [[-30, 2, 14, 20], [2, 6, 22, 26], [34, 2, 12, 20]]) cloud(x, y, z, r);
  if (mix > .02) {
    p.sparkle(add(cloudAt, [2, 64, 36]), 22 * backOut(mix), '#ffd45c', 1);
    p.text('青云', add(cloudAt, [2, 8, 50]), { size: 22 * backOut(mix), color: C.gold, weight: 800 });
  }
  sparkles(p, add(cloudAt, [0, 20, 0]), 70, mix, time, 4);
}

/* 摇钱树：釉红花盆描金「福」，胖树冠用红绳挂满方孔钱。摇动时树身弹性摆动，铜钱一枚枚蹦进盆里。 */
const TREE_COINS = Array.from({ length: 11 }, (_, i) => {
  const a = i * 2.399 + .3, r = 18 + (i % 4) * 12;
  return { x: Math.cos(a) * r, y: 46 + Math.sin(a) * r * .55, z: 34 + (i % 3) * 5, fall: i % 3 === 0, i };
});
const CANOPY = [[-40, 46, -14, 32, 1], [38, 48, -12, 32, 1], [0, 76, -16, 36, 1], [-22, 30, 0, 28, 0], [24, 32, 2, 28, 0], [0, 52, 8, 30, 0]];
export function drawTree(p, s, time) {
  const mix = s.revealMix || 0, sway = wobble(s, time, .15) + (s.active ? 0 : Math.sin(time * 1.4) * .012);
  const fallT = s.active ? clamp((time - .25) / 1.2) : s.revealed ? 1 : 0;
  p.shadow([0, -122, 0], 100, .15);
  p.mesh(cached('tree-pot', () => [
    ...lathe([[0, -122], [34, -122], [46, -114], [52, -102], [50, -92], [0, -92]], C.red, 36),
    ...lathe([[0, -94], [55, -94], [58, -89], [54, -84], [0, -84]], C.gold, 36),
  ]));
  p.mesh(cached('tree-soil', () => lathe([[0, -86], [50, -86], [50, -85], [0, -85]], '#6e4127', 36)), { outlined: false });
  p.text('福', [0, -106, 52], { size: 20, color: C.gold, weight: 800, u: [1, 0, 0], v: [0, 1, 0] });
  const bend = point => rotate(point, axisAngle([0, 0, 1], sway * clamp((point[1] + 86) / 150)));
  p.line([[0, -86, 0], [3, -44, 0], [-2, -4, 0], [0, 30, 0]].map(bend), C.wood, 15);
  for (const [a, b] of [[[0, -10, 0], [-34, 28, 0]], [[0, -2, 0], [32, 30, 0]]]) p.line([a, b].map(bend), C.wood, 8);
  for (const [x, y, z, r, back] of CANOPY) p.blob(bend([x, y, z]), r, back ? C.leafDeep : C.leaf, { shine: !back, shade: .7 });
  for (const c of TREE_COINS) {
    const hang = bend([c.x, c.y, c.z]);
    if (c.fall && fallT > 0) {
      const local = clamp(fallT * 1.4 - (c.i % 4) * .12), ground = [(c.i % 5 - 2) * 17, -80, 30 + (c.i % 2) * 8];
      const pos = add(lerp3(hang, ground, ease(local)), [0, Math.sin(local * Math.PI) * 26, 0]);
      coin(p, pos, local >= 1 ? axisAngle([1, 0, 0], .35) : axisAngle([0, 1, 0], local * 12), 12);
    } else {
      p.line([add(hang, [0, 16, -2]), add(hang, [0, 11, 0])], C.red, 1.6, 1, { outlined: false });
      coin(p, hang, axisAngle([1, 0, 0], Math.PI / 2 + Math.sin(c.i * 1.3 + (s.active ? time * 8 : time * 1.3)) * .3), 11);
    }
  }
  if (mix > .02) p.glow([0, -72, 30], 92, C.gold, mix * .34);
  sparkles(p, [0, 40, 0], 84, mix, time, 6);
}

/* 财库：红漆拱盖宝箱，金包边与铆钉，锁片刻「财」。开库时箱盖弹开、金光迸射、元宝蹦起。 */
function rays(p, at, mix, time) {
  if (mix <= .02) return;
  const o = p.project(at), c = p.c, R = 150 * o[3];
  c.save(); c.translate(o[0], o[1]); c.rotate(time * .25); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU, w = .14;
    const g = c.createRadialGradient(0, 0, 0, 0, 0, R);
    g.addColorStop(0, `rgba(255,214,106,${.42 * mix})`); g.addColorStop(1, 'rgba(255,214,106,0)');
    c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, a - w, a + w); c.closePath(); c.fill();
  }
  c.restore();
}
const yuanbao = () => cached('yuanbao', () => [
  ...deform(lathe([[0, -9], [15, -9], [23, -3], [27, 4], [25, 6.5], [17, 2], [0, 2]], C.gold, 28), v => { const x = v[0] * 1.5, z = v[2] * .82; return [x, v[1] + (v[1] > -4 ? .011 * x * x : 0), z]; }),
  ...shift(deform(sphere(11, C.gold, 20, 8), v => [v[0], Math.max(v[1], -2) * .9, v[2]]), [0, 2, 0]),
]);
export function drawVault(p, s, time) {
  const t = settle(s, time, 1.6), mix = s.revealMix || 0, bob = idleBob(time, s, 2);
  const shake = s.active && time < .6 ? Math.sin(time * 40) * 3 * (1 - time / .6) : 0;
  const o = [shake, bob * .3, 0];
  const open = s.active ? backOut(clamp((time - .5) / .9)) : t;
  p.shadow([0, -114, 0], 126, .17);
  rays(p, add(o, [0, -10, 0]), Math.max(mix, s.active ? clamp((time - .6) / .5) : 0) * .9, time);
  p.mesh(shift(cached('vault-body', () => [
    ...shift(box(166, 72, 100, C.chest), [0, -64, 0]),
    ...shift(box(172, 10, 106, C.gold), [0, -100, 0]),
    ...shift(box(172, 8, 106, C.gold), [0, -30, 0]),
    ...shift(box(16, 74, 104, C.gold), [-64, -64, 0]),
    ...shift(box(16, 74, 104, C.gold), [64, -64, 0]),
  ]), o));
  for (const y of [-54, -76]) p.line([add(o, [-55, y, 50.4]), add(o, [55, y, 50.4])], C.chestDeep, 1.4, 1, { outlined: false });
  for (const x of [-64, 64]) for (const y of [-44, -64, -84]) p.blob(add(o, [x, y, 53]), 2.6, '#ffd36e', { outlined: false, shade: .7 });
  const lid = Math.min(1.22, open) * 1.72;
  const lidMesh = cached('vault-lid', () => shift([
    ...halfCylinder(166, 50, C.chest, 18, C.chestDeep),
    ...transformed(halfCylinder(16, 51.5, C.gold, 18), undefined, [-64, 0, 0]),
    ...transformed(halfCylinder(16, 51.5, C.gold, 18), undefined, [64, 0, 0]),
    ...shift(box(160, 4, 94, C.chestDeep), [0, 2, 0]),
    ...shift(box(30, 26, 6, C.gold), [0, -4, 52]),
  ], [0, 0, 50]));
  const drawLid = () => p.mesh(transformed(lidMesh, axisAngle([1, 0, 0], -lid), add(o, [0, -26, -50])));
  // 箱盖立起后在箱内物品之后，先画；合着时盖在最上面，后画。
  if (open > .45) drawLid();
  if (open > .02) p.face([[-74, -26, -44], [74, -26, -44], [74, -26, 44], [-74, -26, 44]].map(v => add(o, v)), C.inside);
  if (open > .1) {
    const jump = s.active ? clamp((time - .7) / .7) : 1;
    for (const [x, z, a, d] of [[-38, -10, .3, 0], [36, -12, -.4, .2], [0, 2, .1, .1], [-16, 22, -.2, .15], [22, 22, .25, .05]]) {
      const k = clamp(jump * 1.4 - d), hop = Math.sin(k * Math.PI) * 38;
      p.mesh(transformed(yuanbao(), axisAngle([0, 1, 0], a), add(o, [x, -14 + hop + k * 4, z])));
    }
    p.glow(add(o, [0, -4, 0]), 110, C.gold, .1 + Math.min(1, open) * .18 + mix * .1);
  }
  // 箱口前沿压在元宝前面，元宝看起来是装在箱里的。
  if (open > .1) p.mesh(shift(cached('vault-rim', () => box(172, 8, 4, C.gold)), add(o, [0, -30, 51])));
  if (open <= .45) drawLid();
  if (open < .2) {
    p.mesh(shift(cached('vault-lock', () => box(34, 30, 6, C.gold)), add(o, [0, -46, 52])));
    p.text('财', add(o, [0, -46, 55.5]), { size: 18, color: '#a5611a', weight: 800, stroke: null, depth: false });
  }
  if (mix > .02) p.text('财库', [0, 122, 0], { size: 26 * backOut(mix), color: C.gold, weight: 800 });
  sparkles(p, [0, 14, 0], 104, Math.max(mix, open > .6 ? .8 : 0), time, 7);
}
