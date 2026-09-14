// 水晶球 · 界面：水晶球（是非 / 神谕 / 一字）与灵摆。实物用 3D 模型占位块；逻辑见 core.js。
import { MODE, pickAnswer, pickRephrase, chargeStep, RUB_GAIN, SHAKE_GAIN, reduceRepeat, PENDULUM, decidePendulum, initPendulum, pendulumStep, convergenceBias, pendulumLabel } from './core.js';
import { TABS, MODES, MODE_LABEL, MODE_SEAL, TONE_LABEL, QUESTION_PLACEHOLDER, EMPTY_QUESTION_KICKER, BALL_HINTS, BALL_HINT_GESTURE, DAY_FOOTER, NIGHT_FOOTER, PENDULUM_HINTS, PENDULUM_HINT_GESTURE, PENDULUM_TEXT, PENDULUM_NOTE, PENDULUM_EXPLAIN, SHEET_TITLE_BALL, SHEET_TITLE_PENDULUM, TAP_WHISPERS } from './data.js';
import { createRitual } from '../../ui/ritual.js';
import { createModelSlot } from '../../ui/model-slot.js';

export function mount(container, ctx) {
  const { kit, haptic, sound, storage } = ctx;
  const { h, button, chips, tabs, stage, resultCard, sheet, toast, input, typewriter, clear } = kit;

  let tab = storage.get('tab', 'ball');
  if (!TABS.some((t) => t.value === tab)) tab = 'ball';
  let mode = storage.get('mode', MODE.YESNO);
  if (!MODES.some((m) => m.value === mode)) mode = MODE.YESNO;
  let question = '';
  let repeat = { last: '', count: 0 };
  let progress = 0;
  let phase = 'idle'; // idle | charging | revealed
  let answer = null;
  let resultSheet = null;
  let autoTimer = null;

  const st = stage({ cls: 'cr-stage' });
  const ritual = createRitual(ctx, st, ['问', '充能', '见', '解读']);
  const ball = createModelSlot(ctx, { id: 'crystal.ball', label: '水晶球', glyph: '晶', hint: BALL_HINTS.idle });
  const pend = createModelSlot(ctx, { id: 'crystal.pendulum', label: '灵摆', glyph: '◇', hint: PENDULUM_HINTS.idle });
  ball.el.classList.add('cr-slot');
  pend.el.classList.add('cr-slot');
  const answerEl = h('div', { class: 'cr-answer', hidden: true });
  const pendLabels = h('div', { class: 'cr-pend-labels', hidden: true }, h('span', { class: 'n' }, '是'), h('span', { class: 's' }, '是'), h('span', { class: 'w' }, '否'), h('span', { class: 'e' }, '否'));
  st.scene.append(ball.el, pend.el, answerEl, pendLabels);
  pend.set({ x: 0, y: 0 });

  /* ---------- 控件 ---------- */
  const qInput = input({ placeholder: QUESTION_PLACEHOLDER, maxlength: 60, onInput: (v) => (question = v.trim()) });
  const modeChips = chips(MODES, {
    value: mode,
    onChange: (v) => {
      mode = v;
      storage.set('mode', v);
      resetBall();
      haptic.tap();
    },
  });
  const ballControls = h('div', { class: 'cr-controls' }, qInput, modeChips.el, h('div', { class: 'hint' }, BALL_HINT_GESTURE));
  const pendControls = h('div', { class: 'cr-controls' }, qInput, h('div', { class: 'hint' }, PENDULUM_HINT_GESTURE), h('p', { class: 'cr-note' }, PENDULUM_EXPLAIN));
  const controlsWrap = h('div', null);
  const primaryBtn = button('凝 视', { variant: 'primary', size: 'large', primary: true, onClick: () => primaryAction() });
  const resetBtn = button('擦拭重问', { variant: 'ghost', icon: 'refresh', onClick: () => (tab === 'ball' ? resetBall(true) : resetPendulum(true)) });
  const tabBar = tabs(TABS, {
    value: tab,
    onChange: (v) => {
      tab = v;
      storage.set('tab', v);
      showTab();
      haptic.tap();
    },
  });
  container.append(ritual.progress, tabBar.el, controlsWrap, h('div', { class: 'mt-3' }, st.el), kit.actionBar(primaryBtn, resetBtn), ritual.receipt);

  function showTab() {
    clear(controlsWrap);
    controlsWrap.append(tab === 'ball' ? ballControls : pendControls);
    ball.el.hidden = tab !== 'ball';
    pend.el.hidden = tab !== 'pendulum';
    pendLabels.hidden = tab !== 'pendulum';
    answerEl.hidden = true;
    ritual.clear();
    ritual.step(0);
    if (tab === 'ball') {
      resetBall();
      primaryBtn.setLabel('凝 视');
      resetBtn.setLabel('擦拭重问');
    } else {
      resetPendulum();
      primaryBtn.setLabel('开始问');
      resetBtn.setLabel('停下重来');
    }
  }

  function primaryAction() {
    if (resultSheet) return;
    if (tab === 'ball') {
      if (phase === 'revealed') return openBallSheet();
      autoCharge();
    } else {
      if (pState.phase === 'done') return openPendulumSheet();
      if (pState.phase === 'asking') return;
      const ang = ctx.rng.random() * Math.PI * 2;
      startAsk({ vx: Math.cos(ang) * 1.6, vy: Math.sin(ang) * 1.6 });
    }
  }

  /* ================= 水晶球 ================= */
  function resetBall(silent = false) {
    clearInterval(autoTimer);
    autoTimer = null;
    progress = 0;
    phase = 'idle';
    answer = null;
    answerEl.hidden = true;
    ball.set({ progress: 0, glow: false, active: false, text: BALL_HINTS.idle });
    ball.el.querySelector('.model-slot-glyph').style.opacity = '';
    ritual.clear();
    ritual.step(0);
    primaryBtn.setLabel('凝 视');
    primaryBtn.disabled = false;
    if (!silent) return;
    sound.play('flip');
    haptic.tap();
  }
  function charge(delta, source) {
    if (tab !== 'ball' || phase === 'revealed' || resultSheet) return;
    progress = chargeStep(progress, delta);
    phase = 'charging';
    const text = progress < 0.35 ? BALL_HINTS.low : progress < 0.7 ? BALL_HINTS.mid : progress < 1 ? BALL_HINTS.high : BALL_HINTS.charging;
    ball.set({ progress, text, glow: progress > 0.6, active: progress > 0.3 });
    if (source === 'rub' && Math.random() < 0.25) sound.play('shimmer');
    if (progress >= 1) reveal();
  }
  function autoCharge() {
    if (phase === 'revealed' || autoTimer) return;
    haptic.light();
    ritual.step(1);
    autoTimer = setInterval(() => {
      charge(0.05, 'auto');
      if (progress >= 1) {
        clearInterval(autoTimer);
        autoTimer = null;
      }
    }, 75);
  }
  ctx.gesture.rub(ball.el, ({ intensity }) => {
    if (phase === 'idle') ritual.step(1);
    charge(RUB_GAIN * (0.5 + intensity), 'rub');
  });
  ctx.gesture.tap(ball.el, () => {
    if (tab !== 'ball' || phase !== 'idle') return;
    toast(TAP_WHISPERS[Math.floor(ctx.rng.random() * TAP_WHISPERS.length)]);
  });
  ctx.motion.onShake(() => {
    if (tab === 'ball') {
      if (phase === 'idle') ritual.step(1);
      charge(SHAKE_GAIN, 'shake');
      haptic.rattle();
    }
  });
  async function reveal() {
    phase = 'revealed';
    clearInterval(autoTimer);
    autoTimer = null;
    repeat = reduceRepeat(repeat, question);
    answer = pickAnswer(mode, ctx.rng.random, { repeat: repeat.count });
    ritual.step(2);
    ball.set({ progress: 1, glow: true, active: false, text: '雾散了' });
    ball.el.querySelector('.model-slot-glyph').style.opacity = '0.15';
    sound.play('shimmer');
    haptic.settle();
    answerEl.hidden = false;
    answerEl.dataset.mode = mode;
    clear(answerEl);
    const big = h('div', { class: ['cr-answer-text', mode === MODE.WORD && 'word'] });
    answerEl.append(big);
    await new Promise((r) => typewriter(big, answer.text, { speed: mode === MODE.WORD ? 200 : 55, onDone: r }));
    if (!ritual.alive) return;
    await ritual.pause(ctx.platform.simpleMotion ? 100 : 500);
    ball.set({ text: BALL_HINTS.revealed });
    ritual.reveal({
      kicker: question || EMPTY_QUESTION_KICKER,
      title: answer.text,
      text: answer.note,
      onRead: openBallSheet,
    });
    primaryBtn.setLabel('展开解读');
  }
  function openBallSheet() {
    if (!answer || resultSheet) return;
    ritual.step(3);
    const tone = answer.tone;
    const seal = mode === MODE.YESNO ? MODE_SEAL.yesno[tone] || '待' : MODE_SEAL[mode];
    const hour = new Date().getHours();
    const card = resultCard({
      kicker: question || EMPTY_QUESTION_KICKER,
      title: answer.text,
      sub: `${MODE_LABEL[mode]}${tone ? ' · ' + TONE_LABEL[tone] : ''}${answer.egg ? ' · 同一件事第三次问' : ''}`,
      badge: MODE_LABEL[mode],
      seal,
      sections: [
        { label: '注解', text: answer.note },
        { label: '换个问法', text: pickRephrase(answer, ctx.rng.random) },
      ],
      footer: hour >= 23 || hour < 5 ? NIGHT_FOOTER : DAY_FOOTER,
    });
    openSheet(SHEET_TITLE_BALL, card, `【水晶球】${question ? '问：' + question + '\n' : ''}${answer.text}\n${answer.note}\n—— 来感觉 · 玄学占卜`, () => resetBall(true));
  }

  /* ================= 灵摆 ================= */
  let pState = { phase: 'idle', s: initPendulum(), target: null, startedAt: 0, raf: 0, last: 0, result: null };
  let tiltBias = { x: 0, y: 0 };
  let prevTilt = null;
  const ASK_SECONDS = 4.6;

  function resetPendulum(silent = false) {
    cancelAnimationFrame(pState.raf);
    pState = { phase: 'idle', s: initPendulum(), target: null, startedAt: 0, raf: 0, last: 0, result: null };
    pend.set({ x: 0, y: 0, glow: false, active: false, text: PENDULUM_HINTS.idle, progress: 0 });
    pendLabels.dataset.result = '';
    ritual.clear();
    ritual.step(0);
    primaryBtn.setLabel('开始问');
    primaryBtn.disabled = false;
    if (silent) {
      sound.play('flip');
      haptic.tap();
    }
  }
  function startAsk(kick) {
    if (pState.phase === 'asking' || resultSheet) return;
    pState.phase = 'asking';
    pState.target = decidePendulum(ctx.rng.random);
    pState.s = { x: 0, y: 0, vx: kick.vx, vy: kick.vy, t: 0 };
    pState.startedAt = performance.now();
    pState.last = pState.startedAt;
    ritual.step(1);
    haptic.light();
    sound.play('tick');
    pend.set({ active: true, text: PENDULUM_HINTS.asking });
    primaryBtn.disabled = true;
    pState.raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    if (pState.phase !== 'asking') return;
    const dt = Math.min(1 / 30, (now - pState.last) / 1000);
    pState.last = now;
    const t = (now - pState.startedAt) / 1000;
    const ramp = Math.max(0, Math.min(1, (t - 0.6) / 1.4));
    const cb = convergenceBias(pState.s, pState.target, ramp);
    const fade = Math.max(0, 1 - t / ASK_SECONDS);
    const bias = { x: cb.x + tiltBias.x * fade + (ctx.rng.random() - 0.5) * 0.4 * fade, y: cb.y + tiltBias.y * fade + (ctx.rng.random() - 0.5) * 0.4 * fade };
    tiltBias = { x: tiltBias.x * 0.85, y: tiltBias.y * 0.85 };
    pState.s = pendulumStep(pState.s, dt, bias);
    pend.set({ x: pState.s.x / 1.4, y: pState.s.y / 1.4, progress: t / ASK_SECONDS });
    if (t >= ASK_SECONDS) return finishAsk();
    pState.raf = requestAnimationFrame(tick);
  }
  async function finishAsk() {
    pState.phase = 'done';
    const result = pState.target;
    pState.result = result;
    const txt = PENDULUM_TEXT[result];
    pendLabels.dataset.result = result;
    pend.set({ glow: true, active: false, text: `${txt.badge}`, progress: 1 });
    sound.play(result === PENDULUM.YES ? 'chime' : result === PENDULUM.NO ? 'low' : 'pop');
    haptic.settle();
    ritual.step(2);
    await ritual.pause(ctx.platform.simpleMotion ? 100 : 500);
    ritual.reveal({ kicker: question || EMPTY_QUESTION_KICKER, title: pendulumLabel(result), text: txt.conclusion, onRead: openPendulumSheet });
    primaryBtn.setLabel('展开解读');
    primaryBtn.disabled = false;
  }
  // 拖动锥体给初速度；倾斜手机给扰动
  ctx.gesture.drag(pend.el, {
    onMove: (g) => {
      if (tab !== 'pendulum' || pState.phase === 'asking') return;
      pend.set({ x: Math.max(-1, Math.min(1, g.dx / 90)), y: Math.max(-1, Math.min(1, g.dy / 90)) });
    },
    onEnd: (g) => {
      if (tab !== 'pendulum' || pState.phase === 'asking' || g.cancelled) return;
      if (pState.phase === 'done') return;
      const speed = Math.hypot(g.vx, g.vy);
      if (speed < 0.15 && Math.hypot(g.dx, g.dy) < 20) {
        pend.set({ x: 0, y: 0 });
        return;
      }
      startAsk({ vx: Math.max(-2.2, Math.min(2.2, g.vx * 2.4 || g.dx / 60)), vy: Math.max(-2.2, Math.min(2.2, g.vy * 2.4 || g.dy / 60)) });
    },
  });
  ctx.motion.onTilt(({ beta, gamma }) => {
    if (tab !== 'pendulum' || beta == null || gamma == null) return;
    if (prevTilt) {
      const dx = (gamma - prevTilt.gamma) * 0.06;
      const dy = (beta - prevTilt.beta) * 0.06;
      tiltBias = { x: Math.max(-2, Math.min(2, tiltBias.x + dx)), y: Math.max(-2, Math.min(2, tiltBias.y + dy)) };
      if (pState.phase === 'idle' && Math.hypot(dx, dy) > 0.9 && !resultSheet) startAsk({ vx: dx * 1.5, vy: dy * 1.5 });
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
      sub: question || EMPTY_QUESTION_KICKER,
      badge: txt.badge,
      seal: txt.seal,
      verse: txt.verse,
      sections: [
        { label: '结论', text: txt.conclusion },
        { label: '建议', text: txt.advice[Math.floor(ctx.rng.random() * txt.advice.length)] },
        { label: '提醒', text: `${PENDULUM_NOTE} ${PENDULUM_EXPLAIN}` },
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
        button('再问', {
          variant: 'primary',
          onClick: () => {
            resultSheet.close();
            setTimeout(again, 300);
          },
        }),
        button('分享', {
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
    clearInterval(autoTimer);
    cancelAnimationFrame(pState.raf);
    resultSheet?.close();
  };
}
