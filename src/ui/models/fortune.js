// 姻缘 · 事业 · 财富 的六件器物：同心结、红线、官印、青云梯、摇钱树、财库。
// 卡通手游风格：圆胖造型、饱和配色、粗描边、闪光点缀，动作带回弹。
// 状态约定：active 时按 time（本次动作开始后的秒数）播放动作，revealed 后停在落定姿态，
// revealMix 由渲染器平滑过渡，用来淡入光效与文字。
import { lathe, torus, box, sphere, transformed, rotate, axisAngle, add, clamp, ease } from './geometry.js';
const TAU = Math.PI * 2;
const C = {
  red: '#f0503f', redDark: '#c93a30', pink: '#ff8fa0',
  gold: '#ffc83d', goldDeep: '#f09a22', cream: '#fff4d8',
  jade: '#4fd19a', jadeDeep: '#2fae7a', wood: '#c97b3c', woodDeep: '#9a5626',
  leaf: '#69cf4a', leafDeep: '#3fae3c', sky: '#ffffff', paper: '#fff1cf',
  chest: '#e2563b', purple: '#8f6cf0',
};
const cache = new Map();
const cached = (key, build) => { if (!cache.has(key)) cache.set(key, build()); return cache.get(key); };
const shift = (mesh, p) => transformed(mesh, undefined, p);
const lerp3 = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const wobble = (s, time, amount = 1) => s.active ? Math.sin(time * 15) * Math.exp(-time * 1.1) * amount : 0;
const settle = (s, time, duration = 1.4) => s.active ? ease(time / duration) : s.revealed ? 1 : 0;
// 回弹：越过终点一点再落回，卡通动作的「弹性」。
const backOut = t => { t = clamp(t); const k = 1.9; return 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2; };
const idleBob = (time, s, amp = 3) => s.active ? 0 : Math.sin(time * 2.2) * amp;

function sparkles(p, center, spread, mix, time, count = 5, color = '#fff6c8') {
  if (mix <= .02) return;
  for (let i = 0; i < count; i++) {
    const a = i * 2.399 + time * .7, r = spread * (.55 + (i % 3) * .2);
    const tw = .55 + .45 * Math.sin(time * 4 + i * 1.7);
    p.sparkle(add(center, [Math.cos(a) * r, Math.sin(a) * r * .8, 20]), (7 + (i % 2) * 5) * tw, color, mix);
  }
}

function coin(p, center, rotation, size = 12) {
  const mesh = cached('coin' + size, () => [
    ...lathe([[4.5, -2.2], [size, -2.2], [size + 1, 0], [size, 2.2], [4.5, 2.2]], C.gold, 22),
    ...lathe([[4.5, 2.2], [4.5, -2.2]], C.goldDeep, 22),
  ]);
  p.mesh(transformed(mesh, rotation, center));
}

function badge(p, label, at, mix, { color = C.gold, size = 26, ring = C.red } = {}) {
  if (mix <= .02) return;
  const pop = backOut(mix);
  p.blob(at, 26 * pop, ring, { shine: false });
  p.blob(at, 21 * pop, color, { shine: true, outlined: false });
  p.text(label, add(at, [0, 0, 2]), { size: size * pop, color: C.cream, weight: 800 });
}

