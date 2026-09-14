// 星座 · 界面：西方十二星座 / 东方十二生肖。逻辑与文案见 core.js / data.js（星仪随所选星座变化）。
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
  let fortune = null;
  let resultSheet = null;
  let busy = false;

  const st = stage({ cls: 'zd-stage', badge: '星座' });
  const ritual = createRitual(ctx, st, ['选择', '看运势', '解读']);
  const slot = createModelSlot(ctx, { id: 'zodiac.sky', label: '星空', glyph: '♈', hint: UI.stageHint.sign });
  slot.el.classList.add('zd-slot');
  st.scene.append(slot.el);

  /* ---------- 选择器 ---------- */
  const signChips = chips(
    SIGNS.map((s) => ({ value: s.id, label: `${s.glyph} ${s.short}` })),
    {
      value: signId,
      scroll: true,
      onChange: (v) => {
        signId = v;
        storage.set('sign', v);
        refreshStage();
        haptic.tap();
      },
    },
  );
  const bdayInput = input({
    type: 'date',
    onInput: (v) => {
      if (!v) return;
      const [, m, d] = v.split('-').map(Number);
      if (!m || !d) return;
      if (tab === 'sign') {
        const s = signFromDate(m, d);
        signId = s.id;
        storage.set('sign', s.id);
        signChips.set(s.id);
      } else {
        const y = Number(v.split('-')[0]);
        const a = animalFromYmd(y, m, d);
        animalId = a.id;
        storage.set('animal', a.id);
        animalChips.set(a.id);
        toast(`${a.ganzhi}年 · 属${a.name}`);
      }
      refreshStage();
    },
  });
  const animalChips = chips(
    ANIMALS.map((a) => ({ value: a.id, label: `${a.glyph}${a.name}` })),
    {
      value: animalId,
      scroll: true,
      onChange: (v) => {
        animalId = v;
        storage.set('animal', v);
        refreshStage();
        haptic.tap();
      },
    },
  );
  const pickerWrap = h('div', { class: 'zd-picker' });
  const profileEl = h('div', { class: 'zd-profile' });
  const quickEl = h('div', { class: 'zd-quick', hidden: true });

  const primaryBtn = button(UI.primary, { variant: 'primary', size: 'large', primary: true, onClick: () => look() });
  const randomBtn = button(UI.random, { variant: 'ghost', icon: 'refresh', onClick: () => randomPick() });
  const tabBar = tabs(UI.tabs, {
    value: tab,
    onChange: (v) => {
      tab = v;
      storage.set('tab', v);
      showTab();
      haptic.tap();
    },
  });
  container.append(ritual.progress, tabBar.el, pickerWrap, h('div', { class: 'mt-3' }, st.el), kit.actionBar(primaryBtn, randomBtn), quickEl, ritual.receipt, profileEl);

  function current() {
    return tab === 'sign' ? signById(signId) || SIGNS[0] : animalById(animalId) || ANIMALS[0];
  }

  function showTab() {
    clear(pickerWrap);
    pickerWrap.append(tab === 'sign' ? signChips.el : animalChips.el, h('div', { class: 'zd-bday' }, field(tab === 'sign' ? '或输入生日自动判定' : '或输入生日判定生肖（以春节为界）', bdayInput)));
    st.setBadge(tab === 'sign' ? '西方星座' : '东方生肖');
    refreshStage();
  }

  function refreshStage() {
    const cur = current();
    fortune = null;
    quickEl.hidden = true;
    ritual.clear();
    ritual.step(0);
    primaryBtn.setLabel(UI.primary);
    if (tab === 'sign') {
      slot.set({ kind: tab, stars: cur.stars || [], lines: cur.lines || [], glyph: cur.glyph, active: false, text: `${cur.name} · ${cur.dates} · ${ELEMENTS[cur.element].name}` });
    } else {
      slot.set({ kind: tab, stars: cur.stars || [], lines: cur.lines || [], glyph: cur.glyph, active: false, text: `属${cur.name} · ${cur.element}${cur.element ? '' : ''} · ${BRANCH_HOUR[cur.glyph] || ''}` });
    }
    st.setBadge(tab === 'sign' ? cur.name : `属${cur.name}`);
    renderProfile(cur);
  }

  function renderProfile(cur) {
    clear(profileEl);
    const title = UI.profileTitle[tab];
    if (tab === 'sign') {
      profileEl.append(
        h('div', { class: 'zd-sec-title' }, title),
        h('div', { class: 'zd-meta' }, `${cur.en} · ${cur.dates} · ${ELEMENTS[cur.element].name} · 守护星 ${cur.ruler} · ${QUALITIES[cur.quality].split(' ')[0]}`),
        h('div', { class: 'zd-traits' }, cur.traits.map((t) => h('span', { class: 'zd-trait' }, t))),
        h('p', { class: 'zd-text' }, cur.profile),
      );
    } else {
      profileEl.append(h('div', { class: 'zd-sec-title' }, title), h('div', { class: 'zd-meta' }, `地支 ${cur.glyph} · 五行属${cur.element} · 相合 ${cur.match.join('、')} · 相冲 ${cur.clash}`), h('div', { class: 'zd-traits' }, cur.traits.map((t) => h('span', { class: 'zd-trait' }, t))), h('p', { class: 'zd-text' }, cur.profile));
    }
  }

  function randomPick() {
    if (busy) return;
    const list = tab === 'sign' ? SIGNS : ANIMALS;
    const pick = stepIn(list, tab === 'sign' ? signId : animalId, 1 + Math.floor(ctx.rng.random() * (list.length - 1)));
    if (tab === 'sign') {
      signId = pick.id;
      storage.set('sign', pick.id);
      signChips.set(pick.id);
    } else {
      animalId = pick.id;
      storage.set('animal', pick.id);
      animalChips.set(pick.id);
    }
    sound.play('pop');
    haptic.tap();
    refreshStage();
  }
  ctx.motion.onShake(() => {
    if (busy || resultSheet) return;
    randomPick();
    look();
  });

  async function look() {
    if (busy || resultSheet) return;
    busy = true;
    primaryBtn.disabled = true;
    signChips.el.querySelectorAll('button').forEach(b => b.disabled = true);
    animalChips.el.querySelectorAll('button').forEach(b => b.disabled = true);
    tabBar.el.querySelectorAll('button').forEach(b => b.disabled = true);
    randomBtn.disabled = true; bdayInput.disabled = true;
    const cur = current();
    haptic.light();
    sound.play('shimmer');
    slot.set({ active: true });
    if (!await ritual.focus()) return;
    if (!await ritual.pause(ctx.platform.simpleMotion ? 900 : 1800)) return;
    slot.set({ active: false });
    fortune = tab === 'sign' ? signFortune(cur, new Date()) : animalFortune(cur, new Date());
    sound.play(fortune.sound || 'chime');
    haptic.settle();
    renderQuick(cur);
    ritual.step(1);
    ritual.reveal({
      kicker: `${formatDate(new Date())} · ${tab === 'sign' ? cur.name : '属' + cur.name}`,
      title: fortune.label,
      text: fortune.summary,
      onRead: openSheet,
    });
    primaryBtn.setLabel('再看一次');
    primaryBtn.disabled = false;
    [signChips.el, animalChips.el, tabBar.el].forEach(el => el.querySelectorAll('button').forEach(b => b.disabled = false));
    randomBtn.disabled = false; bdayInput.disabled = false;
    busy = false;
  }

  function renderQuick(cur) {
    clear(quickEl);
    quickEl.hidden = false;
    const row = (label, n) => h('div', { class: 'zd-qrow' }, h('span', null, label), stars(n));
    quickEl.append(
      h('div', { class: 'zd-qhead' }, h('span', { class: 'zd-qtitle' }, `${tab === 'sign' ? cur.name : '属' + cur.name} · 今日`), h('span', { class: 'zd-qlevel' }, fortune.label)),
      row('综合', fortune.overall),
      row(ASPECT_LABEL.love, fortune.love),
      row(ASPECT_LABEL.career, fortune.career),
      row(ASPECT_LABEL.wealth, fortune.wealth),
      row(ASPECT_LABEL.health, fortune.health),
      h('div', { class: 'zd-lucky' }, h('span', { class: 'zd-swatch', style: { background: fortune.color.hex } }), `幸运色 ${fortune.color.name} · 幸运数字 ${fortune.number}`, fortune.matchSign ? ` · 速配 ${fortune.matchSign.short}` : fortune.matchAnimal ? ` · 速配 属${fortune.matchAnimal.name}` : ''),
    );
  }

  function openSheet() {
    if (!fortune || resultSheet) return;
    ritual.step(2);
    const cur = current();
    const f = fortune;
    const starRow = (n) => h('span', { class: 'zd-sheet-stars' }, stars(n));
    const sections = [
      { label: '综合', node: h('div', null, starRow(f.overall), h('div', { class: 'mt-1' }, f.summary)) },
      { label: ASPECT_LABEL.love, node: h('div', null, starRow(f.love), h('div', { class: 'mt-1' }, f.text.love)) },
      { label: ASPECT_LABEL.career, node: h('div', null, starRow(f.career), h('div', { class: 'mt-1' }, f.text.career)) },
      { label: ASPECT_LABEL.wealth, node: h('div', null, starRow(f.wealth), h('div', { class: 'mt-1' }, f.text.wealth)) },
      { label: ASPECT_LABEL.health, node: h('div', null, starRow(f.health), h('div', { class: 'mt-1' }, f.text.health)) },
      { label: '幸运', node: h('div', { class: 'row wrap' }, h('span', { class: 'zd-swatch', style: { background: f.color.hex } }), `${f.color.name} · 数字 ${f.number}${f.matchSign ? ' · 速配 ' + f.matchSign.name : f.matchAnimal ? ' · 速配 属' + f.matchAnimal.name : ''}`) },
      { label: '今日一句', text: f.quote },
      { label: '宜 · 忌', text: `宜 ${f.yi}；忌 ${f.ji}。` },
    ];
    if (f.kind === 'animal' && f.year) sections.push({ label: `${f.year.year.ganzhi}年`, text: `${f.year.name}${f.year.extra.length ? '（兼' + f.year.extra.join('、') + '）' : ''}。${f.year.text} ${f.year.advice}` });
    if (f.kind === 'sign' && f.sunIn) sections.push({ label: '生日月', text: UI.sunInSign });
    sections.push({ label: UI.profileTitle[tab], text: cur.profile });
    const card = resultCard({ kicker: `${formatDate(new Date())} · ${f.keywords.join(' · ')}`, title: tab === 'sign' ? cur.name : `属${cur.name}`, sub: tab === 'sign' ? `${cur.glyph} ${cur.en} · ${cur.dates}` : `${cur.glyph} · ${cur.element}`, badge: f.label, seal: f.seal, verse: f.verse, sections, footer: UI.footer });
    resultSheet = sheet({
      title: UI.sheetTitle,
      content: h('div', { class: 'm-zodiac' }, card),
      actions: [
        button(tab === 'sign' ? UI.changeSign : UI.changeAnimal, {
          variant: 'primary',
          onClick: () => {
            resultSheet.close();
            ctx.setTimeout(() => { if (ritual.alive) randomPick(); }, 300);
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

  showTab();
  return () => {
    resultSheet?.close();
  };
}
