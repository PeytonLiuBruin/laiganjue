// 转盘 · 界面（Web DOM）。逻辑在 core.js，文案在 data.js。
import { createRitual } from '../../ui/ritual.js';
import { segmentAt, simulateSpin, boundaryCrossings, omegaFromIntensity, randomOmega, normalizeFlick, fitLabel, paletteFor, parsePreset, isSpinnable, remaining, pushHistory, streakOf, normalizeDeg, DEG, CUSTOM_MAX } from './core.js';
import { PRESETS, CUSTOM, CUSTOM_TEMPLATES, PALETTES, REASONS, VERSES, LAST_ONE, TRIPLE, FLAPPER_LINES, CAP_LINES, WEAK_FLICK, BUSY_LINES, MILESTONES, SHARE_SIGN, FOOTER, getPreset } from './data.js';

/* SVG 几何常量（viewBox 400×400） */
const C = 200;
const R_SEG = 188;
const R_RIM = 196;
const R_RIM_IN = 191;
const R_DOT = 193.5;
const R_TEXT = 121;
const RADIAL = 112;

export function mount(container, ctx) {
  const { kit, haptic, sound, storage } = ctx;
  const { h, button, chips, stage, hint, resultCard, sheet, input, toast, confetti, historyBar, fromHTML, clear } = kit;
  const reduce = !!ctx.platform.prefersReducedMotion;
  const pick = (arr) => ctx.rng.pick(arr);

  /* ---------- 状态 ---------- */
  let presetId = storage.get('preset', 'fortune');
  if (presetId !== CUSTOM.id && !PRESETS.some((p) => p.id === presetId)) presetId = 'fortune';
  let preset = getPreset(presetId);
  let customs = storage.get('customs', []);
  let cur = storage.get('customDraft', { id: null, name: '', text: '' });
  let removed = new Set();
  let items = []; // 当前转盘上的候选 [{label, note, ...}]
  let angle = 0; // 累计旋转角（度，顺时针正）
  let busy = false;
  let raf = 0;
  let spins = storage.get('spins', 0);
  let dirty = false; // 旋转中自定义文本被改动，落地后再重绘
  let segEls = [];
  let labelEls = [];
  let svgEl = null;
  let activeSheet = null;

  /* ---------- 预设切换 ---------- */
  const presetChips = chips([{ value: CUSTOM.id, label: '自己填写' }, ...PRESETS.map((p) => ({ value: p.id, label: p.name }))], {
    value: presetId,
    scroll: true,
    onChange: (v) => {
      if (busy) {
        presetChips.set(presetId);
        toast('转完再换');
        return;
      }
      ritual.clear(); ritual.step(0);
      presetId = v;
      preset = getPreset(v);
      storage.set('preset', v);
      removed.clear();
      customPanel.hidden = v !== CUSTOM.id;
      refreshItems();
      rebuildWheel(true);
      st.setHint(preset.hint);
      updateBadge();
      renderHistory();
      haptic.tap();
      sound.play('flip');
    },
  });

  /* ---------- 舞台：转盘实物 ---------- */
  const st = stage({ cls: 'wh-stage', hint: preset.hint, badge: '' });
  const ritual = createRitual(ctx, st, ['写选项', '转动', '落定', '揭晓']);
  const wait = ritual.pause;
  const halo = h('div', { class: 'wh-halo' });
  const bezel = h('div', { class: 'wh-bezel' });
  const rotor = h('div', { class: 'wh-rotor' });
  const cap = h('div', { class: 'wh-cap' }, h('span', { class: 'wh-cap-ring' }), h('span', { class: 'wh-cap-text' }, '转'));
  const wrap = h('div', { class: 'wh-wrap', attrs: { role: 'img', 'aria-label': '转盘' } }, halo, bezel, rotor, cap);
  const flapper = h(
    'button',
    { type: 'button', class: 'wh-flapper', attrs: { 'aria-label': '指针' } },
    fromHTML(
      '<svg viewBox="0 0 28 40" aria-hidden="true"><path class="wh-flap-body" d="M14 1.5c7 0 12.5 5.4 12.5 12.2 0 9.6-12.5 24.8-12.5 24.8S1.5 23.3 1.5 13.7C1.5 6.9 7 1.5 14 1.5z"/><circle class="wh-flap-eye" cx="14" cy="13.5" r="3.6"/></svg>',
    ),
  );
  const frame = h('div', { class: 'wh-frame' }, wrap, flapper);
  st.scene.append(frame);

  /* ---------- 自定义编辑区 ---------- */
  const nameInput = input({
    placeholder: CUSTOM.namePlaceholder,
    value: cur.name || '',
    maxlength: 12,
    onInput: (v) => {
      cur.name = v.trim();
      saveDraft();
    },
  });
  const textarea = h('textarea', { class: 'textarea wh-textarea', placeholder: CUSTOM.textPlaceholder, rows: 5, attrs: { maxlength: 400, autocorrect: 'off' } });
  textarea.value = cur.text || '';
  let typeTimer = null;
  textarea.addEventListener('input', () => {
    cur.text = textarea.value;
    saveDraft();
    clearTimeout(typeTimer);
    typeTimer = setTimeout(onCustomTextChanged, 260);
  });
  nameInput.setAttribute('aria-label', '转盘名称');
  textarea.setAttribute('aria-label', '转盘选项，每行一项');
  const countEl = h('span', { class: 'wh-count' });
  const templateBtn = button('用个模板', { variant: 'ghost', size: 'small', onClick: useTemplate });
  const saveBtn = button('保存并使用', { variant: 'primary', size: 'small', onClick: saveCustom });
  const deleteBtn = button('删除', { variant: 'ghost', size: 'small', cls: 'wh-del', onClick: deleteCustom });
  const savedWrap = h('div', { class: 'wh-saved' });
  const customPanel = h(
    'div',
    { class: 'wh-custom card', hidden: presetId !== CUSTOM.id },
    h('div', { class: 'wh-custom-head' }, h('span', { class: 't-kicker' }, 'MY WHEEL'), h('span', { class: 'wh-custom-title' }, '我的转盘')),
    savedWrap,
    h('div', { class: 'mt-3' }, nameInput),
    h('p', { class: 'wh-editor-tip' }, `每行一个选项，也可用逗号分隔，支持 2–${CUSTOM_MAX} 项。`),
    h('div', { class: 'mt-2' }, textarea),
    h('div', { class: 'wh-custom-meta' }, countEl, templateBtn),
    h('div', { class: 'wh-custom-actions' }, saveBtn, deleteBtn),
  );
  let templateIdx = 0;

  function saveDraft() {
    storage.set('customDraft', cur);
  }
  function customAllItems() {
    return parsePreset(cur.text).map((label) => ({ label, note: cur.name ? `来自你的转盘「${cur.name}」` : '你自己写的选项，转到哪个都算数。' }));
  }
  function onCustomTextChanged() {
    if (presetId !== CUSTOM.id) return;
    ritual.clear(); ritual.step(0);
    removed.clear();
    if (busy) {
      dirty = true;
      return;
    }
    refreshItems();
    rebuildWheel(false);
    updateBadge();
  }
  function renderSaved() {
    clear(savedWrap);
    if (!customs.length) return;
    const list = [...customs.map((c) => ({ value: c.id, label: c.name || '未命名' })), { value: '__new', label: '＋ 新建' }];
    const sc = chips(list, {
      value: cur.id && customs.some((c) => c.id === cur.id) ? cur.id : '__new',
      scroll: true,
      onChange: (v) => {
        if (busy) {
          toast(pick(BUSY_LINES));
          renderSaved();
          return;
        }
        if (v === '__new') cur = { id: null, name: '', text: '' };
        else {
          const c = customs.find((x) => x.id === v);
          cur = { id: c.id, name: c.name, text: c.text };
        }
        ritual.clear(); ritual.step(0);
        nameInput.value = cur.name;
        textarea.value = cur.text;
        saveDraft();
        deleteBtn.hidden = !cur.id;
        removed.clear();
        refreshItems();
        rebuildWheel(true);
        updateBadge();
        renderHistory();
        haptic.tap();
        sound.play('paper');
      },
    });
    savedWrap.append(sc.el);
  }
  function saveCustom() {
    if (busy) return;
    clearTimeout(typeTimer);
    const parsed = parsePreset(cur.text);
    if (!isSpinnable(parsed)) {
      toast('至少写两项才能转');
      haptic.double();
      return;
    }
    if (!cur.name) cur.name = parsed.slice(0, 2).join('·');
    if (!cur.id) cur.id = 'c' + Date.now().toString(36);
    const idx = customs.findIndex((c) => c.id === cur.id);
    const rec = { id: cur.id, name: cur.name, text: cur.text };
    if (idx >= 0) customs[idx] = rec;
    else customs.push(rec);
    customs = customs.slice(-12);
    storage.set('customs', customs);
    nameInput.value = cur.name;
    saveDraft();
    deleteBtn.hidden = false;
    renderSaved();
    refreshItems();
    rebuildWheel(true);
    updateBadge();
    renderHistory();
    haptic.success();
    sound.play('pop');
    toast(`已保存「${cur.name}」`);
    ritual.clear(); ritual.focus();
  }
  function deleteCustom() {
    if (busy || !cur.id) return;
    customs = customs.filter((c) => c.id !== cur.id);
    storage.set('customs', customs);
    storage.remove('hist:custom:' + cur.id);
    cur = { id: null, name: '', text: '' };
    nameInput.value = '';
    textarea.value = '';
    saveDraft();
    deleteBtn.hidden = true;
    renderSaved();
    refreshItems();
    rebuildWheel(true);
    updateBadge();
    renderHistory();
    haptic.tap();
    sound.play('paper');
    toast('已删除');
  }
  function useTemplate() {
    if (busy) return;
    const t = CUSTOM_TEMPLATES[templateIdx % CUSTOM_TEMPLATES.length];
    templateIdx++;
    cur = { id: null, name: t.name, text: t.text };
    nameInput.value = t.name;
    textarea.value = t.text;
    saveDraft();
    deleteBtn.hidden = true;
    renderSaved();
    onCustomTextChanged();
    haptic.tap();
    sound.play('paper');
  }
  deleteBtn.hidden = !cur.id;
  renderSaved();

  /* ---------- 操作 ---------- */
  const spinBtn = button('转 一 下', {
    variant: 'primary',
    size: 'large',
    primary: true,
    onClick: () => {
      if (busy) {
        toast(pick(BUSY_LINES));
        return;
      }
      spin(randomOmega(), 'button');
    },
  });
  const editBtn = button('编辑选项', { variant: 'soft', onClick: editOptions });
  const candBtn = button('候选', { variant: 'ghost', onClick: openCandidates });
  const histEl = h('div', { class: 'wh-history' });

  container.append(
    ritual.progress,
    h('div', { class: 'wh-top' }, presetChips.el),
    h('div', { class: 'wh-editbar' }, h('span', null, '每一个选项，都由你决定'), editBtn),
    customPanel,
    h('div', { class: 'mt-3' }, st.el),
    hint('spin', '在转盘上拨一下，或摇一摇手机'),
    kit.actionBar(spinBtn, candBtn),
    ritual.receipt,
    histEl,
  );

  function editOptions() {
    if (busy) return;
    if (presetId !== CUSTOM.id) {
      cur = { id: null, name: preset.name, text: items.map((x) => x.label).join('\n') };
      presetId = CUSTOM.id; preset = getPreset(CUSTOM.id);
      storage.set('preset', presetId); presetChips.set(presetId);
      nameInput.value = cur.name; textarea.value = cur.text; saveDraft();
      deleteBtn.hidden = true; removed.clear(); renderSaved(); refreshItems(); rebuildWheel(false); updateBadge();
    }
    ritual.clear(); customPanel.hidden = false;
    customPanel.scrollIntoView({ block: 'start', behavior: reduce ? 'instant' : 'smooth' });
    textarea.focus({ preventScroll: true });
  }

  /* ---------- 三入口：体感 / 手势 / 按钮 ---------- */
  ctx.motion.onShake((e) => spin(omegaFromIntensity(e.intensity), 'motion'));
  // Physical shaking starts a wheel; upward tossing is reserved for thrown objects.

  let downAt = 0;
  let dragged = 0;
  wrap.addEventListener(
    'pointerdown',
    () => {
      downAt = performance.now();
      dragged = 0;
    },
    { passive: true },
  );
  ctx.gesture.spin(
    wrap,
    (omega) => {
      if (busy) return;
      const f = normalizeFlick(omega, ctx.rng.random);
      if (f) {
        if (f.boosted) toast(pick(WEAK_FLICK));
        spin(f.omega, 'gesture');
        return;
      }
      // 没甩：若几乎没动且很快松手 → 当作"点一下转盘"
      if (dragged < 0.06 && performance.now() - downAt < 380) spin(randomOmega(), 'gesture');
      else if (dragged > 0.2) {
        haptic.tap();
        sound.play('clack');
      }
    },
    {
      onMove: (d) => {
        if (busy) return;
        dragged += Math.abs(d);
        if (dragged > 0.02) clearReveal();
        const next = angle + d * DEG;
        const cross = boundaryCrossings(angle, next, items.length);
        if (cross) {
          sound.play('tick');
          haptic.tap();
          kickFlapper(d > 0 ? 6 : -6);
        }
        angle = next;
        setAngle(angle);
      },
    },
  );

  // 彩蛋：戳一下指针，它会小声说话
  ctx.gesture.tap(flapper, () => {
    kickFlapper(14);
    sound.play('tick');
    haptic.tap();
    toast(pick(FLAPPER_LINES));
  });

  /* ---------- 转盘绘制 ---------- */
  function refreshItems() {
    const all = presetId === CUSTOM.id ? customAllItems() : preset.items;
    if (presetId === CUSTOM.id && !isSpinnable(all)) {
      items = [{ label: CUSTOM.emptyLabel, note: '', placeholder: true }];
    } else {
      items = remaining(all, removed);
      if (!items.length) items = all.slice();
    }
    updateCount();
    candBtn.setLabel(removed.size ? `候选 ${items.length}/${all.length}` : '候选');
  }
  function updateCount() {
    if (presetId !== CUSTOM.id) return;
    const k = parsePreset(cur.text).length;
    countEl.textContent = k === 0 ? '每行写一项' : k < 2 ? '还差 1 项就能转' : k >= CUSTOM_MAX ? `已满 ${CUSTOM_MAX} 项，多的不算` : `已识别 ${k} 项`;
    countEl.classList.toggle('ok', k >= 2);
  }

  function buildSvg(list) {
    const n = list.length;
    const pal = PALETTES[preset.palette] || PALETTES.gold;
    const colors = paletteFor(n, pal.length);
    const step = 360 / n;
    const half = step / 2;
    const px = (a, r) => (C + r * Math.sin((a * Math.PI) / 180)).toFixed(2);
    const py = (a, r) => (C - r * Math.cos((a * Math.PI) / 180)).toFixed(2);
    let segs = '';
    let labels = '';
    let dots = '';
    for (let i = 0; i < n; i++) {
      // 占位（自定义还没写够两项）用最安静的一档底色，看起来像一张空盘
      const sw = list[i].placeholder ? pal[1] : pal[colors[i]];
      const a0 = i * step - half;
      const a1 = i * step + half;
      const style = `fill:${sw.fill};fill-opacity:${sw.op}`;
      if (n === 1) {
        segs += `<circle class="wh-seg" data-i="0" cx="${C}" cy="${C}" r="${R_SEG}" style="${style}"/>`;
      } else if (step > 179) {
        const mid = a0 + step / 2;
        segs += `<path class="wh-seg" data-i="${i}" style="${style}" d="M${C} ${C} L${px(a0, R_SEG)} ${py(a0, R_SEG)} A${R_SEG} ${R_SEG} 0 0 1 ${px(mid, R_SEG)} ${py(mid, R_SEG)} A${R_SEG} ${R_SEG} 0 0 1 ${px(a1, R_SEG)} ${py(a1, R_SEG)} Z"/>`;
      } else {
        segs += `<path class="wh-seg" data-i="${i}" style="${style}" d="M${C} ${C} L${px(a0, R_SEG)} ${py(a0, R_SEG)} A${R_SEG} ${R_SEG} 0 0 1 ${px(a1, R_SEG)} ${py(a1, R_SEG)} Z"/>`;
      }
      // 文字：沿半径每字直立叠放，从外向内
      const fit = fitLabel(list[i].label, { radial: RADIAL });
      const chars = Array.from(fit.text);
      const pitch = fit.fontSize * 1.08;
      const total = pitch * (chars.length - 1);
      let tspans = '';
      chars.forEach((ch, j) => {
        const r = R_TEXT + total / 2 - j * pitch;
        tspans += `<tspan x="${C}" y="${(C - r).toFixed(2)}">${escapeXml(ch)}</tspan>`;
      });
      labels += `<text class="wh-label${list[i].placeholder ? ' dim' : ''}" data-i="${i}" font-size="${fit.fontSize}" text-anchor="middle" dominant-baseline="central" style="fill:${sw.text}" transform="rotate(${(i * step).toFixed(3)} ${C} ${C})">${tspans}</text>`;
      // 刻度点：边界大点 + 扇区中点小点
      if (n > 1) dots += `<circle class="wh-dot" cx="${px(a0, R_DOT)}" cy="${py(a0, R_DOT)}" r="2.6"/>`;
      dots += `<circle class="wh-dot minor" cx="${px(i * step, R_DOT)}" cy="${py(i * step, R_DOT)}" r="1.3"/>`;
    }
    return fromHTML(
      `<svg class="wh-svg" viewBox="0 0 400 400" aria-hidden="true">` +
        `<circle class="wh-rim" cx="${C}" cy="${C}" r="${R_RIM}"/>` +
        `<circle class="wh-rim-in" cx="${C}" cy="${C}" r="${R_RIM_IN}"/>` +
        `<g class="wh-segs">${segs}</g><g class="wh-labels">${labels}</g><g class="wh-dots">${dots}</g></svg>`,
    );
  }

  function rebuildWheel(animateIn) {
    clear(rotor);
    svgEl = buildSvg(items);
    rotor.append(svgEl);
    segEls = Array.from(svgEl.querySelectorAll('.wh-seg'));
    labelEls = Array.from(svgEl.querySelectorAll('.wh-label'));
    setAngle(angle);
    if (animateIn && !reduce) {
      rotor.animate([{ opacity: 0.2, transform: `rotate(${angle}deg) scale(0.92)` }, { opacity: 1, transform: `rotate(${angle}deg) scale(1)` }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
  function setAngle(a) {
    rotor.style.transform = `rotate(${a}deg)`;
  }
  function clearReveal() {
    if (!svgEl) return;
    svgEl.classList.remove('revealed');
    for (const el of segEls) el.classList.remove('hit');
    for (const el of labelEls) el.classList.remove('hit');
    cap.classList.remove('pulse');
  }
  function kickFlapper(amp) {
    if (reduce) return;
    flapper.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${amp}deg)`, offset: 0.35 }, { transform: 'rotate(0deg)' }], { duration: 130, easing: 'ease-out' });
  }
  function updateBadge() {
    const n = items.length;
    st.setBadge(items[0]?.placeholder ? `${preset.name} · 等你来写` : `${preset.name} · ${n} 选 1`);
  }
  function lock(v) {
    spinBtn.disabled = v;
    candBtn.disabled = v;
    saveBtn.disabled = v;
    templateBtn.disabled = v;
    presetChips.el.classList.toggle('locked', v);
    savedWrap.classList.toggle('locked', v);
    [editBtn, deleteBtn, nameInput, textarea].forEach((el) => { el.disabled = v; });
  }

  /* ---------- 历史 ---------- */
  const histKey = () => (presetId === CUSTOM.id ? `hist:custom:${cur.id || 'draft'}` : `hist:${presetId}`);
  function renderHistory() {
    clear(histEl);
    const list = storage.get(histKey(), []);
    if (list.length) histEl.append(historyBar(list.slice(-8), (x) => x));
  }

  /* ---------- 旋转：起 → 飞 → 落 → 揭 ---------- */
  async function spin(omega0, source) {
    if (!ritual.alive || activeSheet?.opened || (source === 'motion' && !ritual.receipt.hidden)) return;
    if (busy) {
      if (source === 'button') toast(pick(BUSY_LINES));
      return;
    }
    clearTimeout(typeTimer);
    if (presetId === CUSTOM.id) { refreshItems(); rebuildWheel(false); }
    if (!items.length || items[0].placeholder) {
      if (source !== 'motion') toast('请先填写至少两个选项');
      haptic.double();
      return;
    }
    busy = true;
    lock(true);
    ritual.clear();
    if (!await ritual.focus()) return;
    ritual.step(1);
    clearReveal();
    st.setHint('');
    const n = items.length;
    const speed = Math.sign(omega0) * Math.max(8, Math.min(22, Math.abs(omega0) * 0.62));
    const plan = simulateSpin(speed, { k: 0.48, c: 0.3 });
    const start = angle;
    const sign = omega0 < 0 ? -1 : 1;
    const PULL = reduce ? 0 : 7 * sign; // 起：先往反方向拉一点，像拉弓
    const PRE = reduce ? 0 : 280;
    const finalAngle = start - PULL + plan.angle;
    sound.play('whoosh');
    haptic.light();
    wrap.classList.add('spinning');
    halo.classList.add('on');

    if (reduce) {
      angle = finalAngle;
      setAngle(angle);
      ctx.setTimeout(() => land(), 80);
      return;
    }
    let elapsed = 0, previous = null;
    let prev = start;
    let lastTick = 0;
    let lastHap = 0;
    let laps = 0;
    const tailStart = plan.duration * .82, tailDuration = 1100;
    const total = PRE + tailStart + tailDuration;
    let coasting = false;
    const frame = (now) => {
      if (!ritual.alive) return;
      if (previous !== null && !document.hidden) elapsed += Math.min(50, now - previous);
      previous = now;
      const t = elapsed;
      let a;
      if (t < PRE) {
        const p = t / PRE;
        a = start - PULL * (1 - (1 - p) * (1 - p));
      } else {
        const elapsedSpin = t - PRE;
        const tail = Math.max(0, Math.min(1, (elapsedSpin - tailStart) / tailDuration));
        const physicalTime = elapsedSpin < tailStart ? elapsedSpin : tailStart + (plan.duration - tailStart) * (1 - (1 - tail) ** 2);
        a = start - PULL + plan.angleAt(physicalTime);
        if (elapsedSpin >= tailStart && !coasting) {
          coasting = true; ritual.step(2); st.setHint('还在缓缓走，等最后一格');
        }
      }
      if (t >= total) a = finalAngle;
      setAngle(a);
      const cross = boundaryCrossings(prev, a, n);
      if (cross) {
        const w = plan.omegaAt(Math.max(0, t - PRE));
        if (now - lastTick > 45) {
          sound.play('tick');
          lastTick = now;
        }
        if (now - lastHap > 70) {
          haptic.tap();
          lastHap = now;
        }
        kickFlapper(Math.min(22, 7 + Math.abs(w) * 0.55) * (a >= prev ? 1 : -1));
      }
      const w = Math.abs(plan.omegaAt(Math.max(0, t - PRE)));
      halo.style.opacity = String(Math.min(1, 0.3 + w / 22));
      const newLaps = Math.floor(Math.abs(a - start) / 360);
      if (newLaps !== laps) {
        laps = newLaps;
        st.setBadge(laps ? `${preset.name} · 已转 ${laps} 圈` : `${preset.name} · ${n} 选 1`);
      }
      prev = a;
      if (t >= total) {
        angle = finalAngle;
        raf = 0;
        land();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
  }

  async function land() {
    wrap.classList.remove('spinning');
    halo.classList.remove('on');
    halo.style.opacity = '';
    angle = normalizeDeg(angle);
    setAngle(angle);
    sound.play('clack');
    haptic.settle();
    const n = items.length;
    const idx = segmentAt(angle, n);
    const item = items[idx];
    ritual.step(2); st.setHint('指针停住了，看看它选中了什么');
    if (!await wait(reduce ? 80 : 350)) return;
    await reveal(idx, item);
  }

  async function reveal(idx, item) {
    if (svgEl) {
      svgEl.classList.add('revealed');
      segEls[idx]?.classList.add('hit');
      labelEls[idx]?.classList.add('hit');
    }
    cap.classList.add('pulse');
    const tone = item.tone || 'good';
    const big = item.label === '大吉' || item.label === '中吉';
    if (tone === 'bad') {
      sound.play('low');
    } else if (big) {
      sound.play('chime');
      confetti(st.el, { count: 80, origin: { x: 0.5, y: 0.12 } });
    } else {
      sound.play('success');
      confetti(st.el, { count: 44, origin: { x: 0.5, y: 0.12 } });
    }
    haptic.success();
    st.setBadge(`${preset.name} · ${item.label}`);
    st.setHint('选择已揭晓，详细内容可以稍后展开');

    // 记录
    const key = histKey();
    const prevList = storage.get(key, []);
    const streak = streakOf(prevList, item.label) + 1;
    const list = pushHistory(prevList, item.label, 8);
    storage.set(key, list);
    spins += 1;
    storage.set('spins', spins);
    renderHistory();

    if (!await wait(reduce ? 80 : 850)) return;
    ritual.step(3);
    ritual.reveal({ kicker: `${preset.name} · ${nLabel()}`, title: item.label, text: presetId === 'truth' ? item.text : (item.note || '这一轮，就选它。'), onRead: () => showResult(item, idx, { streak }) });
    if (spins % 10 === 0) ctx.setTimeout(() => toast(MILESTONES[Math.min(MILESTONES.length - 1, spins / 10 - 1)]), 900);
    busy = false;
    lock(false);
    if (dirty) {
      dirty = false;
      onCustomTextChanged();
    }
  }

  const nLabel = () => `${items.length} 选 1`;

  /* ---------- 结果抽屉 ---------- */
  function showResult(item, idx, { streak = 1 } = {}) {
    if (busy || !ritual.alive || activeSheet?.opened) return;
    const n = items.length;
    const isTruth = presetId === 'truth';
    const triple = streak >= 3;
    const reasonPool = n === 1 ? LAST_ONE : (preset.reasons || []).concat(REASONS);
    const reason = triple && n > 1 ? TRIPLE.reason : pick(reasonPool);
    const verse = isTruth ? item.text : pick((preset.verses || []).concat(VERSES));
    const sections = [];
    if (isTruth) sections.push({ label: '规则', text: item.note });
    sections.push({ label: n === 1 ? '只剩它了' : '再转一次的理由', text: reason });
    if (n > 1) {
      const removeBtn = button(`去掉「${item.label}」再转`, {
        variant: 'soft',
        size: 'small',
        onClick: () => {
          removed.add(item.label);
          refreshItems();
          rebuildWheel(true);
          updateBadge();
          sh.close();
          sound.play('paper');
          haptic.tap();
          wait(420).then(() => spin(randomOmega() * (ctx.rng.random() < 0.5 ? 1 : -1), 'button'));
        },
      });
      sections.push({ label: '不想要它', node: h('div', { class: 'wh-remove' }, removeBtn, h('span', { class: 'wh-remove-hint' }, `去掉后还剩 ${n - 1} 项`)), stack: false });
    }
    if (removed.size) {
      const restoreBtn = button('全部恢复', {
        variant: 'ghost',
        size: 'small',
        onClick: () => {
          removed.clear();
          refreshItems();
          rebuildWheel(true);
          updateBadge();
          sh.close();
          haptic.tap();
          sound.play('flip');
          toast('候选已全部恢复');
        },
      });
      sections.push({ label: '已去掉', node: h('div', { class: 'wh-removed' }, h('span', null, [...removed].join(' · ')), restoreBtn), stack: true });
    }
    const card = resultCard({
      kicker: `${preset.name} · ${n} 选 1`,
      title: item.label,
      titleGold: true,
      badge: triple ? TRIPLE.badge : `第 ${spins} 转`,
      sub: isTruth ? '轮到你了' : item.note || undefined,
      seal: item.seal || preset.seal || CUSTOM.seal,
      verse,
      sections,
      footer: FOOTER,
    });
    const actions = [
      button('再转', {
        variant: 'primary',
        icon: 'refresh',
        onClick: () => {
          sh.close();
          wait(400).then(() => spin(randomOmega(), 'button'));
        },
      }),
      button('分享', {
        variant: 'ghost',
        icon: 'share',
        onClick: async () => {
          const lines = [`【转盘 · ${preset.name}】转到了「${item.label}」`];
          if (isTruth) lines.push(item.text);
          if (item.note && !isTruth) lines.push(item.note);
          lines.push(`再转一次的理由：${reason}`, SHARE_SIGN);
          const r = await ctx.share(lines.join('\n'));
          toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制到剪贴板' : '分享失败');
        },
      }),
    ];
    const sh = sheet({ title: triple ? '又是它' : '转盘停下了', content: card, actions });
    activeSheet = sh;
    sh.el.classList.add('m-wheel');
    sh.open();
  }

  /* ---------- 候选管理抽屉 ---------- */
  function openCandidates() {
    if (busy) {
      toast(pick(BUSY_LINES));
      return;
    }
    const all = presetId === CUSTOM.id ? customAllItems() : preset.items;
    if (!isSpinnable(all)) {
      toast('请先填写至少两个选项');
      return;
    }
    const listEl = h('div', { class: 'wh-cands' });
    const render = () => {
      clear(listEl);
      for (const it of all) {
        const off = removed.has(it.label);
        listEl.append(
          h(
            'button',
            {
              type: 'button',
              class: ['wh-cand', off && 'off'],
              onClick: () => {
                if (!off && all.length - removed.size <= 1) {
                  toast('至少留一项');
                  haptic.double();
                  return;
                }
                if (off) removed.delete(it.label);
                else removed.add(it.label);
                haptic.tap();
                sound.play('tick');
                render();
              },
            },
            h('span', { class: 'wh-cand-mark' }, off ? '' : '✓'),
            h('span', { class: 'wh-cand-body' }, h('span', { class: 'wh-cand-label' }, it.label), it.text || it.note ? h('span', { class: 'wh-cand-note' }, it.text || it.note) : null),
          ),
        );
      }
    };
    render();
    const apply = () => {
      if (!ritual.alive) return;
      ritual.clear();
      refreshItems();
      rebuildWheel(true);
      updateBadge();
    };
    const sh = sheet({
      title: '调整候选',
      content: h('div', null, h('p', { class: 'wh-cands-tip' }, '点一下去掉不想要的，再点恢复。去掉的项这次不上盘。'), listEl),
      actions: [
        button('全部恢复', {
          variant: 'ghost',
          onClick: () => {
            removed.clear();
            render();
            haptic.tap();
          },
        }),
        button('完成', { variant: 'primary', onClick: () => sh.close() }),
      ],
      onClose: apply,
    });
    activeSheet = sh;
    sh.el.classList.add('m-wheel');
    sh.open();
  }

  /* ---------- 首次绘制 ---------- */
  refreshItems();
  rebuildWheel(false);
  updateBadge();
  renderHistory();

  return () => {
    activeSheet?.close();
    if (raf) cancelAnimationFrame(raf);
    clearTimeout(typeTimer);
    rotor.getAnimations?.().forEach((a) => a.cancel());
  };
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]);
}
