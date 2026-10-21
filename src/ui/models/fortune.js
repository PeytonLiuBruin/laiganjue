// 姻缘 · 事业 · 财富 的六件器物：同心结、红线、官印、青云梯、摇钱树、财库。
// 与其它器物共用同一套 painter：mesh / line / text / glow / shadow。
// 状态约定：active 时按 time（本次动作开始后的秒数）播放动作，revealed 后停在落定姿态，
// revealMix 由渲染器平滑过渡，用来淡入光晕与文字。
import { lathe, torus, box, transformed, rotate, axisAngle, add, clamp, ease } from './geometry.js';
const TAU = Math.PI * 2;
const RED = '#a8433a', DEEP_RED = '#7d2f2a', GOLD = '#c9a24a', JADE = '#7fa58f', WOOD = '#8a6440', LEAF = '#5f8a62';
const cache = new Map();
const cached = (key, build) => { if (!cache.has(key)) cache.set(key, build()); return cache.get(key); };
const shift = (mesh, p) => transformed(mesh, undefined, p);
const wobble = (s, time, amount = 1) => s.active ? Math.sin(time * 15) * Math.exp(-time * .8) * amount : 0;
const settle = (s, time, duration = 1.4) => s.active ? ease(time / duration) : s.revealed ? 1 : 0;

function coin(p, center, rotation, size = 9) {
  const mesh = cached('coin' + size, () => [
    ...lathe([[3.2, -1.1], [size, -1.1], [size, 1.1], [3.2, 1.1]], GOLD, 20),
    ...lathe([[3.2, 1.1], [3.2, -1.1]], '#9c7a32', 20),
  ]);
  p.mesh(transformed(mesh, rotation, center));
}

function tassel(p, top, length, sway, color = RED) {
  for (let i = -3; i <= 3; i++) {
    const x = i * 2.2;
    p.line([add(top, [x * .4, 0, 0]), add(top, [x + sway * .5, -length * .55, 0]), add(top, [x * 1.2 + sway, -length, 0])], color, 1.2, .9);
  }
  p.mesh(shift(cached('tassel-cap', () => lathe([[0, -4], [5, -2], [5, 3], [0, 5]], GOLD, 16)), top));
}

/* 同心结：两只相扣的红环，下垂流苏。摇动时轻晃，结成后泛起暖光。 */
export function drawKnot(p, s, time) {
  const glowMix = s.revealMix || 0, spin = wobble(s, time, .5) + (s.revealed ? .35 : .25);
  p.shadow([0, -128, 0], 92, .14);
  const q = axisAngle([0, 1, 0], spin);
  const rings = cached('knot-rings', () => [
    ...transformed(torus(40, 6, RED, axisAngle([0, 1, 0], .35), 64), undefined, [-20, 0, 0]),
    ...transformed(torus(40, 6, DEEP_RED, axisAngle([0, 1, 0], -.35), 64), undefined, [20, 0, 0]),
  ]);
  p.glow([0, 22, 0], 120, RED, .06 + glowMix * .16);
  p.mesh(transformed(shift(rings, [0, 0, 0]), q, [0, 22, 0]));
  p.mesh(transformed(cached('knot-core', () => box(16, 16, 10, RED)), axisAngle([0, 0, 1], Math.PI / 4), [0, -26, 6]));
  p.line([[0, -34, 6], [0, -52, 6]], RED, 2.2);
  tassel(p, [0, -56, 6], 58, wobble(s, time, 9));
  if (glowMix > .02) p.text('缘', [0, 22, 30], { size: 30, color: '#f6e7d4', weight: 700, alpha: glowMix });
}

/* 红线：两枚玉璧之间一根红线。牵线时由松变紧，合上时线心打出一个小结。 */
export function drawThread(p, s, time) {
  const t = settle(s, time, 1.5), glowMix = s.revealMix || 0;
  const bi = cached('bi', () => transformed(lathe([[18, -4], [42, -4], [44, 0], [42, 4], [18, 4], [18, -4]], JADE, 40), axisAngle([1, 0, 0], Math.PI / 2)));
  for (const x of [-104, 104]) {
    p.shadow([x, -96, 0], 56, .13);
    p.mesh(transformed(bi, axisAngle([0, 1, 0], x < 0 ? .5 : -.5), [x, -12, 0]));
  }
  const sag = 70 * (1 - t) + 6 + wobble(s, time, 8);
  const curve = Array.from({ length: 41 }, (_, i) => {
    const u = i / 40, x = -64 + u * 128;
    return [x, 18 - Math.sin(u * Math.PI) * sag, Math.sin(u * Math.PI) * 10];
  });
  p.line([[-104, 30, 0], curve[0]], RED, 2, .85);
  p.line([curve[40], [104, 30, 0]], RED, 2, .85);
  p.line(curve, RED, 2.4);
  const mid = curve[20];
  if (t > .6) {
    const k = clamp((t - .6) / .4);
    p.mesh(transformed(cached('thread-knot', () => box(11, 11, 8, RED)), axisAngle([0, 0, 1], Math.PI / 4), add(mid, [0, 0, 2])));
    p.glow(mid, 46 * k, RED, .12 + glowMix * .18);
  }
  if (glowMix > .02) p.text('囍', [0, 72, 0], { size: 34, color: RED, weight: 700, alpha: glowMix });
}

