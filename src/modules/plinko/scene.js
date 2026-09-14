import { makeBoard, frameAt } from './core.js';

const circle = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); };

export function paintBoard(c, board, colors) {
  const { width, height, left, right, floor, dividerY } = board;
  c.clearRect(0, 0, width, height);
  const wash = c.createLinearGradient(0, 0, width, height);
  wash.addColorStop(0, colors.surface); wash.addColorStop(1, colors.bg);
  c.fillStyle = wash; c.fillRect(0, 0, width, height);
  // Recessed channels and softly machined pegs share the site's material tones.
  for (let i = 0; i < board.count; i++) {
    const x = left + i * board.slotWidth;
    c.fillStyle = colors.accent; c.globalAlpha = .045;
    c.fillRect(x + 2, dividerY + 12, board.slotWidth - 4, floor - dividerY - 12);
  }
  c.globalAlpha = 1;
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = colors.line; c.lineWidth = 1;
  c.beginPath(); c.moveTo(left, 61); c.lineTo(left, floor); c.lineTo(right, floor); c.lineTo(right, 61); c.stroke();
  for (const x of board.dividers) {
    c.strokeStyle = colors.line; c.lineWidth = 7;
    c.beginPath(); c.moveTo(x + .8, dividerY + 2); c.lineTo(x + .8, floor); c.stroke();
    c.strokeStyle = colors.surface; c.lineWidth = 4;
    c.beginPath(); c.moveTo(x - .5, dividerY); c.lineTo(x - .5, floor - 2); c.stroke();
    c.strokeStyle = colors.edge; c.lineWidth = .7; c.stroke();
  }
  for (const p of board.pins) {
    c.fillStyle = 'rgba(0,0,0,.09)'; circle(c, p.x + 1.4, p.y + 2.2, p.r + 1); c.fill();
    const metal = c.createRadialGradient(p.x - 1.4, p.y - 1.5, .2, p.x, p.y, p.r + .6);
    metal.addColorStop(0, colors.surface); metal.addColorStop(.42, colors.surface); metal.addColorStop(1, colors.edge);
    c.fillStyle = metal; circle(c, p.x, p.y, p.r); c.fill();
    c.strokeStyle = colors.edge; c.lineWidth = .6; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.7)'; circle(c, p.x - 1.15, p.y - 1.35, .75); c.fill();
  }
  c.strokeStyle = colors.line; c.lineWidth = 1;
  for (const x of [165, 195]) { c.beginPath(); c.moveTo(x, 8); c.lineTo(x, 37); c.stroke(); }
  for (const x of [27, 333]) {
    c.fillStyle = colors.edge; circle(c, x, 24, 2); c.fill();
    c.strokeStyle = colors.surface; c.lineWidth = .7; c.beginPath(); c.moveTo(x - 1, 24); c.lineTo(x + 1, 24); c.stroke();
  }
}

export function paintBall(c, ball, radius, colors) {
  c.save();
  const shadow = c.createRadialGradient(ball.x + 3, ball.y + 5, 0, ball.x + 3, ball.y + 5, radius * 1.6);
  shadow.addColorStop(0, 'rgba(0,0,0,.25)'); shadow.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = shadow; circle(c, ball.x + 3, ball.y + 5, radius * 1.6); c.fill();
  const enamel = c.createRadialGradient(ball.x - radius * .4, ball.y - radius * .48, .3, ball.x + radius * .2, ball.y + radius * .2, radius * 1.2);
  enamel.addColorStop(0, '#fffef6'); enamel.addColorStop(.24, colors.accent2); enamel.addColorStop(.66, colors.accent); enamel.addColorStop(1, colors.accent3);
  c.fillStyle = enamel; circle(c, ball.x, ball.y, radius); c.fill(); c.clip();
  c.translate(ball.x, ball.y); c.rotate(ball.angle);
  c.strokeStyle = 'rgba(255,255,255,.32)'; c.lineWidth = .75;
  c.beginPath(); c.ellipse(-radius * .1, 0, radius * .48, radius * .98, .4, 0, Math.PI * 2); c.stroke();
  c.restore();
  c.fillStyle = 'rgba(255,255,255,.8)'; circle(c, ball.x - radius * .3, ball.y - radius * .4, radius * .17); c.fill();
}

export function createPlinkoScene(canvas, ctx, onPhase = () => {}) {
  const c = canvas.getContext('2d'), background = document.createElement('canvas'), back = background.getContext('2d');
  let board = makeBoard(), plan = null, pose = { x: 180, y: 30, angle: .3 }, elapsed = 0, last = null;
  let raf = 0, active = false, alive = true, resolve = null, contactIndex = 0, lastSound = -1, phase = 'idle';
  let colors = {}, scale = 1;
  const simple = ctx.platform.simpleMotion;
  function palette() {
    const style = getComputedStyle(canvas), get = (key, fallback) => style.getPropertyValue(key).trim() || fallback;
    colors = { bg: get('--bg-2', '#f0f1ed'), surface: get('--surface-strong', '#fff'), line: get('--line', '#dfe3dc'), edge: get('--line-strong', '#b8bcae'), accent: get('--accent', '#8d4841'), accent2: get('--accent-2', '#ad6c52'), accent3: get('--accent-3', '#79423b') };
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
