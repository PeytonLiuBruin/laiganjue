// 姻缘 · 界面。两页：正缘（一人生辰 → 夫妻宫 / 配偶星 / 感情流年 / 今日桃花）与合婚（两人生辰 → 缘分分数）。
// 节奏：填生辰 → 主按钮 / 点实物 / 摇一摇 → 实物收紧 → 四枚小印依次亮起 → 结果条 →「展开解读」抽屉。
import { loveProfile, matchPair, shareMatch, shareLove, formatDate } from './core.js';
import { UI, YEAR_NOTES } from './data.js';
import { createRitual } from '../../ui/ritual.js';
import { createModelSlot } from '../../ui/model-slot.js';
import { createBirthForm, describeBirth } from '../../ui/birth-form.js';

export function mount(container, ctx) {
  const { kit, haptic, sound, storage, profile } = ctx;
  const { h, button, tabs, stage, resultCard, sheet, toast, clear, stars, countUp } = kit;

  let tab = storage.get('tab', 'self');
  if (!UI.tabs.some((t) => t.value === tab)) tab = 'self';
  let busy = false;
  let resultSheet = null;
  let love = null;
  let match = null;

  /* ---------- 生辰表单 ---------- */
  const self = profile.get() || { y: 1995, m: 6, d: 18, hour: -1, gender: 'male' };
  const partnerDefault = profile.get('partner') || { y: 1996, m: 8, d: 8, hour: -1, gender: self.gender === 'female' ? 'male' : 'female' };
  const selfForm = createBirthForm(ctx, { value: self, title: UI.formTitle.self, onChange: (v) => { profile.set('self', v); aForm.set(v); invalidate(); } });
  const aForm = createBirthForm(ctx, { value: self, title: UI.formTitle.a, onChange: (v) => { profile.set('self', v); selfForm.set(v); invalidate(); } });
  const bForm = createBirthForm(ctx, { value: partnerDefault, title: UI.formTitle.b, onChange: (v) => { profile.set('partner', v); invalidate(); } });
  const selfWrap = h('div', { class: 'yy-forms' }, selfForm.el);
  const pairWrap = h('div', { class: 'yy-forms yy-pair', hidden: true }, aForm.el, h('div', { class: 'yy-x', attrs: { 'aria-hidden': 'true' } }, '×'), bForm.el);

  /* ---------- 舞台：同心结 / 红线（实物占位，等待外部模型） ---------- */
  const st = stage({ cls: 'yy-stage', badge: UI.badge[tab] });
  const ritual = createRitual(ctx, st, ['生辰', '结缘', '解读']);
  const knot = createModelSlot(ctx, { id: 'yinyuan.knot', label: '同心结', glyph: '缘', hint: UI.stageHint.self });
  const thread = createModelSlot(ctx, { id: 'yinyuan.thread', label: '红线', glyph: '囍', hint: UI.stageHint.pair });
  knot.el.classList.add('yy-slot');
  thread.el.classList.add('yy-slot');
  st.scene.append(knot.el, thread.el);
  const pips = h('div', { class: 'yy-pips', hidden: true, attrs: { 'aria-hidden': 'true' } });

  /* ---------- 提示 / 按钮 ---------- */
  const hintEl = kit.hint('shake', UI.stageHint[tab]);
  hintEl.classList.add('yy-hint');
  const setHint = (text, quiet = false) => {
    if (hintEl.lastChild.textContent !== text) hintEl.lastChild.textContent = text;
    hintEl.classList.toggle('yy-quiet', quiet);
  };
  const primaryBtn = button(UI.primary[tab], { variant: 'primary', size: 'large', primary: true, onClick: () => act() });
  const tabBar = tabs(UI.tabs, {
    value: tab,
    onChange: (v) => {
      if (busy) { tabBar.set(tab); return; }
      tab = v;
      storage.set('tab', v);
      showTab();
      sound.play('paper');
      haptic.tap();
    },
  });
  const quickEl = h('div', { class: 'yy-quick' });
  container.append(ritual.progress, tabBar.el, selfWrap, pairWrap, st.el, pips, hintEl, kit.actionBar(primaryBtn), ritual.receipt);

  ctx.gesture.tap(knot.el, () => act());
  ctx.gesture.tap(thread.el, () => act());
  ctx.motion.onShake(() => act());

  function setBusy(v) {
    busy = v;
    primaryBtn.disabled = v;
    selfForm.setDisabled(v);
    aForm.setDisabled(v);
    bForm.setDisabled(v);
    tabBar.el.querySelectorAll('button').forEach((b) => { b.disabled = v; });
  }

  function showTab() {
    selfWrap.hidden = tab !== 'self';
    pairWrap.hidden = tab !== 'pair';
    knot.el.hidden = tab !== 'self';
    thread.el.hidden = tab !== 'pair';
    invalidate();
  }

  /** 表单或页签变动后，旧结果作废 */
  function invalidate() {
    if (busy) return;
    love = null;
    match = null;
    ritual.clear();
    ritual.step(0);
    pips.hidden = true;
    clear(pips);
    quickEl.remove();
    st.setBadge(UI.badge[tab]);
    setHint(UI.stageHint[tab], false);
    primaryBtn.setLabel(UI.primary[tab]);
    knot.set({ active: false, revealed: false, text: UI.stageHint.self });
    thread.set({ active: false, revealed: false, text: UI.stageHint.pair });
  }

  function act() {
    return tab === 'self' ? lookSelf() : tie();
  }

  /* ---------- 正缘 ---------- */
  async function lookSelf() {
    if (busy || resultSheet || !ritual.alive) return;
    setBusy(true);
    ritual.clear();
    quickEl.remove();
    haptic.tap();
    sound.play('shimmer');
    knot.set({ active: true, text: UI.busyHint.self });
    st.setBadge(`${UI.badge.self} · 结缘中`);
    setHint(UI.busyHint.self, true);
    if (!await ritual.focus()) return;
    if (!await ritual.pause(ctx.platform.simpleMotion ? 700 : 1500)) return;
    try {
      love = loveProfile(selfForm.value, new Date());
    } catch (e) {
      console.error('[yinyuan]', e);
      setBusy(false);
      toast('生辰有误，请检查后再试');
      return;
    }
    profile.set('self', selfForm.value);
    knot.set({ active: false, revealed: true, text: love.daily.title });
    sound.play('chime');
    haptic.settle();
    st.setBadge(`${love.chart.animal}命 · 夫妻宫 ${love.palace}`);
    ritual.step(1);
    ritual.reveal({
      kicker: `${formatDate(new Date())} · ${UI.quick.today}`,
      title: love.daily.title,
      text: love.daily.text,
      onRead: openSelfSheet,
    });
    renderQuickSelf();
    ritual.receipt.insertBefore(quickEl, ritual.receipt.querySelector('.ritual-receipt-actions'));
    primaryBtn.setLabel(UI.again.self);
    setBusy(false);
    setHint(UI.doneHint.self, true);
    revealScroll();
  }

  function renderQuickSelf() {
    clear(quickEl);
    const p = love;
    const row = (label, node) => h('div', { class: 'yy-qrow' }, h('span', { class: 'yy-qlabel' }, label), node);
    const next = p.nextLove ? `${p.nextLove.year} ${p.nextLove.ganZhi}年 · ${p.nextLove.note}` : '静待时机';
    quickEl.append(
      row(UI.quick.today, stars(p.daily.stars)),
      row(UI.quick.next, h('b', null, next)),
      row(UI.quick.palace, h('span', null, `${p.palace} · ${p.palaceText.title}`)),
      row(UI.quick.direction, h('span', null, p.taoHuaDirection)),
    );
  }

  function openSelfSheet() {
    if (!love || resultSheet || busy) return;
    ritual.step(2);
    const p = love;
    const notes = [...new Set(p.years.flatMap((y) => y.tags))].map((t) => YEAR_NOTES[t]);
    const yearList = h(
      'ul',
      { class: 'yy-years' },
      p.years.map((y) => h('li', { class: [y.tags.length && 'on', (y.tags.includes('hongLuan') || y.tags.includes('tianXi')) && 'hot'] }, h('b', null, String(y.year)), h('span', null, `${y.ganZhi} · ${y.animal}`), h('i', null, y.note || '平年'))),
    );
    const sections = [
      { label: UI.sections.today, node: h('div', { class: 'yy-sec' }, h('span', { class: 'yy-sheet-stars' }, stars(p.daily.stars), h('em', null, `${p.daily.index}`)), h('p', null, p.daily.text), h('p', { class: 'yy-tip' }, `${UI.sections.tip}：${p.daily.tip}`)) },
      { label: UI.sections.palace, node: h('div', { class: 'yy-sec' }, h('p', null, h('b', null, `${p.palace} · ${p.palaceText.title}。`), p.palaceText.text)) },
      { label: UI.sections.star, node: h('div', { class: 'yy-sec' }, h('p', null, h('b', null, `${p.star.text.title}。`), p.star.text.text)) },
      { label: UI.sections.years, node: h('div', { class: 'yy-sec' }, yearList, h('p', { class: 'yy-notes' }, notes.length ? notes.map((n) => `${n.short}：${n.text}`).join(' ') : UI.noHighlight)), stack: true },
      { label: UI.sections.taohua, node: h('div', { class: 'yy-sec' }, h('p', null, UI.taoHuaText.replace('{dir}', p.taoHuaDirection)), p.hasTaoHua ? h('p', null, UI.taoHuaBorn) : null) },
    ];
    const card = resultCard({
      kicker: `${formatDate(new Date())} · ${p.chart.animal}命`,
      title: p.palaceText.title,
      sub: `${describeBirth(p.chart.input)} · 夫妻宫 ${p.palace} · 日主 ${p.chart.dayStem}${p.chart.dayElement}`,
      badge: p.daily.title,
      seal: p.daily.seal,
      verse: p.nextLove ? `${p.nextLove.year} ${p.nextLove.ganZhi}年\n${p.nextLove.note}` : '缘分在日子里，不在年份里',
      sections,
      footer: UI.footer,
    });
    resultSheet = sheet({
      title: UI.sheetTitle.self,
      content: h('div', { class: 'm-yinyuan' }, card),
      actions: [
        button(UI.again.self, { variant: 'primary', onClick: () => { const s = resultSheet; resultSheet = null; s.close(); ctx.setTimeout(() => ritual.alive && lookSelf(), 350); } }),
        button(UI.share, { variant: 'ghost', icon: 'share', onClick: async () => { const r = await ctx.share(shareLove(p)); toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制' : '分享已取消'); } }),
      ],
      onClose: () => { resultSheet = null; if (ritual.alive) ritual.step(1); },
    });
    resultSheet.open();
  }

  /* ---------- 合婚 ---------- */
  async function tie() {
    if (busy || resultSheet || !ritual.alive) return;
    setBusy(true);
    ritual.clear();
    quickEl.remove();
    haptic.tap();
    sound.play('whoosh');
    thread.set({ active: true, text: UI.busyHint.pair });
    st.setBadge(`${UI.badge.pair} · 牵线中`);
    setHint(UI.busyHint.pair, true);
    try {
      match = matchPair(aForm.value, bForm.value);
    } catch (e) {
      console.error('[yinyuan]', e);
      setBusy(false);
      toast('生辰有误，请检查后再试');
      return;
    }
    profile.set('self', aForm.value);
    profile.set('partner', bForm.value);
    clear(pips);
    const pipEls = match.items.map((it) => h('span', { class: ['yy-pip', it.tone] }, `${it.label} · ${it.title}`));
    pips.append(...pipEls);
    pips.hidden = false;
    if (!await ritual.focus()) return;
    const step = ctx.platform.simpleMotion ? 160 : 420;
    for (let i = 0; i < pipEls.length; i++) {
      if (!await ritual.pause(step)) return;
      pipEls[i].classList.add('on');
      sound.play('tick');
      haptic.tap();
    }
    if (!await ritual.pause(ctx.platform.simpleMotion ? 120 : 360)) return;
    thread.set({ active: false, revealed: true, text: `${match.score} 分 · ${match.level.name}` });
    sound.play(match.level.tone === 'great' ? 'success' : 'chime');
    haptic.success();
    st.setBadge(`${match.a.animal} × ${match.b.animal} · ${match.level.name}`);
    ritual.step(1);
    const num = h('b', { class: 'yy-score-num' }, '0');
    ritual.reveal({
      kicker: `${match.a.animal} × ${match.b.animal} · 缘分`,
      title: h('span', { class: 'yy-score' }, num, h('small', null, UI.scoreUnit), h('span', { class: 'yy-level' }, match.level.name)),
      text: match.level.text,
      onRead: openPairSheet,
    });
    countUp(num, match.score, { duration: ctx.platform.prefersReducedMotion ? 10 : 900 });
    primaryBtn.setLabel(UI.again.pair);
    setBusy(false);
    setHint(UI.doneHint.pair, true);
    revealScroll();
  }

  function openPairSheet() {
    if (!match || resultSheet || busy) return;
    ritual.step(2);
    const r = match;
    const sec = (it) => ({ label: `${it.label} · ${it.title}`, node: h('div', { class: 'yy-sec' }, h('span', { class: ['yy-tone', it.tone] }, it.pair), h('p', null, it.text)) });
    const sections = [
      ...r.items.map(sec),
      { label: UI.pairSections.sweet, node: h('div', { class: 'yy-sec' }, h('p', null, h('b', null, `${r.sweet.label}${r.sweet.title}。`), r.sweet.text)) },
      { label: UI.pairSections.rough, node: h('div', { class: 'yy-sec' }, h('p', null, r.rough ? [h('b', null, `${r.rough.label}${r.rough.title}。`), r.rough.text] : '没有明显的磕绊处，常见的分歧多来自生活习惯，聊开就好。')) },
      { label: UI.pairSections.advice, node: h('div', { class: 'yy-sec' }, h('p', { class: 'yy-advice' }, r.level.advice)) },
    ];
    const card = resultCard({
      kicker: `合婚 · ${r.a.animal} × ${r.b.animal}`,
      title: `${r.score} ${UI.scoreUnit}`,
      sub: `${describeBirth(r.a.input)}（${r.a.dayStem}${r.a.dayElement}）× ${describeBirth(r.b.input)}（${r.b.dayStem}${r.b.dayElement}）`,
      badge: r.level.name,
      seal: r.level.seal,
      verse: r.level.verse,
      sections,
      footer: UI.footer,
    });
    resultSheet = sheet({
      title: UI.sheetTitle.pair,
      content: h('div', { class: 'm-yinyuan' }, card),
      actions: [
        button(UI.again.pair, { variant: 'primary', onClick: () => { const s = resultSheet; resultSheet = null; s.close(); ctx.setTimeout(() => ritual.alive && tie(), 350); } }),
        button(UI.share, { variant: 'ghost', icon: 'share', onClick: async () => { const res = await ctx.share(shareMatch(r)); toast(res === 'shared' ? '已分享' : res === 'copied' ? '已复制' : '分享已取消'); } }),
      ],
      onClose: () => { resultSheet = null; if (ritual.alive) ritual.step(1); },
    });
    resultSheet.open();
  }

  /** 结果条若被首屏截断，轻轻滚到能看见「展开解读」为止。 */
  function revealScroll() {
    const r = ritual.receipt.getBoundingClientRect();
    const vh = window.visualViewport?.height || window.innerHeight;
    const over = r.bottom - (vh - 12);
    if (over > 0) window.scrollBy({ top: Math.min(over, Math.max(0, r.top - 84)), behavior: ctx.platform.prefersReducedMotion ? 'instant' : 'smooth' });
  }

  showTab();
  return () => {
    if (resultSheet) { const s = resultSheet; resultSheet = null; s.close(); }
  };
}