/* 官印：方印纽钮，落印时抬起压下，印文朱红留在纸上。 */
export function drawSeal(p, s, time) {
  const t = settle(s, time, 1.3), glowMix = s.revealMix || 0;
  const lift = s.active ? Math.abs(Math.sin(time * 4.6)) * 46 * (1 - ease(time / 1.6)) + (1 - t) * 30 : s.revealed ? 46 : 0;
  p.shadow([0, -108, 0], 140, .14);
  p.mesh(cached('seal-paper', () => shift(box(230, 3, 150, '#f2ead8'), [0, -102, 0])));
  if (s.revealed || glowMix > .02) {
    const a = s.revealed ? Math.max(glowMix, .2) : glowMix;
    p.mesh(shift(cached('seal-mark', () => box(80, .6, 80, '#b23a2e')), [0, -100, 0]));
    p.text(s.level === '上' ? '大吉' : '官印', [0, -99.5, 0], { size: s.level === '上' ? 28 : 24, color: '#f8e9dc', u: [1, 0, 0], v: [0, 0, -1], weight: 700, alpha: a });
  }
  const at = [0, -70 + lift, 0];
  p.shadow([0, -101, 0], 54 + lift * .2, .18);
  p.mesh(shift(cached('seal-body', () => [
    ...shift(box(82, 70, 82, '#d9cfb7'), [0, 8, 0]),
    ...shift(box(86, 7, 86, '#c9b98f'), [0, -27, 0]),
    ...shift(lathe([[0, 43], [26, 43], [28, 52], [18, 66], [20, 78], [10, 88], [0, 90]], GOLD, 28), [0, 0, 0]),
  ]), at));
  p.mesh(shift(cached('seal-ring', () => torus(11, 2.6, '#9c7a32', axisAngle([0, 1, 0], 0), 28)), add(at, [0, 76, 0])));
  if (glowMix > .02) p.glow([0, -96, 0], 70, '#b23a2e', glowMix * .15);
}

/* 青云梯：一架斜梯伸入云端，排盘时横档自下而上逐级亮起。 */
export function drawLadder(p, s, time) {
  const t = settle(s, time, 1.8), glowMix = s.revealMix || 0, rungs = 9;
  const q = axisAngle([0, 1, 0], -.42);
  const base = [-10, -112, 0], top = [40, 102, -30];
  const at = (u, side) => rotate(add(add(base, [(top[0] - base[0]) * u, (top[1] - base[1]) * u, (top[2] - base[2]) * u]), [side * 26, 0, 0]), q);
  p.shadow([0, -118, 0], 100, .14);
  for (let i = 0; i < 5; i++) {
    const a = i * 1.7 + (s.active ? time * .6 : 0);
    p.glow(add(rotate(top, q), [Math.cos(a) * 46, 10 + Math.sin(a * 1.3) * 12, 0]), 54 + i * 4, '#ffffff', .55);
  }
  p.line([at(0, -1), at(1, -1)], WOOD, 4.5);
  p.line([at(0, 1), at(1, 1)], WOOD, 4.5);
  for (let i = 0; i < rungs; i++) {
    const u = (i + .5) / rungs, lit = t * rungs - i;
    const color = lit > 0 ? GOLD : '#9f8463';
    p.line([at(u, -1), at(u, 1)], color, 3.2, .95);
    if (lit > 0 && lit < 1.2) p.glow(rotate(add(base, [(top[0] - base[0]) * u, (top[1] - base[1]) * u, (top[2] - base[2]) * u]), q), 26, GOLD, .32);
  }
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1 + (s.active ? time : 0) * .4;
    p.glow(add(rotate(top, q), [Math.cos(a) * 34 - 10, Math.sin(a) * 8 + 4, 18]), 40, '#f7f4ee', .75);
  }
  if (glowMix > .02) {
    p.glow(rotate(top, q), 80, GOLD, glowMix * .28);
    p.text('青云', add(rotate(top, q), [0, 6, 30]), { size: 20, color: '#8a6a2c', weight: 700, alpha: glowMix });
  }
}

