import { createRitual } from '../../ui/ritual.js';
// 卢恩符文 · 界面（Web DOM）。逻辑在 core.js，文案在 data.js。
// 舞台：皮袋（摇动 / 倾倒）→ 符石滚落到麻布上的槽位（背面朝上）→ 点石翻面 → 全翻揭示。
// 三入口：体感（摇 / 甩）· 屏幕手势（摩擦皮袋 / 布上一划）· 主按钮。
import { getSpread, drawForSpread, interpret, shareText, initState, reduceState, packDraw, unpackDraw, RUNES, dateLabel } from './core.js';
import { SPREAD_CHIPS, UI_TEXT, AETTS, shakeLevel } from './data.js';
import { dateKey } from '../../core/rng.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const STONE_SIZE = { 1: 88, 3: 70, 5: 54 };

/** 符形 SVG（viewBox 0 0 100 160，直线描边）。逆位时旋转 180°。 */
function runeSvg(fromHTML, rune, { size = 32, reversed = false, cls = '' } = {}) {
  return fromHTML(
    `<svg xmlns="${SVG_NS}" viewBox="0 0 100 160" width="${size}" height="${Math.round(size * 1.6)}" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" class="rn-glyph${reversed ? ' rev' : ''}${cls ? ' ' + cls : ''}" aria-hidden="true"><path d="${rune.path}"/></svg>`,
  );
}

