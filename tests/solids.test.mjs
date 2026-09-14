import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cubeMesh, d20Mesh, coinMesh, faceUp, rotate, dot, IDENTITY,
  supportHeight,
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

test('support height keeps the lowest rotated vertex on the table', () => {
  for (const mesh of [cubeMesh(),d20Mesh(),coinMesh()]) for(let i=0;i<20;i++) {
    const q=faceUp(mesh,i+1), height=supportHeight(mesh,q,30);
    const lowest=Math.min(...mesh.flatMap(f=>f.points.map(p=>rotate(p,q)[2]*30)));
    close(height+lowest,0);
  }
});
