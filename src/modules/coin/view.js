import { createRitual } from '../../ui/ritual.js';
import { coinPose, COIN_IMPACTS, COIN_SETTLING, dicePose, DICE_IMPACTS, DICE_SETTLING } from './motion.js';
import { createShakeMeter } from '../qian/core.js';
// 硬币骰子 · 界面（Web DOM）。所有逻辑在 core.js，所有文案在 data.js。
// 三个标签页共用一座舞台：硬币 / 骰子托盘 两组实物按模式切换显示。
import {
  HEADS,
  EDGE,
  flipCoin,
  rollDice,
  diceRotation,
  restAngle,
  flipAngle,
  spinsForIntensity,
  powerOf,
  majority,
  streakOf,
  pushHistory,
  PIP_LAYOUT,
  analyzeDice,
  diceSpecialKeys,
  sumBand,
  diceSlots,
  fitFontSize,
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
  COIN_INSCRIPTION,
  FACES,
  COIN_QUIPS,
  BURST_TEXT,
  STREAK_TEXT,
  MILESTONES,
  CHOICE_VERDICTS,
  DICE_SIZE,
  DICE_SPECIALS,
  DICE_SUM_FLAVOR,
  D6_SINGLE,
  D20_BANDS,
  STAGE_HINT,
  GESTURE_TEXT,
  PRIMARY_LABEL,
  SHEET_TITLE,
  BUSY_TOAST,
  RESET_TOAST,
  FOOTER,
  SHARE_SIGN,
} from './data.js';

const LIGHT_THEMES = new Set(['paper', 'celadon']);
const EDGE_CHANCE = 1 / 400; // 立币彩蛋
const DIE_SIZE = 52;