/* 摇钱树：树冠挂满铜钱，摇动时枝叶晃动、铜钱落下，落定后堆在树下。 */
const TREE_COINS = Array.from({ length: 14 }, (_, i) => {
  const a = i * 2.399, r = 22 + (i % 4) * 14;
  return { x: Math.cos(a) * r, y: 40 + Math.sin(a) * r * .55, z: Math.sin(a) * 18, fall: i % 3 === 0, i };
});
export function drawTree(p, s, time) {
  const glowMix = s.revealMix || 0, sway = wobble(s, time, .12);
  const fallT = s.active ? clamp((time - .3) / 1.1) : s.revealed ? 1 : 0;
  p.shadow([0, -120, 0], 110, .16);
  p.mesh(cached('tree-pot', () => lathe([[0, -118], [52, -118], [58, -110], [56, -88], [48, -84], [0, -84]], '#b5835a', 36)));
  p.mesh(cached('tree-soil', () => lathe([[0, -86], [48, -86], [48, -85], [0, -85]], '#5a4535', 36)));
  const bend = point => rotate(point, axisAngle([0, 0, 1], sway * clamp((point[1] + 86) / 150)));
  p.line([[0, -86, 0], [2, -40, 0], [-2, 0, 0], [0, 26, 0]].map(bend), WOOD, 9);
  for (const [a, b] of [[[0, -10, 0], [-46, 34, 6]], [[0, 0, 0], [44, 40, -4]], [[0, 20, 0], [-18, 74, 0]], [[0, 22, 0], [26, 76, 8]]]) p.line([a, b].map(bend), WOOD, 4.5);
  for (let i = 0; i < 10; i++) {
    const a = i * 2.399, r = 30 + (i % 3) * 18;
    p.glow(bend([Math.cos(a) * r, 48 + Math.sin(a) * r * .6, Math.sin(a) * 14]), 34, LEAF, .42);
  }
  for (const c of TREE_COINS) {
    const fall = c.fall ? ease(fallT) : 0;
    const groundX = (c.i % 5 - 2) * 16, ground = [groundX, -82, 18 + (c.i % 2) * 8];
    const hang = bend([c.x, c.y, c.z + 10]);
    const pos = fall ? [hang[0] + (ground[0] - hang[0]) * fall, hang[1] + (ground[1] - hang[1]) * fall, hang[2] + (ground[2] - hang[2]) * fall] : hang;
    if (!fall) p.line([add(hang, [0, 12, 0]), add(hang, [0, 8, 0])], RED, 1, .8);
    const rot = fall > .98 ? axisAngle([1, 0, 0], .25) : axisAngle([1, 0, 0], Math.PI / 2 + Math.sin(c.i + (s.active ? time * 6 : 0)) * .5);
    coin(p, pos, rot, 9);
  }
  if (glowMix > .02) p.glow([0, -82, 20], 70, GOLD, glowMix * .3);
}

/* 财库：木箱铜扣，开库时箱盖掀起，元宝金光透出。 */
export function drawVault(p, s, time) {
  const t = settle(s, time, 1.6), glowMix = s.revealMix || 0;
  p.shadow([0, -110, 0], 130, .17);
  p.mesh(cached('vault-body', () => [
    ...shift(box(170, 78, 104, '#7a4a2e'), [0, -66, 0]),
    ...shift(box(174, 8, 108, GOLD), [0, -100, 0]),
    ...shift(box(174, 6, 108, GOLD), [0, -30, 0]),
    ...shift(box(10, 78, 108.5, '#9c7a32'), [-56, -66, 0]),
    ...shift(box(10, 78, 108.5, '#9c7a32'), [56, -66, 0]),
  ]));
  if (t > .15) {
    const ingot = cached('ingot', () => [
      ...lathe([[0, -9], [20, -9], [27, 0], [30, 7], [14, 4], [12, 12], [0, 14]], '#d8b252', 28),
    ]);
    for (const [x, z, a] of [[-34, -10, .3], [0, 4, -.2], [34, -12, .5], [-12, 20, 0], [20, 22, .1]]) {
      p.mesh(transformed(ingot, axisAngle([0, 1, 0], a), [x, -22 + ease(t) * 4, z]));
    }
    p.glow([0, -6, 0], 110, GOLD, .08 + t * .14 + glowMix * .1);
  }
  const lid = t * 1.9;
  const hinge = [0, -27, -52];
  const lidMesh = cached('vault-lid', () => [
    ...shift(box(174, 22, 108, '#8a5636'), [0, 11, 54]),
    ...shift(box(176, 4, 110, GOLD), [0, 22, 54]),
    ...shift(box(22, 18, 4, GOLD), [0, 6, 108]),
  ]);
  p.mesh(transformed(lidMesh, axisAngle([1, 0, 0], -lid), hinge));
  if (t < .3) p.text('库', [0, -60, 52.5], { size: 22, color: '#f1d79a', weight: 700 });
  if (glowMix > .02) p.text('财库', [0, 52, 0], { size: 22, color: '#8a6a2c', weight: 700, alpha: glowMix });
}

