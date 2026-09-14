import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cubeMesh, d20Mesh, coinMesh, faceUp, rotate, dot, IDENTITY,
  throwPose, supportHeight, flightHeight, projectSolidPoint, CONTACTS,
} from '../src/core/solids.js';

const close = (a, b, tolerance = 1e-8) => assert(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`);

for (const [name, mesh, count] of [['D6', cubeMesh(), 6], ['D20', d20Mesh(), 20]]) {
  test(`${name}: complete numbered faces, complementary opposite faces, correct landing orientation`, () => {
    const numbered = mesh.filter(f => f.ink);
    assert.deepEqual(numbered.map(f => f.ink.value).sort((a, b) => a - b), Array.from({ length: count }, (_, i) => i + 1));
    for (const f of numbered) {
      const opposite = numbered.find(other => dot(f.normal, other.normal) < -.99999);
      assert.equal(f.ink.value + opposite.ink.value, count + 1);
      const q = faceUp(mesh, f.ink.value);
      close(rotate(f.normal, q)[2], 1);
      close(rotate(f.u, q)[0], 1);
      assert(f.points.every(p => p.every(Number.isFinite)));
    }
  });
}

test('D20 has 20 closed triangular faces and 30 shared edges', () => {
  const edges = new Map();
  for (const f of d20Mesh()) {
    assert.equal(f.points.length, 3);
    f.points.forEach((p, i) => {
      const key = [JSON.stringify(p), JSON.stringify(f.points[(i + 1) % 3])].sort().join('|');
      edges.set(key, (edges.get(key) || 0) + 1);
    });
  }
  assert.equal(edges.size, 30);
  assert([...edges.values()].every(count => count === 2));
});

test('coin has a real square hole, thickness and inward facing hole walls', () => {
  const mesh = coinMesh(), walls = mesh.filter(f => Math.hypot(...f.center.slice(0, 2)) < .3 && Math.abs(f.normal[2]) < .01);
  assert.equal(walls.length, 48);
  assert(walls.every(f => dot(f.normal, f.center) < 0));
  const zs = mesh.flatMap(f => f.points.map(p => p[2]));
  close(Math.max(...zs) - Math.min(...zs), .17);
  assert(mesh.every(f => f.points.every(([x, y]) => Math.max(Math.abs(x), Math.abs(y)) >= .1799)));
});

test('throw has airtime, diminishing bounces and a tilted pause before final contact', () => {
  const mesh = cubeMesh(), target = faceUp(mesh, 6), up = mesh.find(f => f.ink?.value === 6).normal;
  assert(throwPose(.15).lift > throwPose(.39).lift);
  assert(throwPose(.39).lift > throwPose(.555).lift);
  for (const t of CONTACTS) close(throwPose(t).lift, 0);
  const suspense = throwPose(.78, { target });
  assert.equal(suspense.phase, 'settling');
  assert(rotate(up, suspense.q)[2] < .9);
  close(rotate(up, throwPose(1, { target }).q)[2], 1);
  for (let i = 0; i <= 100; i++) {
    const p = throwPose(i / 100, { target });
    const lowest = Math.min(...mesh.flatMap(f => f.points.map(v => rotate(v, p.q)[2] * 30)));
    close(lowest + supportHeight(mesh, p.q, 30), 0);
  }
});

test('strong throws stay in the scene on a 320px phone including all D20 results', () => {
  const width = 288, height = 300;
  const specs = [
    { mesh: coinMesh(), size: 68, x: 0, targets: [IDENTITY], axis: [1, .16, .12] },
    { mesh: cubeMesh(), size: 30, x: 92, targets: Array.from({ length: 6 }, (_, i) => faceUp(cubeMesh(), i + 1)) },
    { mesh: d20Mesh(), size: 44, x: 92, targets: Array.from({ length: 20 }, (_, i) => faceUp(d20Mesh(), i + 1)) },
  ];
  for (const { mesh, size, x, targets, axis } of specs) for (const target of targets) {
    for (let i = 0; i <= 50; i++) {
      const pose = throwPose(i / 50, { target, power: 1.5, height: flightHeight(height, 1.5), x, drift: x ? -x * .18 : 18, ...(axis && { axis }) });
      const z = supportHeight(mesh, pose.q, size) + pose.lift;
      for (const f of mesh) for (const v of f.points) {
        const p = rotate(v, pose.q).map(n => n * size);
        p[0] += pose.x; p[1] += pose.y; p[2] += z;
        const [sx, sy] = projectSolidPoint(p, width, height);
        assert(sx >= 0 && sx <= width && sy >= 0 && sy <= height, `cropped vertex: ${sx}, ${sy}`);
      }
    }
  }
});
