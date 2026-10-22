// Shared pacing: bring the physical scene into view, then let the reader decide
// when to open the longer interpretation. No result sheet is opened by a timer.
import { openPaywall } from './paywall.js';

export function createRitual(ctx, stage, labels) {
  const { h, button, clear } = ctx.kit;
  let alive = true;
  const progress = h('span', { hidden: true });
  const receipt = h('div', { class: 'ritual-receipt', hidden: true, attrs: { 'aria-live': 'polite' } });
  const energyFill = h('i');
  const energyText = h('span', null, '轻触或上滑');
  const energy = h('div', { class: 'ritual-energy', hidden: true, attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'ritual-energy-track' }, energyFill), energyText);
  const pending = new Set();
  const animations = new Set();
  const pausedAnimations = new Set();
  const pause = (ms) => new Promise((resolve) => {
    if (!alive) return resolve(false);
    let remaining = ms, started = 0, timer = null;
    const finish = (ok) => { clearTimeout(timer); pending.delete(cancel); document.removeEventListener('visibilitychange', visibility); resolve(ok); };
    const cancel = () => finish(false);
    const visibility = () => {
      if (timer !== null) { clearTimeout(timer); remaining -= performance.now() - started; timer = null; }
      if (!document.hidden) { started = performance.now(); timer = setTimeout(() => finish(alive), Math.max(0, remaining)); }
    };
    pending.add(cancel);
    document.addEventListener('visibilitychange', visibility);
    visibility();
  });
  const visibility = () => {
    animations.forEach((a) => {
      if (document.hidden && a.playState === 'running') { a.pause(); pausedAnimations.add(a); }
      else if (!document.hidden && pausedAnimations.delete(a)) a.play();
    });
  };
  document.addEventListener('visibilitychange', visibility);
  function track(a) {
    if (!alive) { a.cancel(); return a; }
    animations.add(a); visibility();
    a.finished.catch(() => {}).then(() => { animations.delete(a); pausedAnimations.delete(a); });
    return a;
  }
  async function animate(el, keyframes, options = {}) {
    if (!alive) return null;
    const a = el.animate(keyframes, { fill: 'forwards', easing: 'cubic-bezier(.2,.8,.2,1)', ...options, duration: Math.max(240, options.duration ?? 300) });
    track(a);
    await a.finished.catch(() => {});
    animations.delete(a); pausedAnimations.delete(a);
    if (!alive) { a.cancel(); return null; }
    return a;
  }
  function step(index) {
    stage.el.dataset.step = String(index);
  }
  function power(value, text = '蓄力中') {
    energyFill.style.transform = `scaleX(${Math.max(0, Math.min(1, value))})`;
    energyText.textContent = text;
  }
  async function focus() {
    if (!alive) return false;
    if (document.activeElement?.matches('input, textarea')) document.activeElement.blur();
    const r = stage.el.getBoundingClientRect();
    const header = document.querySelector('.app-header')?.getBoundingClientRect().bottom || 64;
    const viewport = window.visualViewport?.height || window.innerHeight;
    if (r.top < header + 12 || r.bottom > viewport - 20) {
      window.scrollTo({ top: window.scrollY + r.top - header - 20, behavior: ctx.platform.prefersReducedMotion ? 'instant' : 'smooth' });
      return pause(ctx.platform.prefersReducedMotion ? 20 : 360);
    }
    return true;
  }
  // gate：深度解读计入免费额度（每个玩法每天 1 次，Pro 不限）。同一个结果解锁后反复打开不再计次。
  function reveal({ kicker = '', title, text, onRead, actions = [], gate = false }) {
    if (!alive) return;
    clear(receipt);
    receipt.append(h('div', { class: 'ritual-receipt-copy' }, kicker && h('span', { class: 'ritual-kicker' }, kicker), h('h2', null, title), text && h('p', null, text)));
    const quota = gate ? ctx.platform?.quota : null;
    const feature = typeof gate === 'string' ? gate : ctx.id;
    let unlocked = !quota;
    const label = () => {
      if (unlocked) return '展开解读';
      const kind = quota.peek(feature);
      return kind === 'free' ? '展开解读 · 今日免费' : kind ? '展开解读' : '解锁深度解读';
    };
    let readBtn = null;
    const read = async () => {
      if (!unlocked) {
        if (!quota.take(feature)) {
          const ok = await openPaywall(ctx.platform, { reason: '今天的免费深度解读已用完，开通 Pro 不限次数' });
          if (!ok || !alive || !quota.take(feature)) { readBtn?.setLabel(label()); return; }
        }
        unlocked = true;
        readBtn?.setLabel(label());
      }
      onRead();
    };
    if (onRead) { readBtn = button(label(), { variant: 'primary', onClick: read }); readBtn.dataset.read = '1'; }
    if (onRead || actions.length) receipt.append(h('div', { class: 'ritual-receipt-actions' }, readBtn, actions));
    receipt.hidden = false;
  }
  function clearResult() { receipt.hidden = true; clear(receipt); }
  ctx.addCleanup(() => {
    alive = false;
    pending.forEach((cancel) => cancel());
    pending.clear();
    animations.forEach((a) => a.cancel()); animations.clear(); pausedAnimations.clear();
    document.removeEventListener('visibilitychange', visibility);
  });
  step(0);
  return { progress, receipt, energy, step, power, focus, pause, animate, track, reveal, clear: clearResult, get alive() { return alive; } };
}
