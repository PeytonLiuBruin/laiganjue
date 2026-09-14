import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions, makeBoard, createPlinkoPhysics, simulateDrop, planDrop, frameAt, DEFAULT_OPTIONS } from '../src/modules/plinko/core.js';
import { seeded } from '../src/core/rng.js';

test('slot editing accepts 2–6 complete labels and rejects invalid drafts without truncation', () => {
  assert.deepEqual(parseOptions(' 做 \r\n\n 不做\n 再想想 ').labels, DEFAULT_OPTIONS);
  for (const n of [2, 3, 6]) assert.equal(parseOptions(Array.from({ length: n }, (_, i) => `选项 ${i}`).join('\n')).error, '');
  for (const text of ['', '只有一个', Array(7).fill('选项').join('\n'), '这是一个超过十二个字的很长选项\n不做']) assert(parseOptions(text).error);
  assert.deepEqual(parseOptions('🍀 试一次\n去看电影，吃饭').labels, ['🍀 试一次', '去看电影，吃饭']);
  assert.deepEqual(parseOptions('<b>做</b>\n不做').labels, ['<b>做</b>', '不做']);
});

test('board dividers align with the equal-width editable slots at all supported counts', () => {
  for (let count = 2; count <= 6; count++) {
    const board = makeBoard(count);
    assert.equal(board.dividers.length, count - 1); assert.equal(board.pins.length, 85);
    for (let i = 0; i < board.dividers.length; i++) assert.equal(board.dividers[i], board.left + board.slotWidth * (i + 1));
  }
  for (const n of [1, 7, NaN, 3.5]) assert.throws(() => makeBoard(n));
});

test('the first free fall accelerates under gravity, then peg and floor contacts dissipate energy', () => {
  const board = makeBoard(3), physics = createPlinkoPhysics(board, { vx: 23 });
  for (let i = 1; i <= 12; i++) {
    const s = physics.advance(1 / 120);
    assert(Math.abs(s.ball.vy - 320 * i / 120) < 1e-7); assert.equal(s.result, null);
  }
  const drop = simulateDrop(board, { vx: 23 });
  assert(drop); assert(drop.contacts.some(c => c.kind === 'pin')); assert(drop.contacts.filter(c => c.kind === 'floor').length >= 2);
  assert.equal(drop.frames.at(-1).y, board.floor - board.ballRadius);
  assert.equal(drop.frames.at(-1).vx, 0); assert.equal(drop.frames.at(-1).vy, 0);
});

test('30, 60 and 120 Hz playback produces the same actual landing slot and pose', () => {
  for (const vx of [-90, -28, 12, 65]) {
    const ends = [];
    for (const fps of [30, 60, 120]) {
      const p = createPlinkoPhysics(makeBoard(6), { vx }); let state;
      for (let i = 0; i < fps * 20 && p.phase !== 'settled'; i++) state = p.advance(1 / fps);
      assert.equal(state.phase, 'settled'); ends.push(state);
    }
    for (const end of ends) { assert.equal(end.result, ends[0].result); assert.deepEqual(end.ball, ends[0].ball); }
  }
});

test('each uniformly selected slot has a complete physical route with multiple collisions', () => {
  for (let count = 2; count <= 6; count++) for (let target = 0; target < count; target++) for (let seed = 0; seed < 12; seed++) {
    let calls = 0;
    const plan = planDrop(count, () => calls++ === 0 ? (target + .5) / count : seeded(`route-${seed}`)());
    assert.equal(calls, 2, 'the current round reads randomness only while preparing the plan');
    assert.equal(plan.result, target); assert(plan.pinHits >= 7);
    assert(plan.playbackDuration >= 8.2 && plan.playbackDuration <= 9.8);
    const end = plan.frames.at(-1);
    assert.equal(Math.floor((end.x - plan.board.left) / plan.board.slotWidth), target);
    assert.equal(end.phase, 'settled');
    for (let i = 0; i < plan.frames.length; i++) {
      const f = plan.frames[i], b = plan.board;
      assert([f.x, f.y, f.angle, f.time].every(Number.isFinite));
      assert(f.x >= b.left + b.ballRadius - .001 && f.x <= b.right - b.ballRadius + .001);
      assert(f.y >= b.ballRadius && f.y <= b.floor - b.ballRadius + .001, `clipped ball: ${f.y}`);
      if (i) assert(Math.hypot(f.x - plan.frames[i - 1].x, f.y - plan.frames[i - 1].y) < 5, 'ball must not teleport to the chosen slot');
    }
  }
});

test('playback sampling, resizing or replaying cannot modify a prepared round', () => {
  const a = planDrop(6, seeded('same round')), b = planDrop(6, seeded('same round'));
  assert.deepEqual(a, b);
  const original = structuredClone(a);
  for (const width of [240, 288, 354, 410]) for (let t = 0; t < 12; t += .03) {
    const pose = frameAt(a, t); pose.x *= width / a.board.width;
    assert(pose.x >= 0 && pose.x <= width);
  }
  assert.deepEqual(a, original);
  assert.equal(frameAt(a, 1e5).phase, 'settled');
  assert.equal(frameAt(a, 0).y, 30);
});

test('copy is complete, sized for the receipt and drawer, and free of placeholders', async () => {
  const { TEXT, BRIEFS, VERSES, READINGS, ADVICE, FOOTER, SHARE_SIGN } = await import('../src/modules/plinko/data.js');
  const len = (s) => [...s].length;
  const all = [...Object.values(TEXT), ...BRIEFS, ...VERSES, ...READINGS, ...ADVICE, FOOTER, SHARE_SIGN];
  for (const s of all) {
    assert.equal(typeof s, 'string'); assert(s.trim().length, 'empty copy');
    assert(!/TODO|xxx|示例|lorem|undefined|null/i.test(s), `placeholder in copy: ${s}`);
    assert(!/[A-Za-z]/.test(s), `latin residue in copy: ${s}`);
  }
  // 舞台下方那一行：≤ 18 字，动词开头
  for (const key of ['hintMotion', 'hintTap', 'falling', 'landing', 'landed']) assert(len(TEXT[key]) <= 18, `${key} too long`);
  assert(/^(轻点|看|等|落定)/.test(TEXT.hintMotion) && /^(轻点)/.test(TEXT.hintTap));
  for (const s of BRIEFS) assert(len(s) <= 40, `brief too long: ${s}`);
  for (const s of [...READINGS, ...ADVICE]) assert(len(s) <= 120, `section too long: ${s}`);
  for (const pool of [BRIEFS, VERSES, READINGS, ADVICE]) { assert(pool.length >= 4); assert.equal(new Set(pool).size, pool.length, 'duplicate copy'); }
  assert(len(TEXT.primary) <= 6 && len(TEXT.again) <= 6 && len(TEXT.busy) <= 6, 'button labels stay short');
  assert.notEqual(TEXT.primary, TEXT.again, 'the button reads differently after a round');
});
