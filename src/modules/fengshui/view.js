// 风水 · 界面。实物（罗盘）用 3D 模型占位块，逻辑全在 core.js。
import { directionAt, mountainAt, mingGua, guaInfo, houseMap, annualStars, toGrid, normalizeHeading, starFor, luckyDirections, compassShareText } from './core.js';
import { UI, STARS8, GROUP_TEXT, DIRECTIONS } from './data.js';
import { createRitual } from '../../ui/ritual.js';
import { createModelSlot } from '../../ui/model-slot.js';

const YEAR_NOW = new Date().getFullYear();

export function mount(container, ctx) {
  const { kit, haptic, sound, storage } = ctx;
  const { h, button, chips, tabs, stage, resultCard, sheet, toast, select, field, clear } = kit;

  const saved = storage.get('profile', {});
  let birthYear = Number(saved.year) || 1995;
  let gender = saved.gender === 'female' ? 'female' : 'male';
  let gua = mingGua(birthYear, gender);
  let tab = storage.get('tab', 'compass');
  if (!UI.tabs.some((t) => t.value === tab)) tab = 'compass';
  let heading = 0;
  let live = false;
  let resultSheet = null;

  const st = stage({ cls: 'fs-stage' });
  const ritual = createRitual(ctx, st, ['指向', '记录', '解读']);
  const slot = createModelSlot(ctx, { id: 'fengshui.compass', label: '罗盘', glyph: '北', hint: UI.compassHint });
  slot.el.classList.add('fs-slot');
  st.scene.append(slot.el);

  /* ---------- 罗盘页 ---------- */
  const readDeg = h('div', { class: 'fs-deg t-num' }, '0°');
  const readDir = h('div', { class: 'fs-dir' }, '正北 · 坎 ☵');
  const readStar = h('div', { class: 'fs-star' }, '');
  const readout = h('div', { class: 'fs-readout' }, readDeg, readDir, readStar);
  const leftBtn = button('◀ 15°', { variant: 'ghost', size: 'small', onClick: () => manualTurn(-15) });
  const rightBtn = button('15° ▶', { variant: 'ghost', size: 'small', onClick: () => manualTurn(15) });
  const compassPane = h('div', { class: 'fs-pane' }, readout, h('div', { class: 'row', style: { justifyContent: 'center', gap: '8px' } }, leftBtn, rightBtn), h('p', { class: 'fs-note' }, UI.compassNote));

  function renderCompass() {
    const dir = directionAt(heading);
    const mtn = mountainAt(heading);
    readDeg.textContent = `${Math.round(normalizeHeading(heading))}°`;
    readDir.textContent = `${dir.full} · ${dir.gua} ${dir.symbol} · ${mtn}山`;
    const star = gua ? starFor(gua, dir.name) : null;
    readStar.textContent = star ? `${gua}命 · 此方为「${star}」· ${STARS8[star].label}` : '在「本命卦」里填生年，可看此方对你的吉凶';
    readStar.dataset.tone = star ? STARS8[star].tone : '';
    slot.set({ angle: -normalizeHeading(heading), glyph: dir.name.length === 1 ? dir.name : dir.name[0], text: `${Math.round(normalizeHeading(heading))}° · ${dir.full} · ${mtn}山${live ? '' : ' · 手动'}` });
  }
  function manualTurn(delta) {
    live = false;
    heading = normalizeHeading(heading + delta);
    haptic.tap();
    sound.play('tick');
    renderCompass();
  }
  // 传感器朝向（平滑）
  let target = null;
  let raf = 0;
  ctx.motion.onHeading(({ heading: hd }) => {
    if (tab !== 'compass' || hd == null) return;
    live = true;
    target = normalizeHeading(hd);
    if (!raf) raf = requestAnimationFrame(smooth);
  });
  function smooth() {
    raf = 0;
    if (target == null) return;
    let diff = target - heading;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    if (Math.abs(diff) < 0.3) {
      heading = target;
    } else {
      heading = normalizeHeading(heading + diff * 0.25);
      raf = requestAnimationFrame(smooth);
    }
    renderCompass();
  }
  // 屏幕拨动占位块 = 手动转罗盘
  ctx.gesture.spin(slot.el, () => {}, {
    onMove: (dRad) => {
      if (tab !== 'compass') return;
      live = false;
      heading = normalizeHeading(heading + (dRad * 180) / Math.PI);
      renderCompass();
    },
  });

  /* ---------- 本命卦页 ---------- */
  const years = [];
  for (let y = YEAR_NOW; y >= 1930; y--) years.push({ value: y, label: `${y} 年` });
  const yearSel = select(years, { value: birthYear, onChange: (v) => setProfile(Number(v), gender) });
  const genderChips = chips(UI.gender, { value: gender, onChange: (v) => setProfile(birthYear, v) });
  const guaCard = h('div', { class: 'fs-gua-card' });
  const guaGrid = h('div', { class: 'fs-grid' });
  const guaPane = h('div', { class: 'fs-pane' }, h('div', { class: 'field-row' }, field('出生年', yearSel), field('性别', genderChips.el)), h('p', { class: 'fs-note' }, UI.lichun), guaCard, h('p', { class: 'fs-grid-note' }, UI.northUp), guaGrid);

  function setProfile(y, g) {
    birthYear = y;
    gender = g;
    gua = mingGua(birthYear, gender);
    storage.set('profile', { year: birthYear, gender });
    renderGua();
    renderCompass();
    haptic.tap();
  }
  function renderGua() {
    const info = guaInfo(gua);
    clear(guaCard);
    if (!info) return;
    const group = GROUP_TEXT[info.group];
    guaCard.append(
      h('div', { class: 'fs-gua-symbol' }, info.symbol),
      h('div', { class: 'fs-gua-name' }, `${gua}命 · ${group.name}`),
      h('div', { class: 'fs-gua-nature' }, info.nature),
      h('div', { class: 'fs-gua-lucky' }, `四吉方：${luckyDirections(gua).join('、')}`),
    );
    renderGrid(guaGrid, toGrid(houseMap(gua), { star: gua, label: '命卦', tone: 'center' }), (cell) =>
      cell.id === 'C' ? [h('b', null, `${info.symbol} ${gua}`), h('i', null, '命卦')] : [h('span', { class: 'fs-cell-dir' }, cell.name), h('b', null, cell.star), h('i', null, cell.label)],
    );
  }

  /* ---------- 飞星页 ---------- */
  let starYear = YEAR_NOW;
  const starYears = [];
  for (let y = YEAR_NOW - 3; y <= YEAR_NOW + 6; y++) starYears.push({ value: y, label: `${y} 年${y === YEAR_NOW ? '（今年）' : ''}` });
  const starSel = select(starYears, {
    value: starYear,
    onChange: (v) => {
      starYear = Number(v);
      renderStars();
      haptic.tap();
    },
  });
  const starHead = h('div', { class: 'fs-gua-card' });
  const starGrid = h('div', { class: 'fs-grid' });
  const starPane = h('div', { class: 'fs-pane' }, field('年份', starSel), h('p', { class: 'fs-note' }, UI.lichun), starHead, h('p', { class: 'fs-grid-note' }, UI.northUp), starGrid);
  function renderStars() {
    const data = annualStars(starYear);
    clear(starHead);
    starHead.append(h('div', { class: 'fs-gua-symbol' }, String(data.center)), h('div', { class: 'fs-gua-name' }, `${starYear} 年 · ${data.centerInfo.name}入中`), h('div', { class: 'fs-gua-nature' }, data.centerInfo.meaning));
    renderGrid(starGrid, toGrid(data.palaces, { star: data.center, short: data.centerInfo.short, tone: data.centerInfo.tone, name: '中宫' }), (cell) => [
      h('span', { class: 'fs-cell-dir' }, cell.id === 'C' ? '中宫' : cell.name),
      h('b', null, cell.short),
      h('i', null, cell.tone === 'great' ? '大吉' : cell.tone === 'good' ? '吉' : cell.tone === 'warn' ? '小凶' : '凶'),
    ]);
  }

  function renderGrid(gridEl, cells, content) {
    clear(gridEl);
    for (const cell of cells) {
      gridEl.append(h('div', { class: ['fs-cell', cell.id === 'C' && 'center'], dataset: { tone: cell.tone || '' } }, content(cell)));
    }
  }

  /* ---------- 组装 ---------- */
  const panes = { compass: compassPane, gua: guaPane, stars: starPane };
  const paneWrap = h('div', { class: 'fs-panes' });
  const primaryBtn = button(UI.primary[tab], { variant: 'primary', size: 'large', primary: true, onClick: () => primaryAction() });
  const tabBar = tabs(UI.tabs, {
    value: tab,
    onChange: (v) => {
      tab = v;
      storage.set('tab', v);
      showTab();
      haptic.tap();
    },
  });
  container.append(ritual.progress, tabBar.el, h('div', { class: 'mt-3' }, st.el), paneWrap, kit.actionBar(primaryBtn), ritual.receipt);

  function showTab() {
    clear(paneWrap);
    paneWrap.append(panes[tab]);
    ritual.clear();
    primaryBtn.setLabel(UI.primary[tab]);
    st.el.hidden = tab !== 'compass';
    if (tab === 'compass') {
      renderCompass();
    }
  }
  renderGua();
  renderStars();
  showTab();
  if (tab === 'compass') ctx.ensureMotion?.().catch(() => {});

  /* ---------- 主按钮：记录 / 详解 ---------- */
  function primaryAction() {
    if (resultSheet) return;
    haptic.light();
    if (tab === 'compass') {
      const dir = directionAt(heading);
      const mtn = mountainAt(heading);
      const star = gua ? starFor(gua, dir.name) : null;
      const info = guaInfo(dir.gua);
      sound.play('pop');
      ritual.step(1);
      ritual.reveal({
        kicker: `${Math.round(normalizeHeading(heading))}° · ${mtn}山`,
        title: `${dir.full} · ${dir.gua} ${dir.symbol}`,
        text: star ? `对${gua}命而言，此方为「${star}」（${STARS8[star].label}）。${STARS8[star].use}` : info.nature,
        onRead: () => openCompassSheet({ dir, mtn, star, info }),
      });
    } else if (tab === 'gua') {
      openGuaSheet();
    } else {
      openStarsSheet();
    }
  }

  function openCompassSheet({ dir, mtn, star, info }) {
    ritual.step(2);
    const sections = [
      { label: '方位', text: `${dir.full}，朝向约 ${Math.round(normalizeHeading(heading))}°，二十四山中的「${mtn}」山。` },
      { label: '八卦', text: `${dir.gua}卦 ${dir.symbol}：${info.nature}。` },
    ];
    if (star) {
      const s = STARS8[star];
      sections.push({ label: `${star}`, text: s.text }, { label: '适合', text: s.use }, { label: '避免', text: s.avoid });
    } else {
      sections.push({ label: '提示', text: '在「本命卦」标签里填上出生年与性别，罗盘就会告诉你每个方位对你的吉凶。' });
    }
    sections.push({ label: '罗盘', text: UI.compassNote });
    const card = resultCard({ kicker: '罗盘所指', title: dir.full, sub: `${dir.gua} ${dir.symbol} · ${mtn}山`, badge: star ? `${star} · ${STARS8[star].label}` : '八方', seal: star ? STARS8[star].label.slice(-1) : dir.name[0], sections, footer: UI.footer });
    openSheet('方位详解', card, compassShareText({ heading, mountain: mtn, direction: dir, gua, star }));
  }

  function openGuaSheet() {
    const info = guaInfo(gua);
    const group = GROUP_TEXT[info.group];
    const rows = houseMap(gua).slice().sort((a, b) => a.rank - b.rank);
    const sections = [
      { label: '命卦', text: `${gua}命（${info.symbol}），${group.name}。${info.trait}` },
      { label: '四吉方', text: group.text },
      ...rows.map((r) => ({ label: `${r.name} · ${r.star}`, text: `${STARS8[r.star].label}。${STARS8[r.star].text} ${STARS8[r.star].use}` })),
    ];
    const card = resultCard({ kicker: `${birthYear} 年 · ${gender === 'male' ? '男' : '女'}`, title: `${gua}命`, sub: `${info.symbol} ${group.name} · ${info.nature}`, badge: group.name, seal: gua, sections, footer: UI.footer });
    const share = `【本命卦】${birthYear} 年${gender === 'male' ? '男' : '女'} · ${gua}命（${group.name}）\n四吉方：${luckyDirections(gua).join('、')}\n${rows.map((r) => `${r.name}·${r.star}`).join(' / ')}\n—— 来感觉 · 玄学占卜`;
    openSheet('八方详解', card, share);
  }

  function openStarsSheet() {
    const data = annualStars(starYear);
    const order = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const sections = [
      { label: '中宫', text: `${data.centerInfo.name}入中。${data.centerInfo.meaning}` },
      ...order.map((id) => {
        const p = data.palaces.find((x) => x.id === id);
        return { label: `${p.name} · ${p.short}`, text: `${p.name}。${p.meaning} ${p.advice}` };
      }),
    ];
    const card = resultCard({ kicker: `${starYear} 年 · 紫白飞星`, title: `${data.centerInfo.short}入中`, sub: data.centerInfo.name, badge: '九宫', seal: String(data.center), sections, footer: UI.footer });
    const share = `【${starYear} 年飞星】${data.centerInfo.name}入中\n${order.map((id) => { const p = data.palaces.find((x) => x.id === id); return `${p.name}·${p.short}`; }).join(' / ')}\n—— 来感觉 · 玄学占卜`;
    openSheet('飞星详解', card, share);
  }

  function openSheet(title, card, shareTextValue) {
    resultSheet = sheet({
      title,
      content: h('div', { class: 'm-fengshui' }, card),
      actions: [
        button('回到罗盘', { variant: 'primary', onClick: () => resultSheet.close() }),
        button('分享', {
          variant: 'ghost',
          icon: 'share',
          onClick: async () => {
            const r = await ctx.share(shareTextValue);
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
    cancelAnimationFrame(raf);
    resultSheet?.close();
  };
}