/* 同心结：两只圆胖红环相扣，中间金珠，下垂流苏。摇动时左右甩、结成后弹一下并冒出闪光。 */
export function drawKnot(p, s, time) {
  const mix = s.revealMix || 0, swing = wobble(s, time, .6), bob = idleBob(time, s);
  const pop = s.revealed ? 1 + Math.max(0, .14 * Math.sin(Math.min(1, mix) * Math.PI)) : 1;
  p.shadow([0, -128, 0], 86, .16);
  const center = [0, 26 + bob, 0];
  const q = axisAngle([0, 0, 1], swing * .4);
  const rings = cached('knot-rings', () => [
    ...transformed(torus(36, 10, C.red, axisAngle([0, 1, 0], .35), 48), undefined, [-22, 0, 0]),
    ...transformed(torus(36, 10, C.redDark, axisAngle([0, 1, 0], -.35), 48), undefined, [22, 0, 0]),
  ]);
  if (mix > .02) p.glow(center, 130, C.pink, mix * .35);
  p.mesh(transformed(rings, q).map(f => ({ ...f, points: f.points.map(pt => add(center, pt.map(v => v * pop))) })));
  const bead = rotate([0, -40, 8], q);
  p.mesh(shift(cached('knot-bead', () => sphere(11, C.gold, 20, 8)), add(center, bead)));
  const cap = add(center, rotate([0, -62, 8], q));
  p.line([add(center, bead), cap], C.red, 4);
  const sway = swing * 26;
  for (let i = -2; i <= 2; i++) p.line([cap, add(cap, [i * 3 + sway * .5, -28, 0]), add(cap, [i * 4 + sway, -52, 0])], i % 2 ? C.redDark : C.red, 4);
  p.mesh(shift(cached('knot-cap', () => lathe([[0, -6], [8, -4], [9, 4], [0, 7]], C.gold, 18)), cap));
  if (mix > .02) badge(p, '缘', add(center, [0, 2, 40]), mix, { color: C.red, ring: C.gold });
  sparkles(p, center, 70, mix, time, 6);
}

/* 红线：两枚胖玉璧之间一根红线，由松到紧，绷紧时弹一下，线心冒出一颗红心。 */
function heart(p, at, size, mix) {
  const pt = p.project(at), r = size * pt[3] * backOut(mix), c = p.c;
  if (r < 1) return;
  c.save(); c.translate(pt[0], pt[1]);
  c.beginPath();
  c.moveTo(0, r * .9);
  c.bezierCurveTo(-r * 1.3, r * .1, -r * 1.1, -r * 1.05, 0, -r * .45);
  c.bezierCurveTo(r * 1.1, -r * 1.05, r * 1.3, r * .1, 0, r * .9);
  c.closePath();
  c.lineJoin = 'round'; c.lineWidth = p.ow; c.strokeStyle = p.outline; c.stroke();
  c.fillStyle = C.red; c.fill();
  c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(-r * .42, -r * .38, r * .2, r * .12, -.6, 0, TAU); c.fill();
  c.restore();
}
export function drawThread(p, s, time) {
  const t = settle(s, time, 1.5), mix = s.revealMix || 0, bob = idleBob(time, s, 2.5);
  const bi = cached('bi', () => transformed([
    ...lathe([[16, -7], [40, -7], [46, 0], [40, 7], [16, 7], [14, 0], [16, -7]], C.jade, 36),
  ], axisAngle([1, 0, 0], Math.PI / 2)));
  const ends = [];
  for (const x of [-100, 100]) {
    const y = -6 + (x < 0 ? bob : -bob);
    p.shadow([x, -100, 0], 54, .15);
    p.mesh(transformed(bi, axisAngle([0, 1, 0], x < 0 ? .45 : -.45), [x, y, 0]));
    ends.push([x + (x < 0 ? 30 : -30), y + 24, 6]);
  }
  const snap = s.active ? Math.sin(Math.max(0, time - 1.2) * 18) * Math.exp(-Math.max(0, time - 1.2) * 5) * 10 * (time > 1.2 ? 1 : 0) : 0;
  const sag = 66 * (1 - t) + 4 + wobble(s, time, 6) + snap;
  const curve = Array.from({ length: 33 }, (_, i) => {
    const u = i / 32, base = lerp3(ends[0], ends[1], u);
    return add(base, [0, -Math.sin(u * Math.PI) * sag, Math.sin(u * Math.PI) * 8]);
  });
  p.line(curve, C.red, 5);
  const mid = curve[16];
  if (t > .7) heart(p, add(mid, [0, 4, 10]), 17, clamp((t - .7) / .3));
  if (mix > .02) {
    p.glow(mid, 90, C.pink, mix * .3);
    p.text('囍', [0, 78, 0], { size: 40 * backOut(mix), color: C.red, weight: 800, stroke: C.cream });
  }
  sparkles(p, add(mid, [0, 20, 0]), 60, mix, time, 5);
}

