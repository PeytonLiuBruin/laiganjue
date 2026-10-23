import { makeBoard, frameAt } from './core.js';

// 小球轮廓：本色加深一半
function darken(hex, k) { const m = /^#([a-f\d]{6})$/i.exec(hex.trim()); if (!m) return '#3a1a14'; return '#' + [0, 2, 4].map(i => Math.round(parseInt(m[1].slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join(''); }
const circle = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); };

// 卡通画风：分格彩色底槽、白色描边隔板、金色描边钉子（两段明暗 + 硬高光点）、描边小球。
const SLOT_TINTS = ['#ffcfc7', '#ffeaa8', '#c9efd9', '#cfe7ff', '#e2d6ff', '#ffd9b8'];
// 深色皮肤：同色相的宝石色，饱和但不发亮，替代原来 22% 透明度的灰褐色
export const SLOT_TINTS_DARK = ['#8a3a4a', '#8a6a1c', '#2f7552', '#2f5f96', '#5e4aa0', '#8f5428'];
const PEG = { lit: '#ffc93c', dark: '#e39a1e', edge: '#7a4512' };
export function paintBoard(c, board, colors) {
  const { width, height, left, right, floor, dividerY } = board, ink = colors.ink || '#2b2240';
  c.clearRect(0, 0, width, height);
  const wash = c.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, colors.surface); wash.addColorStop(1, colors.bg);
  c.fillStyle = wash; c.fillRect(0, 0, width, height);
  for (let i = 0; i < board.count; i++) {
    const x = left + i * board.slotWidth;
    const tints = colors.dark ? SLOT_TINTS_DARK : SLOT_TINTS;
    c.fillStyle = tints[i % tints.length]; c.globalAlpha = colors.dark ? .78 : .62;
    c.fillRect(x + 2, dividerY + 4, board.slotWidth - 4, floor - dividerY - 4);
  }
  c.globalAlpha = 1;
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = ink; c.globalAlpha = .28; c.lineWidth = 2.2;
  c.beginPath(); c.moveTo(left, 61); c.lineTo(left, floor); c.lineTo(right, floor); c.lineTo(right, 61); c.stroke();
  c.globalAlpha = 1;
  for (const x of board.dividers) {
    c.strokeStyle = colors.dark ? '#120e1c' : ink; c.lineWidth = 6.4;
    c.beginPath(); c.moveTo(x, dividerY); c.lineTo(x, floor); c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = 3.4; c.stroke();
  }
  for (const p of board.pins) {
    c.fillStyle = 'rgba(58,44,110,.16)'; circle(c, p.x + 1.2, p.y + 2.4, p.r + .8); c.fill();
    c.fillStyle = PEG.edge; circle(c, p.x, p.y, p.r + 1.1); c.fill();
    c.fillStyle = PEG.dark; circle(c, p.x, p.y, p.r); c.fill();
    c.save(); circle(c, p.x, p.y, p.r); c.clip();
    c.fillStyle = PEG.lit; circle(c, p.x - .9, p.y - 1, p.r * .9); c.fill(); c.restore();
    c.fillStyle = '#fffbe8'; circle(c, p.x - 1.4, p.y - 1.6, .95); c.fill();
  }
  c.strokeStyle = ink; c.globalAlpha = .28; c.lineWidth = 2;
  for (const x of [165, 195]) { c.beginPath(); c.moveTo(x, 8); c.lineTo(x, 37); c.stroke(); }
  c.globalAlpha = 1;
  for (const x of [27, 333]) {
    c.fillStyle = PEG.edge; circle(c, x, 24, 3.2); c.fill();
    c.fillStyle = PEG.lit; circle(c, x, 24, 2.1); c.fill();
  }
}

export function paintBall(c, ball, radius, colors) {
  c.save();
  const shadow = c.createRadialGradient(ball.x + 2, ball.y + 5, 0, ball.x + 2, ball.y + 5, radius * 1.5);
  shadow.addColorStop(0, 'rgba(58,44,110,.32)'); shadow.addColorStop(1, 'rgba(58,44,110,0)');
  c.fillStyle = shadow; circle(c, ball.x + 2, ball.y + 5, radius * 1.5); c.fill();
  c.fillStyle = colors.ballEdge || '#5a1a14'; circle(c, ball.x, ball.y, radius + 1.5); c.fill();
  c.fillStyle = colors.accent3; circle(c, ball.x, ball.y, radius); c.fill();
  c.save(); circle(c, ball.x, ball.y, radius); c.clip();
  c.fillStyle = colors.accent; circle(c, ball.x - radius * .16, ball.y - radius * .2, radius * .9); c.fill();
  c.translate(ball.x, ball.y); c.rotate(ball.angle);
  c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1.1;
  c.beginPath(); c.ellipse(-radius * .1, 0, radius * .48, radius * .98, .4, 0, Math.PI * 2); c.stroke();
  c.restore();
  c.fillStyle = '#fffdf4'; c.beginPath(); c.ellipse(ball.x - radius * .36, ball.y - radius * .42, radius * .26, radius * .15, -.7, 0, Math.PI * 2); c.fill();
  c.restore();
}

