// Shared pacing: bring the physical scene into view, then let the reader decide
// when to open the longer interpretation. No result sheet is opened by a timer.
export function createRitual(ctx, stage, labels) {
  const { h, button, clear } = ctx.kit;
  let alive = true;
  const steps = labels.map((label, i) => h('span', { class: 'ritual-step' }, h('i', null, String(i + 1).padStart(2, '0')), label));
  const progress = h('div', { class: 'ritual-progress', attrs: { 'aria-label': '体验进度' } }, steps);
  const receipt = h('div', { class: 'ritual-receipt', hidden: true, attrs: { 'aria-live': 'polite' } });
  const energyFill = h('i');
  const energyText = h('span', null, '轻触或上滑');
  const energy = h('div', { class: 'ritual-energy', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'ritual-energy-track' }, energyFill), energyText);
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
    const a = el.animate(keyframes, { fill: 'forwards', easing: 'cubic-bezier(.2,.8,.2,1)', ...options, duration: ctx.platform.prefersReducedMotion ? 1 : options.duration ?? 300 });
    track(a);
    await a.finished.catch(() => {});
    animations.delete(a); pausedAnimations.delete(a);
    if (!alive) { a.cancel(); return null; }
    return a;
  }
  function step(index) {
    steps.forEach((el, i) => { el.classList.toggle('current', i === index); el.classList.toggle('complete', i < index); el.setAttribute('aria-current', i === index ? 'step' : 'false'); });
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
  function reveal({ kicker = '', title, text, onRead, actions = [] }) {
    if (!alive) return;
    clear(receipt);
    receipt.append(h('div', { class: 'ritual-receipt-copy' }, kicker && h('span', { class: 'ritual-kicker' }, kicker), h('h2', null, title), text && h('p', null, text)));
    if (onRead || actions.length) receipt.append(h('div', { class: 'ritual-receipt-actions' }, onRead && button('展开解读', { variant: 'primary', onClick: onRead }), actions));
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
