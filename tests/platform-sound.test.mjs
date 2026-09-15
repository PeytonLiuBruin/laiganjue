import test from 'node:test';
import assert from 'node:assert/strict';
import { createSound } from '../src/platform/web.js';

class Signals {
  listeners = new Map();
  addEventListener(type, fn, options) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Map());
    this.listeners.get(type).set(fn, options);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type) { for (const fn of [...this.listeners.get(type)?.keys() || []]) fn({ type }); }
}

function rig(enabled = true) {
  const contexts = [], win = new Signals(), doc = new Signals(), saved = new Map([['sound', enabled]]);
  doc.hidden = false;
  let time = 0, mode = 'run', constructionFails = false;
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ gain: param(), frequency: param(), detune: param(), Q: param(), connect(target) { return target; }, disconnect() { this.disconnected = true; } });
  class FakeAudioContext {
    constructor() {
      if (constructionFails) throw new Error('audio unavailable');
      this.state = 'suspended'; this.sampleRate = 100; this.currentTime = 10; this.destination = node();
      this.sources = []; this.gains = []; this.resumes = 0; this.waiters = []; contexts.push(this);
    }
    createGain() { const n = node(); this.gains.push(n); return n; }
    createBiquadFilter() { return node(); }
    createBuffer(_, size) { return { getChannelData: () => new Float32Array(size) }; }
    source() {
      const n = { ...node(), start(at) { this.startAt = at; }, stop(at) { if (at === undefined) this.cancelled = true; else this.stopAt = at; } };
      this.sources.push(n); return n;
    }
    createOscillator() { return this.source(); }
    createBufferSource() { return this.source(); }
    resume() {
      this.resumes++;
      if (mode === 'reject') return Promise.reject(new Error('activation required'));
      if (mode === 'throw') throw new Error('audio interrupted');
      if (mode === 'pending') return new Promise(resolve => this.waiters.push(resolve));
      this.state = 'running'; this.onstatechange?.(); return Promise.resolve();
    }
    finishResume() { this.state = 'running'; this.onstatechange?.(); this.waiters.splice(0).forEach(resolve => resolve()); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  win.AudioContext = FakeAudioContext;
  const sound = createSound({ get: (k, fallback) => saved.get(k) ?? fallback, set: (k, value) => saved.set(k, value) }, { win, doc, now: () => time });
  return { sound, contexts, win, doc, saved, mode(value) { mode = value; }, failConstructor(value) { constructionFails = value; }, advance(ms) { time += ms; }, get ctx() { return contexts.at(-1); } };
}
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };

test('the first touch unlocks audio and every synthesized effect still plays', t => {
  const r = rig(); t.after(() => r.sound.dispose());
  r.win.emit('focus'); r.win.emit('pageshow');
  assert.equal(r.contexts.length, 0, 'return events never create unsolicited audio before interaction');
  r.win.emit('pointerup');
  assert.equal(r.ctx.state, 'running');
  for (const name of r.sound.names) assert.equal(r.sound.play(name), true, name);
  assert(r.ctx.sources.length > 30);
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'keydown']) {
    assert([...r.win.listeners.get(type).values()].every(options => options.capture), 'nested editors cannot swallow unlock events');
  }
});

test('returning from Safari interruption resumes without resetting the sound preference', async t => {
  const r = rig(); t.after(() => r.sound.dispose());
  r.sound.play('coin', { delay: .4 }); const oldSources = [...r.ctx.sources];
  r.doc.hidden = true; r.ctx.state = 'interrupted'; r.doc.emit('visibilitychange');
  assert(oldSources.every(source => source.cancelled && source.disconnected));
  assert.equal(r.sound.play('chime'), false);
  r.doc.hidden = false; r.doc.emit('visibilitychange'); await settle();
  assert.equal(r.ctx.state, 'running'); assert.equal(r.ctx.gains[0].gain.value, .7);
  assert.equal(r.ctx.sources.length, oldSources.length, 'returning never replays pre-background effects');
  assert.equal(r.sound.play('pop'), true);
  assert.equal(r.saved.get('sound'), true);
});

