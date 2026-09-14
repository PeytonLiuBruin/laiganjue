import { hingeMotion } from '../../core/hinge-motion.js';
// 塔罗 · 界面（Web DOM）。所有逻辑在 core.js，所有文案在 data.js。
// 流程：洗牌（摇 / 摩擦牌堆 / 按钮）→ 抽牌（甩 / 向上快滑 / 主按钮）→ 翻牌（点牌 / 按钮）→ 全部翻开 → 解读抽屉。
import { initSession, shuffleSession, drawNext, flipCard, isFull, allFlipped, isDone, getSpread, SPREADS, synthesize, keywordsOf, meaningOf, sealFor, shareText, cardById, analyze } from './core.js';
import { SUITS, SUIT_VERSES, SPREAD_VERSES, TEXT } from './data.js';
import { createCardArt } from './cards.js';
import { hashString } from '../../core/rng.js';
import { createRitual } from '../../ui/ritual.js';

const PILE_N = 6;
const BRIGHT = new Set(['M19', 'M17', 'M21']); // 太阳 星星 世界：正位撒花
const HEAVY = new Set(['M16', 'M15', 'M13']); // 高塔 恶魔 死神：正位低音 + 震颤

export function mount(container, ctx) {
  const { kit, haptic, sound, storage, rng } = ctx;
  const { h, button, chips, stage, hint, resultCard, sheet, input, toast, confetti } = kit;
  const reduce = ctx.platform.simpleMotion;
  const D = (ms) => (reduce ? Math.max(100, ms * .55) : ms);
  const { backArt, frontArt, makeCard, slotOrnament } = createCardArt(kit);

  /* ---------- 状态 ---------- */
  let spreadId = storage.get('spread', 'single');
  if (!SPREADS.some((s) => s.id === spreadId)) spreadId = 'single';
  let session = initSession(spreadId, rng.random);
  let busy = false;
  let flippingAll = false;
  let question = '';
  let history = storage.get('history', []);
  let resultSheet = null;
  let cardEls = []; // draw index → { el, spin, inner, front, off }
  let slots = []; // { wrap, slot, label }
  let pileJitter = makeJitter(0.4);
  let rubAcc = 0;
  let lastRubAt = 0;
  let lastMotionAt = 0;
  let histOff = null;

  /* ---------- 头部：问题 + 牌阵 ---------- */
  const qInput = input({ placeholder: TEXT.questionPlaceholder, maxlength: 40, onInput: (v) => (question = v.trim()) });
  const spreadChips = chips(
    SPREADS.map((s) => ({ value: s.id, label: s.name })),
    {
      value: spreadId,
      onChange: (v) => {
        if (busy || flippingAll) {
          spreadChips.set(spreadId);
          toast(TEXT.busy);
          return;
        }
        spreadId = v;
        storage.set('spread', v);
        renderSpread();
        reset({ silent: true });
        haptic.tap();
        sound.play('tick');
      },
    },
  );

  /* ---------- 舞台：牌桌 = 牌位 + 牌堆 ---------- */
  const st = stage({ cls: 'tr-stage', hint: TEXT.stageHintIdle, badge: '', minHeight: 300 });
  const spreadEl = h('div', { class: 'tr-spread' });
  const pile = h('div', { class: 'tr-pile' }, h('div', { class: 'tr-pile-shadow' }));
  const pileCards = [];
  for (let i = 0; i < PILE_N; i++) {
    const pc = h('div', { class: 'tr-pile-card' }, backArt());
    pileCards.push(pc);
    pile.append(pc);
  }
  const countEl = h('div', { class: 'tr-deck-count' }, TEXT.shuffledTimes(0));
  const deckZone = h('div', { class: 'tr-deck-zone', attrs: { role: 'button', tabindex: '0', 'aria-label': '牌堆：摩擦洗牌，向上滑动抽牌，长按切牌' }, onKeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); doPrimary(); } } }, pile, countEl);
  const table = h('div', { class: 'tr-table' }, spreadEl, deckZone);
  const layer = h('div', { class: 'tr-layer' });
  st.scene.append(table, layer);
  const ritual = createRitual(ctx, st, ['洗牌', '抽牌', '翻牌', '解读']);
  const wait = ritual.pause;
  qInput.placeholder = '想从牌中了解什么？（选填）';
  qInput.setAttribute('aria-label', '想问塔罗的问题');
  applyPileRest();

  /* ---------- 提示 / 操作 / 历史 ---------- */
  const hintWrap = h('div', { class: 'tr-hint' });
  const setHintRow = (g, text) => {
    kit.clear(hintWrap);
    hintWrap.append(hint(g, text));
  };
  const shuffleBtn = button(TEXT.btnShuffle, {
    variant: 'ghost',
    icon: 'refresh',
    onClick: () => {
      ctx.ensureMotion && ctx.ensureMotion();
      doShuffle(18);
    },
  });
  const primaryBtn = button(TEXT.btnDraw, { variant: 'primary', size: 'large', primary: true, onClick: () => doPrimary() });
  const resetBtn = button(TEXT.btnReset, { variant: 'ghost', onClick: () => reset() });
  const actions = h('div', { class: 'tr-actions' }, shuffleBtn, primaryBtn, resetBtn);
  const histWrap = h('div', { class: 'tr-history' });

  container.append(ritual.progress, h('div', { class: 'tr-top' }, qInput, h('div', { class: 'mt-3' }, spreadChips.el)), h('div', { class: 'mt-4' }, st.el), hintWrap, actions, ritual.receipt, histWrap);

  renderSpread();
  updateCount();
  setHintRow('shake', TEXT.hintIdle);
  setButtons();
  renderHistory();

  /* ---------- 体感 / 手势 ---------- */
  ctx.motion.onShake(async (e) => { if (busy || flippingAll || resultSheet) return; if (session.draws.length) await reset(); if (ritual.alive) doShuffle(e.intensity); });
  ctx.motion.onToss(async (e) => { if (busy || flippingAll || resultSheet) return; if (isDone(session)) await reset(); doPrimary(true, e.intensity); });
  ctx.gesture.flick(
    deckZone,
    (g) => {
      rubAcc = 0;
      doPrimary(true, g.intensity);
    },
    { minSpeed: 0.45, direction: 'up' },
  );
  ctx.gesture.rub(deckZone, ({ distance }) => {
    const now = Date.now();
    if (now - lastRubAt > 600) rubAcc = 0;
    lastRubAt = now;
    rubAcc += distance;
    if (rubAcc > 380 && !busy) {
      rubAcc = 0;
      doShuffle(16);
    }
  });
  ctx.gesture.longPress(deckZone, () => doCut(), { ms: 550 });
  ctx.gesture.drag(deckZone, {
    onMove(g) {
      if (busy || isFull(session) || resultSheet || reduce) return;
      if (Math.abs(g.dy) > Math.abs(g.dx)) pile.style.transform = `translate(${Math.max(-16, Math.min(16, g.dx / 4))}px, ${Math.max(-38, Math.min(8, g.dy / 3))}px) rotate(${Math.max(-6, Math.min(6, g.dx / 16))}deg)`;
    },
    onEnd() { pile.style.transform = ''; },
  });
  ctx.motion.onTilt(kit.parallax(spreadEl, { max: 5 }));
  // 实时抖动：手机轻晃时牌堆跟着颤（节流）
  ctx.motion.onMotion(({ mag, ax, ay }) => {
    const t = Date.now();
    if (busy || resultSheet || isFull(session) || reduce || mag < 5 || t - lastMotionAt < 90) return;
    lastMotionAt = t;
    pile.style.transform = `translate(${Math.max(-10, Math.min(10, -(ax || 0) * .5))}px, ${Math.max(-8, Math.min(8, -(ay || 0) * .4))}px)`;
    ctx.setTimeout(() => (pile.style.transform = ''), 110);
  });

  /* ---------- 牌阵渲染 ---------- */
  function renderSpread() {
    const spread = getSpread(spreadId);
    kit.clear(spreadEl);
    slots = spread.positions.map((pos) => {
      const slot = h('div', { class: 'tr-slot' }, slotOrnament());
      const label = h('div', { class: 'tr-slot-label' }, pos.label);
      const wrap = h('div', { class: 'tr-slot-wrap' }, slot, label);
      spreadEl.append(wrap);
      return { wrap, slot, label };
    });
    const n = spread.positions.length;
    table.dataset.n = String(n);
    st.el.style.removeProperty('min-height');
    table.classList.remove('unveiled');
  }

  function updateCount() {
    table.classList.toggle('has-draws', session.draws.length > 0);
    table.classList.toggle('is-full', isFull(session));
    const spread = getSpread(spreadId);
    countEl.textContent = TEXT.shuffledTimes(session.shuffles);
    const d = new Date();
    st.setBadge(spread.daily ? `${spread.name} · ${d.getMonth() + 1}月${d.getDate()}日` : `${spread.name} · ${TEXT.shuffledTimes(session.shuffles)}`);
  }

  function setButtons() {
    const spread = getSpread(spreadId);
    let label;
    if (!isFull(session)) label = spread.daily ? TEXT.btnDrawDaily : TEXT.btnDraw;
    else if (!allFlipped(session)) label = TEXT.btnFlip;
    else label = TEXT.btnRead;
    primaryBtn.setLabel(label);
    primaryBtn.disabled = busy || flippingAll;
    shuffleBtn.disabled = busy || flippingAll || session.draws.length > 0;
    resetBtn.disabled = busy || flippingAll;
    qInput.disabled = busy || flippingAll;
    spreadChips.el.querySelectorAll('button').forEach((b) => { b.disabled = busy || flippingAll; });
  }

  /* ---------- 主按钮 / 甩 / 快滑：做"下一步" ---------- */
  function doPrimary(fromGesture = false, intensity = 20) {
    if (busy || flippingAll || resultSheet || !ritual.alive) return;
    if (!isFull(session)) return doDraw(intensity);
    if (!allFlipped(session)) return flipAll();
    if (!fromGesture) return showResult(spreadId, session.draws, { question });
  }

  /* ---------- 洗牌 ---------- */
  async function doShuffle(intensity = 20) {
    if (busy || resultSheet || !ritual.alive) return;
    if (session.draws.length) { toast('这组牌抽取后，可以完成翻牌再重新洗牌'); return; }
    busy = true;
    setButtons();
    if (!await ritual.focus()) return;
    ritual.step(0);
    session = shuffleSession(session, rng.random);
    sound.play('shake');
    haptic.rattle();
    const power = Math.max(0.7, Math.min(1.6, intensity / 20));
    const before = pileJitter;
    pileJitter = makeJitter(1);
    const anims = pileCards.map((pc, i) => {
      const s1 = scatter(power, i);
      const s2 = scatter(power * 0.7, i);
      return ritual.animate(
        pc,
        [
          { transform: pileRest(i, before), offset: 0 },
          { transform: `translate(${s1.x}px, ${s1.y}px) rotate(${s1.r}deg)`, offset: 0.32, easing: 'cubic-bezier(.2,.8,.3,1)' },
          { transform: `translate(${s2.x}px, ${s2.y}px) rotate(${s2.r}deg)`, offset: 0.62, easing: 'cubic-bezier(.4,0,.6,1)' },
          { transform: pileRest(i, pileJitter), offset: 1 },
        ],
        { duration: D(1450 + i * 45), easing: 'cubic-bezier(.3,.6,.3,1)' },
      );
    });
    sound.play('rattle', { delay: 0.42 });
    await Promise.all(anims);
    if (!ritual.alive) return;
    applyPileRest();
    haptic.tap();
    updateCount();
    if (session.shuffles === 7) {
      toast(TEXT.shuffleLucky);
      sound.play('chime');
    }
    if (!isFull(session)) st.setHint(getSpread(spreadId).daily ? TEXT.stageHintDaily : TEXT.stageHintShuffled);
    busy = false;
    setButtons();
  }

  /** 切牌（长按牌堆）：上下两半错开再换位 */
  async function doCut() {
    if (busy || resultSheet || !ritual.alive) return;
    if (session.draws.length) { toast('这组牌抽取后，可以完成翻牌再重新洗牌'); return; }
    busy = true;
    setButtons();
    if (!await ritual.focus()) return;
    ritual.step(0);
    session = shuffleSession(session, rng.random);
    sound.play('paper');
    haptic.double();
    const half = Math.floor(PILE_N / 2);
    const shift = 62;
    const shifted = pileCards.map((_, i) => `translate(${i < half ? -shift : shift}px, ${i < half ? 6 : -6}px) rotate(${i < half ? -4 : 4}deg)`);
    await Promise.all(pileCards.map((pc, i) => ritual.animate(pc, [{ transform: pileRest(i, pileJitter) }, { transform: shifted[i] }], { duration: D(440) })));
    if (!ritual.alive) return;
    pileCards.forEach((pc, i) => {
      pc.getAnimations().forEach((a) => a.cancel());
      pc.style.transform = shifted[i];
    });
    // 换位：把下半叠移到最上面（DOM 顺序 = 叠放顺序）
    for (let i = 0; i < half; i++) pile.append(pileCards[i]);
    pileCards.push(...pileCards.splice(0, half));
    pileJitter = makeJitter(0.8);
    await Promise.all(pileCards.map((pc, i) => ritual.animate(pc, [{ transform: pc.style.transform }, { transform: pileRest(i, pileJitter) }], { duration: D(520), easing: 'cubic-bezier(.2,.9,.3,1)' })));
    if (!ritual.alive) return;
    applyPileRest();
    sound.play('clack');
    haptic.medium();
    updateCount();
    toast(TEXT.cutDone);
    busy = false;
    setButtons();
  }

  /* ---------- 抽牌：顶牌飞向下一个空牌位 ---------- */
  async function doDraw(intensity = 20) {
    if (busy || isFull(session)) return;
    busy = true;
    setButtons();
    st.setHint('');
    if (!await ritual.focus()) return;
    ritual.step(1);
    const idx = session.draws.length;
    session = drawNext(session, rng.random, { reversedRate: 0.3 });
    const draw = session.draws[idx];
    if (!draw) {
      busy = false;
      setButtons();
      return;
    }
    const c = makeCard(draw.card);
    if (draw.reversed) c.spin.style.transform = 'rotate(180deg)';
    cardEls[idx] = c;
    sound.play('whoosh');
    haptic.light();
    // 牌堆被"抽走一张"：轻轻一沉
    ritual.animate(pile, [{ transform: 'translateY(0)' }, { transform: 'translateY(3px) scale(.985)' }, { transform: 'translateY(0)' }], { duration: D(320) }).then((a) => a && a.cancel());
    await flyTo(c, slots[idx].slot, intensity);
    if (!ritual.alive) return;
    sound.play('paper');
    haptic.medium();
    slots[idx].wrap.classList.add('filled');
    updateCount();
    let draggingCard = false;
    c.off = ctx.gesture.drag(c.el, {
      onStart() { draggingCard = !busy; if (draggingCard) haptic.tap(); },
      onMove(g) {
        if (!draggingCard || session.draws[idx]?.flipped) return;
        c.inner.style.transform = `rotateY(${Math.min(78, Math.abs(g.dx) * 1.1 + Math.max(0, -g.dy) * 0.6)}deg)`;
      },
      onEnd(g) {
        if (!draggingCard) return; draggingCard = false;
        if (g.cancelled) { if (!session.draws[idx]?.flipped) c.inner.style.transform = 'rotateY(0deg)'; return; }
        onCardTap(idx);
      },
    });
    c.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCardTap(idx); } });
    busy = false;
    if (isFull(session)) {
      ritual.step(2);
      st.setHint('轻触牌背，或拖动牌面翻开');
      setHintRow('flip', TEXT.hintFlip);
    } else {
      setHintRow('flick', TEXT.hintDraw);
    }
    setButtons();
  }

  async function flyTo(c, slotEl, intensity = 20) {
    const lr = layer.getBoundingClientRect();
    const from = pile.getBoundingClientRect();
    const to = slotEl.getBoundingClientRect();
    const el = c.el;
    el.style.left = from.left - lr.left + 'px';
    el.style.top = from.top - lr.top + 'px';
    el.style.width = from.width + 'px';
    el.style.height = from.height + 'px';
    layer.append(el);
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const power = Math.max(.7, Math.min(1.5, intensity / 20));
    const rot = (rng.random() - 0.5) * 18 * power;
    await ritual.animate(
      el,
      Array.from({ length: 61 }, (_, i) => {
        const t = i / 60, u = 1 - (1-t)**3, lift = Math.sin(u*Math.PI)*25*power;
        return { offset: t, transform: `translate(${dx*u}px, ${dy*u-lift}px) rotate(${rot*Math.sin(u*Math.PI)}deg) scale(${1+Math.sin(u*Math.PI)*.035})` };
      }),
      { duration: D(1250 + 180 * power), easing: 'linear' },
    );
    if (!ritual.alive) return;
    // 落地：归位到牌位内，由布局接管
    el.getAnimations().forEach((a) => a.cancel());
    el.style.cssText = '';
    slotEl.append(el);
    el.classList.add('placed');
  }

  /* ---------- 翻牌 ---------- */
  function onCardTap(idx) {
    if (flippingAll || busy || resultSheet || !ritual.alive) return;
    const d = session.draws[idx];
    if (!d) return;
    if (!d.flipped) return doFlip(idx);
    if (isDone(session)) showResult(spreadId, session.draws, { question });
  }

  async function doFlip(idx) {
    if (busy || resultSheet || !ritual.alive) return;
    const d = session.draws[idx];
    const c = cardEls[idx];
    if (!d || d.flipped || !c) return;
    busy = true;
    setButtons();
    if (!await ritual.focus()) return;
    ritual.step(2);
    session = flipCard(session, idx);
    if (d.reversed) { c.spin.style.transform = 'rotate(180deg)'; c.el.classList.add('reversed'); }
    sound.play('flip');
    haptic.light();
    await ritual.animate(
      c.inner,
      hingeMotion((parseFloat(c.inner.style.transform.match(/rotateY\(([-.\d]+)/)?.[1]) || 0) * Math.PI / 180).map(({offset,angle,lift}) => ({ offset, transform: `translateZ(${lift}px) rotateY(${angle*180/Math.PI}deg)` })),
      { duration: D(1900), easing: 'linear' },
    );
    if (!ritual.alive) return;
    c.inner.getAnimations().forEach((a) => a.cancel());
    c.inner.style.transform = 'rotateY(180deg)';
    c.el.classList.add('flipped');
    if (!ritual.alive) return;
    c.el.setAttribute('aria-label', `${d.card.name}，${d.reversed ? '逆位' : '正位'}，点击查看解读`);
    slots[idx].label.textContent = `${getSpread(spreadId).positions[idx].label} · ${d.reversed ? '逆位' : '正位'}`;
    haptic.settle();
    omen(d);
    if (isDone(session)) await onAllFlipped();
    busy = false;
    setButtons();
  }

  async function flipAll() {
    if (flippingAll) return;
    flippingAll = true;
    setButtons();
    for (let i = 0; i < session.draws.length; i++) {
      if (!ritual.alive) return;
      if (session.draws[i].flipped) continue;
      await doFlip(i);
      if (!isDone(session)) await wait(D(650));
    }
    flippingAll = false;
    setButtons();
  }

  /** 特殊牌的小彩蛋 */
  function omen(d) {
    if (d.reversed) return;
    if (BRIGHT.has(d.card.id)) {
      sound.play('chime', { delay: 0.05 });
      haptic.success();
      confetti(st.el, { count: 44, origin: { x: 0.5, y: 0.4 } });
    } else if (HEAVY.has(d.card.id)) {
      sound.play('low', { delay: 0.05 });
      haptic.heavy();
      if (!reduce) {
        st.el.classList.remove('quake');
        void st.el.offsetWidth;
        st.el.classList.add('quake');
      }
    }
  }

  async function onAllFlipped() {
    sound.play('shimmer');
    haptic.success();
    st.setHint(TEXT.stageHintDone);
    setHintRow('tap', TEXT.hintDone);
    const stats = analyze(session.draws);
    if (stats.n === 3 && stats.majors === 3) toast(TEXT.allMajors);
    saveHistory();
    if (!await ritual.pause(reduce ? 180 : 1000)) return;
    table.classList.add('unveiled');
    const d = session.draws[0];
    ritual.reveal({ kicker: session.draws.length === 1 ? keywordsOf(d).join(' · ') : '牌阵已展开', title: session.draws.length === 1 ? '这一刻的提示' : getSpread(spreadId).name, text: session.draws.length === 1 ? meaningOf(d).split('。')[0] + '。' : synthesize(spreadId, session.draws).split('。')[0] + '。' });
    st.setHint('牌面会留在这里，准备好后再展开解读');
    setButtons();
  }

  /* ---------- 结果抽屉 ---------- */
  function showResult(sid, draws, { question: q = '', replay = false } = {}) {
    if (busy || flippingAll || resultSheet || !ritual.alive) return;
    ritual.step(3);
    const spread = getSpread(sid);
    const single = draws.length === 1;
    const stats = analyze(draws);
    const d0 = draws[0];
    const now = new Date();
    const kicker = spread.daily ? `${spread.name} · ${now.getMonth() + 1}月${now.getDate()}日` : spread.name;
    const title = single ? d0.card.name : spread.name;
    const sub = single ? d0.card.en : spread.en;
    let badge;
    if (single) {
      const pos = d0.reversed ? TEXT.reversed : TEXT.upright;
      badge = d0.card.arcana === 'major' ? `${pos} · 大阿卡纳 ${d0.card.roman}` : `${pos} · ${SUITS[d0.card.suit].name} · ${d0.card.element}`;
    } else {
      badge = `大牌 ${stats.majors} · 逆位 ${stats.reversed}`;
    }
    const verse = single ? verseFor(d0) : pickStable(SPREAD_VERSES[sid] || SPREAD_VERSES.single, draws);
    const sections = [];
    if (q) sections.push({ label: TEXT.questionLabel, text: q });
    draws.forEach((d, i) => sections.push({ label: spread.positions[i] ? spread.positions[i].label : `第 ${i + 1} 张`, node: readNode(d, spread.positions[i], { detail: single }), stack: true }));
    sections.push({ label: TEXT.synthesisLabel, text: synthesize(sid, draws) });
    const card = resultCard({ kicker, title, sub, badge, seal: sealFor(sid, draws), verse, sections, footer: TEXT.footer });
    const wrap = h('div', { class: 'm-tarot tr-result' }, card);
    const actions = [
      button('回到牌面', {
        variant: 'primary',
        onClick: () => {
          sh.close();
          ritual.step(2);
        },
      }),
      button(TEXT.btnShare, {
        variant: 'ghost',
        icon: 'share',
        onClick: async () => {
          const r = await ctx.share(shareText(sid, draws, { question: q }));
          toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制到剪贴板' : '分享失败');
        },
      }),
    ];
    const sh = sheet({ title: TEXT.sheetTitle, content: wrap, actions, onClose: () => (resultSheet = null) });
    resultSheet = sh;
    sh.open();
  }

  /** 单张牌的解读排版：小牌面缩略 + 名称 / 关键词 / 解读（大牌单张时附 爱情 / 事业 / 建议） */
  function readNode(d, pos, { detail = false } = {}) {
    const card = d.card;
    const thumb = h('div', { class: ['tr-thumb', d.reversed && 'reversed'] }, frontArt(card));
    const name = h(
      'div',
      { class: 'tr-read-name' },
      h('span', null, card.name),
      h('span', { class: ['tr-tag', d.reversed && 'rev'] }, d.reversed ? TEXT.reversed : TEXT.upright),
      h('span', { class: 'tr-read-en' }, card.en),
    );
    const body = h('div', { class: 'tr-read-body' }, name, h('div', { class: 'tr-read-kw' }, keywordsOf(d).join(' · ')), h('p', { class: 'tr-read-text' }, meaningOf(d)));
    if (pos && pos.hint && !detail) body.insertBefore(h('div', { class: 'tr-read-meta' }, pos.hint), body.children[1]);
    if (card.arcana === 'major' && detail) {
      body.append(
        h(
          'div',
          { class: 'tr-read-more' },
          h('div', null, h('b', null, '爱情'), card.love),
          h('div', null, h('b', null, '事业'), card.career),
          h('div', null, h('b', null, '建议'), card.advice),
        ),
      );
    } else if (card.arcana === 'minor' && detail) {
      const s = SUITS[card.suit];
      body.append(h('div', { class: 'tr-read-meta' }, `${s.name} · ${s.element} · ${s.theme}`));
    }
    return h('div', { class: 'tr-read' }, thumb, body);
  }

  function verseFor(d) {
    const c = d.card;
    if (c.arcana === 'major') return c.verse;
    const band = c.rank <= 3 ? 0 : c.rank <= 7 ? 1 : c.rank <= 10 ? 2 : 3;
    return SUIT_VERSES[c.suit][band];
  }

  function pickStable(list, draws) {
    const seed = draws.map((d) => d.card.id + (d.reversed ? 'r' : 'u')).join(',');
    return list[hashString(seed) % list.length];
  }

  /* ---------- 历史 ---------- */
  function saveHistory() {
    history = history
      .concat([{ t: Date.now(), spread: spreadId, cards: session.draws.map((d) => ({ id: d.card.id, r: d.reversed ? 1 : 0 })) }])
      .slice(-8);
    storage.set('history', history);
    renderHistory();
  }

  function renderHistory() {
    kit.clear(histWrap);
    if (!history.length) return;
    const list = h('div', { class: 'tr-hist-list' });
    for (const item of history.slice().reverse()) {
      const spread = getSpread(item.spread);
      const draws = item.cards.map((c) => ({ card: cardById(c.id), reversed: !!c.r })).filter((d) => d.card);
      if (!draws.length) continue;
      const parts = [h('b', null, spread.name)];
      draws.forEach((d, i) => {
        parts.push(i ? ' · ' : '：', d.card.name, d.reversed ? h('sup', null, '逆') : null);
      });
      list.append(h('button', { type: 'button', class: 'tr-hist', onClick: () => showResult(item.spread, draws, { replay: true }) }, parts));
    }
    const head = h('div', { class: 'tr-hist-head' }, TEXT.historyHead);
    histWrap.append(head, list);
    // 长按标题清空（只在标题上监听，不影响页面滚动）
    if (histOff) histOff();
    histOff = ctx.gesture.longPress(head, () => {
      if (!history.length) return;
      history = [];
      storage.remove('history');
      renderHistory();
      haptic.double();
      toast(TEXT.historyCleared);
    });
  }

  /* ---------- 重来 ---------- */
  async function reset({ silent = false } = {}) {
    if (busy || flippingAll || !ritual.alive) return;
    ritual.clear(); ritual.step(0); table.classList.remove('unveiled');
    if (resultSheet) resultSheet.close();
    const cards = cardEls.filter(Boolean);
    if (cards.length && !silent && !reduce) {
      busy = true;
      setButtons();
      const pr = pile.getBoundingClientRect();
      await Promise.all(
        cards.map((c, i) => {
          const r = c.el.getBoundingClientRect();
          return ritual.animate(
            c.el,
            [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${pr.left - r.left}px, ${pr.top - r.top}px) scale(.96) rotate(${(i - 1) * 6}deg)`, opacity: 0 }],
            { duration: 360 + i * 40, easing: 'cubic-bezier(.5,0,.3,1)' },
          );
        }),
      );
      busy = false;
    }
    if (!ritual.alive) return;
    for (const c of cards) {
      c.off && c.off();
      c.el.remove();
    }
    cardEls = [];
    session = initSession(spreadId, rng.random);
    slots.forEach((s, i) => { s.wrap.classList.remove('filled'); s.label.textContent = getSpread(spreadId).positions[i].label; });
    updateCount();
    st.setHint(getSpread(spreadId).daily ? TEXT.stageHintDaily : TEXT.stageHintIdle);
    setHintRow('shake', TEXT.hintIdle);
    setButtons();
    if (!silent) {
      haptic.tap();
      sound.play('flip');
    }
  }

  /* ---------- 牌堆姿态 ---------- */
  function makeJitter(scale) {
    return Array.from({ length: PILE_N }, () => ({ x: (rng.random() - 0.5) * 10 * scale, y: (rng.random() - 0.5) * 6 * scale, r: (rng.random() - 0.5) * 12 * scale }));
  }
  function pileRest(i, jit = pileJitter) {
    const j = jit[i];
    return `translate(${((i - 2.5) * 6 + j.x).toFixed(1)}px, ${(Math.abs(i - 2.5) * 2 - i * .8).toFixed(1)}px) rotate(${((i - 2.5) * 5 + j.r * .25).toFixed(1)}deg)`;
  }
  function applyPileRest() {
    if (!ritual.alive) return;
    pileCards.forEach((pc, i) => {
      pc.getAnimations().forEach((a) => a.cancel());
      pc.style.transform = pileRest(i);
    });
  }
  function scatter(power, i) {
    const dir = i % 2 ? 1 : -1;
    return { x: dir * (24 + rng.random() * 46) * power, y: (rng.random() - 0.5) * 60 * power, r: dir * (18 + rng.random() * 40) * power };
  }

  /* ---------- 卸载 ---------- */
  return () => {
    if (resultSheet) resultSheet.close();
    for (const c of cardEls) if (c) [c.el, c.inner, c.spin].forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    pileCards.forEach((pc) => pc.getAnimations().forEach((a) => a.cancel()));
  };
}
