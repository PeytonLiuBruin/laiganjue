import { createThrowPhysics } from '../src/core/throw-physics.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { coinFaces, coinLayout, COIN_VIEW } from '../src/modules/liuyao/coins.js';
import { axisAngle, rotate, supportHeight, flightHeight, projectSolidPoint } from '../src/core/solids.js';

test('all eight three-coin outcomes display the same faces used to calculate the line', () => {
  for (let mask = 0; mask < 8; mask++) {
    const values = [0, 1, 2].map(i => mask & (1 << i) ? 3 : 2);
    const faces = coinFaces(values);
    assert.equal(faces.length, 3);
    assert.equal(faces.reduce((sum, f) => sum + (f === 'heads' ? 3 : 2), 0), values.reduce((a, b) => a + b));
    faces.forEach((face, i) => {
      const orientation = axisAngle([1, 0, 0], face === 'tails' ? Math.PI : 0);
      assert(rotate([0, 0, values[i] === 3 ? 1 : -1], orientation)[2] > .999);
    });
  }
  assert.throws(() => coinFaces([3, 2]));
  assert.throws(() => coinFaces([3, 2, 1]));
});

test('three coins stay fully visible throughout strong throws in narrow phone and desktop money trays', () => {
  for (const width of [154, 224, 466]) {
    const height = 310;
    for (const coin of coinLayout()) for (const startSide of [0, Math.PI]) for (const endSide of [0, Math.PI]) {
      const start = axisAngle([1, 0, 0], startSide), target = axisAngle([1, 0, 0], endSide);
      const pose={...coin,q:start,lift:0};
      const simulation=createThrowPhysics([pose],[target],{power:1.5,height:flightHeight(height,1.5),worldWidth:COIN_VIEW.worldWidth});
      for (let frame = 0; frame <= 240; frame++) {
        simulation.advance(1/60);
        const z = pose.z;
        for (const face of coin.mesh) for (const vertex of face.points) {
          const p = rotate(vertex, pose.q).map(n => n * coin.size);
          p[0] += pose.x; p[1] += pose.y; p[2] += z;
          const [x, y] = projectSolidPoint(p, width, height, COIN_VIEW.ground, COIN_VIEW.worldWidth);
          assert(x >= 1 && x <= width - 1 && y >= 1 && y <= height - 3, `cropped coin at width ${width}, frame ${frame}: ${x}, ${y}`);
        }
      }
    }
  }
});
