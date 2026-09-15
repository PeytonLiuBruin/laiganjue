// 事业 · 界面。两页：今日事业（官印 → 事业签 + 当日贵人方位 / 吉时 / 宜忌）与事业格局（生辰 → 格局 / 贵人属相 / 驿马 / 文昌 / 流年）。
// 节奏：摇一摇 / 点实物 / 主按钮 → 实物落印 → 结果条 →「展开解读」抽屉。
import { todayCareer, drawSign, careerChart, shareToday, shareChart, formatDate, hourLabel } from './core.js';
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
  let career = null;

  /* ---------- 今日：生辰提示行 ---------- */
  const profileLine = h('div', { class: 'sy-profile' });
  function renderProfileLine() {
    clear(profileLine);
    const p = profile.get();
    profileLine.append(
      h('span', null, p ? UI.profileLine.replace('{birth}', describeBirth(p)) : UI.profileMissing),
      button(p ? '修改' : UI.profileGo, { variant: 'ghost', size: 'small', onClick: () => { if (busy) return; tabBar.set('chart'); tab = 'chart'; storage.set('tab', tab); showTab(); } }),
    );
  }

  /* ---------- 格局：生辰表单 ---------- */
  const form = createBirthForm(ctx, { value: profile.get() || { y: 1995, m: 6, d: 18, hour: -1, gender: 'male' }, title: UI.formTitle, onChange: (v) => { profile.set('self', v); renderProfileLine(); invalidate(); } });
  const formWrap = h('div', { class: 'sy-form', hidden: true }, form.el);

  /* ---------- 舞台：官印 / 格局（实物占位，等待外部模型） ---------- */
  const st = stage({ cls: 'sy-stage', badge: UI.badge[tab] });
  const ritual = createRitual(ctx, st, ['求签', '揭示', '解读']);
  const seal = createModelSlot(ctx, { id: 'shiye.seal', label: '官印', glyph: '印', hint: UI.stageHint.today });
  const ladder = createModelSlot(ctx, { id: 'shiye.ladder', label: '青云梯', glyph: '仕', hint: UI.stageHint.chart });
  seal.el.classList.add('sy-slot');
  ladder.el.classList.add('sy-slot');
  st.scene.append(seal.el, ladder.el);

  /* ---------- 提示 / 按钮 ---------- */
  const hintEl = kit.hint('shake', UI.stageHint[tab]);
  hintEl.classList.add('sy-hint');
  const setHint = (text, quiet = false) => {
    if (hintEl.lastChild.textContent !== text) hintEl.lastChild.textContent = text;
    hintEl.classList.toggle('sy-quiet', quiet);
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
  const quickEl = h('div', { class: 'sy-quick' });
  container.append(ritual.progress, tabBar.el, profileLine, formWrap, st.el, hintEl, kit.actionBar(primaryBtn), ritual.receipt);

  ctx.gesture.tap(seal.el, () => act());
  ctx.gesture.tap(ladder.el, () => act());
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
    seal.el.hidden = tab !== 'today';
    ladder.el.hidden = tab !== 'chart';
    invalidate();
  }

  function invalidate() {
    if (busy) return;
    sign = null;
    career = null;
    ritual.clear();
    ritual.step(0);
    quickEl.remove();
    st.setBadge(UI.badge[tab]);
    setHint(UI.stageHint[tab], false);
    primaryBtn.setLabel(UI.primary[tab]);
    seal.set({ active: false, revealed: false, text: UI.stageHint.today });
    ladder.set({ active: false, revealed: false, text: UI.stageHint.chart });
  }

  function act() {
    return tab === 'today' ? stamp() : lookChart();
  }

  const rowOf = (label, node) => h('div', { class: 'sy-qrow' }, h('span', { class: 'sy-qlabel' }, label), node);

  /* ---------- 今日事业：落印求签 ---------- */
  async function stamp() {
    if (busy || resultSheet || !ritual.alive) return;
    setBusy(true);
    ritual.clear();
    quickEl.remove();
    haptic.tap();
    sound.play('shake');
    seal.set({ active: true, text: UI.busyHint.today });
    st.setBadge(`${UI.badge.today} · 落印中`);
    setHint(UI.busyHint.today, true);
    if (!await ritual.focus()) return;
    if (!await ritual.pause(ctx.platform.simpleMotion ? 600 : 1400)) return;
    try {
      today = todayCareer(profile.get(), new Date());
      sign = drawSign(ctx.rng.random);
    } catch (e) {
      console.error('[shiye]', e);
      setBusy(false);
      toast('计算出错，请稍后再试');
      return;
    }
    seal.set({ active: false, revealed: true, level: sign.level, text: `${sign.level}签 · ${sign.title}` });
    sound.play(sign.level === '上' ? 'gong' : 'thud');
    haptic.success();
    st.setBadge(`${today.day.dayGanZhi}日 · ${sign.level}签`);
    ritual.step(1);
    ritual.reveal({
      kicker: `${formatDate(new Date())} · ${today.day.dayGanZhi}日 · 事业签 第${sign.no}签`,
      title: sign.title,
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
    const hours = t.luckyHours.slice(0, 2).map((x, i) => h('span', { class: 'sy-nowrap' }, (i ? ' · ' : '') + hourLabel(x)));
    quickEl.append(
      rowOf(UI.quick.index, h('span', { class: 'sy-qstars' }, stars(t.stars), h('b', null, t.level.title))),
      rowOf(UI.quick.gui, h('b', null, `${t.gui.now} · ${t.gui.label}`)),
      rowOf(UI.quick.hours, h('span', null, hours.length ? hours : '今日宜缓')),
      rowOf(UI.quick.yi, h('span', null, t.yi.length ? t.yi.join(' · ') : '无特别事项')),
    );
  }

  function openTodaySheet() {
    if (!sign || !today || resultSheet || busy) return;
    ritual.step(2);
    const t = today;
    const s = sign;
    const hourList = h('ul', { class: 'sy-hours' }, t.day.hours.map((x) => h('li', { class: [x.lucky && 'on', x.index === t.current?.index && 'now'] }, h('b', null, `${x.zhi}时`), h('span', null, hourLabel(x).slice(3)), h('i', null, x.lucky ? `吉 · ${x.xi}` : '平'))));
    const sections = [
      { label: UI.sections.sign, text: s.meaning },
      { label: UI.sections.advice, node: h('p', { class: 'sy-advice' }, s.advice) },
      {
        label: UI.sections.today,
        node: h('div', { class: 'sy-sec' },
          h('span', { class: 'sy-sheet-stars' }, stars(t.stars), h('em', null, `${t.index} · ${t.level.title}`)),
          h('p', null, t.level.text),
          t.relation ? h('p', null, h('b', null, `${t.relation.title}。`), t.relation.text) : h('p', { class: 'sy-faint' }, UI.profileMissing),
          t.notes.length ? h('p', { class: 'sy-faint' }, t.notes.join(' ')) : null,
          h('p', { class: 'sy-faint' }, `今日一事：${t.tip}`)),
      },
      { label: UI.sections.positions, text: UI.guiText.replace('{yang}', t.gui.yang).replace('{yin}', t.gui.yin).replace('{now}', t.gui.now) },
      { label: UI.sections.hours, node: h('div', { class: 'sy-sec' }, h('p', { class: 'sy-faint' }, t.luckyHours.length ? UI.hoursLead : UI.hoursNone), hourList), stack: true },
      { label: UI.sections.yiji, node: h('div', { class: 'sy-sec' }, h('p', null, h('b', null, '宜 '), t.yi.length ? t.yi.join(' · ') : UI.yiNone), h('p', null, h('b', null, '忌 '), t.ji.length ? t.ji.join(' · ') : UI.jiNone)) },
    ];
    const card = resultCard({
      kicker: `${formatDate(new Date())} · ${t.day.dayGanZhi}日`,
      title: s.title,
      sub: `事业签 · 第${s.no}签 · ${s.level}签 · 农历${t.day.lunarText}`,
      badge: t.level.title,
      seal: s.seal,
      verse: s.verse,
      sections,
      footer: UI.footer,
    });
    resultSheet = sheet({
      title: UI.sheetTitle.today,
      content: h('div', { class: 'm-shiye' }, card),
      actions: [
        button(UI.again.today, { variant: 'primary', onClick: () => { const sh = resultSheet; resultSheet = null; sh.close(); ctx.setTimeout(() => ritual.alive && stamp(), 350); } }),
        button(UI.share, { variant: 'ghost', icon: 'share', onClick: async () => { const r = await ctx.share(shareToday(t, s)); toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制' : '分享已取消'); } }),
      ],
      onClose: () => { resultSheet = null; if (ritual.alive) ritual.step(1); },
    });
    resultSheet.open();
  }

  /* ---------- 事业格局 ---------- */
  async function lookChart() {
    if (busy || resultSheet || !ritual.alive) return;
    setBusy(true);
    ritual.clear();
    quickEl.remove();
    haptic.tap();
    sound.play('shimmer');
    ladder.set({ active: true, text: UI.busyHint.chart });
    st.setBadge(`${UI.badge.chart} · 排盘中`);
    setHint(UI.busyHint.chart, true);
    if (!await ritual.focus()) return;
    if (!await ritual.pause(ctx.platform.simpleMotion ? 600 : 1300)) return;
    try {
      career = careerChart(form.value, new Date());
    } catch (e) {
      console.error('[shiye]', e);
      setBusy(false);
      toast('生辰有误，请检查后再试');
      return;
    }
    profile.set('self', form.value);
    renderProfileLine();
    ladder.set({ active: false, revealed: true, text: career.type.name });
    sound.play('gong');
    haptic.settle();
    st.setBadge(`${career.chart.animal}命 · ${career.type.name}`);
    ritual.step(1);
    ritual.reveal({
      kicker: `${describeBirth(career.chart.input)} · 日主 ${career.chart.dayStem}${career.chart.dayElement}`,
      title: `${career.type.name} · ${career.type.title}`,
      text: career.type.text,
      onRead: openChartSheet,
    });
    renderQuickChart();
    ritual.receipt.insertBefore(quickEl, ritual.receipt.querySelector('.ritual-receipt-actions'));
    primaryBtn.setLabel(UI.again.chart);
    setBusy(false);
    setHint(UI.doneHint.chart, true);
    revealScroll();
  }

  function renderQuickChart() {
    clear(quickEl);
    const w = career;
    const next = w.nextYear ? `${w.nextYear.year} ${w.nextYear.ganZhi}年 · ${w.nextYear.note}` : '静待时机';
    quickEl.append(
      rowOf(UI.quick.guiren, h('b', null, w.guiAnimals.map((a) => `属${a}`).join('、'))),
      rowOf(UI.quick.yima, h('span', null, `${w.yiMaText.title} · ${w.yiMa}`)),
      rowOf(UI.quick.wenchang, h('span', null, `${w.wenChangText.title} · ${w.wenChangDirection}`)),
      rowOf(UI.quick.next, h('b', null, next)),
    );
  }

  function openChartSheet() {
    if (!career || resultSheet || busy) return;
    ritual.step(2);
    const w = career;
    const notes = [...new Set(w.years.flatMap((y) => y.tags))].map((t) => YEAR_NOTES[t]);
    const yearList = h('ul', { class: 'sy-years' }, w.years.map((y) => h('li', { class: [y.tags.length && 'on', y.tags.some((t) => ['zhengguan', 'qisha', 'yin', 'guiren'].includes(t)) && 'hot'] }, h('b', null, String(y.year)), h('span', null, `${y.ganZhi} · ${y.animal}`), h('i', null, y.note || '平年'))));
    const g = w.groups;
    const sections = [
      { label: UI.chartSections.type, node: h('div', { class: 'sy-sec' }, h('p', null, h('b', null, `${w.type.title}。`), w.type.text), h('p', { class: 'sy-advice' }, w.type.advice), h('p', { class: 'sy-faint' }, `适合的路子：${w.type.suits}`), h('p', { class: 'sy-faint' }, `官杀 ${g.官杀} · 印星 ${g.印星} · 食伤 ${g.食伤} · 财星 ${g.财星} · 比劫 ${g.比劫}`)) },
      { label: UI.chartSections.guiren, node: h('div', { class: 'sy-sec' }, h('p', null, h('b', null, `${w.guiText.title}。`), w.guiText.text), h('p', null, w.guiLine), h('p', { class: 'sy-faint' }, `贵人方位：${w.guiDirections.join('、')}`)) },
      { label: UI.chartSections.yima, node: h('div', { class: 'sy-sec' }, h('p', null, h('b', null, `${w.yiMaText.title}。`), w.yiMaText.text), h('p', { class: 'sy-faint' }, `驿马在${w.yiMa}`)) },
      { label: UI.chartSections.wenchang, node: h('div', { class: 'sy-sec' }, h('p', null, h('b', null, `${w.wenChangText.title}。`), w.wenChangText.text), h('p', { class: 'sy-faint' }, `文昌在${w.wenChang}：方位${w.wenChangDirection}，书桌朝此更利读书。`)) },
      { label: UI.chartSections.strength, text: w.strengthText },
      { label: UI.chartSections.years, node: h('div', { class: 'sy-sec' }, yearList, h('p', { class: 'sy-faint' }, notes.length ? notes.map((n) => `${n.short}：${n.text}`).join(' ') : UI.noHighlight)), stack: true },
    ];
    const card = resultCard({
      kicker: describeBirth(w.chart.input),
      title: w.type.name,
      sub: `${w.chart.animal}命 · 日主 ${w.chart.dayStem}${w.chart.dayElement} · ${w.type.title}`,
      badge: w.guiText.title,
      seal: w.type.name.slice(0, 1),
      verse: w.nextYear ? `${w.nextYear.year} ${w.nextYear.ganZhi}年\n${w.nextYear.note}` : '功在日日不辍',
      sections,
      footer: UI.footer,
    });
    resultSheet = sheet({
      title: UI.sheetTitle.chart,
      content: h('div', { class: 'm-shiye' }, card),
      actions: [
        button(UI.again.chart, { variant: 'primary', onClick: () => { const sh = resultSheet; resultSheet = null; sh.close(); ctx.setTimeout(() => ritual.alive && lookChart(), 350); } }),
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
