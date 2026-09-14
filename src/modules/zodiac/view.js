// 星座 · 界面：西方十二星座 / 东方十二生肖。逻辑与文案见 core.js / data.js（星仪随所选星座变化）。
// 节奏：选好 → 点星仪 / 看运势 / 摇一摇 → 星光聚拢 → 揭示（结果条 + 星级）→「展开解读」抽屉。
import { signFromDate, animalFromYmd, signFortune, animalFortune, shareText, formatDate, signById, animalById, stepIn } from './core.js';
import { SIGNS, ANIMALS, ASPECT_LABEL, ELEMENTS, QUALITIES, UI, BRANCH_HOUR } from './data.js';
import { createRitual } from '../../ui/ritual.js';
import { createModelSlot } from '../../ui/model-slot.js';

export function mount(container, ctx) {
  const { kit, haptic, sound, storage } = ctx;
  const { h, button, chips, tabs, stage, resultCard, sheet, toast, input, field, clear, stars } = kit;

  let tab = storage.get('tab', 'sign');
  if (!UI.tabs.some((t) => t.value === tab)) tab = 'sign';
  let signId = storage.get('sign', 'aries');
  let animalId = storage.get('animal', 'shu');
  signId = signById(signId)?.id || SIGNS[0].id;
  animalId = animalById(animalId)?.id || ANIMALS[0].id;
  let bday = String(storage.get('bday', '') || '');
  let fortune = null;
  let resultSheet = null;
  let busy = false;

  /* ---------- 舞台 ---------- */
  const st = stage({ cls: 'zd-stage', badge: '星座' });
  const ritual = createRitual(ctx, st, ['选择', '看运势', '解读']);
  // 星仪延后一拍再挂到舞台上（见 mountSky），先把界面画出来。
  let slot = null;
  let pendingSky = {};
  const sky = {
    set(state) {
      pendingSky = { ...pendingSky, ...state };
      slot?.set(state);
    },
  };

  /* ---------- 选择器：一行横滑芯片 + 生日 ---------- */
  const signChips = chips(
    SIGNS.map((s) => ({ value: s.id, label: `${s.glyph} ${s.short}` })),
    { value: signId, scroll: true, onChange: (v) => pick(v, true) },
  );
  const animalChips = chips(
    ANIMALS.map((a) => ({ value: a.id, label: `${a.glyph}${a.name}` })),
    { value: animalId, scroll: true, onChange: (v) => pick(v, true) },
  );
  const strip = h('div', { class: 'zd-strip' });
  const bdayInput = input({ type: 'date', value: bday, onInput: applyBirthday });
  bdayInput.min = '1900-01-01';
  bdayInput.max = '2100-12-31';
  bdayInput.setAttribute('aria-label', '生日');
  const bdayField = h('div', { class: 'zd-bday', hidden: true });
  const bdayBtn = button(UI.birthToggle, { variant: 'ghost', cls: 'zd-bday-btn', onClick: toggleBirthday });
  bdayBtn.prepend(kit.svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', { size: 18 }));
  bdayBtn.setAttribute('aria-expanded', 'false');
  const pickerWrap = h('div', { class: 'zd-picker' }, h('div', { class: 'zd-picker-row' }, strip, bdayBtn), bdayField);

  /* ---------- 提示 / 按钮 / 结果 ---------- */
  const hintEl = kit.hint('tap', UI.gestureHint[tab]);
  hintEl.classList.add('zd-hint');
  const setHint = (text, quiet = false) => {
    if (hintEl.lastChild.textContent !== text) hintEl.lastChild.textContent = text;
    hintEl.classList.toggle('zd-quiet', quiet);
  };
  const primaryBtn = button(UI.primary, { variant: 'primary', size: 'large', primary: true, onClick: () => look() });
  const randomBtn = button(UI.random, { variant: 'ghost', icon: 'refresh', onClick: () => randomPick() });
  const tabBar = tabs(UI.tabs, {
    value: tab,
    onChange: (v) => {
      tab = v;
      storage.set('tab', v);
      showTab();
      sound.play('paper');
      haptic.tap();
    },
  });
  const quickEl = h('div', { class: 'zd-quick' });
  const spacer = h('div', { class: 'zd-spacer', attrs: { 'aria-hidden': 'true' } });
  const profileEl = h('div', { class: 'zd-profile' });
  container.append(ritual.progress, tabBar.el, pickerWrap, st.el, hintEl, kit.actionBar(primaryBtn, randomBtn), ritual.receipt, spacer, profileEl);

  /* ---------- 状态 ---------- */
  const currentId = () => (tab === 'sign' ? signId : animalId);
  const current = () => (tab === 'sign' ? signById(signId) || SIGNS[0] : animalById(animalId) || ANIMALS[0]);
  const displayName = (cur) => (tab === 'sign' ? cur.name : `属${cur.name}`);

  function setBusy(value) {
    busy = value;
    primaryBtn.disabled = value;
    randomBtn.disabled = value;
    bdayBtn.disabled = value;
    bdayInput.disabled = value;
    [signChips.el, animalChips.el, tabBar.el].forEach((el) => el.querySelectorAll('button').forEach((b) => { b.disabled = value; }));
  }

  function showTab() {
    clear(strip);
    strip.append(tab === 'sign' ? signChips.el : animalChips.el);
    bdayField.replaceChildren(field(UI.birthLabel[tab], bdayInput));
    hintEl.querySelector('.hint-glyph')?.setAttribute('aria-hidden', 'true');
    refreshStage();
    centerChip(false);
  }

  /** 把选中的芯片滚到横条中间（只滚横条，不动页面） */
  function centerChip(smooth = true) {
    const list = tab === 'sign' ? signChips.el : animalChips.el;
    const active = list.querySelector('.chip.active');
    if (!active) return;
    const left = active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2;
    list.scrollTo({ left: Math.max(0, left), behavior: smooth && !ctx.platform.prefersReducedMotion ? 'smooth' : 'instant' });
  }

  function pick(id, fromChip = false) {
    if (busy) {
      (tab === 'sign' ? signChips : animalChips).set(currentId());
      return;
    }
    if (tab === 'sign') {
      signId = id;
      storage.set('sign', id);
      signChips.set(id);
    } else {
      animalId = id;
      storage.set('animal', id);
      animalChips.set(id);
    }
    if (fromChip) {
      sound.play('tick');
      haptic.tap();
    }
    centerChip();
    refreshStage();
  }

  /** 左右滑 / 摇一摇用：按顺序切到相邻的一个 */
  function switchBy(step) {
    if (busy || resultSheet) return;
    const list = tab === 'sign' ? SIGNS : ANIMALS;
    pick(stepIn(list, currentId(), step).id);
    sound.play('tick');
    haptic.tap();
  }

  function refreshStage() {
    const cur = current();
    fortune = null;
    holdSpace();
    ritual.clear();
    ritual.step(0);
    primaryBtn.setLabel(UI.primary);
    if (tab === 'sign') {
      sky.set({ kind: tab, stars: cur.stars || [], lines: cur.lines || [], glyph: cur.glyph, active: false, text: `${cur.name} · ${cur.dates} · ${ELEMENTS[cur.element].name}` });
    } else {
      sky.set({ kind: tab, stars: [], lines: [], glyph: cur.glyph, active: false, text: `属${cur.name} · 五行属${cur.element} · ${cur.glyph}时 ${BRANCH_HOUR[cur.glyph] || ''}` });
    }
    st.setBadge(displayName(cur));
    setHint(UI.gestureHint[tab]);
    renderProfile(cur);
    // 结果条收起后页面变短，先用占位撑住再放开，避免滚动位置跳动。
    if (window.scrollY > 0 && !ctx.platform.prefersReducedMotion) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      ctx.setTimeout(releaseSpace, 450);
    } else releaseSpace();
  }

  function holdSpace() {
    const r = ritual.receipt;
    if (r.hidden) return;
    const cs = getComputedStyle(r);
    spacer.style.height = `${r.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom)}px`;
  }
  function releaseSpace() {
    spacer.style.height = '0px';
  }

  function renderProfile(cur) {
    clear(profileEl);
    const title = UI.profileTitle[tab];
    const meta = tab === 'sign'
      ? `${cur.en} · ${cur.dates} · ${ELEMENTS[cur.element].name} · 守护星 ${cur.ruler} · ${QUALITIES[cur.quality].split(' ')[0]}`
      : `地支 ${cur.glyph} · 五行属${cur.element} · 相合 ${cur.match.join('、')} · 相冲 ${cur.clash}`;
    profileEl.append(
      h('div', { class: 'zd-sec-title' }, title),
      h('div', { class: 'zd-meta' }, meta),
      h('div', { class: 'zd-traits' }, cur.traits.map((t) => h('span', { class: 'zd-trait' }, t))),
      h('p', { class: 'zd-text' }, cur.profile),
    );
  }

  /* ---------- 生日 ---------- */
  function toggleBirthday() {
    if (busy) return;
    const open = bdayField.hidden;
    bdayField.hidden = !open;
    bdayBtn.setAttribute('aria-expanded', String(open));
    bdayBtn.classList.toggle('active', open);
    haptic.tap();
    if (open) ctx.setTimeout(() => { try { bdayInput.focus({ preventScroll: true }); } catch { /* ignore */ } }, 60);
  }
  function applyBirthday(v) {
    if (!v || busy) return;
    const [y, m, d] = v.split('-').map(Number);
    if (!m || !d || !y || y < 1900 || y > 2100) return;
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return;
    bday = v;
    storage.set('bday', v);
    if (tab === 'sign') {
      const s = signFromDate(m, d);
      pick(s.id);
      toast(`${m}月${d}日 · ${s.name}`);
    } else {
      const a = animalFromYmd(y, m, d);
      pick(a.id);
      toast(`${a.ganzhi}年 · 属${a.name}`);
    }
    sound.play('tick');
    haptic.light();
  }

  function randomPick() {
    if (busy || resultSheet) return;
    const list = tab === 'sign' ? SIGNS : ANIMALS;
    pick(stepIn(list, currentId(), 1 + Math.floor(ctx.rng.random() * (list.length - 1))).id);
    sound.play('pop');
    haptic.tap();
  }
  ctx.motion.onShake(() => {
    if (busy || resultSheet) return;
    randomPick();
    look();
  });

  /* ---------- 看运势 ---------- */
  async function look() {
    if (busy || resultSheet || !ritual.alive) return;
    setBusy(true);
    const cur = current();
    holdSpace();
    ritual.clear();
    haptic.light();
    sound.play('shimmer');
    sky.set({ active: true });
    st.setBadge(`${displayName(cur)} · 观星中`);
    setHint(UI.busyHint, true);
    if (!await ritual.focus()) return;
    if (!await ritual.pause(ctx.platform.simpleMotion ? 900 : 1800)) return;
    fortune = tab === 'sign' ? signFortune(cur, new Date()) : animalFortune(cur, new Date());
    sky.set({ active: false });
    sound.play(fortune.sound || 'chime');
    haptic.settle();
    st.setBadge(`${displayName(cur)} · ${fortune.label}`);
    ritual.step(1);
    ritual.reveal({
      kicker: `${formatDate(new Date())} · ${displayName(cur)}${fortune.sunIn ? ' · ' + UI.sunInBadge : ''}`,
      title: fortune.label,
      text: fortune.summary,
      onRead: openSheet,
    });
    renderQuick();
    ritual.receipt.insertBefore(quickEl, ritual.receipt.querySelector('.ritual-receipt-actions'));
    releaseSpace();
    primaryBtn.setLabel(UI.again);
    setBusy(false);
    setHint(UI.doneHint[tab], true);
    revealScroll();
  }

  /** 结果条若被首屏截断，轻轻滚到能看见「展开解读」为止。 */
  function revealScroll() {
    const r = ritual.receipt.getBoundingClientRect();
    const vh = window.visualViewport?.height || window.innerHeight;
    const over = r.bottom - (vh - 12);
    if (over > 0) window.scrollBy({ top: Math.min(over, Math.max(0, r.top - 84)), behavior: ctx.platform.prefersReducedMotion ? 'instant' : 'smooth' });
  }

  const swatch = (hex) => h('span', { class: 'zd-swatch', style: { background: hex }, attrs: { 'aria-hidden': 'true' } });
  const luckyText = (f) => `幸运色 ${f.color.name} · 幸运数字 ${f.number}${f.matchSign ? ' · 速配 ' + f.matchSign.short : f.matchAnimal ? ' · 速配 属' + f.matchAnimal.name : ''}`;

  function renderQuick() {
    clear(quickEl);
    const f = fortune;
    const row = (label, n) => h('div', { class: 'zd-qrow' }, h('span', { class: 'zd-qlabel' }, label), stars(n));
    quickEl.append(
      h('div', { class: 'zd-qrow zd-qmain' }, h('span', { class: 'zd-qlabel' }, '综合'), stars(f.overall)),
      h('div', { class: 'zd-qgrid' }, row(ASPECT_LABEL.love, f.love), row(ASPECT_LABEL.career, f.career), row(ASPECT_LABEL.wealth, f.wealth), row(ASPECT_LABEL.health, f.health)),
      h('div', { class: 'zd-lucky' }, swatch(f.color.hex), luckyText(f)),
    );
  }

  /* ---------- 解读抽屉 ---------- */
  function openSheet() {
    if (!fortune || resultSheet || busy) return;
    ritual.step(2);
    const cur = current();
    const f = fortune;
    const aspect = (n, text) => h('div', { class: 'zd-sec' }, h('span', { class: 'zd-sheet-stars' }, stars(n)), h('p', null, text));
    const sections = [
      {
        label: '综合',
        node: h('div', { class: 'zd-sec' },
          h('span', { class: 'zd-sheet-stars' }, stars(f.overall)),
          h('p', null, f.summary + (f.sunIn ? ' ' + UI.sunInSign : '')),
          h('div', { class: 'zd-lucky' }, swatch(f.color.hex), luckyText(f)),
          h('div', { class: 'zd-kw' }, `${UI.keywords} ${f.keywords.join(' · ')}`),
        ),
      },
      { label: ASPECT_LABEL.love, node: aspect(f.love, f.text.love) },
      { label: ASPECT_LABEL.career, node: aspect(f.career, f.text.career) },
      { label: ASPECT_LABEL.wealth, node: aspect(f.wealth, f.text.wealth) },
      { label: ASPECT_LABEL.health, node: aspect(f.health, f.text.health) },
      { label: UI.todayLabel, node: h('div', { class: 'zd-sec' }, h('p', { class: 'zd-quote' }, `「${f.quote}」`), h('p', null, `宜 ${f.yi} · 忌 ${f.ji}`)) },
    ];
    if (f.kind === 'animal' && f.year) {
      const y = f.year;
      sections.push({
        label: `${y.year.ganzhi}年运`,
        node: h('div', { class: 'zd-sec' }, h('p', null, h('b', null, `${y.name}${y.extra.length ? '（兼' + y.extra.join('、') + '）' : ''}。`), y.text), h('p', { class: 'zd-advice' }, y.advice)),
      });
    }
    const card = resultCard({
      kicker: formatDate(new Date()),
      title: displayName(cur),
      sub: tab === 'sign' ? `${cur.glyph} ${cur.en} · ${cur.dates}${f.sunIn ? ' · ' + UI.sunInBadge : ''}` : `${cur.glyph} · 五行属${cur.element}`,
      badge: f.label,
      seal: f.seal,
      verse: f.verse,
      sections,
      footer: UI.footer,
    });
    resultSheet = sheet({
      title: UI.sheetTitle,
      content: h('div', { class: 'm-zodiac' }, card),
      actions: [
        button(tab === 'sign' ? UI.changeSign : UI.changeAnimal, {
          variant: 'primary',
          onClick: () => {
            const s = resultSheet;
            resultSheet = null;
            s.close();
            ctx.setTimeout(() => {
              if (!ritual.alive) return;
              randomPick();
              look();
            }, 350);
          },
        }),
        button(UI.share, {
          variant: 'ghost',
          icon: 'share',
          onClick: async () => {
            const r = await ctx.share(shareText(f));
            toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制' : '分享已取消');
          },
        }),
      ],
      onClose: () => {
        resultSheet = null;
        if (ritual.alive) ritual.step(1);
      },
    });
    resultSheet.open();
  }

  /* ---------- 星仪 ---------- */
  function mountSky() {
    if (slot || !ritual.alive) return;
    const cur = current();
    slot = createModelSlot(ctx, { id: 'zodiac.sky', label: '星仪', glyph: cur.glyph, hint: UI.stageHint[tab] });
    slot.el.classList.add('zd-slot');
    st.scene.append(slot.el);
    slot.set(pendingSky);
    ctx.gesture.tap(slot.el, () => look());
    ctx.gesture.flick(slot.el, (g) => switchBy(g.direction === 'left' ? 1 : -1), { axis: 'x', direction: 'any', minDist: 36 });
  }

  showTab();
  ctx.setTimeout(mountSky, 0);
  return () => {
    resultSheet?.close();
  };
}
