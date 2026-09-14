import test from 'node:test';
import assert from 'node:assert/strict';
import { createMotionRecognizer } from '../src/platform/motion.js';
import { createHaptic } from '../src/platform/haptic.js';

function stream() {
  const recognizer = createMotionRecognizer(), events = [];
  let time = 0, state;
  function sample(x = 0, y = 0, z = 0, frames = 1) {
    for (let i = 0; i < frames; i++) {
      state = recognizer.push({ ax: x, ay: y, az: z, t: time }); time += 20;
      if (state.event) events.push(state.event);
    }
    return state;
  }
  return { sample, events, recognizer };
}

test('体感摇动必须往返，手收住后只出手一次', () => {
  const s = stream();
  s.sample(18, 0, 0, 5); s.sample(-19, 0, 0, 5); s.sample(20, 0, 0, 5);
  assert.equal(s.events.length, 0);
  assert.equal(s.sample(0, 0, 0, 6).phase, 'ready');
  assert.equal(s.events.length, 0);
  s.sample(0, 0, 0, 8);
  assert.equal(s.events.length, 1); assert.equal(s.events[0].type, 'shake');
  s.sample(18, 0, 0, 5); s.sample(-18, 0, 0, 5); s.sample(18, 0, 0, 5); s.sample(0, 0, 0, 16);
  assert.equal(s.events.length, 1, '落定反馈期间不能立即触发下一次');
});

test('持续加速、横向单次碰撞、轻晃都不误判为投掷或摇动', () => {
  for (const [x, y, z] of [[18, 0, 0], [0, -18, 0], [0, 0, 20], [3, 3, 3]]) {
    const s = stream(); s.sample(x, y, z, 35); s.sample(0, 0, 0, 20);
    assert.equal(s.events.length, 0);
  }
});

test('向上加速和刹住组成一次投掷，重置后不带入上一个页面的动作', () => {
  const s = stream();
  s.sample(0, 21, 0, 5); s.sample(0, -16, 0, 5);
  s.sample(0, 0, 0, 15);
  assert.deepEqual(s.events.map((e) => e.type), ['toss']);
  const other = stream(); other.sample(0, 21, 0, 5); other.recognizer.reset(); other.sample(0, 0, 0, 15);
  assert.equal(other.events.length, 0);
});

test('重力误差、非法值和断流不会在恢复时突然出手', () => {
  const s = stream(); s.sample(0, 20, 0, 5); s.sample(NaN); s.sample(0, 0, 0, 20);
  assert.equal(s.events.length, 0);
  const r = createMotionRecognizer(); r.push({ ay: 20, t: 0 }); r.push({ t: 1000 });
  assert.equal(r.push({ t: 1230 }).event, null);
});

function hapticRig() {
  let time = 0;
  const calls = [], data = new Map(), listeners = {};
  const doc = { hidden: false, addEventListener: (type, fn) => { listeners[type] = fn; } };
  const nav = { userActivation: { hasBeenActive: true }, vibrate(p) { calls.push(p); return true; } };
  const haptic = createHaptic({ get: (key, fallback) => data.get(key) ?? fallback, set: (key, value) => data.set(key, value) }, nav, doc, () => time);
  return { haptic, calls, data, nav, doc, listeners, advance(ms) { time += ms; } };
}

test('出手、大小碰撞和落定发出实际 Vibration API 请求，并合并同时落地', () => {
  const r = hapticRig();
  assert(r.haptic.release()); r.advance(400); assert(r.haptic.impact(1));
  assert.equal(r.haptic.impact(.6), false); r.advance(180); assert(r.haptic.impact(.2));
  r.advance(400); assert(r.haptic.settle()); assert.equal(r.haptic.tap(), false);
  assert.deepEqual(r.calls, [24, 54, 25, [22, 65, 36]]);
});

test('关闭震动或切到后台会停止马达，未激活页面不发出震动', () => {
  const r = hapticRig(); r.haptic.rattle(); r.haptic.setEnabled(false);
  assert.equal(r.calls.at(-1), 0); assert.equal(r.data.get('haptic'), false);
  assert.equal(r.haptic.success(), false);
  r.haptic.setEnabled(true); r.doc.hidden = true; r.listeners.visibilitychange();
  assert.equal(r.calls.at(-1), 0); assert.equal(r.haptic.success(), false);
  r.doc.hidden = false; r.nav.userActivation.hasBeenActive = false;
  assert.equal(r.haptic.success(), false);
});

test('无震动接口或接口拒绝时如实返回未支持/未触发', () => {
  const storage = { get: (_, fallback) => fallback };
  const unsupported = createHaptic(storage, {}, null);
  assert.equal(unsupported.supported, false); assert.equal(unsupported.success(), false);
  const rejected = createHaptic(storage, { vibrate: () => false }, null);
  assert.equal(rejected.success(), false);
});
