// 水晶球 · 界面：水晶球（是非 / 神谕 / 一字）与灵摆。球体与灵摆由交互状态驱动；逻辑见 core.js。
// 节奏：问 → 充能（摩擦 / 摇 / 主按钮）→ 雾散见字 → 舞台下方一行小结 → 「展开解读」抽屉。
import { MODE, pickAnswer, pickRephrase, chargeStep, RUB_GAIN, SHAKE_GAIN, reduceRepeat, PENDULUM, decidePendulum, initPendulum, PENDULUM_PARAMS, pendulumStep, convergenceBias, pendulumLabel } from './core.js';
import { TABS, MODES, MODE_LABEL, MODE_SEAL, TONE_LABEL, QUESTION_PLACEHOLDER, EMPTY_QUESTION_KICKER, LABELS, BALL_HINTS, BALL_BADGE, DAY_FOOTER, NIGHT_FOOTER, PENDULUM_HINTS, PENDULUM_BADGE, PENDULUM_TEXT, PENDULUM_NOTE, PENDULUM_EXPLAIN, SHEET_TITLE_BALL, SHEET_TITLE_PENDULUM, TAP_WHISPERS } from './data.js';
import { createRitual } from '../../ui/ritual.js';
import { createModelSlot } from '../../ui/model-slot.js';

