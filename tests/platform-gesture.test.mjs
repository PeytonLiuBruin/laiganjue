import test from 'node:test';
import assert from 'node:assert/strict';
import { createGesture } from '../src/platform/web.js';

function rig() {
  let time = 0;
  const props = new Map(), priorities = new Map(), classes = new Set(), listeners = new Map();
  const el = {
    style: {
      setProperty(k, v, p = '') { props.set(k, v); priorities.set(k, p); },
      getPropertyValue: (k) => props.get(k) || '',
      getPropertyPriority: (k) => priorities.get(k) || '',
      removeProperty(k) { props.delete(k); priorities.delete(k); },
    },
    classList: { add: (k) => classes.add(k), remove: (k) => classes.delete(k), contains: (k) => classes.has(k) },
    addEventListener(k, fn) { if (!listeners.has(k)) listeners.set(k, new Set()); listeners.get(k).add(fn); },
    removeEventListener(k, fn) { listeners.get(k)?.delete(fn); },
    setPointerCapture() {}, releasePointerCapture() {},
  };
  function send(type, x, y, dt = 25, extra = {}) {
    time += dt;
    const e = { type, pointerId: 1, button: 0, isPrimary: true, clientX: x, clientY: y, cancelable: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    for (const fn of [...listeners.get(type) || []]) fn(e);
    return e;
  }
  function swipe(end = 'pointerup') {
    send('pointerdown', 80, 300);
    send('pointermove', 82, 260);
    send('pointermove', 82, 170);
    send(end, 82, 80);
  }
  return { el, send, swipe, gesture: createGesture(() => time), action: () => el.style.getPropertyValue('touch-action') };
}

test('vertical dragging claims touch before movement and restores the original policy', () => {
  const r = rig(), moves = [], ends = [];
  r.el.style.setProperty('touch-action', 'pan-y', 'important');
  const off = r.gesture.drag(r.el, { onMove: (g) => moves.push(g), onEnd: (g) => ends.push(g) });
  assert.equal(r.action(), 'none', 'inline gesture ownership overrides button/theme pan-y styles');
  r.send('pointerdown', 10, 300);
  assert.equal(r.send('pointermove', 20, 90).defaultPrevented, true);
  r.send('pointerup', 20, 80);
  assert.equal(moves[0].dy, -210);
  assert.equal(ends[0].cancelled, false);
  off(); off();
  assert.equal(r.action(), 'pan-y');
  assert.equal(r.el.style.getPropertyPriority('touch-action'), 'important');
  assert.equal(r.el.classList.contains('no-touch'), false);
});

test('coexisting deck gestures keep ownership until the last drag binding is removed', () => {
  const r = rig();
  const flick = r.gesture.flick(r.el, () => {}), drag = r.gesture.drag(r.el, {}), tap = r.gesture.tap(r.el, () => {});
  assert.equal(r.action(), 'none');
  flick(); tap();
  assert.equal(r.action(), 'none');
  drag();
  assert.equal(r.action(), '');
});

test('tap-only surfaces retain native scrolling and horizontal page handles allow pan-y', () => {
  const r = rig(); r.el.style.setProperty('touch-action', 'pan-y');
  const tap = r.gesture.tap(r.el, () => {});
  assert.equal(r.action(), 'pan-y');
  assert.equal(r.el.classList.contains('no-touch'), false);
  r.send('pointerdown', 0, 0);
  assert.equal(r.send('pointermove', 0, 70).defaultPrevented, false);
  r.send('pointercancel', 0, 70);
  const flick = r.gesture.flick(r.el, () => {}, { axis: 'x', direction: 'any' });
  assert.equal(r.action(), 'pan-y');
  const drag = r.gesture.drag(r.el, {});
  assert.equal(r.action(), 'none');
  drag(); assert.equal(r.action(), 'pan-y');
  flick(); tap(); assert.equal(r.action(), 'pan-y');
});

test('upward flicks repeat, while cancellation and lost capture never release a throw', () => {
  const r = rig(), throws = [];
  r.gesture.flick(r.el, (g) => throws.push(g));
  r.swipe('pointercancel'); r.swipe('lostpointercapture');
  assert.equal(throws.length, 0);
  for (let i = 0; i < 8; i++) r.swipe();
  assert.equal(throws.length, 8);
  assert(throws.every(g => g.direction === 'up' && g.dy === -220));
});

test('secondary touches do not start gestures and detaching cancels a held object once', () => {
  const r = rig(), ends = [];
  const off = r.gesture.drag(r.el, { onEnd: g => ends.push(g) });
  r.send('pointerdown', 0, 300, 25, { isPrimary: false });
  r.send('pointerup', 0, 0);
  assert.equal(ends.length, 0);
  r.send('pointerdown', 0, 300); r.send('pointermove', 10, 140);
  off(); off(); r.send('pointerup', 10, 0);
  assert.equal(ends.length, 1);
  assert.equal(ends[0].cancelled, true);
  assert.equal(ends[0].dy, -160);
});