/* 官印：圆胖玉印配金色印钮，抬起、蓄力、重重落下（落地压扁再弹回），盖出朱红印文。 */
export function drawSeal(p, s, time) {
  const t = settle(s, time, 1.3), mix = s.revealMix || 0;
  let lift = 0, squash = 1;
  if (s.active) {
    const up = clamp(time / .55), down = clamp((time - .7) / .25);
    lift = time < .7 ? ease(up) * 70 : (1 - down * down) * 70;
    if (time > .95) { const k = Math.exp(-(time - .95) * 7); squash = 1 - Math.sin((time - .95) * 20) * .16 * k; }
  } else lift = s.revealed ? 58 + idleBob(time, { active: false }, 3) : idleBob(time, s, 3) + 4;
  p.shadow([0, -108, 0], 150, .14);
  p.mesh(cached('seal-paper', () => shift(box(236, 5, 150, C.paper), [0, -104, 0])));
  for (const x of [-118, 118]) p.mesh(transformed(cached('seal-roll', () => transformed(lathe([[0, -76], [9, -76], [9, 76], [0, 76]], C.wood, 18), axisAngle([1, 0, 0], Math.PI / 2))), undefined, [x, -100, 0]));
  if (s.revealed || mix > .02) {
    const a = Math.max(mix, s.revealed ? .3 : 0), k = backOut(a);
    p.mesh(shift(box(84 * k, 1, 84 * k, C.red), [0, -101, 0]), { outlined: false });
    p.text(s.level === '上' ? '大吉' : '官印', [0, -100, 0], { size: (s.level === '上' ? 30 : 26) * k, color: C.cream, u: [1, 0, 0], v: [0, 0, -1], weight: 800, alpha: a, stroke: '#9e2a20' });
  }
  const at = [0, -64 + lift, 0];
  p.shadow([0, -102, 0], 58 - lift * .2, .22);
  const body = cached('seal-body', () => [
    ...shift(box(86, 56, 86, C.jade), [0, 0, 0]),
    ...shift(box(92, 10, 92, C.gold), [0, -30, 0]),
    ...shift(box(90, 8, 90, C.gold), [0, 30, 0]),
    ...shift(lathe([[0, 0], [30, 0], [32, 8], [22, 18], [24, 28], [14, 36], [0, 38]], C.gold, 24), [0, 34, 0]),
  ]);
  p.mesh(body.map(f => ({ ...f, points: f.points.map(pt => add(at, [pt[0] * (2 - squash), pt[1] * squash, pt[2] * (2 - squash)])) })));
  p.mesh(shift(cached('seal-ring', () => torus(12, 4, C.goldDeep, axisAngle([0, 1, 0], 0), 24)), add(at, [0, 76 * squash, 0])));
  if (mix > .02) p.glow([0, -96, 0], 90, C.gold, mix * .25);
  sparkles(p, [0, -70, 0], 90, mix, time, 6);
}

