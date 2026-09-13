// 御神签 · 界面（Web DOM）。所有逻辑在 core.js，所有文案在 data.js。
// 节奏：摇筒（起）→ 签棒滑出（飞 / 落）→ 签纸展开盖章（揭）→ 结果抽屉 → 结签 / 带回家。
import { pickLot, levelOf, isBad, initRack, tieUp, untie, visibleKnots, RACK_MAX, drawnToday, markDrawn, shareText, PHASE, nextPhase, ITEM_KEYS, toneOf } from './core.js';
import { TEXT } from './data.js';
import { createRitual } from '../../ui/ritual.js';
import { overRope } from './interaction.js';

const STICK_IN = 'translate(0px, -4px) rotate(90deg)';
const STICK_OUT = 'translate(-8px, 104px) rotate(-5deg)';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function mount(container, ctx) {
  const { kit, haptic, sound, storage } = ctx;
  const { h, button, stage, hint, resultCard, sheet, toast, confetti, historyBar } = kit;
  const reduce = !!ctx.platform.prefersReducedMotion;
  const dur = (ms) => (reduce ? 1 : ms);
  const cancelAnims = (el) => el.getAnimations && el.getAnimations().forEach((a) => a.cancel());

  /* ---------- 状态 ---------- */
  let phase = PHASE.IDLE;
  let busy = false;
  let lot = null; // 当前抽到的签
  let rack = storage.get('rack', initRack());
  let daily = storage.get('daily', null);
  let history = storage.get('history', []);
  let lastNo = storage.get('lastNo', null);
  let dragging = false;
  let openSheet = null;
  let tying = false, slipDrag = false, resolved = false;
  const today = () => ctx.rng.dateKey();

  /* ---------- 舞台 ---------- */
  const st = stage({ cls: 'ok-stage', hint: TEXT.hintIdle, badge: badgeText(), minHeight: 420 });
  const ritual = createRitual(ctx, st, ['摇签', '取签', '展签', '结缘']);
  const wait = ritual.pause;

  // 四季飘落物（春樱 / 夏萤 / 秋叶 / 冬雪）
  const month = new Date().getMonth() + 1;
  const season = month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter';
  const ambient = h('div', { class: ['ok-ambient', 'ok-season-' + season] });
  for (let i = 0; i < 7; i++) {
    const p = h('span', { class: 'ok-petal' });
    p.style.setProperty('--x', `${8 + ((i * 53) % 84)}%`);
    p.style.setProperty('--d', `${8 + ((i * 7) % 5)}s`);
    p.style.setProperty('--delay', `${-(i * 1.7)}s`);
    p.style.setProperty('--dx', `${((i % 3) - 1) * 40}px`);
    ambient.append(p);
  }

  // 结绳架（みくじ掛け）
  const rackRod = h('div', { class: 'ok-rack-rod' });
  const dropHint = h('div', { class: 'ok-drop-hint' }, '将签纸拖到绳上');
  const rackKnots = h('div', { class: 'ok-rack-knots' });
  const rackEl = h('div', { class: 'ok-rack', attrs: { role: 'button', tabindex: '0', 'aria-label': TEXT.btnRack } }, h('span', { class: 'ok-rack-post l' }), h('span', { class: 'ok-rack-post r' }), rackRod, h('div', { class: 'ok-rack-rod2' }), rackKnots, dropHint);

  // 案几 + 签筒 + 签棒 + 签纸，全部相对 .ok-set 原点定位
  const shelf = h('div', { class: 'ok-shelf' });
  const tube = h(
    'div',
    { class: 'ok-tube' },
    h('div', { class: 'ok-tube-shadow' }),
    h(
      'div',
      { class: 'ok-tube-body' },
      h('span', { class: 'ok-tube-band' }),
      h('span', { class: 'ok-tube-band b2' }),
      h(
        'div',
        { class: 'ok-tube-label' },
        h('span', { class: 'ok-tube-kanji' }, Array.from('御神签').map((c) => h('i', null, c))),
        h('span', { class: 'ok-tube-kana' }, Array.from('おみくじ').map((c) => h('i', null, c))),
      ),
      h('span', { class: 'ok-tube-hole' }),
    ),
    h('div', { class: 'ok-tube-cap' }),
  );
  const tubeAnim = h('div', { class: 'ok-tube-anim' }, tube);
  const tubeWrap = h('div', { class: 'ok-tube-wrap', attrs: { role: 'button', 'aria-label': TEXT.btnShake } }, tubeAnim);
  const stickLabel = h('span', { class: 'ok-stick-label' });
  const stick = h('div', { class: 'ok-stick', attrs: { role: 'button', 'aria-label': TEXT.btnDraw } }, h('span', { class: 'ok-stick-tip' }), stickLabel);
  const slip = h('div', { class: 'ok-slip paper-slip', hidden: true, attrs: { role: 'button', tabindex: '0', 'aria-label': '签纸，点击查看解读' } });
  let slipLevelEl = null;
  const set = h('div', { class: 'ok-set' }, shelf, stick, tubeWrap, slip);
  st.scene.append(ambient, rackEl, set);

  /* ---------- 操作区 ---------- */
  const primaryBtn = button(TEXT.btnShake, { variant: 'primary', size: 'large', primary: true, onClick: onPrimary });
  const rackBtn = button(TEXT.btnRack, { variant: 'ghost', onClick: () => openRackSheet() });
  const histWrap = h('div', { class: 'ok-history' });

  container.append(
    ritual.progress,
    h('div', { class: 'mt-3' }, st.el),
    hint('shake', TEXT.gestureHint),
    kit.actionBar(primaryBtn, rackBtn),
    ritual.receipt,
    histWrap,
  );
  renderRack();
  renderHistory();
  syncUI();

  /* ---------- 三条入口：体感 / 手势 / 按钮 ---------- */
  ctx.motion.onShake((e) => onShakeEvent(e));
  ctx.motion.onToss((e) => {
    if (tying || openSheet || phase === PHASE.PAPER) return;
    if (phase === PHASE.STICK) drawPaper();
    else onShakeEvent(e);
  });
  // 倾斜：挂架微视差
  ctx.motion.onTilt(kit.parallax(rackEl, { max: 4 }));
  // 原始加速度：静止时签筒随手轻晃（节流）
  let lastSway = 0;
  ctx.motion.onMotion((m) => {
    const t = Date.now();
    if (t - lastSway < 90) return;
    lastSway = t;
    if (busy || dragging || phase !== PHASE.IDLE || reduce) return;
    const ax = clamp(m.ax || 0, -5, 5);
    tubeWrap.style.transform = Math.abs(ax) < 0.5 ? '' : `rotate(${(-ax * 1.6).toFixed(1)}deg)`;
  });

  // 在签筒上左右来回拖动 = 摇签
  let dragLastX = null;
  let dragDir = 0;
  let dragReversals = 0;
  let dragTravel = 0;
  ctx.gesture.drag(tubeWrap, {
    onStart() {
      if (busy || phase !== PHASE.IDLE) return;
      dragging = true;
      dragLastX = null;
      dragDir = 0;
      dragReversals = 0;
      dragTravel = 0;
      tubeWrap.classList.add('ok-grab');
    },
    onMove(g) {
      if (!dragging) return;
      if (dragLastX != null) {
        const d = g.dx - dragLastX;
        if (Math.abs(d) > 2) {
          const s = Math.sign(d);
          if (dragDir && s !== dragDir) {
            dragReversals++;
            sound.play('rattle');
            haptic.tap();
          }
          dragDir = s;
          dragTravel += Math.abs(d);
        }
      }
      dragLastX = g.dx;
      tubeWrap.style.transform = `translateY(-10px) rotate(${clamp(g.dx / 5, -18, 18)}deg)`;
      if (dragReversals >= 3 && dragTravel > 120) {
        endDrag();
        ctx.motion.simulate('shake', { intensity: clamp(14 + dragTravel / 18, 16, 34), source: 'gesture' });
      }
    },
    onEnd(g) {
      if (!dragging) return;
      endDrag();
      if (dragReversals >= 1 && Math.abs(g.vx) > 1.1) ctx.motion.simulate('shake', { intensity: 22, source: 'gesture' });
    },
  });
  ctx.gesture.tap(tubeWrap, () => nudgeTube());
  ctx.gesture.longPress(tubeWrap, () => openHowto());
  ctx.gesture.tap(stick, () => drawPaper());
  ctx.gesture.drag(slip, {
    onStart() {
      if (busy || !tying || phase !== PHASE.PAPER) return;
      slipDrag = true; cancelAnims(slip);
      slip.classList.add('ok-slip-dragging'); haptic.tap();
    },
    onMove(g) {
      if (!slipDrag) return;
      slip.style.transform = `translate(${g.dx}px, ${45 + g.dy}px) scale(.68) rotate(${clamp(g.dx / 16, -9, 9)}deg)`;
      const hit = overRope(g, rackEl.getBoundingClientRect());
      if (hit && !rackEl.classList.contains('ok-over')) haptic.tap();
      rackEl.classList.toggle('ok-over', hit);
      dropHint.textContent = hit ? '松手结签' : '将签纸拖到绳上';
    },
    onEnd(g) {
      if (!slipDrag) {
        if (!g.cancelled && !tying && !busy && phase === PHASE.PAPER && Math.hypot(g.dx,g.dy) < 10) showResult(lot);
        return;
      }
      slipDrag = false; slip.classList.remove('ok-slip-dragging');
      if (!g.cancelled && overRope(g, rackEl.getBoundingClientRect())) tieToRack();
      else {
        const from = slip.style.transform;
        slip.style.transform = 'translateY(45px) scale(.68)';
        slip.animate([{ transform: from }, { transform: slip.style.transform }], { duration: dur(340), easing: 'cubic-bezier(.2,.8,.3,1)' });
        rackEl.classList.remove('ok-over'); dropHint.textContent = '将签纸拖到绳上';
        st.setHint(g.cancelled ? '签纸已放回，继续拖动即可' : '再向上拖一点，松手挂上签绳');
      }
    },
  });
  slip.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tying && !busy) { tying = false; delete st.el.dataset.tie; rackEl.classList.remove('ok-over'); slip.style.transform = ''; syncUI(); showPaperReceipt(); }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (busy || phase !== PHASE.PAPER) return; tying ? tieToRack() : showResult(lot); }
  });
  rackEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!busy) openRackSheet(); } });
  ctx.gesture.tap(rackEl, () => openRackSheet());

  function endDrag() {
    dragging = false;
    tubeWrap.classList.remove('ok-grab');
    tubeWrap.style.transform = '';
  }

  /* ---------- 流程 ---------- */
  function setBusy(v) {
    busy = v;
    primaryBtn.disabled = v;
  }
  function go(action) {
    const n = nextPhase(phase, action);
    if (n) phase = n;
    syncUI();
  }

  async function onPrimary() {
    if (busy || !ritual.alive) return;
    if (phase === PHASE.IDLE) doShake(20 + Math.random() * 6);
    else if (phase === PHASE.STICK) drawPaper();
    else if (phase === PHASE.PAPER) { if (tying) tieToRack(); else showResult(lot); }
  }

  async function onShakeEvent(e = {}) {
    if (busy || openSheet || tying || !ritual.alive || phase === PHASE.PAPER) return;
    if (phase === PHASE.STICK) {
      nudgeStick();
      return;
    }
    if (phase === PHASE.PAPER) await resetStage();
    if (phase !== PHASE.IDLE) return;
    doShake(e.intensity || 20);
  }

  /** 摇签：签筒提起摇动 → 签棒从筒底滑出落在案上 */
  async function doShake(intensity) {
    if (busy || phase !== PHASE.IDLE) return;
    setBusy(true);
    endDrag();
    ritual.clear();
    if (!await ritual.focus()) return;
    ritual.step(0);
    go('shake');
    if (drawnToday(daily, today())) toast(TEXT.dailyToast);

    const power = clamp(intensity / 20, 0.7, 1.6);
    const lvl = power < 0.95 ? 1 : power < 1.25 ? 2 : 3;
    tubeAnim.classList.add('ok-shaking', 'ok-s' + lvl);
    tubeAnim.getAnimations().forEach((a) => ritual.track(a));
    sound.play('shake');
    haptic.rattle();
    const total = dur(2300 + lvl * 160);
    for (let t = 260; t < total - 80; t += 280) {
      ctx.setTimeout(() => {
        sound.play('rattle');
        if (t > 650) haptic.rattle();
      }, t);
    }
    await wait(total);
    if (!ritual.alive) return;
    tubeAnim.classList.remove('ok-shaking', 'ok-s1', 'ok-s2', 'ok-s3');

    if (!ritual.alive) return;
    lot = pickLot(ctx.rng.random);
    stickLabel.textContent = lot.no;

    // 提起签筒，签棒从底部小口滑出
    tubeAnim.classList.add('ok-lift');
    sound.play('tick', { delay: 0.05 });
    await wait(dur(380));
    if (!ritual.alive) return;
    await slideOutStick();
    tubeAnim.classList.remove('ok-lift');
    await wait(dur(420));
    if (!ritual.alive) return;
    haptic.light();
    if (!ritual.alive) return;
    ritual.step(1);
    go('out');
    setBusy(false);
  }

  async function slideOutStick() {
    cancelAnims(stick);
    const d = dur(1450);
    ritual.animate(stick,
      [
        { transform: STICK_IN, offset: 0 },
        { transform: 'translate(3px, 54px) rotate(86deg)', offset: 0.48, easing: 'cubic-bezier(.3,.8,.5,1)' },
        { transform: 'translate(-2px, 92px) rotate(34deg)', offset: 0.8, easing: 'cubic-bezier(.5,0,.8,.5)' },
        { transform: 'translate(-8px, 100px) rotate(-8deg)', offset: 0.92 },
        { transform: STICK_OUT, offset: 1 },
      ],
      { duration: d, fill: 'forwards', easing: 'ease-out' },
    );
    await wait(d * 0.8);
    if (!ritual.alive) return;
    sound.play('clack');
    haptic.medium();
    await wait(d * 0.2 + 20);
    if (!ritual.alive) return;
    stick.classList.add('ok-stick-glow');
  }

  /** 取签纸：和纸从筒侧展开 → 盖章 → 结果抽屉 */
  async function drawPaper() {
    if (busy || phase !== PHASE.STICK || !lot) return;
    setBusy(true);
    if (!await ritual.focus()) return;
    ritual.step(2);
    go('draw');
    stick.classList.remove('ok-stick-glow');
    sound.play('paper');
    haptic.light();
    renderSlip(lot);
    cancelAnims(slip);
    slip.hidden = false;
    tubeWrap.classList.add('ok-dim');
    stick.classList.add('ok-dim');
    const d = dur(1600);
    ritual.animate(slip,
      [
        { transform: 'perspective(800px) translateY(-24px) rotateX(-70deg) scaleY(0.12)', opacity: 0 },
        { transform: 'perspective(800px) translateY(-12px) rotateX(-24deg) scaleY(0.65)', opacity: 1, offset: 0.45 },
        { transform: 'translateY(0) scaleY(1.02)', offset: 0.85 },
        { transform: 'translateY(0) scaleY(1)' },
      ],
      { duration: d, fill: 'forwards', easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
    await wait(d);
    if (!ritual.alive) return;

    if (!ritual.alive) return;
    // 盖章
    const level = levelOf(lot.level);
    slipLevelEl.classList.add('ok-stamp');
    if (level.tone === 'gold') {
      sound.play('chime');
      haptic.success();
      confetti(st.el, { count: 72, origin: { x: 0.5, y: 0.38 } });
      st.el.classList.add('ok-glory');
      ctx.setTimeout(() => st.el.classList.remove('ok-glory'), 2400);
    } else if (level.bad) {
      sound.play('low');
      haptic.heavy();
    } else if (level.tone === 'red') {
      sound.play('success');
      haptic.success();
    } else {
      sound.play('pop');
      haptic.double();
    }

    // 记录
    const key = today();
    daily = markDrawn(daily, key);
    storage.set('daily', daily);
    history = history.concat([{ no: lot.no, level: lot.level, date: key }]).slice(-12);
    storage.set('history', history);
    const repeat = lastNo === lot.no;
    lastNo = lot.no;
    storage.set('lastNo', lastNo);
    renderHistory();
    if (repeat) ctx.setTimeout(() => toast(TEXT.sameLotToast), 900);

    if (!await ritual.pause(reduce ? 180 : 950)) return;
    cancelAnims(slip);
    setBusy(false);
    syncUI();
    showPaperReceipt();
  }

  function showPaperReceipt() {
    if (!lot || !ritual.alive) return;
    const level = levelOf(lot.level);
    ritual.reveal({ kicker: lot.no, title: level.name, text: lot.summary.split('。')[0] + '。', actions: [
      button(isBad(level) ? '把凶签结在这里' : '收好这份祝福', { variant: 'soft', onClick: () => isBad(level) ? beginTie() : takeHome() }),
      button('再抽一签', { variant: 'ghost', onClick: async () => { await resetStage(); if (ritual.alive) doShake(22); } }),
    ] });
  }
  async function beginTie() {
    if (busy || resolved || phase !== PHASE.PAPER || !lot || !ritual.alive) return;
    if (!await ritual.focus()) return;
    tying = true; ritual.step(3); st.el.dataset.tie = 'ready';
    cancelAnims(slip); slip.style.transform = 'translateY(45px) scale(.68)';
    slip.setAttribute('aria-label', '拖动签纸到上方签绳；也可按回车自动结签');
    st.setHint('按住签纸，向上拖到签绳，再松手');
    dropHint.textContent = '将签纸拖到绳上'; primaryBtn.setLabel('帮我结签');
    ritual.reveal({ kicker: '结缘', title: '把牵挂，留在这里', text: '拖动签纸到上方的绳子，亲手结下这一签。' });
  }
  /** Fold into a paper strip, travel to the rope, then wrap into a visible knot. */
  async function tieToRack() {
    if (busy || resolved || !tying || phase !== PHASE.PAPER || !lot || !ritual.alive) return;
    setBusy(true); ritual.step(3); rackEl.classList.remove('ok-over');
    const idx = Math.min(visibleKnots(rack).length, RACK_MAX - 1);
    const rr = rackRod.getBoundingClientRect();
    const sr = slip.getBoundingClientRect();
    const targetX = rr.left + rr.width * (idx + .5) / RACK_MAX;
    const targetY = rr.top + 10;
    const sceneRect = st.scene.getBoundingClientRect();
    const folded = h('div', { class: 'ok-folding-paper', attrs: { 'aria-hidden': 'true' } }, h('i'), h('b'), h('i'));
    folded.style.left = sr.left + sr.width / 2 - sceneRect.left + 'px';
    folded.style.top = sr.top + sr.height / 2 - sceneRect.top + 'px';
    st.scene.append(folded);
    const from = slip.style.transform || 'translateY(45px) scale(.68)';
    sound.play('paper');
    await ritual.animate(slip, [{ transform: from, opacity: 1 }, { transform: from + ' scaleX(.16) scaleY(.62)', opacity: .15 }], { duration: dur(380) });
    if (!ritual.alive) return;
    slip.hidden = true; folded.classList.add('visible'); haptic.light();
    const tx = targetX - (sr.left + sr.width / 2), ty = targetY - (sr.top + sr.height / 2);
    await ritual.animate(folded, [{ transform: 'translate(-50%, -50%) rotate(-4deg)' }, { transform: `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) rotate(0deg)` }], { duration: dur(620), easing: 'cubic-bezier(.22,.8,.3,1)' });
    if (!ritual.alive) return;
    folded.classList.add('wrapped'); sound.play('paper'); haptic.double();
    if (!await ritual.pause(dur(600))) return;
    resolved = true;
    rack = tieUp(rack, { no: lot.no, level: lot.level, date: today() }); storage.set('rack', rack);
    renderRack(true); folded.remove(); cancelAnims(slip); sound.play('chime'); haptic.success();
    dropHint.textContent = '签已结好'; st.setHint('这一签留在这里，带着轻松继续今天');
    st.el.dataset.tie = 'done'; tying = false;
    ritual.reveal({ kicker: '结签完成', title: '牵挂已放下', text: '你的签纸已留在签绳上。愿接下来的日子，自在一些。', actions: [button('再抽一签', { variant: 'primary', onClick: async () => { await resetStage({ slipDone: true }); if (ritual.alive) doShake(22); } })] });
    setBusy(false); primaryBtn.setLabel('查看这支签');
  }

  /** 带回家：签纸收起，喜气纸屑 */
  async function takeHome() {
    if (busy || resolved || phase !== PHASE.PAPER || !ritual.alive) return;
    setBusy(true);
    if (!await ritual.focus()) return;
    ritual.step(3);
    sound.play('whoosh');
    haptic.success();
    confetti(st.el, { count: 48, origin: { x: 0.5, y: 0.5 } });
    const d = dur(660);
    cancelAnims(slip);
    ritual.animate(slip,
      [
        { transform: 'translate(0,0) rotate(0) scale(1)', opacity: 1 },
        { transform: 'translate(0,-24px) rotate(-3deg) scale(0.96)', offset: 0.3, easing: 'cubic-bezier(.2,.8,.3,1)' },
        { transform: 'translate(0, 330px) rotate(10deg) scale(0.3)', opacity: 0 },
      ],
      { duration: d, fill: 'forwards', easing: 'cubic-bezier(.5,0,.8,.4)' },
    );
    await wait(d);
    if (!ritual.alive) return;
    slip.hidden = true;
    cancelAnims(slip);
    sound.play('chime', { delay: 0.02 });
    if (!ritual.alive) return;
    setBusy(false);
    resolved = true;
    st.setHint('祝福已收好，愿今天有好事发生');
    primaryBtn.setLabel('查看这支签');
    ritual.reveal({ kicker: '已收好', title: '把这份祝福带走', text: '今天的签已记在抽签记录里。', actions: [button('再抽一签', { variant: 'primary', onClick: async () => { await resetStage({ slipDone: true }); if (ritual.alive) doShake(22); } })] });
  }

  /** 回到初始：签纸折起、签棒收回筒中 */
  async function resetStage({ slipDone = false } = {}) {
    if (busy || !ritual.alive) return;
    setBusy(true);
    ritual.clear(); ritual.step(0); tying = false; slipDrag = false; resolved = false;
    delete st.el.dataset.tie; rackEl.classList.remove('ok-over'); slip.style.transform = '';
    if (openSheet) {
      openSheet.close();
      openSheet = null;
    }
    if (!slipDone && !slip.hidden) {
      const d = dur(320);
      cancelAnims(slip);
      slip.animate([{ transform: 'scaleY(1)', opacity: 1 }, { transform: 'translateY(-20px) scaleY(0.04)', opacity: 0 }], { duration: d, fill: 'forwards', easing: 'cubic-bezier(.6,0,.9,.4)' });
      sound.play('paper');
      await wait(d);
    if (!ritual.alive) return;
    }
    slip.hidden = true;
    cancelAnims(slip);
    tubeWrap.classList.remove('ok-dim');
    stick.classList.remove('ok-dim', 'ok-stick-glow');
    if (phase !== PHASE.IDLE) {
      const d = dur(440);
      cancelAnims(stick);
      ritual.animate(stick,
        [
          { transform: STICK_OUT, opacity: 1 },
          { transform: 'translate(0px, 40px) rotate(70deg)', opacity: 0.5, offset: 0.6 },
          { transform: STICK_IN, opacity: 0 },
        ],
        { duration: d, fill: 'forwards', easing: 'cubic-bezier(.4,0,.6,1)' },
      );
      sound.play('tick');
      await wait(d);
    if (!ritual.alive) return;
      cancelAnims(stick);
    }
    if (!ritual.alive) return;
    lot = null;
    if (phase !== PHASE.IDLE) go('reset');
    setBusy(false);
    syncUI();
  }

  /* ---------- 小反馈 ---------- */
  function nudgeTube() {
    if (busy || dragging || phase !== PHASE.IDLE || reduce) return;
    sound.play('tick');
    haptic.tap();
    tubeAnim.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-4deg)', offset: 0.3 }, { transform: 'rotate(3deg)', offset: 0.62 }, { transform: 'rotate(0)' }], { duration: dur(380), easing: 'ease-out' });
    st.setHint(TEXT.hintNudge);
  }
  function nudgeStick() {
    if (busy || phase !== PHASE.STICK) return;
    sound.play('tick');
    haptic.tap();
    stick.animate([{ transform: STICK_OUT }, { transform: 'translate(-6px, 101px) rotate(-3deg)', offset: 0.4 }, { transform: STICK_OUT }], { duration: dur(320), easing: 'ease-out' });
    st.setHint(TEXT.hintStickNudge);
  }

  /* ---------- 渲染 ---------- */
  function badgeText() {
    const key = today();
    if (!drawnToday(daily, key)) return TEXT.badgeFresh;
    return Number(daily.count) === 1 ? TEXT.badgeDrawnOnce : TEXT.badgeDrawnMany.replace('{n}', daily.count);
  }

  function syncUI() {
    const label = { idle: TEXT.btnShake, shaking: TEXT.btnShaking, stick: TEXT.btnDraw, paper: tying ? '帮我结签' : '展开解读' }[phase];
    primaryBtn.setLabel(label);
    st.setHint({ idle: TEXT.hintIdle, shaking: TEXT.hintShaking, stick: TEXT.hintStick, paper: '先看看签纸，准备好后展开解读' }[phase]);
    if (lot && phase === PHASE.STICK) st.setBadge(lot.no);
    else if (lot && phase === PHASE.PAPER) st.setBadge(`${lot.no} · ${levelOf(lot.level).name}`);
    else st.setBadge(badgeText());
    container.dataset.okPhase = phase;
  }

  function renderSlip(l) {
    const level = levelOf(l.level);
    kit.clear(slip);
    slip.className = `ok-slip paper-slip ok-tone-${level.tone}`;
    slipLevelEl = h('div', { class: 'ok-slip-level' }, level.name);
    slip.append(
      h('div', { class: 'ok-slip-edge top' }),
      h('div', { class: 'ok-slip-no' }, l.no),
      slipLevelEl,
      h('div', { class: 'ok-slip-kana' }, level.kana),
      h('div', { class: 'ok-slip-waka' }, l.waka.map((line) => h('span', null, line))),
      h('div', { class: 'ok-slip-rule' }),
      h('div', { class: 'ok-slip-blurb' }, level.blurb),
      h('div', { class: 'ok-slip-edge bottom' }),
    );
  }

  function renderRack(animateLast = false) {
    kit.clear(rackKnots);
    const knots = visibleKnots(rack);
    knots.forEach((k, i) => {
      const el = h('span', { class: ['ok-knot', k.level && 'ok-knot-' + toneOf(k.level), animateLast && i === knots.length - 1 && 'ok-knot-new'] });
      el.style.left = `${((i + 0.5) / RACK_MAX) * 100}%`;
      el.style.setProperty('--r', `${((i * 37) % 9) - 4}deg`);
      el.style.animationDelay = animateLast && i === knots.length - 1 ? '' : `${-(i % 5) * 0.7}s`;
      rackKnots.append(el);
    });
    rackBtn.setLabel(rack.tied ? `${TEXT.btnRack} · ${rack.tied}` : TEXT.btnRack);
  }

  function renderHistory() {
    kit.clear(histWrap);
    if (!history.length) return;
    histWrap.append(
      h('div', { class: 'ok-history-kicker' }, TEXT.historyKicker),
      historyBar(history.slice(-8), (x) => `${x.no} · ${(levelOf(x.level) || {}).name || ''}`),
    );
  }

  /* ---------- 抽屉 ---------- */
  function showResult(l) {
    if (openSheet || busy || !ritual.alive) return;
    const level = levelOf(l.level);
    const bad = isBad(level);
    const itemsNode = h(
      'div',
      { class: 'ok-items' },
      ITEM_KEYS.map((k) => h('div', { class: 'ok-item' }, h('span', { class: 'ok-item-k' }, k), h('span', { class: 'ok-item-v' }, l.items[k]))),
    );
    const card = resultCard({
      kicker: `${l.no} · ${level.kana}`,
      title: level.name,
      titleGold: level.tone === 'gold',
      badge: `运势 · ${level.badge}`,
      sub: level.blurb,
      seal: level.seal,
      verse: l.waka.join('\n'),
      sections: [
        { label: TEXT.sectionSummary, text: l.summary },
        { label: TEXT.sectionItems, node: itemsNode, stack: true },
        { label: TEXT.sectionNote, text: bad ? TEXT.noteBad : TEXT.noteGood },
      ],
      footer: TEXT.footer,
    });
    const wrap = h('div', { class: ['m-omikuji', 'ok-sheet-wrap', 'ok-tone-' + level.tone] }, card);
    const actions = [
      resolved ? button('回到抽签', { variant: 'primary', onClick: () => sh.close() }) : bad
        ? button(TEXT.btnTie, {
            variant: 'primary',
            onClick: () => {
              sh.close();
              ritual.pause(450).then((alive) => { if (alive) beginTie(); });
            },
          })
        : button(TEXT.btnTakeHome, {
            variant: 'primary',
            onClick: () => {
              sh.close();
              ritual.pause(450).then((alive) => { if (alive) takeHome(); });
            },
          }),
      button(TEXT.btnShare, {
        variant: 'ghost',
        icon: 'share',
        onClick: async () => {
          const r = await ctx.share(shareText(l));
          toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制到剪贴板' : '分享失败');
        },
      }),
    ];
    const sh = sheet({
      title: TEXT.sheetTitle,
      content: wrap,
      actions,
      onClose: () => {
        if (openSheet === sh) openSheet = null;
      },
    });
    openSheet = sh;
    sh.open();
  }

  function openRackSheet() {
    if (openSheet || busy || !ritual.alive) return;
    haptic.tap();
    sound.play('pop');
    const count = Number(rack.tied) || 0;
    const knots = visibleKnots(rack).filter((k) => k.no);
    const body = h(
      'div',
      { class: 'm-omikuji ok-sheet-wrap' },
      h('div', { class: 'ok-rack-hero' }, h('div', { class: 'ok-rack-num gold-text' }, String(count)), h('div', { class: 't-kicker' }, 'MUSUBI · 结签')),
      h('p', { class: 'ok-p' }, count ? TEXT.rackCount.replace('{n}', count) : TEXT.rackEmpty),
      knots.length
        ? h(
            'div',
            { class: 'ok-rack-list' },
            knots
              .slice()
              .reverse()
              .map((k) => h('span', { class: 'history-item' }, `${k.no}${k.level ? ' · ' + (levelOf(k.level) || {}).name : ''}`)),
          )
        : null,
      kit.ornament(),
      TEXT.rackIntro.map((t) => h('p', { class: 'ok-p t-muted' }, t)),
      h('p', { class: 'ok-p t-muted' }, TEXT.takeHomeIntro),
    );
    const actions = [button(TEXT.btnOk, { variant: 'primary', onClick: () => sh.close() })];
    if (count > 0) {
      actions.push(
        button(TEXT.btnUntie, {
          variant: 'ghost',
          onClick: () => {
            rack = untie(rack);
            storage.set('rack', rack);
            renderRack();
            haptic.tap();
            sound.play('flip');
            toast(TEXT.untieDone);
            sh.close();
          },
        }),
      );
    }
    const sh = sheet({
      title: TEXT.btnRack,
      content: body,
      actions,
      onClose: () => {
        if (openSheet === sh) openSheet = null;
      },
    });
    openSheet = sh;
    sh.open();
  }

  function openHowto() {
    if (openSheet || busy || dragging) return;
    haptic.light();
    sound.play('pop');
    const body = h(
      'div',
      { class: 'm-omikuji ok-sheet-wrap' },
      h('ol', { class: 'ok-howto' }, TEXT.howto.map((s) => h('li', null, h('b', null, s.step), h('span', null, s.text)))),
    );
    const sh = sheet({
      title: TEXT.howtoTitle,
      content: body,
      actions: [button(TEXT.btnOk, { variant: 'primary', onClick: () => sh.close() })],
      onClose: () => {
        if (openSheet === sh) openSheet = null;
      },
    });
    openSheet = sh;
    sh.open();
  }

  /* ---------- 卸载 ---------- */
  return () => {
    if (openSheet) {
      openSheet.close();
      openSheet = null;
    }
    [slip, stick, tubeAnim, tubeWrap, ...st.el.querySelectorAll('.ok-folding-paper')].forEach(cancelAnims);
  };
}
