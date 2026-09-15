import test from 'node:test';
import assert from 'node:assert/strict';
import { createSolidScene } from '../src/ui/solid-scene.js';
import { createBlockMesh } from '../src/modules/jiaobei/model.js';
import { face, axisAngle, coinMesh, d20Mesh, faceUp } from '../src/core/solids.js';
import { rotationError } from '../src/core/throw-physics.js';

function sceneRig(t, specs) {
  let time = 0, nextFrame = 0;
  const frames = new Map(), attrs = new Map();
  const globals = {
    window: { devicePixelRatio: 1 },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    ResizeObserver: class { constructor(cb) { this.cb = cb; } observe() { this.cb(); } disconnect() {} },
    requestAnimationFrame(fn) { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { frames.delete(id); },
    performance: { now: () => time },
  };
  const previous = Object.fromEntries(Object.keys(globals).map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const [k, value] of Object.entries(globals)) Object.defineProperty(globalThis, k, { value, configurable: true });
  const canvas = {
    dataset: {}, getContext: () => null, getBoundingClientRect: () => ({ width: 350, height: 360 }),
    removeAttribute: k => attrs.delete(k), getAttribute: k => attrs.get(k) ?? null, setAttribute: (k, v) => attrs.set(k, v),
  };
  const ctx = { addCleanup() {}, platform: { simpleMotion: false }, haptic: { impact() {}, settle() {} }, sound: { play() {} } };
  const scene = createSolidScene(canvas, ctx); scene.set(specs);
  t.after(() => {
    scene.dispose();
    for (const [k, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k]; }
  });
  function step() { time += 1000 / 60; const ready = [...frames.values()]; frames.clear(); ready.forEach(fn => fn(time)); }
  async function finish(result, expected = true) {
    for (let i = 0; i < 1200 && canvas.dataset.phase !== 'settled'; i++) step();
    assert.equal(canvas.dataset.phase, 'settled'); assert.deepEqual(await result, expected);
  }
  return { scene, canvas, step, finish };
}

const jiaobeiMesh = createBlockMesh(28, 10).map(f => face(f.points, null, f.flat ? 'cut' : 'wood'));
const specs = () => [-1, 1].map(side => ({ kind: 'jiaobei', mesh: jiaobeiMesh, size: 43, x: side * 65, y: side * 8, q: axisAngle([1, 0, 0], .14) }));

test('jiaobei follow-up previews preserve the newly landed faces instead of pre-throw faces', async t => {
  const { scene, finish } = sceneRig(t, specs());
  for (const faces of [['flat', 'round'], ['round', 'round'], ['round', 'flat'], ['flat', 'flat'], ['stand', 'round']]) {
    scene.preview(18, -28);
    await finish(scene.throwTo(faces, 22));
    const landed = scene.objects.map(o => ({ q: [...o.q], x: o.x, y: o.y }));
    faces.forEach((value, i) => assert(rotationError(landed[i].q, axisAngle([1, 0, 0], value === 'round' ? Math.PI : value === 'stand' ? Math.PI / 2 : 0)).angle < 1e-9));
    scene.preview(0, 0);
    scene.objects.forEach((o, i) => assert.deepEqual(o.q, landed[i].q, `result ${faces} changed on the next motion sample`));
    scene.preview(-12, -40); scene.rest();
    scene.objects.forEach((o, i) => { assert.deepEqual(o.q, landed[i].q); assert.equal(o.x, landed[i].x); assert.equal(o.y, landed[i].y); assert.equal(o.lift, 0); });
  }
});

for (const [kind, mesh, value] of [['coin', coinMesh(), 'tails'], ['dice', d20Mesh(), 17]]) {
  test(`${kind} restores the latest physical result when a new drag is cancelled`, async t => {
    const { scene, finish } = sceneRig(t, [{ kind, mesh, size: 42, x: 0, y: 0, q: axisAngle([1, 0, 0], .12) }]);
    scene.preview(20, -36); await finish(scene.throwTo([value], 20));
    const target = kind === 'coin' ? axisAngle([1, 0, 0], Math.PI) : faceUp(mesh, value);
    scene.preview(-15, -20); scene.rest();
    assert(rotationError(scene.objects[0].q, target).angle < 1e-9, `${kind} reverted to an old drag baseline`);
  });
}

test('preview cleanup cannot overwrite a throw that is already in flight', async t => {
  const { scene, step, finish } = sceneRig(t, specs());
  scene.preview(16, -30); const pending = scene.throwTo(['round', 'flat'], 22);
  for (let i = 0; i < 14; i++) step();
  const airborne = scene.objects.map(o => ({ q: [...o.q], z: o.z, lift: o.lift }));
  scene.preview(0, 0); scene.rest();
  scene.objects.forEach((o, i) => assert.deepEqual({ q: o.q, z: o.z, lift: o.lift }, airborne[i]));
  await finish(pending);
});

test('live D20 shaking preserves the latest landed face across repeated rounds and cancelled previews', async t => {
  const mesh = d20Mesh();
  const { scene, step, finish } = sceneRig(t, [{ kind: 'dice', mesh, size: 32, x: 0, y: 0, q: faceUp(mesh, 3) }]);
  for (const value of [17, 6]) {
    scene.preview(18, -25);
    const pending = scene.startDiceShake(() => [value]);
    scene.driveDice({ ax: 12, holding: true });
    for (let i = 0; i < 8; i++) step();
    const rolling = [...scene.objects[0].q];
    scene.rest(); assert.deepEqual(scene.objects[0].q, rolling);
    scene.releaseDice(); await finish(pending, [value]);
    scene.preview(-15, -20); scene.rest();
    assert(rotationError(scene.objects[0].q, faceUp(mesh, value)).angle < 1e-9);
  }
});
