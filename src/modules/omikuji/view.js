import { createStickScene } from '../../ui/stick-scene.js';
// 御神签 · 界面（Web DOM）。所有逻辑在 core.js，所有文案在 data.js。
// 节奏：摇筒（起）→ 签棒滑出（飞 / 落）→ 签纸展开盖章（揭）→ 结果条「展开解读」→ 抽屉 → 结签 / 带回家。
// 舞台下方只有一句操作提示（say），随阶段更换；舞台内的 stage-hint 不用。
import { pickLot, levelOf, isBad, initRack, tieUp, untie, visibleKnots, RACK_MAX, drawnToday, markDrawn, shareText, briefOf, PHASE, nextPhase, ITEM_KEYS, toneOf } from './core.js';
import { TEXT } from './data.js';
import { createRitual } from '../../ui/ritual.js';
import { overRope } from './interaction.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function mount(container, ctx) {
  const { kit, haptic, sound, storage } = ctx;
  const { h, button, stage, hint, resultCard, sheet, toast, confetti, historyBar } = kit;
  const reduce = !!ctx.platform.simpleMotion;
  const dur = (ms) => (reduce ? Math.max(100, ms * .55) : ms);
  const cancelAnims = (el) => el.getAnimations?.().forEach((a) => { a.finished.catch(() => {}); a.cancel(); });

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
  const dropHint = h('div', { class: 'ok-drop-hint', attrs: { 'aria-hidden': 'true' } }, TEXT.dropHint);
  const rackKnots = h('div', { class: 'ok-rack-knots' });
  const rackEl = h('div', { class: 'ok-rack', attrs: { role: 'button', tabindex: '0', 'aria-label': TEXT.btnRack } }, h('span', { class: 'ok-rack-post l' }), h('span', { class: 'ok-rack-post r' }), rackRod, h('div', { class: 'ok-rack-rod2' }), rackKnots, dropHint);

  const canvas = h('canvas', { class: 'stick-canvas', attrs: { 'aria-hidden': 'true' } });
  const tubeWrap = h('button', { type: 'button', class: 'ok-tube-wrap stick-scene', attrs: { 'aria-label': '摇动御神签筒' } }, canvas);
  const stick = h('button', { type: 'button', class: 'stick-pick-target', hidden: true, attrs: { 'aria-label': '拾起签棒，取签纸' } });
  const bundle = createStickScene(ctx, canvas, { kind: 'omikuji', pickTarget: stick });
  const slip = h('div', { class: 'ok-slip paper-slip', hidden: true, attrs: { role: 'button', tabindex: '0', 'aria-label': '签纸，点击查看解读' } });
  let slipLevelEl = null;
  const set = h('div', { class: 'ok-set' }, slip);
  st.scene.append(ambient, rackEl, tubeWrap, stick, set);

  /* ---------- 操作区 ---------- */
  const primaryBtn = button(TEXT.btnShake, { variant: 'primary', size: 'large', primary: true, onClick: onPrimary });
  const rackBtn = button(TEXT.btnRack, { variant: 'ghost', onClick: () => openRackSheet() });
  const histWrap = h('div', { class: 'ok-history' });
  // 唯一的一句操作提示：图标 + 文字，随阶段更换
  const hintEl = hint('shake', TEXT.hintIdle);
  hintEl.classList.add('ok-hint');
  let hintGesture = 'shake';
  function say(text, gesture = hintGesture) {
    if (hintEl.lastChild.textContent !== text) hintEl.lastChild.textContent = text;
    if (gesture !== hintGesture) {
      const glyph = hintEl.firstChild;
      glyph.classList.remove(hintGesture);
      glyph.classList.add(gesture);
      kit.clear(glyph);
      glyph.append(kit.icon('g-' + gesture));
      hintGesture = gesture;
    }
  }

  container.append(
    ritual.progress,
    h('div', { class: 'mt-3' }, st.el),
    hintEl,
    kit.actionBar(primaryBtn, rackBtn),
    ritual.receipt,
    histWrap,
  );
  renderRack();
  renderHistory();
  syncUI();

  /* ---------- 三条入口：体感 / 手势 / 按钮 ---------- */
  ctx.motion.onShake((e) => onShakeEvent(e));
  // 倾斜：飘落物微视差（挂架是拖放目标，保持不动）
  ctx.motion.onTilt(kit.parallax(ambient, { max: 6 }));
  ctx.motion.onMotion((m) => {
    if (dragging || openSheet || tying || !ritual.alive) return;
    if (busy) { bundle.feed(m); return; }
    const moving = Math.hypot(m.ax || 0, m.ay || 0, m.az || 0) > 5.5;
    if (phase === PHASE.IDLE) { bundle.feed(m); if (moving) doShake(20, { continuous: true }); }
    else if (moving) onShakeEvent({ intensity: 20, continuous: true });
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
          }
          dragDir = s;
          dragTravel += Math.abs(d);
        }
      }
      bundle.preview(g.dx / 4);
      dragLastX = g.dx;
      if (dragReversals >= 3 && dragTravel > 120) say(TEXT.hintDragReady);
    },
    onEnd(g) {
      if (!dragging) return;
      endDrag();
      if (!g.cancelled && dragReversals >= 3 && dragTravel > 120) onShakeEvent({ intensity: clamp(14 + dragTravel / 18, 16, 34), replay: false });
      else say(TEXT.hintNudge);
    },
  });
  ctx.gesture.tap(tubeWrap, () => nudgeTube());
  ctx.gesture.longPress(tubeWrap, () => openHowto());
  ctx.gesture.tap(stick, () => drawPaper());
  for (const [el, act] of [[tubeWrap, nudgeTube], [stick, drawPaper]]) el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); }
  });
  ctx.gesture.drag(slip, {
    onStart() {
      if (busy || !tying || phase !== PHASE.PAPER) return;
      slipDrag = true; cancelAnims(slip);
      slip.classList.add('ok-slip-dragging'); haptic.tap();
      dropHint.textContent = TEXT.dropHint; dropHint.classList.add('show');
    },
    onMove(g) {
      if (!slipDrag) return;
      slip.style.transform = `translate(${g.dx}px, ${45 + g.dy}px) scale(.68) rotate(${clamp(g.dx / 16, -9, 9)}deg)`;
      const hit = overRope(g, rackEl.getBoundingClientRect());
      if (hit && !rackEl.classList.contains('ok-over')) haptic.tap();
      rackEl.classList.toggle('ok-over', hit);
      dropHint.textContent = hit ? TEXT.dropHintOver : TEXT.dropHint;
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
        rackEl.classList.remove('ok-over'); dropHint.classList.remove('show');
        say(g.cancelled ? TEXT.hintSlipBack : TEXT.hintSlipMore);
      }
    },
  });
  slip.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') cancelTie();
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (busy || phase !== PHASE.PAPER) return; tying ? tieToRack() : showResult(lot); }
  });
  rackEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!busy) openRackSheet(); } });
  ctx.gesture.tap(rackEl, () => openRackSheet());

  function endDrag() {
    dragging = false;
    tubeWrap.classList.remove('ok-grab');
  }

  /* ---------- 流程 ---------- */
  function setBusy(v) {
    busy = v;
    primaryBtn.disabled = v;
    rackBtn.disabled = v;
    rackEl.setAttribute('aria-disabled', String(v));
    tubeWrap.disabled = v || phase !== PHASE.IDLE; stick.disabled = v;
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
    else if (phase === PHASE.PAPER) { if (tying) tieToRack(); else again(); }
  }
  /** 再摇一签：收起签纸、签棒回筒，随即再摇 */
  async function again() {
    await resetStage({ slipDone: slip.hidden });
    if (ritual.alive) doShake(22);
  }

  async function onShakeEvent(e = {}) {
    if (busy || openSheet || tying || !ritual.alive) return;
    if (phase !== PHASE.IDLE) await resetStage();
    if (!ritual.alive) return;
    doShake(e.intensity || 20, { continuous: !!e.continuous, replay: e.replay !== false });
  }

  /** A rod slides through the raised cylinder's outlet, then tips onto the table. */
  async function doShake(intensity, { continuous = false, replay = true } = {}) {
    if (busy || phase !== PHASE.IDLE) return;
    setBusy(true); endDrag(); ritual.clear();
    if (!await ritual.focus()) return;
    ritual.step(0); go('shake');
    if (!await bundle.draw({ power: intensity / 20, continuous, replay })) return;
    if (!await wait(320)) return;
    lot = pickLot(ctx.rng.random); bundle.setLabel(lot.no); stick.hidden = false;
    ritual.step(1); go('out'); setBusy(false);
  }

  /** 取签纸：和纸从筒侧展开 → 盖章 → 结果抽屉 */
  async function drawPaper() {
    if (busy || phase !== PHASE.STICK || !lot) return;
    setBusy(true);
    if (!await ritual.focus()) return;
    ritual.step(2);
    go('draw');
    stick.classList.remove('ok-stick-glow'); stick.hidden = true;
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

    if (!await ritual.pause(reduce ? 180 : 720)) return;
    cancelAnims(slip);
    setBusy(false);
    syncUI();
    showPaperReceipt();
  }

  function showPaperReceipt() {
    if (!lot || !ritual.alive) return;
    const level = levelOf(lot.level);
    ritual.reveal({
      kicker: lot.no, title: level.name, text: briefOf(lot),
      onRead: () => showResult(lot),
      actions: [button(isBad(level) ? TEXT.receiptTie : TEXT.receiptKeep, { variant: 'soft', onClick: () => (isBad(level) ? beginTie() : takeHome()) })],
    });
  }
  /** 结签中途放弃：签纸放回原位，回到「展开解读」 */
  function cancelTie() {
    if (!tying || busy || !ritual.alive) return;
    tying = false; slipDrag = false;
    delete st.el.dataset.tie; rackEl.classList.remove('ok-over'); dropHint.classList.remove('show');
    cancelAnims(slip); slip.style.transform = '';
    slip.setAttribute('aria-label', '签纸，点击查看解读');
    haptic.tap(); syncUI(); showPaperReceipt();
  }
  async function beginTie() {
    if (busy || resolved || phase !== PHASE.PAPER || !lot || !ritual.alive) return;
    if (!await ritual.focus()) return;
    tying = true; ritual.step(3); st.el.dataset.tie = 'ready';
    cancelAnims(slip); slip.style.transform = 'translateY(45px) scale(.68)';
    slip.setAttribute('aria-label', '拖动签纸到上方签绳；也可按回车自动结签');
    dropHint.textContent = TEXT.dropHint; dropHint.classList.remove('show');
    syncUI();
    ritual.reveal({ kicker: TEXT.tieKicker, title: TEXT.tieTitle, text: TEXT.tieText, actions: [button(TEXT.btnTieCancel, { variant: 'ghost', onClick: cancelTie })] });
  }
  /** Fold into a paper strip, travel to the rope, then wrap into a visible knot. */
  async function tieToRack() {
    if (busy || resolved || !tying || phase !== PHASE.PAPER || !lot || !ritual.alive) return;
    setBusy(true); ritual.step(3); rackEl.classList.remove('ok-over'); dropHint.classList.remove('show');
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
    dropHint.textContent = TEXT.dropHintDone; dropHint.classList.add('show');
    st.el.dataset.tie = 'done'; tying = false;
    ritual.reveal({ kicker: TEXT.tiedKicker, title: TEXT.tiedTitle, text: TEXT.tiedText, onRead: () => showResult(lot) });
    setBusy(false); syncUI();
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
    resolved = true;
    tubeWrap.classList.remove('ok-dim');
    setBusy(false); syncUI();
    ritual.reveal({ kicker: TEXT.takenKicker, title: TEXT.takenTitle, text: TEXT.takenText, onRead: () => showResult(lot) });
  }

  /** 回到初始：签纸折起、签棒收回筒中 */
  async function resetStage({ slipDone = false } = {}) {
    if (busy || !ritual.alive) return;
    setBusy(true);
    ritual.clear(); ritual.step(0); tying = false; slipDrag = false; resolved = false;
    delete st.el.dataset.tie; rackEl.classList.remove('ok-over'); dropHint.classList.remove('show'); slip.style.transform = '';
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
    stick.hidden = true; bundle.reset();
    if (!ritual.alive) return;
    lot = null;
    if (phase !== PHASE.IDLE) go('reset');
    setBusy(false);
    syncUI();
  }

  /* ---------- 小反馈 ---------- */
  function nudgeTube() {
    if (busy || dragging || phase !== PHASE.IDLE) return;
    doShake(20);
  }

  /* ---------- 渲染 ---------- */
  function badgeText() {
    const key = today();
    if (!drawnToday(daily, key)) return TEXT.badgeFresh;
    return Number(daily.count) === 1 ? TEXT.badgeDrawnOnce : TEXT.badgeDrawnMany.replace('{n}', daily.count);
  }

  function syncUI() {
    const label = { idle: TEXT.btnShake, shaking: TEXT.btnShaking, stick: TEXT.btnDraw, paper: tying ? TEXT.btnTieHelp : TEXT.btnAgain }[phase];
    primaryBtn.setLabel(label);
    if (phase === PHASE.PAPER) {
      if (tying) say(TEXT.hintTie, 'flick');
      else if (resolved) say(st.el.dataset.tie === 'done' ? TEXT.hintTied : TEXT.hintTaken, 'shake');
      else say(TEXT.hintPaper, 'tap');
    } else if (phase === PHASE.STICK) say(TEXT.hintStick, 'tap');
    else say(phase === PHASE.SHAKING ? TEXT.hintShaking : TEXT.hintIdle, 'shake');
    if (lot && phase === PHASE.STICK) st.setBadge(lot.no);
    else if (lot && phase === PHASE.PAPER) st.setBadge(`${lot.no} · ${levelOf(lot.level).name}`);
    else st.setBadge(badgeText());
    container.dataset.okPhase = phase;
    tubeWrap.disabled = busy || phase !== PHASE.IDLE;
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
      // 番号与假名各自不断行，窄屏只在「 · 」处换行
      kicker: h('span', null, h('span', { class: 'ok-nowrap' }, l.no), ' · ', h('span', { class: 'ok-nowrap' }, level.kana)),
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
      resolved ? button('回到签筒', { variant: 'primary', onClick: () => sh.close() }) : bad
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
      h('div', { class: 'ok-rack-hero' }, h('div', { class: 'ok-rack-num gold-text' }, String(count)), h('div', { class: 't-kicker' }, TEXT.rackKicker)),
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
    [slip, stick, tubeWrap, ...st.el.querySelectorAll('.ok-folding-paper')].forEach(cancelAnims);
  };
}