/* 青云梯：粗木梯伸进蓬松白云，排盘时横档自下而上逐级变金、每级弹一下，顶端亮起一颗星。 */
export function drawLadder(p, s, time) {
  const t = settle(s, time, 1.8), mix = s.revealMix || 0, rungs = 7;
  const q = axisAngle([0, 1, 0], -.38);
  const base = [-14, -116, 0], top = [34, 82, -24];
  const along = u => lerp3(base, top, u);
  const at = (u, side) => rotate(add(along(u), [side * 30, 0, 0]), q);
  p.shadow([0, -120, 0], 92, .16);
  const cloudAt = rotate(top, q), drift = Math.sin(time * .9) * 4;
  const puffs = [[-44, 6, 4, 22], [-18, 20, 10, 28], [16, 22, 6, 30], [46, 8, 2, 22], [0, 0, 18, 26], [-30, -6, 20, 18], [30, -4, 22, 20]];
  const backPuffs = puffs.filter(pf => pf[2] < 10), frontPuffs = puffs.filter(pf => pf[2] >= 10);
  for (const [x, y, z, r] of backPuffs) p.blob(add(cloudAt, [x + drift, y + 10, z - 20]), r, C.sky, { shine: false });
  p.line([at(0, -1), at(1, -1)], C.woodDeep, 9);
  p.line([at(0, 1), at(1, 1)], C.woodDeep, 9);
  for (let i = 0; i < rungs; i++) {
    const u = (i + .6) / (rungs + .4), lit = clamp(t * rungs - i);
    const hop = lit > 0 && lit < 1 ? Math.sin(lit * Math.PI) * 5 : 0;
    p.line([add(at(u, -1), [0, hop, 0]), add(at(u, 1), [0, hop, 0])], lit >= 1 || (lit > 0 && !s.active) ? C.gold : C.wood, 7);
    if (lit > 0 && lit < 1) p.sparkle(add(rotate(along(u), q), [0, 8 + hop, 20]), 10, '#fff6c8');
  }
  for (const [x, y, z, r] of frontPuffs) p.blob(add(cloudAt, [x + drift, y + 10, z + 10]), r, C.sky, { shine: false });
  if (mix > .02) {
    p.glow(add(cloudAt, [0, 40, 30]), 80, C.gold, mix * .35);
    p.sparkle(add(cloudAt, [0, 70, 40]), 24 * backOut(mix), C.gold, 1);
    p.text('青云', add(cloudAt, [0, 14, 46]), { size: 22 * backOut(mix), color: C.gold, weight: 800 });
  }
}

/* 摇钱树：胖胖的树冠挂满金币，摇动时整棵树弹性摇摆、金币一枚枚蹦进盆里，揭晓后金光闪闪。 */
const TREE_COINS = Array.from({ length: 12 }, (_, i) => {
  const a = i * 2.399, r = 20 + (i % 4) * 12;
  return { x: Math.cos(a) * r, y: 44 + Math.sin(a) * r * .55, z: 30 + (i % 3) * 6, fall: i % 3 === 0, i };
});
const CANOPY = [[-38, 40, -10, 34], [36, 44, -8, 34], [0, 70, -14, 38], [-20, 30, 4, 28], [22, 30, 6, 28], [0, 48, 10, 32]];
export function drawTree(p, s, time) {
  const mix = s.revealMix || 0, sway = wobble(s, time, .16) + (s.active ? 0 : Math.sin(time * 1.6) * .015);
  const fallT = s.active ? clamp((time - .25) / 1.2) : s.revealed ? 1 : 0;
  p.shadow([0, -120, 0], 104, .17);
  p.mesh(cached('tree-pot', () => [
    ...lathe([[0, -118], [42, -118], [52, -96], [0, -96]], C.red, 32),
    ...lathe([[0, -98], [58, -98], [60, -88], [56, -84], [0, -84]], C.gold, 32),
  ]));
  p.mesh(cached('tree-soil', () => lathe([[0, -86], [50, -86], [50, -84.5], [0, -84.5]], '#7a4a2a', 32)), { outlined: false });
  const bend = point => rotate(point, axisAngle([0, 0, 1], sway * clamp((point[1] + 86) / 150)));
  p.line([[0, -86, 0], [3, -40, 0], [-2, 0, 0], [0, 30, 0]].map(bend), C.wood, 16);
  for (const [a, b] of [[[0, -6, 0], [-34, 30, 0]], [[0, 0, 0], [32, 32, 0]]]) p.line([a, b].map(bend), C.wood, 9);
  for (const [x, y, z, r] of CANOPY) p.blob(bend([x, y, z]), r, z > 0 ? C.leaf : C.leafDeep, { shine: z > 0 });
  for (const c of TREE_COINS) {
    const hang = bend([c.x, c.y, c.z]);
    if (c.fall && fallT > 0) {
      const local = clamp(fallT * 1.4 - (c.i % 4) * .12), ground = [(c.i % 5 - 2) * 18, -80, 30 + (c.i % 2) * 8];
      const arc = Math.sin(local * Math.PI) * 26;
      const pos = add(lerp3(hang, ground, ease(local)), [0, arc, 0]);
      coin(p, pos, local >= 1 ? axisAngle([1, 0, 0], .35) : axisAngle([0, 1, 0], local * 12), 12);
    } else {
      coin(p, hang, axisAngle([1, 0, 0], Math.PI / 2 + Math.sin(c.i + (s.active ? time * 8 : time * 1.5)) * .35), 11);
    }
  }
  if (mix > .02) p.glow([0, -70, 30], 90, C.gold, mix * .35);
  sparkles(p, [0, 40, 0], 80, mix, time, 6);
}

