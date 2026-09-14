// 八字 · 界面。数据型模块：表单 → 四柱 → 五行 → 日主 → 详批。
// 节奏：填生辰 → 排盘（按钮 / 点命牌 / 摇一摇）→ 命牌依次翻面 → 舞台下方一行小结 → 「展开解读」抽屉。
import { computeChart, elementRatios, shareText, daysInMonth, ELEMENTS } from './core.js';
import { HOURS, GENDERS, DAY_MASTER, ELEMENT_INFO, SHISHEN_TEXT, TODAY_TEXT, NAYIN_TEXT, STRENGTH_TEXT, UI } from './data.js';
import { createRitual } from '../../ui/ritual.js';
import { createModelSlot } from '../../ui/model-slot.js';

const YEAR_NOW = new Date().getFullYear();

export function mount(container, ctx) {
  const { kit, haptic, sound, storage } = ctx;
  const { h, button, chips, stage, resultCard, sheet, toast, select, field, clear } = kit;

  const saved = storage.get('birth', { y: 1995, m: 6, d: 18, hour: -1, gender: 'male' });
  let input = { y: Number(saved.y) || 1995, m: Number(saved.m) || 6, d: Number(saved.d) || 18, hour: saved.hour == null ? -1 : Number(saved.hour), gender: saved.gender === 'female' ? 'female' : 'male' };
  let chart = null;
  let resultSheet = null;
  let busy = false;

  /* ---------- 表单 ---------- */
  const years = [];
  for (let y = YEAR_NOW; y >= 1930; y--) years.push({ value: y, label: `${y}` });
  const months = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1} 月` }));
  const daySel = select([], { value: input.d, onChange: (v) => set('d', Number(v)) });
  const yearSel = select(years, { value: input.y, onChange: (v) => set('y', Number(v)) });
  const monthSel = select(months, { value: input.m, onChange: (v) => set('m', Number(v)) });
  const hourSel = select(HOURS, { value: input.hour, onChange: (v) => set('hour', Number(v)) });
  const genderChips = chips(GENDERS, { value: input.gender, onChange: (v) => set('gender', v) });
  genderChips.el.setAttribute('role', 'group');
  genderChips.el.setAttribute('aria-label', '性别');
  function fillDays() {
    const n = daysInMonth(input.y, input.m);
    if (input.d > n) input.d = n;
    clear(daySel);
    for (let d = 1; d <= n; d++) daySel.append(h('option', { value: d, selected: d === input.d }, `${d} 日`));
  }
  fillDays();
  function set(k, v) {
    input = { ...input, [k]: v };
    if (k === 'y' || k === 'm') fillDays();
    storage.set('birth', input);
    haptic.tap();
    if (chart && !busy) {
      chart = null;
      ritual.clear();
      barsEl.hidden = todayEl.hidden = true;
      clear(pillarsEl);
      slot.set({ pillars: [], active: false, text: '等待排盘' });
      primaryBtn.setLabel(UI.primary);
      st.setBadge(UI.badgeIdle);
      st.setHint(UI.stageHint);
    }
  }
  const form = h(
    'div',
    { class: 'bz-form' },
    h('div', { class: 'bz-row3' }, field('年', yearSel), field('月', monthSel), field('日', daySel)),
    h('div', { class: 'bz-row2' }, field('时辰', hourSel), field('性别', genderChips.el)),
    h('p', { class: 'bz-note' }, UI.hourNote),
  );
  const setFormDisabled = (v) => form.querySelectorAll('select, button').forEach((el) => { el.disabled = v; });

  /* ---------- 舞台：四柱 ---------- */
  const st = stage({ cls: 'bz-stage', badge: UI.badgeIdle, hint: UI.stageHint });
  const ritual = createRitual(ctx, st, ['生辰', '排盘', '详批']);
  const pillarsEl = h('div', { class: 'sr-only', attrs: { 'aria-live': 'polite' } });

  /* ---------- 结果区 ---------- */
  const barsEl = h('div', { class: 'bz-bars', hidden: true });
  const todayEl = h('div', { class: 'bz-today', hidden: true });

  const primaryBtn = button(UI.primary, { variant: 'primary', size: 'large', primary: true, onClick: () => compute() });
  // 先把界面挂上，再创建命牌模型：模型在已连接的舞台里初始化，首帧就能画出来。
  container.append(ritual.progress, form, h('div', { class: 'mt-3' }, st.el), kit.actionBar(primaryBtn), ritual.receipt, barsEl, todayEl);
  const slot = createModelSlot(ctx, { id: 'bazi.pillars', label: '四柱命牌', hint: UI.stageHint });
  slot.el.classList.add('bz-slot');
  st.scene.append(slot.el, pillarsEl);

  /* ---------- 三条入口：主按钮 / 点命牌 / 摇一摇 ---------- */
  ctx.gesture.tap(slot.el, () => compute());
  ctx.motion.onShake(() => compute());

  async function compute() {
    if (busy || resultSheet || !ritual.alive) return;
    busy = true;
    primaryBtn.disabled = true;
    setFormDisabled(true);
    ritual.clear();
    try {
      chart = computeChart(input);
    } catch (e) {
      console.error('[bazi]', e);
      toast(UI.badDate);
      busy = false;
      primaryBtn.disabled = false;
      setFormDisabled(false);
      return;
    }
    haptic.light();
    sound.play('flip');
    st.setBadge(`${chart.lunarText} · ${chart.shengXiao}年生`);
    st.setHint(UI.stageHintBusy);
    if (!await ritual.focus()) return;
    barsEl.hidden = todayEl.hidden = true;
    if (!await renderPillars()) return;
    setFormDisabled(false);
    renderBars();
    renderToday();
    ritual.step(1);
    const dm = DAY_MASTER[chart.dayMaster];
    ritual.reveal({
      kicker: `日主 ${dm.name} · ${STRENGTH_TEXT[chart.strength].short}`,
      title: dm.image,
      text: `${dm.keywords.join(' · ')}。${chart.missing.length ? `五行缺${chart.missing.join('、')}。` : '五行齐全。'}`,
      onRead: openSheet,
    });
    st.setHint('');
    primaryBtn.setLabel(UI.again);
    primaryBtn.disabled = false;
    busy = false;
    revealScroll();
  }

  async function renderPillars() {
    clear(pillarsEl);
    const duration = ctx.platform.simpleMotion || ctx.platform.prefersReducedMotion ? 1400 : 2400;
    slot.set({ pillars: chart.pillars, active: true, duration: duration / 1000, text: '四柱正在翻转' });
    for (const p of chart.pillars) pillarsEl.append(h('p', null, `${p.label} ${p.ganZhi}，${p.shiShen}，${p.naYin}`));
    for (let i = 0; i < 4; i++) {
      if (!await ritual.pause(duration / 4)) return false;
      sound.play('tick'); haptic.impact(.35 + i * .08);
    }
    slot.set({ active: false, text: chart.pillars.map((p) => `${p.label} ${p.ganZhi}`).join('，') });
    sound.play('chime');
    haptic.settle();
    // 最后一块命牌落定后停一拍，再给出小结。
    return ritual.pause(ctx.platform.prefersReducedMotion ? 40 : 260);
  }

  /** 小结若被首屏截断，轻轻滚到能看见「展开解读」为止。 */
  function revealScroll() {
    const r = ritual.receipt.getBoundingClientRect();
    const vh = window.visualViewport?.height || window.innerHeight;
    const over = r.bottom - (vh - 12);
    if (over > 0) window.scrollBy({ top: Math.min(over, Math.max(0, r.top - 84)), behavior: ctx.platform.prefersReducedMotion ? 'instant' : 'smooth' });
  }

  function renderBars() {
    clear(barsEl);
    barsEl.hidden = false;
    barsEl.append(h('div', { class: 'bz-sec-title' }, '五行分布'));
    const list = h('div', { class: 'bz-bar-list', attrs: { role: 'list' } });
    const max = Math.max(1, ...ELEMENTS.map((e) => chart.elements[e]));
    for (const r of elementRatios(chart)) {
      const tag = r.count === 0 ? '缺' : r.count >= 3 ? '旺' : r.count === 1 ? '弱' : '中';
      list.append(
        h(
          'div',
          { class: 'bz-bar', dataset: { el: r.element }, attrs: { role: 'listitem', 'aria-label': `${r.element} ${r.count}，${tag}` } },
          h('span', { class: 'bz-bar-name' }, r.element),
          h('span', { class: 'bz-bar-track' }, h('i', { style: { width: `${Math.round((r.count / max) * 100)}%` } })),
          h('span', { class: 'bz-bar-count t-num' }, `${r.count}`),
          h('span', { class: ['bz-bar-tag', tag === '缺' && 'lack', tag === '旺' && 'rich'] }, tag),
        ),
      );
    }
    barsEl.append(list, h('p', { class: 'bz-note' }, `${STRENGTH_TEXT[chart.strength].label} · 同类与生扶占 ${Math.round(chart.supportRatio * 100)}%${chart.hasHour ? '' : ' · 未计时柱'}`));
  }

  function renderToday() {
    clear(todayEl);
    todayEl.hidden = false;
    const rel = chart.todayRelation;
    todayEl.append(h('div', { class: 'bz-sec-title' }, '今日与你'), h('p', { class: 'bz-today-text' }, `今日${chart.todayGanZhi}日，日干「${chart.todayGan}」于你为「${rel}」。${TODAY_TEXT[rel] || ''}`));
  }

  /** 多行小节：每行一个短段，不靠换行符。 */
  const lines = (arr) => h('div', { class: 'bz-lines' }, arr.map((t) => h('p', null, t)));

  function openSheet() {
    if (!chart || resultSheet || busy) return;
    ritual.step(2);
    const dm = DAY_MASTER[chart.dayMaster];
    const pillars = chart.pillars.map((p) => p.ganZhi).join(' ');
    const sections = [
      { label: '命格概览', text: `${chart.lunarText}生，属${chart.shengXiao}，${chart.xingZuo}座。四柱 ${pillars}${chart.hasHour ? '' : '（时辰未知，暂排三柱）'}。` },
      { label: '日主性情', text: dm.text },
      { label: '强弱', text: STRENGTH_TEXT[chart.strength].text },
    ];
    const tune = [...chart.missing.map((e) => `缺${e}：${ELEMENT_INFO[e].lack}`), ...chart.strong.map((e) => `${e}旺：${ELEMENT_INFO[e].excess}`)];
    if (tune.length) sections.push({ label: '五行调候', node: lines(tune), stack: true });
    const ss = Object.entries(chart.shiShenCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k, n]) => `${k} ×${n}：${SHISHEN_TEXT[k]}`);
    if (ss.length) sections.push({ label: '十神分布', node: lines(ss), stack: true });
    sections.push({ label: '纳音', text: `${chart.pillars.map((p) => `${p.label} ${p.naYin}`).join(' · ')}。${NAYIN_TEXT[chart.pillars[2].naYinElement] || ''}` });
    sections.push({ label: '命宫胎元', text: `命宫 ${chart.mingGong}，胎元 ${chart.taiYuan}，身宫 ${chart.shenGong}。命宫看志向所寄，胎元看先天根基，身宫看后天着力之处。` });
    const card = resultCard({
      kicker: `${chart.input.y}.${chart.input.m}.${chart.input.d}${chart.hasHour ? ' · ' + chart.pillars[3].zhi + '时' : ''} · ${chart.gender === 'male' ? '男' : '女'}`,
      title: dm.name,
      sub: `${dm.image} · ${pillars}`,
      badge: STRENGTH_TEXT[chart.strength].label,
      seal: chart.dayMasterElement,
      sections,
      footer: UI.footer,
    });
    resultSheet = sheet({
      title: UI.sheetTitle,
      content: h('div', { class: 'm-bazi' }, card),
      actions: [
        button(UI.back, { variant: 'primary', onClick: () => resultSheet.close() }),
        button('分享', {
          variant: 'ghost',
          icon: 'share',
          onClick: async () => {
            const r = await ctx.share(shareText(chart));
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

  return () => {
    resultSheet?.close();
  };
}