test('page-cache restore and focus also recover suspended or interrupted audio', async t => {
  const r = rig(); t.after(() => r.sound.dispose()); r.sound.play('pop');
  r.win.emit('pagehide'); r.ctx.state = 'interrupted';
  assert.equal(r.sound.play('pop'), false);
  r.win.emit('pageshow'); await settle();
  assert.equal(r.ctx.state, 'running');
  r.ctx.state = 'suspended'; r.win.emit('focus'); await settle();
  assert.equal(r.ctx.state, 'running'); assert.equal(r.sound.play('pop'), true);
});

test('a pending automatic resume cannot block the next real touch activation', async t => {
  const r = rig(); t.after(() => r.sound.dispose()); r.sound.play('pop'); await settle();
  r.ctx.state = 'interrupted'; r.mode('pending'); r.win.emit('focus');
  const attempts = r.ctx.resumes;
  r.sound.play('tick'); r.sound.play('coin');
  assert.equal(r.ctx.resumes, attempts, 'animation frames share one pending resume');
  r.mode('run'); r.win.emit('touchend'); await settle();
  assert.equal(r.ctx.resumes, attempts + 1);
  assert.equal(r.sound.play('pop'), true);
});

test('suspended effects are coalesced and expire instead of producing a delayed burst', async t => {
  const r = rig(); t.after(() => r.sound.dispose()); r.mode('pending');
  r.sound.play('coin'); r.sound.play('shake'); r.sound.play('pop');
  assert.equal(r.ctx.sources.length, 0);
  r.ctx.finishResume(); await settle();
  assert.equal(r.ctx.sources.length, 1, 'only the freshest pending effect is audible');
  r.ctx.state = 'interrupted'; r.sound.play('gong'); r.advance(600);
  r.ctx.finishResume(); await settle();
  assert.equal(r.ctx.sources.length, 1, 'stale effects have expired');
});

test('a late resume completion while hidden stays silent and drops the pending effect', async t => {
  const r = rig(); t.after(() => r.sound.dispose()); r.mode('pending'); r.sound.play('coin');
  r.doc.hidden = true; r.doc.emit('visibilitychange'); r.ctx.finishResume(); await settle();
  assert.equal(r.ctx.sources.length, 0); assert.equal(r.ctx.gains[0].gain.value, 0);
  r.doc.hidden = false; r.doc.emit('visibilitychange');
  assert.equal(r.ctx.sources.length, 0); assert.equal(r.sound.play('pop'), true);
});

test('closed contexts are rebuilt and rejected resume attempts can recover on the next gesture', async t => {
  const r = rig(); t.after(() => r.sound.dispose()); r.sound.play('pop'); await settle();
  const old = r.ctx; await old.close(); r.win.emit('pointerdown');
  assert.equal(r.contexts.length, 2); assert.notEqual(r.ctx, old);
  await settle(); r.ctx.state = 'interrupted'; r.mode('reject'); r.win.emit('pointerup'); await settle();
  r.mode('throw'); assert.equal(r.sound.play('tick'), false);
  r.mode('run'); r.win.emit('keydown'); await settle();
  assert.equal(r.sound.play('pop'), true);
});

test('muting persists through lifecycle events and re-enabling restores playback', t => {
  const r = rig(false); t.after(() => r.sound.dispose());
  for (const type of ['pointerdown', 'touchend', 'focus', 'pageshow']) r.win.emit(type);
  assert.equal(r.contexts.length, 0);
  r.sound.setEnabled(true); assert.equal(r.sound.play('chime'), true);
  const sources = [...r.ctx.sources]; r.sound.setEnabled(false);
  assert(sources.every(source => source.cancelled)); assert.equal(r.saved.get('sound'), false);
  r.ctx.state = 'interrupted'; r.win.emit('pagehide'); r.win.emit('pageshow'); r.win.emit('pointerup');
  assert.equal(r.ctx.state, 'interrupted'); assert.equal(r.sound.play('pop'), false);
  r.sound.setEnabled(true); assert.equal(r.sound.play('pop'), true);
});

test('unavailable audio remains non-fatal and lifecycle listeners are disposed', () => {
  const r = rig(); r.failConstructor(true); assert.equal(r.sound.play('pop'), false);
  r.failConstructor(false); assert.equal(r.sound.play('pop'), true);
  r.sound.dispose();
  assert.equal(r.ctx.state, 'closed');
  assert([...r.win.listeners.values(), ...r.doc.listeners.values()].every(list => list.size === 0));
  r.win.emit('touchend'); assert.equal(r.contexts.length, 1);
});