/* 财库：红漆宝箱金色包边，开库时箱盖弹开，元宝蹦出来、金光四射。 */
export function drawVault(p, s, time) {
  const t = settle(s, time, 1.6), mix = s.revealMix || 0, bob = idleBob(time, s, 2);
  const shake = s.active && time < .6 ? Math.sin(time * 40) * 3 * (1 - time / .6) : 0;
  const o = [shake, bob * .3, 0];
  p.shadow([0, -112, 0], 128, .18);
  p.mesh(shift(cached('vault-body', () => [
    ...shift(box(168, 76, 100, C.chest), [0, -66, 0]),
    ...shift(box(174, 10, 106, C.gold), [0, -100, 0]),
    ...shift(box(174, 8, 106, C.gold), [0, -30, 0]),
    ...shift(box(14, 76, 104, C.gold), [-62, -66, 0]),
    ...shift(box(14, 76, 104, C.gold), [62, -66, 0]),
  ]), o));
  const open = s.active ? backOut(clamp((time - .5) / .9)) : t;
  if (open > .02) p.mesh(shift(cached('vault-inside', () => box(146, 2, 82, '#5e2418')), add(o, [0, -27, 0])), { outlined: false });
  if (open > .1) {
    const ingot = cached('ingot', () => lathe([[0, -10], [20, -10], [28, -2], [34, 8], [16, 4], [13, 14], [0, 16]], C.gold, 24));
    const jump = s.active ? clamp((time - .7) / .7) : 1;
    for (const [x, z, a, d] of [[-36, -8, .3, 0], [0, 4, -.2, .1], [36, -10, .5, .2], [-14, 22, 0, .15], [22, 24, .1, .05]]) {
      const k = clamp(jump * 1.4 - d), hop = Math.sin(k * Math.PI) * 36;
      p.mesh(transformed(ingot, axisAngle([0, 1, 0], a), add(o, [x, -22 + hop + k * 4, z])));
    }
    p.glow(add(o, [0, 0, 0]), 120, C.gold, .12 + open * .2 + mix * .1);
  }
  const lid = Math.min(1.25, open) * 1.75;
  const lidMesh = cached('vault-lid', () => [
    ...shift(box(172, 24, 104, C.chest), [0, 12, 52]),
    ...shift(box(176, 6, 10, C.gold), [0, 22, 101]),
    ...shift(box(176, 6, 10, C.gold), [0, 22, 3]),
    ...shift(box(16, 28, 108, C.gold), [-62, 12, 52]),
    ...shift(box(16, 28, 108, C.gold), [62, 12, 52]),
    ...shift(box(30, 30, 8, C.gold), [0, 0, 106]),
  ]);
  p.mesh(transformed(lidMesh, axisAngle([1, 0, 0], -lid), add(o, [0, -26, -52])));
  if (open < .3) p.text('财', add(o, [0, -64, 52]), { size: 30, color: C.gold, weight: 800 });
  if (mix > .02) p.text('财库', [0, 70, 0], { size: 26 * backOut(mix), color: C.gold, weight: 800 });
  sparkles(p, [0, 10, 0], 100, Math.max(mix, open > .6 ? .8 : 0), time, 7);
}