export function mount(container, ctx) {
  const { kit, haptic, sound, storage } = ctx;
  const { h, button, chips, tabs, stage, resultCard, sheet, toast, input, typewriter, clear, nextFrame } = kit;
  const quick = !!(ctx.platform.simpleMotion || ctx.platform.prefersReducedMotion);

  let tab = storage.get('tab', 'ball');
  if (!TABS.some((t) => t.value === tab)) tab = 'ball';
  let mode = storage.get('mode', MODE.YESNO);
  if (!MODES.some((m) => m.value === mode)) mode = MODE.YESNO;
  let question = String(storage.get('question', '') || '').slice(0, 40);
  let repeat = { last: '', count: 0 };
  let progress = 0;
  let phase = 'idle'; // idle | charging | revealing | revealed
  let answer = null;
  let resultSheet = null;
  let autoTimer = null;
  let generation = 0, cancelTyping = null, lastRubHaptic = 0;

  /* ---------- 舞台 ---------- */
  const st = stage({ cls: 'cr-stage' });
  const ritual = createRitual(ctx, st, ['问', '充能', '见', '解读']);
  const ball = createModelSlot(ctx, { id: 'crystal.ball', label: '水晶球', glyph: '晶', hint: BALL_HINTS.idle });
  const pend = createModelSlot(ctx, { id: 'crystal.pendulum', label: '灵摆', glyph: '◇', hint: PENDULUM_HINTS.idle });
  ball.el.classList.add('cr-slot');
  pend.el.classList.add('cr-slot');
  const answerEl = h('div', { class: 'cr-answer', hidden: true });
  st.scene.append(ball.el, pend.el, answerEl);
  pend.set({ x: 0, y: 0 });

  // 舞台正下方唯一的一行操作提示；充能时旁边多一条细细的进度
  const hintText = h('span', { class: 'cr-hint-text' });
  const hintFill = h('i');
  const hintEl = h('div', { class: 'cr-hint', attrs: { 'aria-live': 'polite' } }, hintText, h('span', { class: 'cr-hint-track', attrs: { 'aria-hidden': 'true' } }, hintFill));
  function setHint(text, charge = null) {
    hintText.textContent = text || '';
    if (charge == null) {
      delete hintEl.dataset.charging;
      hintFill.style.transform = 'scaleX(0)';
    } else {
      hintEl.dataset.charging = '1';
      hintFill.style.transform = `scaleX(${Math.max(0, Math.min(1, charge))})`;
    }
  }

  /* ---------- 控件 ---------- */
  const qInput = input({ placeholder: QUESTION_PLACEHOLDER, value: question, maxlength: 40, onInput: (v) => { question = v.trim(); storage.set('question', question); } });
  qInput.setAttribute('aria-label', '想问的问题（选填）');
  const modeChips = chips(MODES, {
    value: mode,
    onChange: (v) => {
      mode = v;
      storage.set('mode', v);
      resetBall();
      haptic.tap();
      sound.play('tick');
    },
  });
  const ballControls = h('div', { class: 'cr-controls' }, modeChips.el);
  const controlsWrap = h('div', { class: 'cr-ask' });
  const primaryBtn = button(LABELS.gaze, { variant: 'primary', size: 'large', primary: true, onClick: () => primaryAction() });
  const resetBtn = button(LABELS.wipe, { variant: 'ghost', icon: 'refresh', onClick: () => (tab === 'ball' ? resetBall(true) : resetPendulum(true)) });
  const tabBar = tabs(TABS, {
    value: tab,
    onChange: (v) => {
      tab = v;
      storage.set('tab', v);
      showTab();
      haptic.tap();
    },
  });
  container.append(ritual.progress, tabBar.el, controlsWrap, st.el, hintEl, kit.actionBar(primaryBtn, resetBtn), ritual.receipt);

  /** 主按钮 / 次按钮随状态换文案；次按钮只在有东西可擦、可扶的时候可点 */
  function setButtons({ primary, busy = false, canReset = true, ghost = null }) {
    primaryBtn.setLabel(primary);
    primaryBtn.disabled = busy;
    qInput.disabled = busy || (tab === 'ball' ? phase !== 'idle' : pState.phase !== 'idle');
    if (ghost) resetBtn.setLabel(ghost);
    resetBtn.disabled = !canReset;
  }

  function showTab() {
    generation++; cancelTyping?.(); cancelTyping = null;
    clearInterval(autoTimer); autoTimer = null; cancelAnimationFrame(pState.raf);
    clear(controlsWrap);
    controlsWrap.append(qInput);
    if (tab === 'ball') controlsWrap.append(ballControls);
    ball.el.hidden = tab !== 'ball';
    pend.el.hidden = tab !== 'pendulum';
    answerEl.hidden = true;
    ritual.clear();
    ritual.step(0);
    if (tab === 'ball') resetBall();
    else resetPendulum();
  }

  function primaryAction() {
    if (resultSheet) return;
    if (tab === 'ball') {
      if (phase === 'revealing') return;
      if (phase === 'revealed') resetBall();
      autoCharge();
    } else {
      if (['asking', 'settling'].includes(pState.phase)) return;
      const ang = ctx.rng.random() * Math.PI * 2;
      startAsk({ vx: Math.cos(ang) * 1.6, vy: Math.sin(ang) * 1.6 });
    }
  }

  /* ================= 水晶球 ================= */
  function resetBall(feedback = false) {
    generation++; cancelTyping?.(); cancelTyping = null;
    clearInterval(autoTimer);
    autoTimer = null;
    progress = 0;
    phase = 'idle';
    answer = null;
    answerEl.hidden = true;
    clear(answerEl);
    ball.set({ progress: 0, glow: false, active: false, revealed: false, text: BALL_HINTS.idle });
    st.setBadge(BALL_BADGE.idle);
    setHint(BALL_HINTS.idle);
    ritual.clear();
    ritual.step(0);
    setButtons({ primary: LABELS.gaze, busy: false, canReset: false, ghost: LABELS.wipe });
    if (!feedback) return;
    sound.play('flip');
    haptic.tap();
  }
  function charge(delta, source) {
    if (tab !== 'ball' || phase === 'revealed' || phase === 'revealing' || resultSheet) return;
    progress = chargeStep(progress, delta);
    if (phase === 'idle') {
      ritual.step(1);
      st.setBadge(BALL_BADGE.charging);
      resetBtn.disabled = false;
    }
    phase = 'charging';
    qInput.disabled = true;
    const text = progress < 0.35 ? BALL_HINTS.low : progress < 0.7 ? BALL_HINTS.mid : progress < 1 ? BALL_HINTS.high : BALL_HINTS.charging;
    ball.set({ progress, text, glow: progress > 0.6, active: progress > 0.3 });
    setHint(text, progress);
    if (source === 'rub') {
      if (ctx.rng.random() < 0.25) sound.play('shimmer');
      const now = performance.now();
      if (now - lastRubHaptic > 140) {
        lastRubHaptic = now;
        haptic.light();
      }
    }
    if (progress >= 1) reveal();
  }
  async function autoCharge() {
    if (phase === 'revealed' || phase === 'revealing' || autoTimer || primaryBtn.disabled) return;
    setButtons({ primary: LABELS.gazing, busy: true, canReset: true });
    const g = generation;
    if (!await ritual.focus() || g !== generation || phase === 'revealing' || phase === 'revealed') return;
    haptic.light();
    sound.play('tick');
    // 约 1.5s 从零充满；摩擦过一半的话更快
    autoTimer = setInterval(() => {
      if (!document.hidden) charge(quick ? 0.06 : 0.035, 'auto');
    }, 50);
  }
  ctx.gesture.rub(ball.el, ({ intensity }) => {
    if (tab !== 'ball' || resultSheet) return;
    if (phase === 'revealed') resetBall();
    charge(RUB_GAIN * (0.5 + intensity), 'rub');
  });
  ctx.gesture.tap(ball.el, () => {
    if (tab !== 'ball' || phase !== 'idle') return;
    toast(TAP_WHISPERS[Math.floor(ctx.rng.random() * TAP_WHISPERS.length)]);
  });
  ctx.motion.onShake(() => {
    if (tab !== 'ball' || resultSheet || phase === 'revealing') return;
    if (phase === 'revealed') resetBall();
    charge(SHAKE_GAIN, 'shake');
    sound.play('shake');
    haptic.rattle();
  });
  async function reveal() {
    phase = 'revealing';
    setButtons({ primary: LABELS.gazing, busy: true, canReset: true });
    clearInterval(autoTimer); autoTimer = null;
    const g = generation;
    repeat = reduceRepeat(repeat, question);
    const selected = pickAnswer(mode, ctx.rng.random, { repeat: repeat.count });
    answer = selected;
    ritual.step(2);
    ball.set({ progress: 1, glow: true, active: false, text: BALL_HINTS.charging });
    setHint(BALL_HINTS.charging, 1);
    haptic.medium();
    if (!await ritual.focus() || g !== generation) return;
    if (!await ritual.pause(quick ? 300 : 700) || g !== generation) return;
    ball.set({ revealed: true, text: BALL_HINTS.clearing });
    st.setBadge(BALL_BADGE.revealed);
    setHint(BALL_HINTS.clearing);
    sound.play('shimmer'); haptic.settle();
    answerEl.hidden = false;
    answerEl.dataset.mode = mode;
    clear(answerEl);
    const big = h('div', { class: ['cr-answer-text', mode === MODE.WORD && 'word'] });
    answerEl.append(big);
    const written = await new Promise((resolve) => {
      const stop = typewriter(big, selected.text, { speed: quick ? 18 : mode === MODE.WORD ? 160 : 48, onDone: () => resolve(true) });
      cancelTyping = () => { stop(); resolve(false); };
    });
    if (!written || !ritual.alive || g !== generation) return;
    cancelTyping = null;
    if (!await ritual.pause(quick ? 100 : 350) || g !== generation) return;
    phase = 'revealed';
    ball.set({ text: BALL_HINTS.revealed });
    setHint(BALL_HINTS.revealed);
    ritual.reveal({ kicker: question ? `问：${question}` : EMPTY_QUESTION_KICKER, title: selected.text, text: selected.note, onRead: openBallSheet });
    ritual.receipt.toggleAttribute('data-long', [...selected.text].length > 8);
    setButtons({ primary: LABELS.again, busy: false, canReset: true });
  }
  function openBallSheet() {
    if (!answer || phase !== 'revealed' || resultSheet) return;
    ritual.step(3);
    const tone = answer.tone;
    const seal = mode === MODE.YESNO ? MODE_SEAL.yesno[tone] || '待' : MODE_SEAL[mode];
    const hour = new Date().getHours();
    const len = [...answer.text].length;
    const card = resultCard({
      cls: mode === MODE.WORD ? 'cr-card-word' : len > 12 ? 'cr-card-verse' : len > 6 ? 'cr-card-mid' : '',
      kicker: MODE_LABEL[mode],
      title: answer.text,
      sub: question ? `问：${question}` : EMPTY_QUESTION_KICKER,
      badge: answer.egg ? '同一件事第三次问' : tone ? TONE_LABEL[tone] : null,
      seal,
      sections: [
        { label: mode === MODE.WORD ? '字解' : '注解', text: answer.note },
        { label: '换个问法', text: pickRephrase(answer, ctx.rng.random) },
      ],
      footer: hour >= 23 || hour < 5 ? NIGHT_FOOTER : DAY_FOOTER,
    });
    openSheet(SHEET_TITLE_BALL, card, `【水晶球】${question ? '问：' + question + '\n' : ''}${answer.text}\n${answer.note}\n—— 来感觉 · 玄学占卜`, () => resetBall(true));
  }

  /* ================= 灵摆 ================= */
  let pState = { phase: 'idle', s: initPendulum(), target: null, startedAt: 0, raf: 0, last: 0, result: null, elapsed: 0 };
  let tiltBias = { x: 0, y: 0 };
  let prevTilt = null;
  const ASK_SECONDS = quick ? 3 : 4.6;

  function resetPendulum(feedback = false) {
    generation++; prevTilt = null;
    cancelAnimationFrame(pState.raf);
    pState = { phase: 'idle', s: initPendulum(), target: null, startedAt: 0, raf: 0, last: 0, result: null, elapsed: 0 };
    pend.set({ x: 0, y: 0, glow: false, active: false, result: null, text: PENDULUM_HINTS.idle, progress: 0 });
    st.setBadge(PENDULUM_BADGE.idle);
    setHint(PENDULUM_HINTS.idle);
    ritual.clear();
    ritual.step(0);
    setButtons({ primary: LABELS.askPendulum, busy: false, canReset: false, ghost: LABELS.steady });
    if (!feedback) return;
    sound.play('flip');
    haptic.tap();
  }
  async function startAsk(kick) {
    if (['asking', 'settling'].includes(pState.phase) || resultSheet) return;
    if (pState.phase === 'done') resetPendulum();
    const g = generation;
    pState.phase = 'asking';
    setButtons({ primary: LABELS.swinging, busy: true, canReset: true });
    if (!await ritual.focus() || g !== generation) return;
    pState.elapsed = 0;
    pState.target = decidePendulum(ctx.rng.random);
    pState.s = { x: kick.x || 0, y: kick.y || 0, vx: kick.vx, vy: kick.vy, t: 0 };
    pState.startedAt = performance.now();
    pState.last = pState.startedAt;
    ritual.step(1);
    st.setBadge(PENDULUM_BADGE.asking);
    setHint(PENDULUM_HINTS.asking, 0);
    haptic.light();
    sound.play('tick');
    pend.set({ active: true, text: PENDULUM_HINTS.asking });
    pState.raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    if (!['asking', 'settling'].includes(pState.phase)) return;
    const dt = document.hidden ? 0 : Math.min(1 / 30, (now - pState.last) / 1000);
    pState.last = now;
    pState.elapsed += dt;
    const t = pState.elapsed;
    const ramp = Math.max(0, Math.min(1, (t - 0.6) / 1.4));
    const cb = convergenceBias(pState.s, pState.target, ramp);
    const fade = Math.max(0, 1 - t / ASK_SECONDS);
    const bias = { x: cb.x + tiltBias.x * fade + (ctx.rng.random() - 0.5) * 0.4 * fade, y: cb.y + tiltBias.y * fade + (ctx.rng.random() - 0.5) * 0.4 * fade };
    tiltBias = { x: tiltBias.x * 0.85, y: tiltBias.y * 0.85 };
    const settling = t >= ASK_SECONDS;
    if (settling) pState.phase = 'settling';
    pState.s = pendulumStep(pState.s, dt, settling ? null : bias, settling ? { ...PENDULUM_PARAMS, damping: 3.5 } : PENDULUM_PARAMS);
    pend.set({ x: pState.s.x / 1.4, y: pState.s.y / 1.4, progress: t / ASK_SECONDS });
    hintFill.style.transform = `scaleX(${Math.min(1, t / ASK_SECONDS)})`;
    if (settling && Math.hypot(pState.s.x, pState.s.y, pState.s.vx, pState.s.vy) < .018) return finishAsk();
    pState.raf = requestAnimationFrame(tick);
  }
  async function finishAsk() {
    const g = generation;
    pState.phase = 'done';
    const result = pState.target;
    pState.result = result;
    const txt = PENDULUM_TEXT[result];
    pend.set({ glow: true, active: false, result, text: txt.badge, progress: 1 });
    st.setBadge(txt.badge);
    setHint(PENDULUM_HINTS.done);
    sound.play(result === PENDULUM.YES ? 'chime' : result === PENDULUM.NO ? 'low' : 'pop');
    haptic.settle();
    ritual.step(2);
    if (!await ritual.pause(quick ? 100 : 500) || g !== generation) return;
    ritual.reveal({ kicker: question ? `问：${question}` : EMPTY_QUESTION_KICKER, title: pendulumLabel(result), text: txt.conclusion, onRead: openPendulumSheet });
    ritual.receipt.toggleAttribute('data-long', false);
    setButtons({ primary: LABELS.again, busy: false, canReset: true });
  }
  // 拖动锥体给初速度；倾斜手机给扰动
  ctx.gesture.drag(pend.el, {
    onMove: (g) => {
      if (tab !== 'pendulum' || ['asking', 'settling'].includes(pState.phase)) return;
      pend.set({ x: Math.max(-1, Math.min(1, g.dx / 90)), y: Math.max(-1, Math.min(1, g.dy / 90)) });
    },
    onEnd: (g) => {
      if (tab !== 'pendulum' || ['asking', 'settling'].includes(pState.phase) || g.cancelled) return;
      const speed = Math.hypot(g.vx, g.vy);
      if (speed < 0.15 && Math.hypot(g.dx, g.dy) < 20) {
        pend.set({ x: 0, y: 0 });
        return;
      }
      startAsk({ x: Math.max(-1, Math.min(1, g.dx / 90)) * 1.4, y: Math.max(-1, Math.min(1, g.dy / 90)) * 1.4, vx: Math.max(-2.2, Math.min(2.2, g.vx * 2.4 || g.dx / 60)), vy: Math.max(-2.2, Math.min(2.2, g.vy * 2.4 || g.dy / 60)) });
    },
  });
  ctx.motion.onTilt(({ beta, gamma }) => {
    if (tab !== 'pendulum' || beta == null || gamma == null) return;
    if (prevTilt) {
      const dx = (gamma - prevTilt.gamma) * 0.06;
      const dy = (beta - prevTilt.beta) * 0.06;
      tiltBias = { x: Math.max(-2, Math.min(2, tiltBias.x + dx)), y: Math.max(-2, Math.min(2, tiltBias.y + dy)) };
      if ((pState.phase === 'idle' || pState.phase === 'done') && Math.hypot(dx, dy) > 0.9 && !resultSheet) startAsk({ vx: dx * 1.5, vy: dy * 1.5 });
    }
    prevTilt = { beta, gamma };
  });
  function openPendulumSheet() {
    if (!pState.result || resultSheet) return;
    ritual.step(3);
    const txt = PENDULUM_TEXT[pState.result];
    const card = resultCard({
      kicker: txt.kicker,
      title: txt.title,
      sub: question ? `问：${question}` : EMPTY_QUESTION_KICKER,
      badge: txt.badge,
      seal: txt.seal,
      verse: txt.verse,
      sections: [
        { label: '结论', text: txt.conclusion },
        { label: '建议', text: txt.advice[Math.floor(ctx.rng.random() * txt.advice.length)] },
        { label: '提醒', text: `${PENDULUM_NOTE}${PENDULUM_EXPLAIN}` },
      ],
      footer: DAY_FOOTER,
    });
    openSheet(SHEET_TITLE_PENDULUM, card, `【灵摆】${question ? '问：' + question + '\n' : ''}${txt.title} · ${txt.badge}\n${txt.conclusion}\n—— 来感觉 · 玄学占卜`, () => resetPendulum(true));
  }

  /* ---------- 抽屉 ---------- */
  function openSheet(title, card, share, again) {
    resultSheet = sheet({
      title,
      content: h('div', { class: 'm-crystal' }, card),
      actions: [
        button(LABELS.again, {
          variant: 'primary',
          onClick: () => {
            resultSheet.close();
            ctx.setTimeout(() => { if (ritual.alive) again(); }, 300);
          },
        }),
        button(LABELS.share, {
          variant: 'ghost',
          icon: 'share',
          onClick: async () => {
            const r = await ctx.share(share);
            toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制' : '分享已取消');
          },
        }),
      ],
      onClose: () => {
        resultSheet = null;
        if (ritual.alive) ritual.step(2);
      },
    });
    resultSheet.open();
  }

  showTab();
  return () => {
    generation++; cancelTyping?.();
    clearInterval(autoTimer);
    cancelAnimationFrame(pState.raf);
    resultSheet?.close();
  };
}
