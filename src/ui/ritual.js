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
  // 快进：仪式进行中轻点舞台，剩下的等待、界面动画与 3D 器物都按 HURRY 倍速走完，结果出来后恢复正常速度。
  const HURRY = 3;
  let hurrying = false;
  const rushers = new Set();
  const animations = new Set();
  const pausedAnimations = new Set();
  const pause = (ms) => new Promise((resolve) => {
    if (!alive) return resolve(false);
    let remaining = ms, started = 0, timer = null;
    const finish = (ok) => { clearTimeout(timer); pending.delete(cancel); rushers.delete(rush); document.removeEventListener('visibilitychange', visibility); resolve(ok); };
    const cancel = () => finish(false);
    const visibility = () => {
      if (timer !== null) { clearTimeout(timer); remaining -= performance.now() - started; timer = null; }
      if (!document.hidden) { started = performance.now(); timer = setTimeout(() => finish(alive), Math.max(0, remaining)); }
    };
    // 快进时把剩余时间缩短为 1/HURRY，重新计时
    const rush = () => {
      if (timer === null) { remaining /= HURRY; return; }
      clearTimeout(timer); remaining = (remaining - (performance.now() - started)) / HURRY;
      started = performance.now(); timer = setTimeout(() => finish(alive), Math.max(0, remaining));
    };
    if (hurrying) remaining /= HURRY;
    pending.add(cancel); rushers.add(rush);
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
    animations.add(a); if (hurrying) a.playbackRate = HURRY; visibility();
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
  const stages = () => [...stage.el.querySelectorAll('[data-model-slot]')].map((el) => el.__stage).filter((x) => x?.setSpeed);
  function setHurry(on) {
    hurrying = on;
    if (on) stage.el.dataset.hurry = '1'; else delete stage.el.dataset.hurry;
    stages().forEach((x) => x.setSpeed(on ? HURRY : 1));
  }
  /** 快进当前仪式。返回 true 表示确实有在进行的仪式被快进。 */
  function hurry() {
    if (!alive || hurrying || (!pending.size && !animations.size)) return false;
    setHurry(true);
    [...rushers].forEach((r) => r());
    animations.forEach((a) => { a.playbackRate = HURRY; });
    return true;
  }
  // 只在仪式进行中响应，不影响平时在舞台上的手势
  const onStageTap = () => { hurry(); };
  stage.el.addEventListener('pointerdown', onStageTap);
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
  // 深度解读的统一闸门：先用当天免费次数或单次包，不够时弹付费卡。
  // key 是结果的身份（例如 'liuyao:1729600000000'），同一个结果解锁后反复打开、从历史里打开都不再计次。
  // 返回 true 表示已放行并执行了 fn。
  let refreshReadLabel = null; // 当前结果条上「展开解读」按钮的文字刷新
  async function gated(feature, key, fn) {
    const quota = ctx.platform?.quota;
    if (!quota || (key && quota.isUnlocked?.(key))) { fn(); return true; }
    if (!quota.take(feature)) {
      const ok = await openPaywall(ctx.platform, { reason: '今天的免费深度解读已用完，开通 Pro 不限次数' });
      if (!ok || !alive || !quota.take(feature)) { refreshReadLabel?.(); return false; }
    }
    if (key) quota.markUnlocked?.(key);
    fn();
    refreshReadLabel?.();
    return true;
  }
  // short：给半宽按钮用（六爻卦成后主按钮和「再起一卦」并排），避免折成两行
  function gateLabel(feature, key, { short = false } = {}) {
    const quota = ctx.platform?.quota;
    if (!quota || (key && quota.isUnlocked?.(key))) return '展开解读';
    const kind = quota.peek(feature);
    if (short) return kind === 'free' ? '免费展开解读' : kind ? '展开解读' : '解锁深度解读';
    return kind === 'free' ? '展开解读 · 今日免费' : kind ? '展开解读' : '解锁深度解读';
  }
  // gate：深度解读计入免费额度（每个玩法每天 1 次，Pro 不限）。gate 为字符串时作为额度的玩法名。
  // unlockKey：结果身份，传了就跨次记住已解锁（见 gated）。没传时只在这一张结果条内记住。
  // 返回 { read }，模块里其他打开解读的入口（点签纸、历史、主按钮）也应调用它，免得绕过额度。
  function reveal({ kicker = '', title, text, onRead, actions = [], gate = false, unlockKey = null }) {
    if (!alive) return { read: () => {} };
    if (hurrying) setHurry(false);
    clear(receipt);
    receipt.append(h('div', { class: 'ritual-receipt-copy' }, kicker && h('span', { class: 'ritual-kicker' }, kicker), h('h2', null, title), text && h('p', null, text)));
    const feature = typeof gate === 'string' ? gate : ctx.id;
    const key = gate ? (unlockKey ? String(unlockKey) : null) : null;
    let unlocked = !gate || !ctx.platform?.quota;
    // 结果条里还有并排的按钮时，解读按钮只占半宽，用短文字免得折行
    const label = () => (unlocked ? '展开解读' : gateLabel(feature, key, { short: actions.length > 0 }));
    let readBtn = null;
    const read = async () => {
      if (!onRead) return;
      if (unlocked) { onRead(); return; }
      const ok = await gated(feature, key, () => { unlocked = true; onRead(); });
      readBtn?.setLabel(label());
      return ok;
    };
    if (onRead) { readBtn = button(label(), { variant: 'primary', onClick: read }); readBtn.dataset.read = '1'; }
    refreshReadLabel = readBtn ? () => readBtn.setLabel(label()) : null;
    if (onRead || actions.length) receipt.append(h('div', { class: 'ritual-receipt-actions' }, readBtn, actions));
    if (onRead) trialNudge();
    receipt.hidden = false;
    return { read };
  }
  // 连续使用第 3 天起，在结果条底部出现一次温和的年度试用提示，7 天内不重复，Pro 不出现。
  function trialNudge() {
    const streak = ctx.platform?.streak;
    if (!streak) return;
    const n = streak.visit();
    if (!streak.shouldNudge()) return;
    streak.markNudged();
    const go = h('button', { type: 'button', class: 'ritual-nudge-go', onClick: () => openPaywall(ctx.platform, { reason: `已经连续来了 ${n} 天，年度 Pro 可以先免费试用` }) }, '看看');
    const close = h('button', { type: 'button', class: 'ritual-nudge-x', attrs: { 'aria-label': '不再显示' }, onClick: () => note.remove() }, '×');
    const note = h('div', { class: 'ritual-nudge', attrs: { role: 'note' } }, h('span', null, `连续 ${n} 天来感觉了 · 年度 Pro 可免费试用`), go, close);
    receipt.append(note);
  }
  function clearResult() { receipt.hidden = true; clear(receipt); refreshReadLabel = null; if (hurrying) setHurry(false); }
  ctx.addCleanup(() => {
    alive = false;
    pending.forEach((cancel) => cancel());
    pending.clear(); rushers.clear();
    stage.el.removeEventListener('pointerdown', onStageTap);
    animations.forEach((a) => a.cancel()); animations.clear(); pausedAnimations.clear();
    document.removeEventListener('visibilitychange', visibility);
  });
  step(0);
  return { progress, receipt, energy, step, power, focus, pause, animate, track, reveal, gated, gateLabel, hurry, clear: clearResult, get alive() { return alive; }, get hurrying() { return hurrying; } };
}