export function mount(container, ctx) {
  const { kit, haptic, sound, storage, rng } = ctx;
  const { h, button, chips, tabs, stage, hint, resultCard, sheet, input, toast, confetti, historyBar, fromHTML } = kit;
  const reduce = !!ctx.platform.prefersReducedMotion;
  let alive = true;

  /* ---------- 状态 ---------- */
  let mode = storage.get('mode', 'coin');
  if (!MODES.some((m) => m.value === mode)) mode = 'coin';
  let busy = false;
  let burst = Number(storage.get('burst', 1)) || 1;
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
  let last = null; // 最近一次结果（供「详情」与分享）
  let openSheetRef = null;

  /* ---------- 皮肤：浅色皮肤下换白骰黑点 ---------- */
  const isLight = () => LIGHT_THEMES.has(ctx.theme);
  const applyTheme = (t) => container.classList.toggle('cn-light', LIGHT_THEMES.has(t));
  applyTheme(ctx.theme);
  ctx.onTheme(applyTheme);

  /* ---------- 标签页 ---------- */
  const tabsUI = tabs(MODES, {
    value: mode,
    onChange: (v) => {
      if (busy) {
        tabsUI.set(mode);
        toast(BUSY_TOAST);
        return;
      }
      setMode(v);
    },
  });

  /* ---------- 硬币面板：连抛 ---------- */
  const burstChips = chips(BURST_MODES, {
    value: burst,
    onChange: (v) => {
      if (busy) {
        burstChips.set(burst);
        toast(BUSY_TOAST);
        return;
      }
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
    onChange: (v) => {
      if (busy) {
        countChips.set(diceCount);
        toast(BUSY_TOAST);
        return;
      }
      diceCount = v;
      storage.set('dice.count', v);
      tray.setDice(diceCount, diceSides);
      updateBadge();
      hideResult();
      haptic.tap();
      sound.play('rattle');
    },
  });
  const typeChips = chips(DICE_TYPES, {
    value: diceSides,
    onChange: (v) => {
      if (busy) {
        typeChips.set(diceSides);
        toast(BUSY_TOAST);
        return;
      }
      diceSides = v;
      storage.set('dice.sides', v);
      tray.setDice(diceCount, diceSides);
      updateBadge();
      hideResult();
      haptic.tap();
      sound.play('flip');
    },
  });
  const dicePanel = h(
    'div',
    { class: 'cn-panel cn-dice-panel' },
    h('div', { class: 'cn-ctl-row' }, h('span', { class: 'cn-ctl-label' }, '颗数'), countChips.el),
    h('div', { class: 'cn-ctl-row' }, h('span', { class: 'cn-ctl-label' }, '面数'), typeChips.el),
  );

  /* ---------- 二选一面板：A / B ---------- */
  const onOption = (which) => (v) => {
    if (which === 'a') optA = normalizeOption(v, CHOICE_DEFAULT[0]);
    else optB = normalizeOption(v, CHOICE_DEFAULT[1]);
    storage.set('choice.' + which, which === 'a' ? optA : optB);
    coin.setChoice(optA, optB);
    updateBadge();
  };
  const inA = input({ placeholder: CHOICE_DEFAULT[0], value: optA, maxlength: 8, onInput: onOption('a'), onEnter: () => inB.focus() });
  const inB = input({ placeholder: CHOICE_DEFAULT[1], value: optB, maxlength: 8, onInput: onOption('b'), onEnter: () => {} });
  const presets = h(
    'div',
    { class: 'cn-presets' },
    CHOICE_PRESETS.map(([a, b]) =>
      h(
        'button',
        {
          type: 'button',
          class: 'cn-preset',
          onClick: () => {
            if (busy) return;
            optA = a;
            optB = b;
            inA.value = a;
            inB.value = b;
            storage.set('choice.a', a);
            storage.set('choice.b', b);
            coin.setChoice(optA, optB);
            updateBadge();
            haptic.tap();
            sound.play('tick');
          },
        },
        `${a} / ${b}`,
      ),
    ),
  );
  const choicePanel = h('div', { class: 'cn-panel' }, h('div', { class: 'cn-vs' }, inA, h('span', { class: 'cn-vs-mark' }, '或'), inB), presets);

  /* ---------- 舞台 ---------- */
  const st = stage({ cls: 'cn-stage', minHeight: 380 });
  const ritual = createRitual(ctx, st, ['心念', '抛出', '落定', '揭晓']);
  const wait = ritual.pause;
  const ambient = h('div', { class: 'cn-ambient' });
  const jitter = h('div', { class: 'cn-jitter' });
  const coin = makeCoin();
  const tray = makeTray();
  jitter.append(coin.el, tray.el);
  st.scene.append(ambient, jitter);

  /* ---------- 舞台下方：结果 / 统计 ---------- */
  const resBig = h('div', { class: 'cn-res-big gold-text' });
  const resBadge = h('span', { class: 'cn-res-badge' });
  const resSub = h('div', { class: 'cn-res-sub' });
  const resultEl = h('div', { class: 'cn-result' }, resBig, h('div', null, resBadge), resSub);
  const statsText = h('span', { class: 'cn-stats-text' });
  const resetBtn = h('button', { type: 'button', class: 'cn-reset', onClick: resetTally }, '清零');
  const statsEl = h('div', { class: 'cn-stats' }, statsText, resetBtn);

  const hintWrap = h('div', { class: 'cn-hint' });
  const primaryBtn = button(PRIMARY_LABEL[mode], { variant: 'primary', size: 'large', primary: true, onClick: () => act(22) });
  const detailBtn = button('详情', { variant: 'ghost', icon: 'info', disabled: true, onClick: () => openSheet() });
  const histEl = h('div', { class: 'cn-history' });

  container.append(
    ritual.progress,
    h('div', { class: 'cn-head' }, tabsUI.el, h('div', { class: 'cn-panels mt-3' }, coinPanel, dicePanel, choicePanel)),
    h('div', { class: 'mt-4' }, st.el),
    resultEl,
    statsEl,
    hintWrap,
    kit.actionBar(primaryBtn, detailBtn),
    histEl,
  );
  setMode(mode, true);
  renderStats();

  // Shaking belongs to the dice tray; an upward release belongs to a coin.
  ctx.motion.onToss((e) => { if (mode !== 'dice' && !last) act(e.intensity); });
  ctx.motion.onShake((e) => { if (mode === 'dice' && !last) act(e.intensity); });
  let held = false, charged = false;
  const shakeMeter = createShakeMeter({ need: 2, minSwing: 22 });
  ctx.gesture.drag(st.scene, {
    onStart() {
      if (busy || openSheetRef?.opened) return;
      held = true; charged = false; shakeMeter.reset(); haptic.tap();
    },
    onMove(g) {
      if (!held || reduce) return;
      const dx = Math.max(-26, Math.min(26, g.dx * .25));
      const dy = Math.max(-32, Math.min(8, g.dy * .25));
      jitter.style.transform = `translate(${dx}px,${dy}px) rotate(${dx * .2}deg)`;
      const ready = mode === 'dice' ? shakeMeter.push(g.dx).done || Math.hypot(g.dx, g.dy) > 70 : g.dy < -32;
      if (ready && !charged) { charged = true; haptic.light(); }
      st.setHint(ready ? (mode === 'dice' ? '松手，让骰子滚落' : '松手，抛出硬币') : mode === 'dice' ? '左右摇动，松手投出' : '向上滑动，松手抛出');
    },
    onEnd(g) {
      if (!held) return;
      held = false; jitter.style.transform = '';
      const ready = mode === 'dice' ? shakeMeter.state.done || Math.hypot(g.dx, g.dy) > 40 : g.dy < -32;
      if (!g.cancelled && ready) act(Math.max(14, Math.min(36, 14 + Math.hypot(g.dx, g.dy) / 9)));
      else st.setHint(STAGE_HINT[mode]);
    },
  });
  ctx.motion.onTilt(kit.parallax(ambient, { max: 14 }));
  ctx.motion.onMotion((m) => {
    if (busy || held || last || openSheetRef?.opened || reduce) return;
    // Inertia follows the measured direction; random jitter felt disconnected.
    const dx = Math.max(-14, Math.min(14, -(m.ax || 0) * 1.2));
    const dy = Math.max(-18, Math.min(5, -(m.ay || 0)));
    jitter.style.transform = m.phase === 'idle' ? '' : `translate(${dx}px,${dy}px) rotate(${dx * .35}deg)`;
    if (m.phase === 'ready') st.setHint('收住动作，准备出手');
    else if (m.phase === 'charging') st.setHint(mode === 'dice' ? '左右轻摇，收住后投出' : '向上轻甩，收住后抛出');
    else st.setHint(STAGE_HINT[mode]);
  });

  /* ---------- 模式 ---------- */
  function setMode(v, silent = false) {
    mode = v;
    jitter.style.transform = '';
    storage.set('mode', v);
    coinPanel.hidden = v !== 'coin';
    dicePanel.hidden = v !== 'dice';
    choicePanel.hidden = v !== 'choice';
    coin.el.hidden = v === 'dice';
    tray.el.hidden = v !== 'dice';
    coin.setChoice(v === 'choice' ? optA : null, optB);
    if (v === 'dice') tray.setDice(diceCount, diceSides);
    primaryBtn.setLabel(PRIMARY_LABEL[v]);
    kit.clear(hintWrap);
    hintWrap.append(hint(v === 'dice' ? 'shake' : 'toss', GESTURE_TEXT[v]));
    st.setHint(STAGE_HINT[v]);
    statsEl.hidden = v !== 'coin';
    last = null;
    detailBtn.disabled = true;
    hideResult();
    updateBadge();
    renderHistory();
    if (!silent) {
      haptic.tap();
      sound.play('flip');
    }
  }

  function updateBadge() {
    if (mode === 'coin') st.setBadge(burst > 1 ? `连抛 ${burst} · 多数为胜` : '一枚 · 来感通宝');
    else if (mode === 'dice') st.setBadge(`${diceCount} 颗 · D${diceSides}`);
    else st.setBadge(`二选一 · ${optA} / ${optB}`);
  }

  function lock(b) {
    primaryBtn.disabled = b;
    detailBtn.disabled = b || !last;
    container.classList.toggle('cn-busy', b);
    inA.disabled = b; inB.disabled = b; resetBtn.disabled = b;
  }

  function showResult({ big, badge, sub, seq = false }) {
    resBig.textContent = big;
    resBig.classList.toggle('cn-seq', seq);
    resBig.classList.toggle('cn-long', !seq && [...String(big)].length > 3);
    resBadge.textContent = badge || '';
    resBadge.hidden = !badge;
    resSub.textContent = sub || '';
    resultEl.classList.add('show');
  }
  function hideResult() {
    resultEl.classList.remove('show');
  }

  function act(intensity = 20) {
    if (busy || !alive || openSheetRef?.opened) return;
    jitter.style.transform = '';
    if (mode === 'coin') return burst > 1 ? doBurst(burst, intensity) : doFlip(intensity);
    if (mode === 'dice') return doRoll(intensity);
    return doChoice(intensity);
  }

  /* ---------- 硬币：单抛 ---------- */
  async function doFlip(intensity) {
    busy = true;
    lock(true);
    hideResult();
    st.setHint('');
    if (!await ritual.focus()) return;
    ritual.step(1);
    const face = flipCoin(rng.random, { edgeChance: EDGE_CHANCE });
    await coin.fly(face, intensity);
    if (!alive) return;
    ritual.step(2); st.setHint('硬币已停住，看看朝上的一面');
    if (!await wait(reduce ? 80 : 850)) return;
    ritual.step(3);
    totalFlips++;
    tally[face] = (tally[face] || 0) + 1;
    coinHistory = pushHistory(coinHistory, face, 20);
    persistCoin();
    const f = FACES[face];
    const quip = rng.pick(COIN_QUIPS[face]);
    last = { kind: 'coin', face, quip, n: totalFlips };
    showResult({ big: f.name, badge: f.badge, sub: quip });
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
    busy = false;
    lock(false);
  }

  /* ---------- 硬币：连抛 N 次，多数为胜 ---------- */
  async function doBurst(n, intensity) {
    busy = true;
    lock(true);
    hideResult();
    st.setHint('');
    if (!await ritual.focus()) return;
    ritual.step(1);
    const results = [];
    for (let i = 0; i < n; i++) {
      st.setBadge(`连抛 ${n} · 第 ${i + 1} 抛`);
      const face = flipCoin(rng.random);
      await coin.fly(face, intensity, { quick: true, spins: 2 + (i % 2) });
      if (!alive) return;
      results.push(face);
      totalFlips++;
      tally[face]++;
      coinHistory = pushHistory(coinHistory, face, 20);
      showResult({ big: results.map((r) => FACES[r].dot).join(' '), badge: `第 ${i + 1} / ${n} 抛`, sub: '', seq: true });
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
    showResult({ big: m.tie ? BURST_TEXT.tieTitle : FACES[w].name, badge: `正 ${m.counts.heads} · 反 ${m.counts.tails}`, sub: text });
    updateBadge();
    if (m.tie) {
      sound.play('low');
      haptic.double();
    } else {
      sound.play('success');
      haptic.success();
      if (m.sweep) confetti(st.el, { count: 60, origin: { x: 0.5, y: 0.5 } });
    }
    busy = false;
    lock(false);
    ritual.step(3); st.setHint('这一轮已完成，可点详情回看');
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
    renderStats();
    renderHistory();
    hideResult();
    last = null;
    detailBtn.disabled = true;
    toast(RESET_TOAST);
    haptic.tap();
    sound.play('paper');
  }

  /* ---------- 骰子 ---------- */
  async function doRoll(intensity) {
    busy = true;
    lock(true);
    hideResult();
    st.setHint('');
    if (!await ritual.focus()) return;
    ritual.step(1);
    const values = rollDice(diceCount, diceSides, rng.random);
    sound.play('shake');
    haptic.rattle();
    await tray.roll(values, intensity);
    if (!alive) return;
    if (!await wait(reduce ? 30 : 260)) return;
    const a = analyzeDice(values, diceSides);
    const keys = diceSpecialKeys(values, diceSides);
    const size = DICE_SIZE[a.size];
    diceHistory = diceHistory.concat([{ v: values, s: diceSides }]).slice(-10);
    storage.set('dice.history', diceHistory);
    last = { kind: 'dice', values, sides: diceSides, a, keys, flavor: diceFlavor(values, diceSides) };
    const special = keys.length ? DICE_SPECIALS[keys[0]].name : null;
    showResult({
      big: String(a.sum),
      badge: `${size.badge}${special ? ' · ' + special : ''}`,
      sub: values.length === 1 ? last.flavor : values.join(' · '),
    });
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
    busy = false;
    lock(false);
    ritual.step(3); st.setHint('骰子已落定，可点详情查看');
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
    busy = true;
    lock(true);
    hideResult();
    st.setHint('');
    if (!await ritual.focus()) return;
    ritual.step(1);
    inA.blur();
    inB.blur();
    coin.setChoice(optA, optB);
    const face = flipCoin(rng.random);
    await coin.fly(face, intensity);
    if (!alive) return;
    ritual.step(2); st.setHint('硬币已停住，看看朝上的一面');
    if (!await wait(reduce ? 80 : 850)) return;
    ritual.step(3);
    const { winner, loser } = pickOption(face, optA, optB);
    const verdict = fillTemplate(rng.pick(CHOICE_VERDICTS), { w: winner, l: loser });
    choiceHistory = choiceHistory.concat([winner]).slice(-8);
    storage.set('choice.history', choiceHistory);
    last = { kind: 'choice', face, winner, loser, verdict, a: optA, b: optB };
    showResult({ big: winner, badge: `${FACES[face].alias}朝上`, sub: verdict });
    sound.play('chime');
    haptic.success();
    renderHistory();
    busy = false;
    lock(false);
    st.setHint('选择已揭晓，可点详情查看');
  }

  /* ---------- 结果抽屉 ---------- */
  function openSheet() {
    if (!last || !alive) return;
    if (openSheetRef && openSheetRef.opened) return;
    const card = buildCard(last);
    const again = button(last.kind === 'burst' ? '再抛一轮' : '再来一次', {
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
        toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制到剪贴板' : '分享失败');
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

  const cardCls = () => ['m-coin', 'cn-card', isLight() && 'cn-light'].filter(Boolean).join(' ');

  function buildCard(r) {
    let card;
    if (r.kind === 'coin') {
      const f = FACES[r.face];
      const rate = headsRate(tally);
      const sk = streakOf(coinHistory);
      const stat = `正 ${tally.heads} 次 · 反 ${tally.tails} 次${tally.edge ? ' · 立 ' + tally.edge + ' 次' : ''}${rate != null ? ' · 正面率 ' + rate + '%' : ''}`;
      card = resultCard({
        cls: cardCls(),
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
    } else if (r.kind === 'burst') {
      const { m, n, results, text } = r;
      const w = m.winner;
      card = resultCard({
        cls: cardCls(),
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
    } else if (r.kind === 'dice') {
      const { values, sides, a, keys } = r;
      const size = DICE_SIZE[a.size];
      const ruleNote = values.length === 3 && sides === 6 ? ' 三颗六面骰以 10 为界：十点及以下为小，十一点及以上为大。' : '';
      card = resultCard({
        cls: cardCls(),
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
    } else {
      const f = FACES[r.face];
      card = resultCard({
        cls: cardCls(),
        kicker: `二选一 · ${r.a} / ${r.b}`,
        title: r.winner,
        badge: `${f.alias}朝上`,
        seal: '定',
        sub: `「${r.loser}」落选`,
        verse: r.verdict,
        sections: [
          { label: '所问', text: `${r.a}，还是 ${r.b}？` },
          { label: '解曰', text: f.meaning },
        ],
        footer: FOOTER,
      });
      const len = [...String(r.winner)].length;
      if (len > 3) {
        const t = card.querySelector('.result-title');
        if (t) {
          t.style.fontSize = len > 6 ? '24px' : '28px';
          t.style.letterSpacing = '0.06em';
        }
      }
    }
    return card;
  }

  function shareText(r) {
    if (r.kind === 'coin') {
      const f = FACES[r.face];
      return `【硬币】第 ${r.n} 抛：${f.name}（${f.alias}）。「${r.quip}」\n累计 正 ${tally.heads} · 反 ${tally.tails}\n${SHARE_SIGN}`;
    }
    if (r.kind === 'burst') {
      const seq = r.results.map((x) => FACES[x].dot).join(' ');
      const w = r.m.tie ? '平局' : `「${FACES[r.m.winner].name}」胜`;
      return `【硬币 · 连抛 ${r.n}】${seq}\n正 ${r.m.counts.heads} · 反 ${r.m.counts.tails} → ${w}\n${r.text}\n${SHARE_SIGN}`;
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
    resetBtn.hidden = totalFlips === 0;
  }

  function renderHistory() {
    kit.clear(histEl);
    if (mode === 'coin') {
      if (coinHistory.length) histEl.append(dotsNode(coinHistory, { latest: true, legend: true }));
    } else if (mode === 'dice') {
      if (diceHistory.length) histEl.append(historyBar(diceHistory.slice(-10), (r) => `${r.v.join('·')} = ${r.v.reduce((x, y) => x + y, 0)}`));
    } else if (choiceHistory.length) {
      histEl.append(historyBar(choiceHistory.slice(-8), (x) => x));
    }
  }

  /** ● 正 ○ 反 ◐ 立 的小圆点序列 */
  function dotsNode(list, { latest = false, legend = false } = {}) {
    const dots = h(
      'div',
      { class: 'cn-dots' },
      list.map((f, i) => h('span', { class: ['cn-dot', f === HEADS ? 'h' : f === EDGE ? 'e' : 't', latest && i === list.length - 1 && 'latest'], attrs: { title: FACES[f].name } })),
    );
    if (!legend) return dots;
    return h('div', { class: 'cn-dots-wrap' }, dots, h('div', { class: 'cn-dots-legend' }, '● 正　○ 反'));
  }

  /** 抽屉里的小骰子 */
  function miniDiceNode(values, sides) {
    const row = h('div', { class: 'cn-mini-row' });
    for (const v of values) {
      if (sides === 6) {
        const d = h('span', { class: 'cn-mini' });
        for (const [r, c] of PIP_LAYOUT[v]) d.append(h('i', { class: 'cn-pip', style: { gridRow: r, gridColumn: c } }));
        row.append(d);
      } else {
        row.append(h('span', { class: 'cn-mini cn-n' }, String(v)));
      }
    }
    row.append(h('span', { class: 'cn-mini-sum' }, `= ${values.reduce((x, y) => x + y, 0)}`));
    return row;
  }

  /* ---------- 实物：一枚硬币 ---------- */
  function makeCoin() {
    const edges = [];
    for (let i = -3; i <= 3; i++) edges.push(h('div', { class: 'cn-edge', style: { transform: `translateZ(${i}px)` } }));
    const chars = Object.entries(COIN_INSCRIPTION).map(([pos, ch]) => h('span', { class: ['cn-ch', 'cn-at-' + pos] }, ch));
    const optAEl = h('div', { class: 'cn-opt' });
    const optBEl = h('div', { class: 'cn-opt' });
    const heads = h('div', { class: 'cn-face cn-heads' }, h('div', { class: 'cn-rim' }), h('div', { class: 'cn-hole' }), chars, optAEl);
    const tails = h('div', { class: 'cn-face cn-tails' }, h('div', { class: 'cn-rim' }), flowerSvg(), optBEl);
    const body = h('div', { class: 'cn-coin' }, edges, heads, tails);
    const wrap = h('div', { class: 'cn-coin-wrap' }, body);
    const shadow = h('div', { class: 'cn-coin-shadow' });
    const el = h('div', { class: 'cn-coin-zone' }, shadow, wrap);

    let angle = 0; // 当前静止角度（0 正 / 180 反 / 90 立）
    let wob = 0; // 落地后的轻微歪斜
    let anims = [];
    const cancelAll = () => {
      for (const a of anims) a.cancel();
      anims = [];
    };
    const setBase = () => {
      body.style.transform = `rotateX(${angle}deg) rotateZ(${wob}deg)`;
      wrap.style.transform = '';
      shadow.style.transform = '';
      shadow.style.opacity = '';
    };
    setBase();

    /** Airborne tumble, rebound, then a long roll before the face settles. */
    async function fly(face, intensity = 20, { quick = false, spins: forced } = {}) {
      cancelAll();
      el.classList.remove('standing');
      const power = powerOf(intensity);
      const spins = forced ?? Math.max(3, Math.round(spinsForIntensity(intensity) * 0.65));
      const dur = reduce ? 1 : quick ? 2400 : Math.round(3300 + power * 420);
      const clearance = st.el.clientHeight - 46 - el.offsetHeight - 68;
      const height = Math.max(26, Math.min(quick ? 85 : 100 + power * 16, clearance));
      const target = flipAngle(face, spins);
      const nextWob = (rng.random() - 0.5) * 12;
      const wrapFrames = [], bodyFrames = [], shadowFrames = [];
      for (let i = 0; i <= 100; i++) {
        const t = reduce ? 1 : i / 100;
        const p = coinPose(t, { start: angle, target, height, wobble: wob, endWobble: nextWob });
        wrapFrames.push({ transform: `translate(${p.x}px,${p.y}px)`, offset: i / 100 });
        bodyFrames.push({ transform: `rotateX(${p.rx}deg) rotateY(${p.ry}deg) rotateZ(${p.rz}deg)`, offset: i / 100 });
        shadowFrames.push({ transform: `translateX(${p.x}px) scale(${p.shadowScale})`, opacity: p.shadowOpacity, offset: i / 100 });
      }
      sound.play('coin'); sound.play('whoosh', { delay: 0.02 }); haptic.release();
      anims = [
        ritual.track(wrap.animate(wrapFrames, { duration: dur, fill: 'forwards', easing: 'linear' })),
        ritual.track(body.animate(bodyFrames, { duration: dur, fill: 'forwards', easing: 'linear' })),
        ritual.track(shadow.animate(shadowFrames, { duration: dur, fill: 'forwards', easing: 'linear' })),
      ];
      el.dataset.phase = 'flight'; delete el.dataset.face;
      let previous = 0;
      const cues = [...COIN_IMPACTS.map((t, i) => ({ t, i })), { t: COIN_SETTLING, settle: true }].sort((a, b) => a.t - b.t);
      for (const cue of cues) {
        if (!await wait(dur * (cue.t - previous))) return;
        if (cue.settle) {
          el.dataset.phase = 'settling'; ritual.step(2); st.setHint('币沿还在晃，等它倒向最后一面');
        } else {
          sound.play(cue.i ? 'tick' : 'coin'); haptic.impact([1, .55, .25, .12][cue.i]);
          if (!cue.i) { el.dataset.phase = 'rolling'; st.setHint('轻弹，翻滚，慢慢停下来'); }
        }
        previous = cue.t;
      }
      if (!await wait(dur * (1 - previous) + 30)) return;
      await Promise.all(anims.map((a) => a.finished.catch(() => {})));
      if (!alive) return;
      angle = restAngle(face); wob = nextWob;
      cancelAll(); setBase();
      el.dataset.face = face; el.dataset.phase = 'settled'; haptic.settle();
      if (face === EDGE) el.classList.add('standing');
    }

    /** 二选一：两面写字（自动缩字）；传 null 恢复铸币面 */
    function setChoice(a, b) {
      const on = a != null;
      body.classList.toggle('choice', on);
      if (!on) return;
      for (const [node, text] of [
        [optAEl, a],
        [optBEl, b],
      ]) {
        const fit = fitFontSize(text);
        node.textContent = text;
        node.style.fontSize = fit.size + 'px';
        node.dataset.lines = fit.lines;
      }
    }

    function rest() {
      cancelAll();
      setBase();
      el.classList.remove('standing');
    }
    return { el, fly, setChoice, rest };
  }

  /** 花面纹样：八瓣莲纹 + 双环 + 点饰 */
  function flowerSvg() {
    const petals = [];
    const dots = [];
    for (let i = 0; i < 8; i++) {
      petals.push(`<path d="M0,-12 C-13,-24 -13,-42 0,-53 C13,-42 13,-24 0,-12Z" transform="rotate(${i * 45})"/>`);
      dots.push(`<circle cy="-46" r="2.2" transform="rotate(${22.5 + i * 45})"/>`);
    }
    return fromHTML(
      `<svg class="cn-flower" xmlns="http://www.w3.org/2000/svg" viewBox="-75 -75 150 150" aria-hidden="true">` +
        `<g class="cn-fl-ring"><circle r="61"/><circle r="56.5"/></g>` +
        `<g class="cn-fl-petals">${petals.join('')}</g>` +
        `<g class="cn-fl-dots">${dots.join('')}</g>` +
        `<circle class="cn-fl-core" r="9"/><circle class="cn-fl-core2" r="4"/>` +
        `</svg>`,
    );
  }

  /* ---------- 实物：骰子托盘 ---------- */
  function makeTray() {
    const disc = h('div', { class: 'cn-tray-disc' });
    const field = h('div', { class: 'cn-tray-field' });
    const el = h('div', { class: 'cn-tray' }, disc, field);
    let dice = [];
    let count = 0;
    let sides = 6;
    const half = DIE_SIZE / 2;

    function makeFace(f) {
      const face = h('div', { class: ['cn-df', 'cn-f' + f] });
      for (const [r, c] of PIP_LAYOUT[f]) face.append(h('span', { class: 'cn-pip', style: { gridRow: r, gridColumn: c } }));
      return face;
    }

    function setDieBase(d) {
      d.lift.style.transform = `translate3d(0, 0, ${half}px)`;
      d.cube.style.transform = `rotateX(${d.rot.rx}deg) rotateY(${d.rot.ry}deg)`;
      d.el.style.transform = `rotateZ(${d.zr}deg)`;
      d.shadow.style.transform = '';
      d.shadow.style.opacity = '';
    }

    function build() {
      kit.clear(field);
      dice = [];
      const slots = diceSlots(count, DIE_SIZE);
      for (const s of slots) {
        const cube = h('div', { class: 'cn-cube' });
        let value;
        if (sides === 20) {
          value = 1 + Math.floor(rng.random() * 20);
          cube.append(h('div', { class: 'cn-df cn-f20a' }, h('span', { class: 'cn-num' }, String(value))), h('div', { class: 'cn-df cn-f20b' }, h('span', { class: 'cn-num' }, String(21 - value))));
        } else {
          value = 1 + Math.floor(rng.random() * 6);
          for (let f = 1; f <= 6; f++) cube.append(makeFace(f));
        }
        const lift = h('div', { class: 'cn-lift' }, h('div', { class: 'cn-up' }, cube));
        const shadow = h('div', { class: 'cn-dshadow' });
        const jx = (rng.random() - 0.5) * 8;
        const jy = (rng.random() - 0.5) * 8;
        const dieEl = h('div', { class: ['cn-die', sides === 20 && 'cn-d20'], style: { left: s.x + jx + 'px', top: s.y + jy + 'px' } }, shadow, lift);
        field.append(dieEl);
        const d = { el: dieEl, lift, cube, shadow, rot: sides === 20 ? { rx: 0, ry: 0 } : diceRotation(value), zr: sides === 20 ? 0 : (rng.random() - 0.5) * 50, value, anims: [] };
        setDieBase(d);
        dice.push(d);
      }
    }

    function setDice(n, s) {
      if (n === count && s === sides && dice.length) return;
      count = n;
      sides = s;
      build();
    }

    async function rollOne(d, value, power, dur, delay) {
      if (delay && !await wait(delay)) return;
      if (!alive) return;
      for (const a of d.anims) a.cancel();
      d.anims = [];
      const target = sides === 20 ? { rx: 0, ry: 0 } : diceRotation(value);
      const sign = () => rng.random() < .5 ? 1 : -1;
      const opts = {
        start: d.rot, target: { rx: target.rx + 360 * (2 + Math.round(power)) * sign(), ry: target.ry + 360 * (2 + Math.round(power)) * sign() },
        power, half, driftX: (rng.random() - .5) * 54, driftY: -16 - rng.random() * 16,
        startZ: d.zr, endZ: sides === 20 ? 0 : (rng.random() - .5) * 55,
      };
      const liftFrames = [], cubeFrames = [], turnFrames = [], shadowFrames = [];
      for (let i = 0; i <= 150; i++) {
        const offset = i / 150, p = dicePose(reduce ? 1 : offset, opts);
        liftFrames.push({ offset, transform: `translate3d(${p.x}px,${p.y}px,${p.z}px)` });
        cubeFrames.push({ offset, transform: `rotateX(${p.rx}deg) rotateY(${p.ry}deg)` });
        turnFrames.push({ offset, transform: `rotateZ(${p.rz}deg)` });
        shadowFrames.push({ offset, transform: `translate(${p.x}px,${p.y}px) scale(${p.shadowScale})`, opacity: p.shadowOpacity });
      }
      d.el.dataset.phase = 'flight'; delete d.el.dataset.value;
      const numbers = d.cube.querySelectorAll('.cn-num');
      // The simplified D20 has two drawn faces. Change those numbers while it is
      // tumbling, then fix both faces before the final edge hesitation.
      numbers.forEach((node, i) => { node.textContent = String(i ? 21 - value : value); });
      d.anims = [[d.lift, liftFrames], [d.cube, cubeFrames], [d.el, turnFrames], [d.shadow, shadowFrames]].map(([el, frames]) => ritual.track(el.animate(frames, { duration: dur, fill: 'forwards', easing: 'linear' })));
      const cues = [...DICE_IMPACTS.map((t, i) => ({ t, i })), { t: DICE_SETTLING, settle: true }].sort((a, b) => a.t - b.t);
      let previous = 0;
      for (const cue of cues) {
        if (!await wait(dur * (cue.t - previous))) return;
        if (cue.settle) {
          d.el.dataset.phase = 'settling'; ritual.step(2); st.setHint('还倚在棱边，等最后一下');
        } else {
          sound.play(cue.i ? 'tick' : 'thud'); haptic.impact([1, .6, .3, .25, .1][cue.i]);
          if (!cue.i) d.el.dataset.phase = 'rolling';
        }
        previous = cue.t;
      }
      if (!await wait(dur * (1 - previous))) return;
      await Promise.all(d.anims.map((a) => a.finished.catch(() => {})));
      if (!alive) return;
      d.rot = target; d.zr = opts.endZ; d.value = value;
      for (const a of d.anims) a.cancel();
      d.anims = []; setDieBase(d);
      d.el.dataset.phase = 'settled'; d.el.dataset.value = String(value);
    }

    async function roll(values, intensity = 20) {
      const power = powerOf(intensity);
      const dur = reduce ? 10 : Math.round(3200 + power * 420);
      haptic.release();
      await Promise.all(dice.map((d, i) => rollOne(d, values[i] ?? values[0], power, dur, reduce ? 0 : i * 110)));
      if (alive) haptic.settle();
    }

    function rest() {
      for (const d of dice) {
        for (const a of d.anims) a.cancel();
        d.anims = [];
        setDieBase(d);
      }
    }
    return { el, setDice, roll, rest };
  }

  /* ---------- 卸载 ---------- */
  return () => {
    alive = false;
    coin.rest();
    tray.rest();
    if (openSheetRef) openSheetRef.close();
  };
}
