import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiceShake } from '../src/modules/coin/dice-shake.js';
import { cubeMesh, d20Mesh, faceUp, rotate, supportHeight, projectSolidPoint } from '../src/core/solids.js';

function rig(sides = 6, count = 3) {
  const mesh = sides === 20 ? d20Mesh() : cubeMesh(), small = count > 3;
  const objects = Array.from({ length: count }, (_, i) => ({
    mesh, size: sides === 20 ? (small ? 36 : 44) : (small ? 25 : 30),
    x: (i % Math.min(count, 3) - (Math.min(count, 3) - 1) / 2) * (small ? 82 : 92),
    y: small ? (i < 3 ? 50 : -38) : 0, lift: 0, q: faceUp(mesh, 1),
  }));
  let draws = 0;
  const motion = createDiceShake(objects, { chooseValues: () => { draws++; return objects.map(() => draws); } });
  return { objects, motion, get draws() { return draws; } };
}
function shaking(r, t, power = 1) {
  r.motion.feed({ ax: 18 * Math.sin(t / 70) * power, ay: 9 * Math.cos(t / 90) * power, az: 6 * Math.sin(t / 40) * power, t });
  return r.motion.advance(t);
}
function quiet(r, start, end) {
  let state;
  for (let t = start; t <= end; t += 16) { r.motion.feed({ t }); state = r.motion.advance(t); }
  return state;
}

for (const sides of [6, 20]) test(`D${sides}: keeps rotating throughout a 15-second shake and reveals only after stopping`, () => {
  const r = rig(sides), orientations = [];
  for (let t = 0; t <= 15000; t += 16) {
    const state = shaking(r, t);
    assert.equal(state.phase, 'shaking'); assert.equal(state.values, null);
    if (t % 1600 === 0) orientations.push([...r.objects[0].q]);
  }
  assert.equal(r.draws, 0);
  assert(orientations.slice(1).every((q, i) => Math.hypot(...q.map((v, j) => v - orientations[i][j])) > .1));
  assert.equal(quiet(r, 15016, 15224).phase, 'shaking');
  assert.equal(quiet(r, 15240, 15400).phase, 'settling');
  const result = quiet(r, 15416, 17000);
  assert.equal(result.phase, 'settled'); assert.deepEqual(result.values, [1, 1, 1]); assert.equal(r.draws, 1);
  for (const o of r.objects) assert(Math.abs(rotate(o.mesh.find(f => f.ink?.value === 1).normal, o.q)[2] - 1) < 1e-8);
});

test('resuming during the final roll preserves the current pose and discards the pending result', () => {
  const r = rig();
  for (let t = 0; t < 1200; t += 16) shaking(r, t);
  assert.equal(quiet(r, 1200, 2000).phase, 'settling');
  const before = r.objects.map(o => [...o.q]);
  r.motion.feed({ ax: -18, t: 2016 });
  assert.equal(r.motion.phase, 'shaking');
  assert.deepEqual(r.objects.map(o => o.q), before, 'resuming must not reset orientation');
  for (let t = 2016; t < 6500; t += 16) assert.equal(shaking(r, t).values, null);
  const result = quiet(r, 6512, 8304);
  assert.equal(result.phase, 'settled'); assert.deepEqual(result.values, [2, 2, 2]);
});

test('brief zero crossings, weak ongoing movement and a missing sensor tail have correct release timing', () => {
  const r = rig();
  for (let t = 0; t < 1500; t += 16) {
    r.motion.feed({ ax: t % 240 < 80 ? 0 : t % 480 < 240 ? 4 : -4, t });
    assert.equal(r.motion.advance(t).phase, 'shaking');
  }
  assert.equal(r.draws, 0);
  let final;
  for (let t = 1504; t < 3400; t += 16) final = r.motion.advance(t);
  assert.equal(final.phase, 'settled'); assert.equal(r.draws, 1);
});

test('dragging keeps control until pointer release', () => {
  const r = rig(); r.motion.feed({ ax: 15, t: 0, holding: true });
  for (let t = 16; t < 4000; t += 16) assert.equal(r.motion.advance(t).phase, 'shaking');
  assert.equal(r.draws, 0); r.motion.endInput(4000);
  assert.equal(quiet(r, 4016, 5808).phase, 'settled');
});

test('one to six live D6/D20 dice keep finite poses and fit the narrow phone scene', () => {
  for (const sides of [6, 20]) for (const count of [1, 3, 6]) {
    const r = rig(sides, count);
    for (let t = 0; t < 5000; t += 16) {
      shaking(r, t, 1.5);
      for (const o of r.objects) {
        assert([...o.q, o.x, o.y, o.lift].every(Number.isFinite));
        assert(Math.abs(Math.hypot(...o.q) - 1) < 1e-7);
        if (t % 128) continue;
        const z = supportHeight(o.mesh, o.q, o.size) + o.lift;
        for (const f of o.mesh) for (const vertex of f.points) {
          const p = rotate(vertex, o.q).map(v => v * o.size);
          p[0] += o.x; p[1] += o.y; p[2] += z;
          const [x, y] = projectSolidPoint(p, 288, 300);
          assert(x >= 0 && x <= 288 && y >= 0 && y <= 300, `D${sides} × ${count} cropped at ${x}, ${y}`);
        }
      }
    }
  }
});