export function mount(container, ctx) {
  const { kit, haptic, sound, storage } = ctx;
  const { h, button, chips, stage, hint, resultCard, sheet, toast, confetti, historyBar, fromHTML, nextFrame } = kit;
  const reduce = !!ctx.platform.prefersReducedMotion;
  const T = (ms) => (reduce ? 1 : ms);
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const glyph = (rune, opts) => runeSvg(fromHTML, rune, opts);

  /* ---------- 状态 ---------- */
  let spreadId = storage.get('spread', 'single');
  let spread = getSpread(spreadId);
  spreadId = spread.id;
  let state = initState(spread.id);
  let busy = false;
  let lastModel = null;
  let revealing = false; // 防止两枚石头几乎同时翻完时重复揭示
  let stones = []; // { el, body, shadow, rune, reversed, tilt, flipped, flipAnim, off }
  let history = storage.get('history', []);
  container.dataset.rnTheme = ctx.theme;
  ctx.onTheme((t) => {
    container.dataset.rnTheme = t;
  });

  /* ---------- 顶部：牌阵 ---------- */
  const spreadChips = chips(SPREAD_CHIPS, {
    value: spreadId,
    onChange: async (v) => {
      if (busy) {
        spreadChips.set(spreadId);
        return;
      }
      spreadId = v;
      spread = getSpread(v);
      storage.set('spread', v);
      haptic.tap();
      sound.play('pop');
      if (stones.length) await collect({ silent: true });
      state = initState(spread.id);
      buildSlots();
      setPhaseUI();
    },
  });

  /* ---------- 舞台 ---------- */
  const st = stage({ cls: 'rn-stage', hint: UI_TEXT.hints.idle, badge: '', minHeight: 430 });
  const ritual = createRitual(ctx, st, ['摇袋', '出石', '翻面', '解读']);
  const wait = ritual.pause;
  const glow = h('div', { class: 'rn-glow' });

  // 皮袋
  const mouthPt = h('div', { class: 'rn-mouth-pt' });
  const bag = h(
    'div',
    { class: 'rn-bag' },
    h('div', { class: 'rn-bag-body' }, h('span', { class: 'rn-bag-stitch' }), h('span', { class: 'rn-bag-sheen' })),
    h('div', { class: 'rn-bag-neck' }),
    h('div', { class: 'rn-bag-mouth' }),
    h('div', { class: 'rn-cord' }, h('span', { class: 'rn-cord-knot' }), h('span', { class: 'rn-cord-tail t1' }), h('span', { class: 'rn-cord-tail t2' })),
    mouthPt,
  );
  const bagWrap = h('div', { class: 'rn-bag-wrap', attrs: { role: 'button', 'aria-label': '皮袋：摩擦或点击摸符' } }, h('div', { class: 'rn-bag-shadow' }), bag);

  // 布面 + 符石层（兄弟关系：手势互不干扰）
  const cloth = h('div', { class: 'rn-cloth', attrs: { 'aria-label': '麻布：一划全部翻开' } });
  const stoneLayer = h('div', { class: 'rn-stones' });
  const table = h('div', { class: 'rn-table' }, cloth, stoneLayer);
  st.scene.append(glow, table, bagWrap);

  /* ---------- 操作 ---------- */
  const primary = button(UI_TEXT.primary.idle(spread.n), {
    variant: 'primary',
    size: 'large',
    primary: true,
    onClick: async () => {
      if (busy) return;
      if (ctx.ensureMotion) ctx.ensureMotion().catch(() => {});
      if (state.phase === 'idle') doDraw(20);
      else if (state.phase === 'drawn') flipAll();
      else if (lastModel) showResult(lastModel);
    },
  });
  const resetBtn = button(UI_TEXT.reset, { variant: 'ghost', icon: 'refresh', disabled: true, onClick: () => !busy && collect() });
  const indexBtn = button(UI_TEXT.index, { variant: 'ghost', size: 'small', onClick: openIndex });
  const histEl = h('div', { class: 'rn-history' });

  container.append(
    h('div', { class: 'rn-top' }, spreadChips.el),
    h('div', { class: 'mt-4' }, st.el),
    hint('shake', UI_TEXT.gestureHint),
    kit.actionBar(primary, resetBtn),
    h('div', { class: 'rn-more' }, indexBtn),
    histEl,
  );
  buildSlots();
  setPhaseUI();
  renderHistory();

  /* ---------- 输入：体感 ---------- */
  ctx.motion.onShake((e) => onShakeInput(e.intensity));
  // Revealing a stone requires a deliberate tap or drag on the stone.
  // 实时微抖：传感器持续输入时皮袋跟着轻晃（节流）
  let lastMotion = 0;
  ctx.motion.onMotion((m) => {
    const t = now();
    if (t - lastMotion < 70) return;
    lastMotion = t;
    if (busy || !ritual.alive || state.phase !== 'idle') return;
    const k = Math.max(0, Math.min(1, ((m.smooth || 0) - 2) / 10));
    bagWrap.style.setProperty('--rn-jit', k < 0.03 ? '0deg' : `${Math.max(-8, Math.min(8, -(m.ax || 0) * .7))}deg`);
  });
  // 倾斜：舞台上的光斑跟着走
  let lastTilt = 0;
  ctx.motion.onTilt(({ beta, gamma }) => {
    const t = now();
    if (t - lastTilt < 60 || beta == null || gamma == null) return;
    lastTilt = t;
    const gx = 50 + Math.max(-1, Math.min(1, gamma / 35)) * 30;
    const gy = 28 + Math.max(-1, Math.min(1, (beta - 45) / 35)) * 22;
    glow.style.setProperty('--gx', gx.toFixed(1) + '%');
    glow.style.setProperty('--gy', gy.toFixed(1) + '%');
  });

  /* ---------- 输入：屏幕手势 ---------- */
  let rubAcc = 0;
  let rubTimer = null;
  let lastRattle = 0;
  ctx.gesture.rub(bagWrap, ({ intensity }) => {
    if (busy || state.phase === 'drawn') return;
    rubAcc += intensity;
    setShakeClass(intensity > 0.6 ? 3 : intensity > 0.3 ? 2 : 1);
    const t = now();
    if (t - lastRattle > 150) {
      lastRattle = t;
      sound.play('rattle');
      haptic.tap();
    }
    clearTimeout(rubTimer);
    rubTimer = ctx.setTimeout(() => {
      setShakeClass(0);
      rubAcc = 0;
    }, 260);
    if (rubAcc >= 1.6) {
      rubAcc = 0;
      clearTimeout(rubTimer);
      setShakeClass(0);
      const strength = 16 + Math.round(intensity * 14);
      (state.phase === 'revealed' ? collect({ silent: true }) : Promise.resolve()).then(() => doDraw(strength));
    }
  });
  ctx.gesture.tap(bagWrap, () => {
    if (busy) return;
    if (state.phase === 'idle') doDraw(16);
    else if (state.phase === 'revealed') collect({ silent: true }).then(() => doDraw(16));
    else {
      wobble(1);
      toast(UI_TEXT.toastFlipFirst);
    }
  });
  ctx.gesture.flick(cloth, () => onTossInput(), { direction: 'any', minSpeed: 0.4, minDist: 28 });

  function onShakeInput(intensity = 20) {
    if (busy) return;
    if (state.phase === 'idle') doDraw(intensity);
    else if (state.phase === 'revealed') return;
    else {
      wobble(shakeLevel(intensity));
      toast(UI_TEXT.toastFlipFirst);
    }
  }
  function onTossInput() {
    if (busy) return;
    if (state.phase === 'idle') doDraw(22);
    else if (state.phase === 'drawn') flipAll();
  }

  /* ---------- 槽位 ---------- */
  function buildSlots() {
    clearStones();
    kit.clear(cloth);
    table.style.setProperty('--rn-size', (STONE_SIZE[spread.n] || 64) + 'px');
    table.className = 'rn-table rn-n' + spread.n;
    spread.layout.forEach((p, i) => {
      const pos = spread.positions[i];
      cloth.append(h('div', { class: 'rn-slot', style: { left: p.x + '%', top: p.y + '%' } }, h('span', { class: 'rn-slot-label' }, pos.label)));
    });
  }

  function clearStones() {
    for (const s of stones) {
      try {
        s.off && s.off();
      } catch {
        /* ignore */
      }
      s.el.getAnimations().forEach((a) => a.cancel());
      s.el.remove();
    }
    stones = [];
  }

  function buildStones(draw) {
    clearStones();
    revealing = false;
    draw.forEach((d, i) => {
      const p = spread.layout[i];
      const shadow = h('div', { class: 'rn-stone-shadow' });
      const body = h(
        'div',
        { class: 'rn-stone-body' },
        h('div', { class: 'rn-face rn-back' }, h('span', { class: 'rn-speck' })),
        h('div', { class: 'rn-face rn-front' }, glyph(d.rune, { size: 40, reversed: d.reversed })),
      );
      const label = h('div', { class: 'rn-stone-label' }, d.rune.zh, d.reversed ? h('i', null, UI_TEXT.reversed) : null);
      const el = h('div', { class: ['rn-stone', 'rn-shape-' + (i % 5)], style: { left: p.x + '%', top: p.y + '%' }, attrs: { role: 'button', 'aria-label': `符石 ${i + 1}` } }, shadow, body, label);
      const stone = { el, body, shadow, rune: d.rune, reversed: d.reversed, tilt: (Math.random() - 0.5) * 22, flipped: false, flipAnim: null, off: null };
      stone.off = ctx.gesture.tap(el, () => onStoneTap(i));
      stoneLayer.append(el);
      stones.push(stone);
    });
  }

  function onStoneTap(i) {
    const s = stones[i];
    if (!s) return;
    if (s.flipped) {
      if (busy || !s.el.classList.contains('flipped')) return;
      openDetail(s.rune, s.reversed);
      return;
    }
    if (busy || state.phase !== 'drawn') return;
    flipStone(i);
  }

  /* ---------- 皮袋动画 ---------- */
  function setShakeClass(level) {
    bagWrap.classList.remove('rn-shaking-1', 'rn-shaking-2', 'rn-shaking-3');
    if (level > 0) bagWrap.classList.add('rn-shaking-' + Math.min(3, level));
  }
  function wobble(level = 1) {
    setShakeClass(level);
    haptic.tap();
    sound.play('rattle');
    ctx.setTimeout(() => setShakeClass(0), 380);
  }
  async function shakeBag(ms, intensity) {
    const level = shakeLevel(intensity);
    setShakeClass(level);
    st.setHint(UI_TEXT.hints.shaking);
    haptic.rattle();
    const step = level === 3 ? 120 : level === 2 ? 150 : 190;
    const end = now() + ms;
    do {
      sound.play('rattle');
      if (!await wait(Math.max(1, Math.min(step, end - now())))) return;
    } while (now() < end - 5);
    setShakeClass(0);
  }

  /* ---------- 出石 ---------- */
  async function pour(draw) {
    st.setHint(UI_TEXT.hints.pouring);
    sound.play('whoosh');
    haptic.light();
    bag.getAnimations().forEach((a) => a.cancel());
    const tilt = ritual.track(bag.animate([{ transform: 'translate(0px, 0px) rotate(0deg)' }, { transform: 'translate(-8px, 30px) rotate(150deg)' }], {
      duration: T(380),
      fill: 'forwards',
      easing: 'cubic-bezier(.4,0,.3,1)',
    }));
    await tilt.finished.catch(() => {});
    if (!ritual.alive) return;
    buildStones(draw);
    await nextFrame();
    const m = mouthPt.getBoundingClientRect();
    const mouth = { x: m.left + m.width / 2, y: m.top + m.height / 2 };
    const gap = T(150);
    const flights = stones.map((s, i) => flyStone(s, mouth, i * gap));
    ctx.setTimeout(() => {
      bag.animate([{ transform: 'translate(-8px, 30px) rotate(150deg)' }, { transform: 'translate(0px, 0px) rotate(0deg)' }], {
        duration: T(560),
        fill: 'forwards',
        easing: 'cubic-bezier(.34,1.45,.64,1)',
      });
    }, (stones.length - 1) * gap + T(220));
    await Promise.all(flights);
  }

  async function flyStone(s, mouth, delay) {
    if (delay && !await wait(delay)) return;
    if (!ritual.alive) return;
    const r = s.el.getBoundingClientRect();
    const dx = mouth.x - (r.left + r.width / 2), dy = mouth.y - (r.top + r.height / 2);
    const dur = T(2100), tilt = s.tilt;
    const flight = ritual.animate(s.el, [
      { transform: `translate(${dx}px,${dy}px) rotate(-190deg) scale(.5)`, opacity: 0, offset: 0 },
      { opacity: 1, offset: .1 },
      { transform: `translate(${dx * .4}px,${dy * .4 - 26}px) rotate(-75deg) scale(1)`, offset: .28 },
      { transform: `translate(8px,0) rotate(${tilt - 35}deg) scale(1)`, offset: .44 },
      { transform: `translate(3px,-12px) rotate(${tilt + 20}deg)`, offset: .56 },
      { transform: `translate(0,0) rotate(${tilt - 15}deg)`, offset: .68 },
      { transform: `translate(0,-2px) rotate(${tilt - 12}deg)`, offset: .82 },
      { transform: `translate(0,0) rotate(${tilt + 4}deg)`, offset: .94 },
      { transform: `translate(0,0) rotate(${tilt}deg)`, opacity: 1, offset: 1 },
    ].map((frame) => ({ ...frame, easing: 'ease-in-out' })), { duration: dur, easing: 'linear' });
    ritual.animate(s.shadow, [{ transform: 'scale(.4)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: .44 }, { transform: 'scale(.85)', opacity: .5, offset: .56 }, { transform: 'scale(1)', opacity: 1 }], { duration: dur });
    let previous = 0;
    for (const [i, t] of [.44, .68, .94].entries()) {
      if (!await wait(dur * (t - previous))) return;
      sound.play(i ? 'tick' : 'thud'); haptic.impact([.8, .4, .15][i]); previous = t;
    }
    await flight;
    if (!ritual.alive) return;
    s.el.classList.add('landed');
  }

  /* ---------- 抽符主流程 ---------- */
  async function doDraw(intensity = 20) {
    if (busy || state.phase !== 'idle') return;
    busy = true;
    setButtons();
    if (!await ritual.focus()) return;
    await shakeBag(T(1100), intensity);
    if (!ritual.alive) return;
    const date = new Date();
    const draw = drawForSpread(spread, ctx.rng.random, date);
    state = reduceState(state, { type: 'draw', draw });
    await pour(draw);
    if (!ritual.alive) return;
    haptic.settle();
    if (spread.daily) {
      const k = dateKey(date);
      if (storage.get('dailyKey') === k) toast(UI_TEXT.sameDay);
      storage.set('dailyKey', k);
    }
    busy = false;
    setPhaseUI();
  }

  /* ---------- 翻面 ---------- */
  async function flipStone(i, { chain = false } = {}) {
    const s = stones[i];
    if (!ritual.alive || !s || s.flipped) return;
    s.flipped = true;
    state = reduceState(state, { type: 'flip', index: i });
    sound.play('flip');
    const a = (s.flipAnim = ritual.track(s.body.animate(
      [
        { transform: 'rotateY(0deg) translateZ(0px)' },
        { transform: 'rotateY(78deg) translateZ(30px)', offset: .36 },
        { transform: 'rotateY(84deg) translateZ(34px)', offset: .62 },
        { transform: 'rotateY(180deg) translateZ(0px)' },
      ],
      { duration: T(1700), fill: 'forwards', easing: 'cubic-bezier(.45,0,.2,1)' },
    )));
    if (!await wait(T(1050))) return;
    haptic.light();
    sound.play('tick');
    await a.finished.catch(() => {});
    if (!ritual.alive) return;
    s.el.classList.add('flipped');
    if (s.reversed) haptic.double();
    if (!chain && state.phase === 'revealed') await reveal();
  }

  async function flipAll() {
    if (busy || state.phase !== 'drawn') return;
    busy = true;
    setButtons();
    const pending = stones.map((_, i) => i).filter((i) => !stones[i].flipped);
    await Promise.all(pending.map((i, k) => wait(k * T(170)).then(() => flipStone(i, { chain: true }))));
    if (!ritual.alive) return;
    if (state.phase !== 'revealed') state = reduceState(state, { type: 'flipAll' });
    await reveal();
  }

  async function reveal() {
    if (revealing) return;
    revealing = true;
    busy = true;
    setButtons();
    st.setHint('');
    // 等所有仍在翻转的石头停下
    await Promise.all(stones.map((s) => (s.flipAnim ? s.flipAnim.finished.catch(() => {}) : null)));
    if (!await wait(T(400))) return;
    sound.play('shimmer');
    haptic.success();
    st.scene.classList.add('rn-revealed');
    // 彩蛋：正位的太阳（索维洛）或欢愉（温乔）——金光与钟声
    const bright = stones.find((s) => !s.reversed && (s.rune.id === 'sowilo' || s.rune.id === 'wunjo'));
    if (bright) {
      sound.play('chime', { delay: 0.12 });
      confetti(st.el, { count: 42, origin: { x: 0.5, y: 0.62 }, spread: 200 });
    } else if (stones.some((s) => s.rune.id === 'hagalaz')) {
      sound.play('low', { delay: 0.2 });
    }
    const draw = stones.map((s) => ({ rune: s.rune, reversed: s.reversed }));
    lastModel = interpret(draw, spread, { date: new Date() });
    history = history.concat([packDraw(draw, spread.id)]).slice(-12);
    storage.set('history', history);
    renderHistory();
    if (!await wait(T(640))) return;
    busy = false;
    setPhaseUI();
    st.setHint('符石已翻开，点解读慢慢读');
  }

  /* ---------- 收回 ---------- */
  async function collect({ silent = false } = {}) {
    if (busy) return;
    if (!stones.length) {
      state = reduceState(state, { type: 'reset' });
      setPhaseUI();
      return;
    }
    busy = true;
    setButtons();
    st.scene.classList.remove('rn-revealed');
    const m = mouthPt.getBoundingClientRect();
    const mouth = { x: m.left + m.width / 2, y: m.top + m.height / 2 };
    if (!silent) sound.play('whoosh');
    await Promise.all(
      stones.map((s, i) =>
        wait(i * T(60)).then(async () => {
          const r = s.el.getBoundingClientRect();
          const dx = mouth.x - (r.left + r.width / 2);
          const dy = mouth.y - (r.top + r.height / 2);
          const a = s.el.animate(
            [
              { transform: `translate(0px, 0px) rotate(${s.tilt}deg) scale(1)`, opacity: 1 },
              { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 30}px) rotate(${s.tilt + 90}deg) scale(0.8)`, opacity: 1, offset: 0.55 },
              { transform: `translate(${dx}px, ${dy}px) rotate(${s.tilt + 200}deg) scale(0.3)`, opacity: 0 },
            ],
            { duration: T(440), fill: 'forwards', easing: 'cubic-bezier(.4,0,.6,1)' },
          );
          await a.finished.catch(() => {});
        }),
      ),
    );
    sound.play('rattle');
    haptic.tap();
    setShakeClass(1);
    ctx.setTimeout(() => setShakeClass(0), 320);
    clearStones();
    revealing = false;
    state = reduceState(state, { type: 'reset' });
    busy = false;
    setPhaseUI();
  }

  /* ---------- UI 同步 ---------- */
  function badgeText() {
    return spread.daily ? `${spread.name} · ${dateLabel(new Date())}` : `${spread.name} · ${spread.short || spread.kicker}`;
  }
  function setButtons() {
    primary.disabled = busy;
    resetBtn.disabled = busy || state.phase === 'idle';
  }
  function setPhaseUI() {
    const ph = state.phase;
    primary.setLabel(ph === 'idle' ? UI_TEXT.primary.idle(spread.n) : ph === 'drawn' ? UI_TEXT.primary.drawn : '展开解读');
    setButtons();
    st.setHint(UI_TEXT.hints[ph] || '');
    st.setBadge(badgeText());
    container.dataset.rnPhase = ph;
  }
  function renderHistory() {
    kit.clear(histEl);
    const items = history.flatMap((rec) => unpackDraw(rec)).slice(-8);
    if (items.length) histEl.append(historyBar(items, (d) => (d.reversed ? '逆·' : '') + d.rune.zh));
  }

  /* ---------- 结果抽屉 ---------- */
  function runeSection(it, multi) {
    return h(
      'div',
      { class: 'rn-sec' },
      h('div', { class: ['rn-sec-stone', it.reversed && 'rev'] }, glyph(it.rune, { size: 22, reversed: it.reversed })),
      h(
        'div',
        { class: 'rn-sec-body' },
        h(
          'div',
          { class: 'rn-sec-head' },
          h('b', null, it.rune.zh),
          h('span', { class: 'rn-sec-latin' }, it.rune.name),
          h('span', { class: ['rn-tag', it.reversed && 'rev'] }, it.reversed ? UI_TEXT.reversed : UI_TEXT.upright),
        ),
        h('div', { class: 'rn-sec-kw' }, it.keywords.join(' · ')),
        h('p', { class: 'rn-sec-text' }, it.meaning),
        multi && it.position.hint ? h('div', { class: 'rn-sec-hint' }, `${it.position.label}位 · ${it.position.hint}`) : null,
      ),
    );
  }

  function showResult(model) {
    const multi = model.items.length > 1;
    const sections = [];
    if (model.overall) sections.push({ label: '合参', text: model.overall });
    for (const it of model.items) sections.push({ label: multi ? it.position.label : '解曰', node: runeSection(it, multi), stack: true });
    sections.push({
      label: '符文的建议',
      text: model.adviceFrom ? `${model.advice}（取「${model.adviceFrom.position.label}」位 ${model.adviceFrom.rune.zh} 之言）` : model.advice,
    });
    const card = resultCard({
      kicker: model.kicker,
      title: model.title,
      sub: model.sub,
      badge: model.badge,
      seal: model.seal,
      verse: model.verse,
      sections,
      footer: model.footer,
    });
    const wrap = h('div', { class: 'm-runes rn-sheet', dataset: { rnTheme: ctx.theme } }, card);
    const sh = sheet({
      title: UI_TEXT.sheetTitle,
      content: wrap,
      actions: [
        button(UI_TEXT.again, {
          variant: 'primary',
          onClick: async () => {
            sh.close();
            await wait(T(300));
            await collect({ silent: true });
            doDraw(20);
          },
        }),
        button(UI_TEXT.share, {
          variant: 'ghost',
          icon: 'share',
          onClick: async () => {
            const r = await ctx.share(shareText(model));
            toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制到剪贴板' : '分享失败');
          },
        }),
      ],
    });
    sh.open();
  }

  /* ---------- 单符细解 ---------- */
  function openDetail(rune, reversed = false) {
    haptic.tap();
    sound.play('paper');
    const stoneEl = h('div', { class: ['rn-detail-stone', reversed && 'rev'] }, glyph(rune, { size: 42, reversed }));
    const sections = [
      {
        label: '符形',
        node: h(
          'div',
          { class: 'rn-detail-row' },
          stoneEl,
          h(
            'div',
            { class: 'rn-detail-meta' },
            h('div', null, h('span', { class: 't-faint' }, '读音 '), h('b', { class: 'rn-sound' }, rune.sound)),
            h('div', null, h('span', { class: 't-faint' }, '象征 '), rune.symbol),
            h('div', null, h('span', { class: 't-faint' }, '族属 '), rune.aett),
            h('div', { class: 't-faint', style: { fontSize: '12px' } }, rune.reversible ? '可取逆位' : '字形对称，不取逆位'),
          ),
        ),
        stack: false,
      },
      { label: '正位', text: `${rune.up.keywords.join(' · ')}。${rune.up.meaning}` },
      rune.rev ? { label: '逆位', text: `${rune.rev.keywords.join(' · ')}。${rune.rev.meaning}` } : { label: '逆位', text: '此符上下对称，正逆同形，因此不取逆位。它的意思不会被翻转，只会更强或更弱。' },
      { label: '建议', text: rune.advice },
    ];
    const card = resultCard({
      kicker: `${rune.aett} · ${rune.symbol}`,
      title: `${rune.zh} · ${rune.name}`,
      badge: reversed ? UI_TEXT.reversed : rune.reversible ? UI_TEXT.upright : '正逆同形',
      sub: rune.line,
      seal: rune.sound,
      verse: (reversed && rune.rev ? rune.rev.keywords : rune.up.keywords).join(' · '),
      sections,
      footer: UI_TEXT.footer,
    });
    const wrap = h('div', { class: 'm-runes rn-sheet', dataset: { rnTheme: ctx.theme } }, card);
    sheet({ title: UI_TEXT.detailTitle, content: wrap }).open();
  }

  /* ---------- 符文一览 ---------- */
  function openIndex() {
    haptic.tap();
    sound.play('paper');
    const groups = Object.values(AETTS).map((a) =>
      h(
        'div',
        { class: 'rn-aett' },
        h('div', { class: 'rn-aett-head' }, h('b', null, a.name), h('span', null, a.theme)),
        h('p', { class: 'rn-aett-desc' }, a.desc),
        h(
          'div',
          { class: 'rn-grid' },
          RUNES.filter((r) => r.aett === a.name).map((r) =>
            h(
              'button',
              { type: 'button', class: ['rn-cell', !r.reversible && 'fixed'], onClick: () => openDetail(r) },
              !r.reversible ? h('span', { class: 'rn-cell-dot', attrs: { title: '不取逆位' } }) : null,
              glyph(r, { size: 18 }),
              h('span', { class: 'rn-cell-zh' }, r.zh),
              h('span', { class: 'rn-cell-latin' }, r.name),
            ),
          ),
        ),
      ),
    );
    const wrap = h(
      'div',
      { class: 'm-runes rn-sheet rn-index', dataset: { rnTheme: ctx.theme } },
      h('p', { class: 'rn-index-intro' }, '古弗萨克二十四枚，分三族。点任意一枚看细解；灰点者不取逆位。'),
      groups,
    );
    sheet({ title: UI_TEXT.indexTitle, content: wrap }).open();
  }

  /* ---------- 卸载 ---------- */
  return () => {
    clearTimeout(rubTimer);
    clearStones();
    bag.getAnimations().forEach((a) => a.cancel());
    setShakeClass(0);
  };
}
