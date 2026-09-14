import { createSolidScene } from '../../ui/solid-scene.js';
import { cubeMesh, d20Mesh, coinMesh, faceUp } from '../../core/solids.js';
import { createRitual } from '../../ui/ritual.js';
import { DICE_WAKE } from './dice-shake.js';
// 硬币骰子 · 界面（Web DOM）。所有逻辑在 core.js，所有文案在 data.js。
// 三个标签页共用一座舞台：硬币 / 骰子托盘 两组实物按模式切换显示。
// 节奏与筊杯一致：实物落定 → 结果条（一句话）→「展开解读」→ 抽屉。
import {
  HEADS,
  EDGE,
  flipCoin,
  rollDice,
  majority,
  streakOf,
  pushHistory,
  PIP_LAYOUT,
  analyzeDice,
  diceSpecialKeys,
  sumBand,
  normalizeOption,
  pickOption,
  fillTemplate,
  headsRate,
} from './core.js';
import {
  MODES,
  BURST_MODES,
  DICE_COUNTS,
  DICE_TYPES,
  CHOICE_PRESETS,
  CHOICE_DEFAULT,
  FACES,
  COIN_QUIPS,
  BURST_TEXT,
  STREAK_TEXT,
  MILESTONES,
  CHOICE_VERDICTS,
  CHOICE_MEANING,
  DICE_SIZE,
  DICE_SPECIALS,
  DICE_SUM_FLAVOR,
  D6_SINGLE,
  D20_BANDS,
  STAGE_HINT,
  HINTS,
  PRIMARY_LABEL,
  AGAIN_LABEL,
  SHEET_TITLE,
  HISTORY_LABEL,
  BUSY_TOAST,
  RESET_TOAST,
  FOOTER,
  SHARE_SIGN,
} from './data.js';

