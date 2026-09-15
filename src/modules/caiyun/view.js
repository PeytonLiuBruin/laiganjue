// 财运 · 界面。两页：今日财运（摇钱树 → 财运签 + 当日财神 / 吉时 / 宜忌）与我的财库（生辰 → 财星 / 财库 / 禄神 / 类型 / 流年）。
// 节奏：摇一摇 / 点实物 / 主按钮 → 实物摇动 → 结果条 →「展开解读」抽屉。
import { todayWealth, drawSign, wealthChart, shareToday, shareChart, formatDate, hourLabel } from './core.js';
import { UI, YEAR_NOTES } from './data.js';
import { createRitual } from '../../ui/ritual.js';
import { createModelSlot } from '../../ui/model-slot.js';
import { createBirthForm, describeBirth } from '../../ui/birth-form.js';

export function mount(container, ctx) {
  const { kit, haptic, sound, storage, profile } = ctx;
  const { h, button, tabs, stage, resultCard, sheet, toast, clear, stars } = kit;

  let tab = storage.get('tab', 'today');
  if (!UI.tabs.some((t) => t.value === tab)) tab = 'today';
  let busy = false;
  let resultSheet = null;
  let today = null;
  let sign = null;
  let wealth = null;

  /* ---------- 今日：生辰提示行 ---------- */
  const profileLine = h('div', { class: 'cy-profile' });
  function renderProfileLine() {
    clear(profileLine);
    const p = profile.get();
    profileLine.append(
      h('span', null, p ? UI.profileLine.replace('{birth}', describeBirth(p)) : UI.profileMissing),
      button(p ? '修改' : UI.profileGo, { variant: 'ghost', size: 'small', onClick: () => { if (busy) return; tabBar.set('chart'); tab = 'chart'; storage.set('tab', tab); showTab(); } }),
    );
  }

  /* ---------- 财库：生辰表单 ---------- */
  const form = createBirthForm(ctx, { value: profile.get() || { y: 1995, m: 6, d: 18, hour: -1, gender: 'male' }, title: UI.formTitle, onChange: (v) => { profile.set('self', v); renderProfileLine(); invalidate(); } });
  const formWrap = h('div', { class: 'cy-form', hidden: true }, form.el);

  /* ---------- 舞台：摇钱树 / 财库（实物占位，等待外部模型） ---------- */
  const st = stage({ cls: 'cy-stage', badge: UI.badge[tab] });
  const ritual = createRitual(ctx, st, ['求财', '揭示', '解读']);
  const tree = createModelSlot(ctx, { id: 'caiyun.tree', label: '摇钱树', glyph: '财', hint: UI.stageHint.today });
  const vault = createModelSlot(ctx, { id: 'caiyun.vault', label: '财库', glyph: '库', hint: UI.stageHint.chart });
  tree.el.classList.add('cy-slot');
  vault.el.classList.add('cy-slot');
  st.scene.append(tree.el, vault.el);

  /* ---------- 提示 / 按钮 ---------- */
  const hintEl = kit.hint('shake', UI.stageHint[tab]);
  hintEl.classList.add('cy-hint');
  const setHint = (text, quiet = false) => {
    if (hintEl.lastChild.textContent !== text) hintEl.lastChild.textContent = text;
    hintEl.classList.toggle('cy-quiet', quiet);
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
  const quickEl = h('div', { class: 'cy-quick' });
  container.append(ritual.progress, tabBar.el, profileLine, formWrap, st.el, hintEl, kit.actionBar(primaryBtn), ritual.receipt);

  ctx.gesture.tap(tree.el, () => act());
  ctx.gesture.tap(vault.el, () => act());
  ctx.motion.onShake(() => act());

  function setBusy(v) {
    busy = v;
    primaryBtn.disabled = v;
    form.setDisabled(v);
    tabBar.el.querySelectorAll('button').forEach((b) => { b.disabled = v; });
    profileLine.querySelectorAll('button').forEach((b) => { b.disabled = v; });
  }

  function showTab() {
    profileLine.hidden = tab !== 'today';
    formWrap.hidden = tab !== 'chart';
    tree.el.hidden = tab !== 'today';
    vault.el.hidden = tab !== 'chart';
    invalidate();
  }

  function invalidate() {
    if (busy) return;
    sign = null;
    wealth = null;
    ritual.clear();
    ritual.step(0);
    quickEl.remove();
    st.setBadge(UI.badge[tab]);
    setHint(UI.stageHint[tab], false);
    primaryBtn.setLabel(UI.primary[tab]);
    tree.set({ active: false, revealed: false, text: UI.stageHint.today });
    vault.set({ active: false, revealed: false, text: UI.stageHint.chart });
  }

  function act() {
    return tab === 'today' ? shakeTree() : lookVault();
  }

  const rowOf = (label, node) => h('div', { class: 'cy-qrow' }, h('span', { class: 'cy-qlabel' }, label), node);

  /* ---------- 今日财运：摇钱树 ---------- */
  async function shakeTree() {
    if (busy || resultSheet || !ritual.alive) return;
    setBusy(true);
    ritual.clear();
    quickEl.remove();
    haptic.tap();
    sound.play('shake');
    tree.set({ active: true, text: UI.busyHint.today });
    st.setBadge(`${UI.badge.today} · 摇动中`);
    setHint(UI.busyHint.today, true);
    if (!await ritual.focus()) return;
    if (!await ritual.pause(ctx.platform.simpleMotion ? 600 : 1400)) return;
    try {
      today = todayWealth(profile.get(), new Date());
      sign = drawSign(ctx.rng.random);
    } catch (e) {
      console.error('[caiyun]', e);
      setBusy(false);
      toast('计算出错，请稍后再试');
      return;
    }
    tree.set({ active: false, revealed: true, level: sign.level, text: `${sign.level}签 · ${sign.title}` });
    sound.play(sign.level === '上' ? 'coin' : 'chime');
    haptic.success();
    st.setBadge(`${today.day.dayGanZhi}日 · ${sign.level}签`);
    ritual.step(1);
    ritual.reveal({
      kicker: `${formatDate(new Date())} · ${today.day.dayGanZhi}日 · 财运签 第${sign.no}签`,
      title: `${sign.title}`,
      text: sign.verse.replace('\n', '，') + '。',
      onRead: openTodaySheet,
    });
    renderQuickToday();
    ritual.receipt.insertBefore(quickEl, ritual.receipt.querySelector('.ritual-receipt-actions'));
    primaryBtn.setLabel(UI.again.today);
    setBusy(false);
    setHint(UI.doneHint.today, true);
    revealScroll();
  }

  function renderQuickToday() {
    clear(quickEl);
    const t = today;
    const hours = t.luckyHours.slice(0, 2).map((x, i) => h('span', { class: 'cy-nowrap' }, (i ? ' · ' : '') + hourLabel(x)));
    quickEl.append(
      rowOf(UI.quick.index, h('span', { class: 'cy-qstars' }, stars(t.stars), h('b', null, t.level.title))),
      rowOf(UI.quick.cai, h('b', null, t.positions.cai)),
      rowOf(UI.quick.hours, h('span', null, hours.length ? hours : '今日宜守')),
      rowOf(UI.quick.yi, h('span', null, t.yi.length ? t.yi.join(' · ') : '无特别事项')),
    );
  }

  function openTodaySheet() {
    if (!sign || !today || resultSheet || busy) return;
    ritual.step(2);
    const t = today;
    const s = sign;
    const hourList = h('ul', { class: 'cy-hours' }, t.day.hours.map((x) => h('li', { class: [x.lucky && 'on', x.index === t.current?.index && 'now'] }, h('b', null, `${x.zhi}时`), h('span', null, hourLabel(x).slice(3)), h('i', null, x.lucky ? `吉 · ${x.cai}` : '平'))));
    const sections = [
      { label: UI.sections.sign, text: s.meaning },
      { label: UI.sections.advice, node: h('p', { class: 'cy-advice' }, s.advice) },
      {
        label: UI.sections.today,
        node: h('div', { class: 'cy-sec' },
          h('span', { class: 'cy-sheet-stars' }, stars(t.stars), h('em', null, `${t.index} · ${t.level.title}`)),
          h('p', null, t.level.text),
          t.relation ? h('p', null, h('b', null, `${t.relation.title}。`), t.relation.text) : h('p', { class: 'cy-faint' }, UI.profileMissing),
          t.notes.length ? h('p', { class: 'cy-faint' }, t.notes.join(' ')) : null,
          h('p', { class: 'cy-faint' }, `今日一事：${t.tip}`)),
      },
      { label: UI.sections.positions, text: UI.positionsText.replace('{cai}', t.positions.cai).replace('{xi}', t.positions.xi).replace('{fu}', t.positions.fu) },
      { label: UI.sections.hours, node: h('div', { class: 'cy-sec' }, h('p', { class: 'cy-faint' }, t.luckyHours.length ? UI.hoursLead : UI.hoursNone), hourList), stack: true },
      { label: UI.sections.yiji, node: h('div', { class: 'cy-sec' }, h('p', null, h('b', null, '宜 '), t.yi.length ? t.yi.join(' · ') : UI.yiNone), h('p', null, h('b', null, '忌 '), t.ji.length ? t.ji.join(' · ') : UI.jiNone)) },
    ];
    const card = resultCard({
      kicker: `${formatDate(new Date())} · ${t.day.dayGanZhi}日`,
      title: s.title,
      sub: `财运签 · 第${s.no}签 · ${s.level}签 · 农历${t.day.lunarText}`,
      badge: t.level.title,
      seal: s.seal,
      verse: s.verse,
      sections,
      footer: UI.footer,
    });
    resultSheet = sheet({
      title: UI.sheetTitle.today,
      content: h('div', { class: 'm-caiyun' }, card),
      actions: [
        button(UI.again.today, { variant: 'primary', onClick: () => { const sh = resultSheet; resultSheet = null; sh.close(); ctx.setTimeout(() => ritual.alive && shakeTree(), 350); } }),
        button(UI.share, { variant: 'ghost', icon: 'share', onClick: async () => { const r = await ctx.share(shareToday(t, s)); toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制' : '分享已取消'); } }),
      ],
      onClose: () => { resultSheet = null; if (ritual.alive) ritual.step(1); },
    });
    resultSheet.open();
  }

  /* ---------- 我的财库 ---------- */
  async function lookVault() {
    if (busy || resultSheet || !ritual.alive) return;
    setBusy(true);
    ritual.clear();
    quickEl.remove();
    haptic.tap();
    sound.play('shimmer');
    vault.set({ active: true, text: UI.busyHint.chart });
    st.setBadge(`${UI.badge.chart} · 清点中`);
    setHint(UI.busyHint.chart, true);
    if (!await ritual.focus()) return;
    if (!await ritual.pause(ctx.platform.simpleMotion ? 600 : 1300)) return;
    try {
      wealth = wealthChart(form.value, new Date());
    } catch (e) {
      console.error('[caiyun]', e);
      setBusy(false);
      toast('生辰有误，请检查后再试');
      return;
    }
    profile.set('self', form.value);
    renderProfileLine();
    vault.set({ active: false, revealed: true, text: wealth.type.name });
    sound.play('coin');
    haptic.settle();
    st.setBadge(`${wealth.chart.animal}命 · ${wealth.type.name}`);
    ritual.step(1);
    ritual.reveal({
      kicker: `${describeBirth(wealth.chart.input)} · 日主 ${wealth.chart.dayStem}${wealth.chart.dayElement}`,
      title: wealth.type.name,
      text: wealth.type.text,
      onRead: openVaultSheet,
    });
    renderQuickVault();
    ritual.receipt.insertBefore(quickEl, ritual.receipt.querySelector('.ritual-receipt-actions'));
    primaryBtn.setLabel(UI.again.chart);
    setBusy(false);
    setHint(UI.doneHint.chart, true);
    revealScroll();
  }

  function starsText(w) {
    return UI.starsText[w.starsKey].replace('{z}', String(w.zheng)).replace('{p}', String(w.pian));
  }

  function renderQuickVault() {
    clear(quickEl);
    const w = wealth;
    const next = w.nextYear ? `${w.nextYear.year} ${w.nextYear.ganZhi}年 · ${w.nextYear.note}` : '静待时机';
    quickEl.append(
      rowOf(UI.quick.stars, h('span', null, starsText(w))),
      rowOf(UI.quick.treasury, h('span', null, w.treasuryText.title)),
      rowOf(UI.quick.lu, h('span', null, `${w.luDirection} · ${w.luHours}`)),
      rowOf(UI.quick.next, h('b', null, next)),
    );
  }

  function openVaultSheet() {
    if (!wealth || resultSheet || busy) return;
    ritual.step(2);
    const w = wealth;
    const notes = [...new Set(w.years.flatMap((y) => y.tags))].map((t) => YEAR_NOTES[t]);
    const yearList = h('ul', { class: 'cy-years' }, w.years.map((y) => h('li', { class: [y.tags.length && 'on', y.tags.some((t) => t === 'zhengcai' || t === 'piancai' || t === 'treasury') && 'hot'] }, h('b', null, String(y.year)), h('span', null, `${y.ganZhi} · ${y.animal}`), h('i', null, y.note || '平年'))));
    const sections = [
      { label: UI.chartSections.type, node: h('div', { class: 'cy-sec' }, h('p', null, h('b', null, `${w.type.title}。`), w.type.text), h('p', { class: 'cy-advice' }, w.type.advice), h('p', { class: 'cy-faint' }, `适合的路子：${w.type.suits}`)) },
      { label: UI.chartSections.stars, text: `${starsText(w)} 你的财星五行为${w.wealthEl}。` },
      { label: UI.chartSections.treasury, node: h('div', { class: 'cy-sec' }, h('p', null, h('b', null, `${w.treasuryText.title}。`), w.treasuryText.text), h('p', { class: 'cy-faint' }, `财库地支：${w.treasury.join('、')}`)) },
      { label: UI.chartSections.lu, node: h('div', { class: 'cy-sec' }, h('p', null, h('b', null, `${w.luText.title}。`), w.luText.text), h('p', { class: 'cy-faint' }, `禄神在${w.lu}：方位${w.luDirection}，时辰 ${w.luHours}`)) },
      { label: UI.chartSections.strength, text: w.strengthText },
      { label: UI.chartSections.years, node: h('div', { class: 'cy-sec' }, yearList, h('p', { class: 'cy-faint' }, notes.length ? notes.map((n) => `${n.short}：${n.text}`).join(' ') : UI.noHighlight)), stack: true },
    ];
    const card = resultCard({
      kicker: describeBirth(w.chart.input),
      title: w.type.name,
      sub: `${w.chart.animal}命 · 日主 ${w.chart.dayStem}${w.chart.dayElement} · 财星属${w.wealthEl}`,
      badge: w.treasuryText.title,
      seal: w.type.name.slice(0, 1),
      verse: w.nextYear ? `${w.nextYear.year} ${w.nextYear.ganZhi}年\n${w.nextYear.note}` : '财在日积月累里',
      sections,
      footer: UI.footer,
    });
    resultSheet = sheet({
      title: UI.sheetTitle.chart,
      content: h('div', { class: 'm-caiyun' }, card),
      actions: [
        button(UI.again.chart, { variant: 'primary', onClick: () => { const sh = resultSheet; resultSheet = null; sh.close(); ctx.setTimeout(() => ritual.alive && lookVault(), 350); } }),
        button(UI.share, { variant: 'ghost', icon: 'share', onClick: async () => { const r = await ctx.share(shareChart(w)); toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制' : '分享已取消'); } }),
      ],
      onClose: () => { resultSheet = null; if (ritual.alive) ritual.step(1); },
    });
    resultSheet.open();
  }

  function revealScroll() {
    const r = ritual.receipt.getBoundingClientRect();
    const vh = window.visualViewport?.height || window.innerHeight;
    const over = r.bottom - (vh - 12);
    if (over > 0) window.scrollBy({ top: Math.min(over, Math.max(0, r.top - 84)), behavior: ctx.platform.prefersReducedMotion ? 'instant' : 'smooth' });
  }

  renderProfileLine();
  showTab();
  return () => {
    if (resultSheet) { const s = resultSheet; resultSheet = null; s.close(); }
  };
}
