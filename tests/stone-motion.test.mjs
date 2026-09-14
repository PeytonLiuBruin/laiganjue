import test from 'node:test';
import assert from 'node:assert/strict';
import { stoneFlight } from '../src/core/stone-motion.js';

test('stone falls, makes progressively weaker contacts and settles at its slot', () => {
  for (const [dx, dy, tilt] of [[-100, -120, -9], [70, -50, 7], [0, 20, 0]]) {
    const { samples, impacts } = stoneFlight(dx, dy, tilt);
    assert.equal(samples[0].x, dx);
    assert.equal(samples[0].y, dy);
    assert(samples.every((p) => Object.values(p).every(Number.isFinite) && p.height >= 0));
    assert(impacts.length >= 2);
    assert(impacts[0].time > .45 && impacts[0].time < .65);
    assert(impacts.slice(1).every((p, i) => p.strength < impacts[i].strength));
    assert.deepEqual(samples.at(-1), { offset: 1, x: 0, y: 0, height: 0, angle: tilt });
    const finalStep = samples.at(-2);
    assert(Math.abs(finalStep.x) + Math.abs(finalStep.y) < .02);
    assert(Math.abs(finalStep.angle - tilt) < .05);
    // No frozen frames on the way down and no snap to the target at the end.
    assert(samples.slice(1, 55).every((p, i) => p.x !== samples[i].x || p.y !== samples[i].y));
  }
});