export function createPlinkoScene(canvas, ctx, onPhase = () => {}) {
  const c = canvas.getContext('2d'), background = document.createElement('canvas'), back = background.getContext('2d');
  let board = makeBoard(), plan = null, pose = { x: 180, y: 30, angle: .3 }, elapsed = 0, last = null;
  let raf = 0, active = false, alive = true, resolve = null, contactIndex = 0, lastSound = -1, phase = 'idle';
  let colors = {}, scale = 1;
  const simple = ctx.platform.simpleMotion;
  function palette() {
    const style = getComputedStyle(canvas), get = (key, fallback) => style.getPropertyValue(key).trim() || fallback;
    colors = { bg: get('--bg-2', '#f0f1ed'), surface: get('--surface-strong', '#fff'), line: get('--line', '#dfe3dc'), edge: get('--line-strong', '#b8bcae'), accent: get('--accent', '#8d4841'), accent2: get('--accent-2', '#ad6c52'), accent3: get('--accent-3', '#79423b'),
      ink: get('--text', '#2b2240'), ballEdge: darken(get('--accent-3', '#79423b'), .5), dark: ['ink', 'cinnabar', 'nebula'].includes(document.documentElement.dataset.theme) };
  }
  function resize() {
    if (!alive) return;
    const width = canvas.getBoundingClientRect().width || 324, dpr = Math.min(window.devicePixelRatio || 1, 2);
    scale = width / board.width * dpr;
    canvas.width = background.width = Math.ceil(board.width * scale);
    canvas.height = background.height = Math.ceil(board.height * scale);
    palette(); back.setTransform(scale, 0, 0, scale, 0, 0); paintBoard(back, board, colors); render();
  }
  function render() {
    if (!alive || !c) return;
    c.setTransform(scale, 0, 0, scale, 0, 0); c.clearRect(0, 0, board.width, board.height);
    c.drawImage(background, 0, 0, board.width, board.height);
    if (plan && !simple) {
      const speed = plan.duration / (simple ? 3.5 : plan.playbackDuration), worldTime = Math.max(0, elapsed - .3) * speed;
      for (let i = Math.max(0, contactIndex - 6); i < contactIndex; i++) {
        const hit = plan.contacts[i], age = (worldTime - hit.time) / speed;
        if (age < 0 || age > .26 || hit.kind !== 'pin') continue;
        c.globalAlpha = (1 - age / .26) * .45; c.strokeStyle = colors.accent; c.lineWidth = 1;
        circle(c, hit.x, hit.y, 5 + age * 20); c.stroke(); c.globalAlpha = 1;
      }
    }
    const gate = active ? Math.min(1, elapsed / .26) : phase === 'settled' ? 1 : 0;
    c.strokeStyle = colors.edge; c.lineWidth = 2;
    c.beginPath(); c.moveTo(165, 40); c.lineTo(180 - gate * 14, 40); c.moveTo(180 + gate * 14, 40); c.lineTo(195, 40); c.stroke();
    paintBall(c, pose, board.ballRadius, colors);
  }
  function setPhase(next) {
    if (phase === next) return;
    phase = next; canvas.dataset.phase = next; onPhase(next);
  }
  function tick(now) {
    raf = 0;
    if (!alive || !active || document.hidden) { last = null; return; }
    const dt = last === null ? 0 : Math.max(0, Math.min(.05, (now - last) / 1000)); last = now; elapsed += dt;
    const duration = simple ? 3.5 : plan.playbackDuration;
    const worldTime = Math.max(0, elapsed - .3) / duration * plan.duration;
    pose = frameAt(plan, worldTime);
    setPhase(pose.phase === 'settled' ? 'landing' : pose.phase);
    let strongest = null;
    while (contactIndex < plan.contacts.length && plan.contacts[contactIndex].time <= worldTime) {
      const hit = plan.contacts[contactIndex++];
      if (!strongest || hit.speed > strongest.speed) strongest = hit;
    }
    if (strongest && elapsed - lastSound > .07) {
      ctx.sound.play(strongest.kind === 'floor' ? 'pop' : 'tick');
      ctx.haptic.impact(Math.min(.6, strongest.speed / 280)); lastSound = elapsed;
    }
    render();
    if (elapsed >= .3 + duration + .42) {
      active = false; setPhase('settled'); canvas.dataset.slot = String(plan.result);
      const done = resolve; resolve = null; done?.(plan.result);
    } else raf = requestAnimationFrame(tick);
  }
  function play(nextPlan) {
    plan = nextPlan; board = plan.board; pose = frameAt(plan, 0); elapsed = 0; last = null; contactIndex = 0; lastSound = -1; active = true;
    canvas.removeAttribute('data-slot'); setPhase('falling'); resize();
    return new Promise(done => { resolve = done; raf = requestAnimationFrame(tick); });
  }
  function reset(count) {
    cancelAnimationFrame(raf); active = false; resolve?.(null); resolve = null; plan = null;
    board = makeBoard(count); pose = { x: 180, y: 30, angle: .3 }; elapsed = 0; last = null;
    canvas.removeAttribute('data-slot'); canvas.dataset.phase = phase = 'idle'; resize();
  }
  const visibility = () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; last = null; }
    else if (active && !raf) { last = null; raf = requestAnimationFrame(tick); }
  };
  const observer = new ResizeObserver(resize); observer.observe(canvas);
  ctx.onTheme(resize); document.addEventListener('visibilitychange', visibility);
  ctx.addCleanup(() => {
    alive = false; active = false; cancelAnimationFrame(raf); resolve?.(null); resolve = null;
    observer.disconnect(); document.removeEventListener('visibilitychange', visibility);
  });
  return { play, reset };
}