const EDGE_CHANCE = 1 / 400; // 立币彩蛋
const THROW_DY = 32; // 手指上滑超过这个距离，松手即抛出
const CHOICE_SWAP_MS = 220; // 二选一：铜钱飞到高处、字已看不清时，把胜出项换到落定朝上的那一面
const RITUAL_MS = 4300; // 单抛从出手到结果条的节拍：落得快的多停一口气，落得慢的紧接着揭晓，手感一致
const SETTLE_BEAT = 850; // 落定后至少看清这一面再揭晓
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function mount(container, ctx) {
  const { kit, haptic, sound, storage, rng } = ctx;
  const { h, button, chips, tabs, stage, resultCard, sheet, input, toast, confetti, historyBar } = kit;
  const reduce = !!ctx.platform.simpleMotion;
  let alive = true;

  /* ---------- 状态 ---------- */
  let mode = storage.get('mode', 'coin');
  if (!MODES.some((m) => m.value === mode)) mode = 'coin';
  let busy = false;
  let diceRun = 0, diceDriven = false, diceRoundValues = null;
  let burst = Number(storage.get('burst', 1)) || 1;
  if (!BURST_MODES.some((b) => b.value === burst)) burst = 1;
  let tally = Object.assign({ heads: 0, tails: 0, edge: 0 }, storage.get('coin.tally', {}));
  let coinHistory = storage.get('coin.history', []);
  let totalFlips = Number(storage.get('coin.total', 0)) || 0;
  let diceCount = Number(storage.get('dice.count', 3)) || 3;
  let diceSides = Number(storage.get('dice.sides', 6)) || 6;
  if (!DICE_COUNTS.some((c) => c.value === diceCount)) diceCount = 3;
  if (!DICE_TYPES.some((t) => t.value === diceSides)) diceSides = 6;
  let diceHistory = storage.get('dice.history', []);
  let optA = normalizeOption(storage.get('choice.a', CHOICE_DEFAULT[0]), CHOICE_DEFAULT[0]);
  let optB = normalizeOption(storage.get('choice.b', CHOICE_DEFAULT[1]), CHOICE_DEFAULT[1]);
  let choiceHistory = storage.get('choice.history', []);
  let last = null; // 最近一次结果（结果条 / 抽屉 / 分享共用）
  let openSheetRef = null;

  /* ---------- 标签页 ---------- */
  const tabsUI = tabs(MODES, {
    value: mode,
    onChange: (v) => {
      if (busy) { tabsUI.set(mode); toast(BUSY_TOAST); return; }
      setMode(v);
    },
  });

  /* ---------- 硬币面板：连抛 ---------- */
  const burstChips = chips(BURST_MODES, {
    value: burst,
    onChange: (v) => {
      if (busy) { burstChips.set(burst); toast(BUSY_TOAST); return; }
      burst = v;
      storage.set('burst', v);
      updateBadge();
      haptic.tap();
    },
  });
  const coinPanel = h('div', { class: 'cn-panel' }, burstChips.el);

  /* ---------- 骰子面板：颗数 / 面数 ---------- */
  const countChips = chips(DICE_COUNTS, {
    value: diceCount,
    scroll: true,
    onChange: (v) => {
      if (busy) { countChips.set(diceCount); toast(BUSY_TOAST); return; }
      diceCount = v;
      storage.set('dice.count', v);
      tray.setDice(diceCount, diceSides);
      forgetResult();
      haptic.tap();
      sound.play('rattle');
    },
  });
  const typeChips = chips(DICE_TYPES, {
    value: diceSides,
    onChange: (v) => {
      if (busy) { typeChips.set(diceSides); toast(BUSY_TOAST); return; }
      diceSides = v;
      storage.set('dice.sides', v);
      tray.setDice(diceCount, diceSides);
      forgetResult();
      haptic.tap();
      sound.play('flip');
    },
  });
  const dicePanel = h(
    'div',
    { class: 'cn-panel cn-dice-panel' },
    h('div', { class: 'cn-ctl-row', attrs: { role: 'group', 'aria-label': '颗数' } }, h('span', { class: 'cn-ctl-label' }, '颗数'), countChips.el),
    h('div', { class: 'cn-ctl-row', attrs: { role: 'group', 'aria-label': '面数' } }, h('span', { class: 'cn-ctl-label' }, '面数'), typeChips.el),
  );

  /* ---------- 二选一面板：A / B + 预设 ---------- */
  const presetKey = (a, b) => `${a}/${b}`;
  const onOption = (which) => (v) => {
    if (which === 'a') optA = normalizeOption(v, CHOICE_DEFAULT[0]);
    else optB = normalizeOption(v, CHOICE_DEFAULT[1]);
    storage.set('choice.' + which, which === 'a' ? optA : optB);
    presetChips.set(presetKey(optA, optB));
    coin.setChoice(optA, optB);
    updateBadge();
  };
  const inA = input({ placeholder: CHOICE_DEFAULT[0], value: optA, maxlength: 8, onInput: onOption('a'), onEnter: () => inB.focus() });
  const inB = input({ placeholder: CHOICE_DEFAULT[1], value: optB, maxlength: 8, onInput: onOption('b'), onEnter: () => {} });
  inA.setAttribute('aria-label', '选项一');
  inB.setAttribute('aria-label', '选项二');
  const presetChips = chips(
    CHOICE_PRESETS.map(([a, b]) => ({ value: presetKey(a, b), label: `${a} / ${b}`, a, b })),
    {
      value: presetKey(optA, optB),
      scroll: true,
      onChange: (_, it) => {
        if (busy) { presetChips.set(presetKey(optA, optB)); return; }
        optA = it.a; optB = it.b;
        inA.value = optA; inB.value = optB;
        storage.set('choice.a', optA);
        storage.set('choice.b', optB);
        coin.setChoice(optA, optB);
        updateBadge();
        haptic.tap();
        sound.play('tick');
      },
    },
  );
  presetChips.el.classList.add('cn-presets');
  const choicePanel = h('div', { class: 'cn-panel' }, h('div', { class: 'cn-vs' }, inA, h('span', { class: 'cn-vs-mark', attrs: { 'aria-hidden': 'true' } }, '或'), inB), presetChips.el);

  /* ---------- 舞台 ---------- */
  const st = stage({ cls: 'cn-stage' });
  const ritual = createRitual(ctx, st, ['心念', '抛出', '落定', '揭晓']);
  const wait = ritual.pause;
  const coin = makeCoin();
  const tray = makeTray();
  st.scene.append(h('div', { class: 'cn-jitter' }, coin.el, tray.el));

  /* ---------- 舞台下方：一行提示 → 主按钮 → 结果条 → 记录 ---------- */
  const hintWrap = h('div', { class: 'cn-hint' });
  let hintEl = null;
  // 这一行要么是操作指引（带手势图标），要么是状态说明（不带）。
  function setHint(text, quiet = false) {
    if (!hintEl) return;
    if (hintEl.lastChild.textContent !== text) hintEl.lastChild.textContent = text;
    hintEl.classList.toggle('cn-quiet', quiet);
  }
  const idleHint = () => (last ? [mode === 'dice' ? HINTS.diceLanded : HINTS.landed, true] : [STAGE_HINT[mode], false]);
  const primaryBtn = button(PRIMARY_LABEL[mode], { variant: 'primary', size: 'large', primary: true, onClick: () => act(22) });
  const spacer = h('div', { class: 'cn-spacer', attrs: { 'aria-hidden': 'true' } });
  const statsText = h('span', { class: 'cn-stats-text' });
  const resetBtn = h('button', { type: 'button', class: 'cn-reset', onClick: resetTally }, '清零');
  const statsEl = h('div', { class: 'cn-stats' }, statsText, resetBtn);
  const histEl = h('div', { class: 'cn-history' });

  container.append(
    ritual.progress,
    h('div', { class: 'cn-head' }, tabsUI.el, h('div', { class: 'cn-panels' }, coinPanel, dicePanel, choicePanel)),
    st.el,
    hintWrap,
    kit.actionBar(primaryBtn),
    ritual.receipt,
    spacer,
    h('div', { class: 'cn-record' }, statsEl, histEl),
  );
  setMode(mode, true);

  /* ---------- 三条入口：体感 / 屏幕手势 / 按钮 ---------- */
  // 骰子消费实时加速度流；一段体感手势结束后不得再触发一次录播式投掷。
  ctx.motion.onToss((e) => { if (mode !== 'dice') act(e.intensity); });
  ctx.motion.onShake((e) => { if (mode !== 'dice' || e.source !== 'sensor') act(e.intensity); });
  let held = false, armed = false, sensing = false, dragX = 0, dragY = 0, dragAt = 0;
  ctx.gesture.drag(st.scene, {
    onStart() {
      if ((busy && !(mode === 'dice' && diceDriven)) || openSheetRef?.opened) return;
      held = true; armed = false; haptic.tap();
      dragX = dragY = 0; dragAt = performance.now();
      if (mode === 'dice') { setHint(HINTS.diceDrag, true); return; }
      coin.hold();
      setHint(HINTS.drag, true);
    },
    onMove(g) {
      if (!held) return;
      if (mode === 'dice') {
        const now = performance.now(), dt = Math.max(16, now - dragAt);
        if (diceDriven || Math.hypot(g.dx, g.dy) > 8) driveDiceInput({ ax: -(g.dx - dragX) / dt * 18, ay: -(g.dy - dragY) / dt * 18, az: 0, t: now, holding: true });
        dragX = g.dx; dragY = g.dy; dragAt = now;
        return;
      }
      // 手指提起铜钱：跟手抬起、微微侧倾，这是真正的"拿起来"
      if (!reduce) coin.preview(g.dx, g.dy * 1.4);
      const ready = -g.dy > THROW_DY;
      if (ready !== armed) { armed = ready; if (ready) haptic.light(); setHint(ready ? HINTS.release : HINTS.drag, true); }
    },
    onEnd(g) {
      if (!held) return;
      held = false;
      if (mode === 'dice') {
        if (diceDriven) { if (g.cancelled) tray.cancelDice(); else tray.releaseDice(); }
        else setHint(...idleHint());
        return;
      }
      if (!g.cancelled && -g.dy > THROW_DY) act(clamp(12 + Math.max(-g.vy * 12, -g.dy / 9), 12, 38));
      else { coin.rest(); setHint(...idleHint()); }
    },
  });
  ctx.motion.onMotion((m) => {
    if (mode === 'dice') {
      if (!held && !openSheetRef?.opened) driveDiceInput(m);
      return;
    }
    if (busy || held || openSheetRef?.opened || reduce) return;
    if (m.phase === 'idle') {
      if (sensing) { sensing = false; coin.rest(); setHint(...idleHint()); }
      return;
    }
    // 铜钱跟着手机的惯性走：先抬、再收住，随机抖动会显得脱节
    if (!sensing) { sensing = true; coin.hold(); }
    coin.preview(-clamp(m.ax || 0, -8, 8) * 2, -clamp(m.ay || 0, -4, 20));
    setHint(m.phase === 'ready' ? HINTS.ready : HINTS.charging, true);
  });

  /* ---------- 模式 ---------- */
  function setMode(v, silent = false) {
    mode = v;
    storage.set('mode', v);
    coinPanel.hidden = v !== 'coin';
    dicePanel.hidden = v !== 'dice';
    choicePanel.hidden = v !== 'choice';
    coin.el.hidden = v === 'dice';
    tray.el.hidden = v !== 'dice';
    coin.setChoice(v === 'choice' ? optA : null, optB);
    if (v === 'dice') tray.setDice(diceCount, diceSides);
    kit.clear(hintWrap);
    hintEl = kit.hint(v === 'dice' ? 'shake' : 'toss', '');
    hintWrap.append(hintEl);
    forgetResult();
    if (!silent) { haptic.tap(); sound.play('flip'); }
  }

  function updateBadge() {
    if (mode === 'coin') st.setBadge(burst > 1 ? `连抛 ${burst} · 多数为胜` : '一枚 · 来感通宝');
    else if (mode === 'dice') st.setBadge(`${diceCount} 颗 · D${diceSides}`);
    else st.setBadge(`二选一 · ${optA} / ${optB}`);
  }

  function lock(b) {
    busy = b;
    primaryBtn.disabled = b;
    container.classList.toggle('cn-busy', b);
    inA.disabled = b; inB.disabled = b; resetBtn.disabled = b;
  }
  /** 主按钮文案跟着状态走：抛硬币 → 再抛一次 */
  function syncButtons() {
    primaryBtn.setLabel(last ? AGAIN_LABEL[last.kind] : PRIMARY_LABEL[mode]);
    primaryBtn.disabled = busy;
  }
  /** 换模式 / 换设置 / 清零：忘掉上一条结果 */
  function forgetResult() {
    last = null;
    ritual.clear();
    ritual.step(0);
    releaseSpace();
    updateBadge();
    renderStats();
    renderHistory();
    syncButtons();
    setHint(...idleHint());
  }
  /** 每次出手前：锁定控件、收起上一条结果（占位撑住，页面不跳） */
  let startedAt = 0;
  function begin() {
    lock(true);
    sensing = false;
    startedAt = performance.now();
    holdSpace();
    ritual.clear();
    ritual.step(1);
  }
  /** 落定后的那一口气：至少 SETTLE_BEAT，且整段仪式不短于 RITUAL_MS */
  const beat = () => wait(reduce ? 80 : Math.max(SETTLE_BEAT, RITUAL_MS - (performance.now() - startedAt)));
  function finish() {
    lock(false);
    ritual.step(3);
    syncButtons();
    setHint(...idleHint());
    restoreResult();
    revealScroll();
  }
  // 结果条收起时页面会变短，浏览器会把滚动位置硬拉回顶部；用占位撑住，等新结果出现再放开。
  function holdSpace() {
    const r = ritual.receipt;
    if (r.hidden) return;
    const cs = getComputedStyle(r);
    spacer.style.height = `${r.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom)}px`;
  }
  function releaseSpace() { spacer.style.height = '0px'; }
  /** 结果条若被首屏截断，轻轻滚到能看见「展开解读」为止。 */
  function revealScroll() {
    const r = ritual.receipt.getBoundingClientRect();
    const vh = window.visualViewport?.height || window.innerHeight;
    const over = r.bottom - (vh - 12);
    if (over > 0) window.scrollBy({ top: Math.min(over, Math.max(0, r.top - 84)), behavior: ctx.platform.prefersReducedMotion ? 'instant' : 'smooth' });
  }

  function act(intensity = 20) {
    if (busy || !alive || openSheetRef?.opened) return;
    if (mode === 'coin') return burst > 1 ? doBurst(burst, intensity) : doFlip(intensity);
    if (mode === 'dice') return doRoll(intensity);
    return doChoice(intensity);
  }

  /* ---------- 硬币：单抛 ---------- */
  async function doFlip(intensity) {
    begin();
    if (!await ritual.focus()) return;
    setHint(HINTS.flight, true);
    const face = flipCoin(rng.random, { edgeChance: EDGE_CHANCE });
    if (!await coin.fly(face, intensity, { label: `铜钱落定：${FACES[face].alias}朝上` })) return;
    if (!await beat()) return;
    totalFlips++;
    tally[face] = (tally[face] || 0) + 1;
    coinHistory = pushHistory(coinHistory, face, 20);
    persistCoin();
    const f = FACES[face];
    last = { kind: 'coin', face, quip: rng.pick(COIN_QUIPS[face]), n: totalFlips };
    renderStats();
    renderHistory();
    if (face === EDGE) {
      sound.play('shimmer');
      haptic.success();
      confetti(st.el, { count: 70, origin: { x: 0.5, y: 0.55 } });
    } else {
      sound.play('pop', { delay: 0.03 });
      haptic.light();
    }
    // 彩蛋：连续同面 / 抛数里程碑
    const sk = streakOf(coinHistory);
    if (face !== EDGE && STREAK_TEXT[sk.len]) {
      toast(fillTemplate(STREAK_TEXT[sk.len], { w: f.name }));
      sound.play('shimmer', { delay: 0.25 });
    } else if (MILESTONES[totalFlips]) {
      toast(MILESTONES[totalFlips]);
      confetti(st.el, { count: 40, origin: { x: 0.5, y: 0.5 } });
    }
    finish();
  }

  /* ---------- 硬币：连抛 N 次，多数为胜 ---------- */
  async function doBurst(n, intensity) {
    begin();
    if (!await ritual.focus()) return;
    const results = [];
    for (let i = 0; i < n; i++) {
      st.setBadge(`连抛 ${n} · 第 ${i + 1} 抛`);
      setHint(`${results.length ? dotsText(results) + ' · ' : ''}第 ${i + 1} / ${n} 抛`, true);
      const face = flipCoin(rng.random);
      if (!await coin.fly(face, intensity, { quick: true, label: `第 ${i + 1} 抛：${FACES[face].alias}朝上` })) return;
      results.push(face);
      totalFlips++;
      tally[face]++;
      coinHistory = pushHistory(coinHistory, face, 20);
      setHint(`${dotsText(results)} · 第 ${i + 1} / ${n} 抛`, true);
      renderStats();
      renderHistory();
      if (!await wait(reduce ? 0 : 500)) return;
    }
    persistCoin();
    const m = majority(results);
    const w = m.winner;
    const text = m.tie
      ? fillTemplate(BURST_TEXT.tie, { n })
      : fillTemplate(m.sweep ? BURST_TEXT.sweep : BURST_TEXT.win, { n, w: FACES[w].name, c: m.counts[w] });
    last = { kind: 'burst', n, results, m, text };
    updateBadge();
    if (m.tie) {
      sound.play('low');
      haptic.double();
    } else {
      sound.play('success');
      haptic.success();
      if (m.sweep) confetti(st.el, { count: 60, origin: { x: 0.5, y: 0.5 } });
    }
    finish();
  }

  function persistCoin() {
    storage.set('coin.total', totalFlips);
    storage.set('coin.tally', tally);
    storage.set('coin.history', coinHistory);
  }

  function resetTally() {
    if (busy) return;
    tally = { heads: 0, tails: 0, edge: 0 };
    coinHistory = [];
    totalFlips = 0;
    persistCoin();
    forgetResult();
    toast(RESET_TOAST);
    haptic.tap();
    sound.play('paper');
  }

  /* ---------- 骰子 ---------- */
  function driveDiceInput(m) {
    if (!alive || document.hidden || openSheetRef?.opened) return;
    const ax = m.ax ?? 0, ay = m.ay ?? 0, az = m.az ?? 0;
    if (![ax, ay, az].every(Number.isFinite)) return;
    if (!diceDriven) {
      if (Math.hypot(ax, ay, az) < DICE_WAKE && !m.holding) return;
      const run = ++diceRun;
      // 实时晃动可以接管一次按钮投掷，但不重新摇点数。
      const values = diceRoundValues ??= rollDice(diceCount, diceSides, rng.random);
      diceDriven = true;
      begin();
      ritual.focus();
      setHint(HINTS.diceDrag, true);
      tray.shake(() => values).then((values) => {
        if (!alive || run !== diceRun) return;
        diceDriven = false;
        if (values) finishDice(values);
        else { diceRoundValues = null; lock(false); syncButtons(); setHint(...idleHint()); restoreResult(); }
      });
    }
    tray.driveDice({ ax, ay, az, t: m.t ?? performance.now(), holding: !!m.holding });
  }

  async function doRoll(intensity) {
    const run = ++diceRun;
    const values = diceRoundValues = rollDice(diceCount, diceSides, rng.random);
    begin();
    if (!await ritual.focus() || run !== diceRun) return;
    setHint(HINTS.diceFlight, true);
    sound.play('shake');
    haptic.rattle();
    const completed = await tray.roll(values, intensity);
    if (!alive || run !== diceRun) return;
    if (!completed) { diceRoundValues = null; lock(false); syncButtons(); setHint(...idleHint()); restoreResult(); return; }
    if (!await wait(reduce ? 30 : 260)) return;
    if (run !== diceRun) return;
    finishDice(values);
  }

  function finishDice(values) {
    diceRoundValues = null;
    const a = analyzeDice(values, diceSides);
    const keys = diceSpecialKeys(values, diceSides);
    diceHistory = diceHistory.concat([{ v: values, s: diceSides }]).slice(-10);
    storage.set('dice.history', diceHistory);
    last = { kind: 'dice', values, sides: diceSides, a, keys, flavor: diceFlavor(values, diceSides) };
    renderHistory();
    if (a.triple || keys.includes('allMax') || keys.includes('nat20')) {
      sound.play('gong');
      haptic.success();
      confetti(st.el, { count: 70, origin: { x: 0.5, y: 0.6 } });
    } else if (keys.includes('456') || keys.includes('straight') || a.size === 'big') {
      sound.play('success', { delay: 0.05 });
      haptic.success();
    } else {
      sound.play('pop', { delay: 0.05 });
      haptic.light();
    }
    finish();
  }

  function diceFlavor(values, sides) {
    if (values.length === 1) {
      if (sides === 6) return D6_SINGLE[values[0]];
      const v = values[0];
      if (v === 20) return DICE_SPECIALS.nat20.text;
      if (v === 1) return DICE_SPECIALS.nat1.text;
      return (D20_BANDS.find((b) => v <= b.max) || D20_BANDS[D20_BANDS.length - 1]).text;
    }
    return rng.pick(DICE_SUM_FLAVOR[sumBand(values, sides)]);
  }

  /* ---------- 二选一 ---------- */
  async function doChoice(intensity) {
    begin();
    inA.blur();
    inB.blur();
    if (!await ritual.focus()) return;
    setHint(HINTS.flight, true);
    const face = flipCoin(rng.random);
    const { winner, loser } = pickOption(face, optA, optB);
    // 落定后能正着读的只有铸字那一面：胜出项飞行中换到这一面，铜钱永远以它朝上落地。
    if (!await coin.fly(HEADS, intensity, { choice: [winner, loser], label: `铜钱落定：${winner}` })) return;
    coin.el.dataset.face = face;
    if (!await beat()) return;
    const verdict = fillTemplate(rng.pick(CHOICE_VERDICTS), { w: winner, l: loser });
    choiceHistory = choiceHistory.concat([winner]).slice(-8);
    storage.set('choice.history', choiceHistory);
    last = { kind: 'choice', face, winner, loser, verdict, a: optA, b: optB };
    sound.play('chime');
    haptic.success();
    renderHistory();
    finish();
  }

  /* ---------- 结果条（一句话）→ 抽屉（解读） ---------- */
  const dotsText = (list) => list.map((x) => FACES[x].dot).join(' ');

  function receiptOf(r) {
    if (r.kind === 'coin') {
      const f = FACES[r.face];
      return { kicker: `第 ${r.n} 抛 · ${f.alias}朝上`, title: f.name, text: r.quip };
    }
    if (r.kind === 'burst') {
      const { m, n, results, text } = r;
      return { kicker: `连抛 ${n} · ${dotsText(results)}`, title: m.tie ? BURST_TEXT.tieTitle : FACES[m.winner].name, text };
    }
    if (r.kind === 'dice') {
      const size = DICE_SIZE[r.a.size];
      const sp = r.keys.length ? DICE_SPECIALS[r.keys[0]] : null;
      const kicker = r.values.length === 1 ? `1 颗 D${r.sides}` : `${r.values.length} 颗 D${r.sides} · ${r.values.join(' · ')}`;
      return { kicker, title: `${r.a.sum} · ${size.name}${sp ? ' · ' + sp.name : ''}`, text: sp ? sp.text : r.flavor };
    }
    return { kicker: `二选一 · 「${r.loser}」落选`, title: r.winner, text: r.verdict };
  }

  function restoreResult() {
    if (!last) return;
    const r = receiptOf(last);
    // 一两个字的结果（正 / 反 / 做）放大一号，像盖下去的一枚字
    ritual.receipt.classList.toggle('cn-glyph', [...r.title].length <= 2);
    ritual.reveal({ ...r, onRead: openSheet });
    releaseSpace();
  }

  function openSheet() {
    if (!last || !alive || busy) return;
    if (openSheetRef && openSheetRef.opened) return;
    const card = buildCard(last);
    const again = button(AGAIN_LABEL[last.kind], {
      variant: 'primary',
      onClick: () => {
        sh.close();
        wait(380).then(() => alive && act(22));
      },
    });
    const shareBtn = button('分享', {
      variant: 'ghost',
      icon: 'share',
      onClick: async () => {
        const r = await ctx.share(shareText(last));
        toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制到剪贴板' : '分享已取消');
      },
    });
    const sh = sheet({
      title: SHEET_TITLE[last.kind],
      content: card,
      actions: [again, shareBtn],
      onClose: () => {
        if (openSheetRef === sh) openSheetRef = null;
      },
    });
    openSheetRef = sh;
    sh.open();
  }

  function buildCard(r) {
    const cls = 'm-coin cn-card';
    if (r.kind === 'coin') {
      const f = FACES[r.face];
      const rate = headsRate(tally);
      const sk = streakOf(coinHistory);
      const stat = `正 ${tally.heads} 次 · 反 ${tally.tails} 次${tally.edge ? ' · 立 ' + tally.edge + ' 次' : ''}${rate != null ? ' · 正面率 ' + rate + '%' : ''}`;
      return resultCard({
        cls,
        kicker: `硬币 · 第 ${r.n} 抛`,
        title: f.name,
        badge: f.badge,
        seal: f.seal,
        sub: `${f.alias}朝上`,
        verse: r.quip,
        sections: [
          { label: '解曰', text: f.meaning },
          { label: '统计', text: stat },
          sk.len >= 3 && r.face !== EDGE ? { label: '手气', text: `最近连续 ${sk.len} 次「${f.name}」，热手在握。` } : null,
        ],
        footer: FOOTER,
      });
    }
    if (r.kind === 'burst') {
      const { m, n, results, text } = r;
      const w = m.winner;
      return resultCard({
        cls,
        kicker: fillTemplate(BURST_TEXT.kicker, { n }),
        title: m.tie ? BURST_TEXT.tieTitle : FACES[w].name,
        badge: `正 ${m.counts.heads} · 反 ${m.counts.tails}`,
        seal: m.tie ? '平' : FACES[w].seal,
        sub: m.tie ? '正反各半 · 不分胜负' : m.sweep ? '全数一致 · 态度鲜明' : `「${FACES[w].name}」多数为胜`,
        sections: [
          { label: '判定', text },
          { label: '序列', node: dotsNode(results, { legend: true }), stack: true },
          { label: '解曰', text: m.tie ? FACES.tails.meaning : FACES[w].meaning },
        ],
        footer: FOOTER,
      });
    }
    if (r.kind === 'dice') {
      const { values, sides, a, keys } = r;
      const size = DICE_SIZE[a.size];
      const ruleNote = values.length === 3 && sides === 6 ? '三颗六面骰以 10 为界：十点及以下为小，十一点及以上为大。' : '';
      return resultCard({
        cls,
        kicker: `骰子 · ${values.length} 颗 D${sides}`,
        title: String(a.sum),
        badge: `${size.badge} · ${a.min}–${a.max} 之中`,
        seal: size.seal,
        sub: values.join(' · '),
        sections: [
          { label: '点数', node: miniDiceNode(values, sides) },
          { label: '大小', text: size.text + ruleNote },
          ...keys.map((k) => ({ label: DICE_SPECIALS[k].name, text: DICE_SPECIALS[k].text })),
          { label: '一句', text: r.flavor },
        ],
        footer: '仅供娱乐 · 骰子不欠任何人',
      });
    }
    const card = resultCard({
      cls,
      kicker: '二选一',
      title: r.winner,
      badge: '天意已决',
      seal: '定',
      sub: `「${r.loser}」落选`,
      verse: r.verdict,
      sections: [
        { label: '所问', text: `${r.a}，还是 ${r.b}？` },
        { label: '解曰', text: CHOICE_MEANING },
      ],
      footer: FOOTER,
    });
    // 长选项（最多 8 字、可中英混排）缩小一号，390px 下不换行
    const len = [...String(r.winner)].length;
    if (len > 3) card.querySelector('.result-title')?.classList.add(len > 6 ? 'cn-title-xl' : 'cn-title-l');
    return card;
  }

  function shareText(r) {
    if (r.kind === 'coin') {
      const f = FACES[r.face];
      return `【硬币】第 ${r.n} 抛：${f.name}（${f.alias}）。「${r.quip}」\n累计 正 ${tally.heads} · 反 ${tally.tails}\n${SHARE_SIGN}`;
    }
    if (r.kind === 'burst') {
      const w = r.m.tie ? '平局' : `「${FACES[r.m.winner].name}」胜`;
      return `【硬币 · 连抛 ${r.n}】${dotsText(r.results)}\n正 ${r.m.counts.heads} · 反 ${r.m.counts.tails} → ${w}\n${r.text}\n${SHARE_SIGN}`;
    }
    if (r.kind === 'dice') {
      const size = DICE_SIZE[r.a.size];
      const sp = r.keys.map((k) => DICE_SPECIALS[k].name).join(' · ');
      return `【骰子】${r.values.length} 颗 D${r.sides}：${r.values.join(' · ')} = ${r.a.sum} · ${size.name}${sp ? ' · ' + sp : ''}\n${r.flavor}\n${SHARE_SIGN}`;
    }
    return `【二选一】${r.a} 还是 ${r.b}？天意选了「${r.winner}」\n${r.verdict}\n${SHARE_SIGN}`;
  }

  /* ---------- 统计 / 历史 ---------- */
  function renderStats() {
    statsText.textContent = `正 ${tally.heads} · 反 ${tally.tails}${tally.edge ? ' · 立 ' + tally.edge : ''} · 共 ${totalFlips} 抛`;
    statsEl.hidden = mode !== 'coin' || totalFlips === 0;
  }

  function renderHistory() {
    kit.clear(histEl);
    let body = null;
    if (mode === 'coin' && coinHistory.length) body = dotsNode(coinHistory, { latest: true, legend: true });
    else if (mode === 'dice' && diceHistory.length) body = historyBar(diceHistory.slice(-10), (r) => (r.v.length === 1 ? String(r.v[0]) : `${r.v.join('·')} = ${r.v.reduce((x, y) => x + y, 0)}`));
    else if (mode === 'choice' && choiceHistory.length) body = historyBar(choiceHistory.slice(-8), (x) => x);
    histEl.hidden = !body;
    if (body) histEl.append(h('span', { class: 't-kicker' }, HISTORY_LABEL[mode]), body);
  }

  /** ● 正 ○ 反 ◐ 立 的小圆点序列 */
  function dotsNode(list, { latest = false, legend = false } = {}) {
    const dots = h(
      'div',
      { class: 'cn-dots', attrs: { role: 'img', 'aria-label': list.map((f) => FACES[f].name).join('') } },
      list.map((f, i) => h('span', { class: ['cn-dot', f === HEADS ? 'h' : f === EDGE ? 'e' : 't', latest && i === list.length - 1 && 'latest'], attrs: { title: FACES[f].name } })),
    );
    if (!legend) return dots;
    return h('div', { class: 'cn-dots-wrap' }, dots, h('div', { class: 'cn-dots-legend', attrs: { 'aria-hidden': 'true' } }, '● 正　○ 反'));
  }

  /** 抽屉里的小骰子：与舞台上一样的象牙白骰、深色点 */
  function miniDiceNode(values, sides) {
    const row = h('div', { class: 'cn-mini-row' });
    for (const v of values) {
      if (sides === 6) {
        const d = h('span', { class: 'cn-mini', attrs: { 'aria-label': String(v) } });
        for (const [r, c] of PIP_LAYOUT[v]) d.append(h('i', { class: 'cn-pip', style: { gridRow: r, gridColumn: c } }));
        row.append(d);
      } else {
        row.append(h('span', { class: 'cn-mini cn-n' }, String(v)));
      }
    }
    row.append(h('span', { class: 'cn-mini-sum' }, `= ${values.reduce((x, y) => x + y, 0)}`));
    return row;
  }

  /* ---------- 实物：一枚铜钱（画布） ---------- */
  function makeCoin() {
    const canvas = h('canvas', { class: 'object-canvas', attrs: { role: 'img', 'aria-label': '一枚立体铜钱，字面朝上' } });
    const el = h('div', { class: 'cn-solid cn-solid-coin' }, canvas);
    const scene = createSolidScene(canvas, ctx, { ground: 0.74 });
    scene.set([{ kind: 'coin', mesh: coinMesh(), size: 68, x: 0, y: 0 }]);
    // 预览会记住"拿起前"的姿态；每次出手或重新拿起前都要忘掉旧的，否则会把落定的一面翻回去
    const forget = () => scene.objects.forEach((o) => { delete o.previewQ; });
    async function fly(face, intensity = 20, { quick = false, choice = null, label = '' } = {}) {
      delete el.dataset.face;
      forget();
      sound.play('whoosh');
      haptic.release();
      if (choice) ctx.setTimeout(() => { if (alive) setChoice(choice[0], choice[1]); }, CHOICE_SWAP_MS);
      const ok = await scene.throwTo([face], intensity, {
        duration: reduce ? 1500 : quick ? 2500 : 3500,
        onPhase: (phase) => {
          el.dataset.phase = phase;
          if (phase === 'settling') { ritual.step(2); setHint(HINTS.settled, true); }
        },
      });
      if (ok && alive) {
        el.dataset.face = face;
        el.dataset.phase = 'settled';
        if (label) canvas.setAttribute('aria-label', label);
      }
      return ok && alive;
    }
    function setChoice(a, b) {
      scene.objects[0].choice = a == null ? null : [a, b];
      scene.render();
    }
    return { el, fly, setChoice, hold: forget, preview: scene.preview, rest: scene.rest };
  }

  /* ---------- 实物：托盘里的骰子（画布） ---------- */
  function makeTray() {
    const canvas = h('canvas', { class: 'object-canvas', attrs: { role: 'img', 'aria-label': '托盘里的立体骰子，摇动后滚落' } });
    const el = h('div', { class: 'cn-solid cn-solid-dice' }, canvas);
    const scene = createSolidScene(canvas, ctx, { plate: true, ground: 0.68 });
    let count = 0, sides = 6;
    function setDice(n, s) {
      count = n; sides = s;
      const mesh = s === 20 ? d20Mesh() : cubeMesh(), small = n > 3;
      const size = s === 20 ? (small ? 36 : 44) : small ? 25 : 30;
      const columns = Math.min(n, 3), spacing = small ? 82 : 92;
      scene.set(Array.from({ length: n }, (_, i) => {
        const value = 1 + Math.floor(rng.random() * s);
        return { kind: 'dice', mesh, size, x: (i % columns - (columns - 1) / 2) * spacing, y: small ? (i < 3 ? 50 : -38) : 0, q: faceUp(mesh, value) };
      }));
      canvas.setAttribute('aria-label', `${count} 颗 D${sides} 立体骰子`);
    }
    const onPhase = (phase) => {
      el.dataset.phase = phase;
      if (phase === 'settling') { ritual.step(2); setHint(HINTS.diceSettled, true); }
      else if (phase === 'shaking') ritual.step(1);
    };
    async function roll(values, intensity = 20) {
      sound.play('whoosh');
      haptic.release();
      const ok = await scene.throwTo(values, intensity, { duration: reduce ? 1600 : 2450, onPhase });
      if (ok) { el.dataset.values = values.join(','); el.dataset.phase = 'settled'; }
      return ok;
    }
    function shake(chooseValues) {
      delete el.dataset.values;
      return scene.startDiceShake(chooseValues, { onPhase }).then((values) => {
        if (values) el.dataset.values = values.join(',');
        else el.dataset.phase = 'idle';
        return values;
      });
    }
    return { el, setDice, roll, shake, driveDice: scene.driveDice, releaseDice: scene.releaseDice, cancelDice: scene.cancelDice, rest: scene.rest };
  }

  /* ---------- 卸载 ---------- */
  return () => {
    alive = false;
    diceRun++;
    tray.cancelDice();
    coin.rest();
    tray.rest();
    if (openSheetRef) openSheetRef.close();
  };
}
