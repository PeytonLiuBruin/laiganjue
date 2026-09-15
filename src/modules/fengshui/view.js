// 风水 · 界面。立体罗盘随朝向和拨动旋转，逻辑全在 core.js。
// 节奏：指向（转罗盘）→ 记录（主按钮，罗盘盖印一按 + receipt）→ 解读（抽屉）。
import { directionAt, mountainAt, mingGua, guaInfo, houseMap, annualStars, toGrid, normalizeHeading, angleDiff, splitByTone, starFor, luckyDirections, compassShareText } from './core.js';
import { UI, STARS8, GROUP_TEXT } from './data.js';
import { createRitual } from '../../ui/ritual.js';
import { createModelSlot } from '../../ui/model-slot.js';

const YEAR_NOW = new Date().getFullYear();
const TONE_LABEL = { great: '大吉', good: '吉', warn: '小凶', bad: '凶' };
const RECORD_DRIFT = 12; // 转离已记录方位超过此角度，记录作废
const MODEL_ID = 'fengshui.compass';

export function mount(container, ctx) {
  const { kit, haptic, sound, storage } = ctx;
  const { h, button, chips, tabs, stage, resultCard, sheet, toast, select, field, clear } = kit;

  // 资料：只有用户亲自选过（或在本命卦页确认过）才算"我的命卦"，罗盘才据此报吉凶
  const saved = storage.get('profile', null);
  let hasProfile = !!(saved && Number(saved.year));
  let birthYear = Number(saved?.year) || 1995;
  let gender = saved?.gender === 'female' ? 'female' : 'male';
  let gua = mingGua(birthYear, gender);
  const userGua = () => (hasProfile ? gua : null);
  let tab = storage.get('tab', 'compass');
  if (!UI.tabs.some((t) => t.value === tab)) tab = 'compass';
  let heading = 0;
  let live = false;
  let recorded = null;
  let resultSheet = null;

  const st = stage({ cls: 'fs-stage', hint: UI.hintManual, badge: UI.badgeManual });
  const ritual = createRitual(ctx, st, ['指向', '记录', '解读']);
  let slot = null; // 罗盘实物：等舞台进入文档后再创建（见「组装」处说明）

  /* ---------- 罗盘页 ---------- */
  const readDeg = h('div', { class: 'fs-deg t-num' }, '0°');
  const readDir = h('div', { class: 'fs-dir' }, '');
  const readStar = h('div', { class: 'fs-star' });
  const fillBtn = button(UI.noProfile, { variant: 'ghost', size: 'small', cls: 'fs-fill', onClick: () => switchTab('gua') });
  const readout = h('div', { class: 'fs-readout' }, readDeg, readDir, readStar);
  const leftBtn = button(UI.turnLeft, { variant: 'ghost', size: 'small', onClick: () => manualTurn(-15) });
  const rightBtn = button(UI.turnRight, { variant: 'ghost', size: 'small', onClick: () => manualTurn(15) });
  const compassPane = h('div', { class: 'fs-pane' }, readout, h('div', { class: 'fs-turn' }, leftBtn, rightBtn));

  let lastMtn = null;
  let lastStarKey = null;
  // source: 'sensor' 实时 | 'spin' 手指拨动 | 'manual' 左右键 | 'quiet' 仅重绘
  function renderCompass(source = 'quiet') {
    const deg = Math.round(normalizeHeading(heading));
    const dir = directionAt(heading);
    const mtn = mountainAt(heading);
    readDeg.textContent = `${deg}°`;
    readDir.textContent = `${dir.full} · ${dir.gua} ${dir.symbol} · ${mtn}山`;
    const g = userGua();
    const star = g ? starFor(g, dir.name) : null;
    const key = star ? `${g}:${star}` : 'none';
    if (key !== lastStarKey) {
      lastStarKey = key;
      clear(readStar);
      if (star) {
        readStar.textContent = `${g}命 · 此方为「${star}」· ${STARS8[star].label}`;
        readStar.dataset.tone = STARS8[star].tone;
      } else {
        readStar.dataset.tone = '';
        readStar.append(fillBtn);
      }
    }
    slot?.set({ angle: -normalizeHeading(heading), glyph: dir.name[0], text: `${deg}° · ${dir.full} · ${mtn}山${live ? '' : ' · 手动'}` });
    // 跨过一山，像表圈一样"咔"一下：拨动时有声有震，实时转动只轻震
    if (lastMtn !== null && mtn !== lastMtn && (source === 'spin' || source === 'sensor')) {
      haptic.tap();
      if (source === 'spin') sound.play('tick');
    }
    lastMtn = mtn;
    if (recorded && Math.abs(angleDiff(heading, recorded.heading)) > RECORD_DRIFT) unrecord();
  }
  function setLive(v) {
    if (!v) { target = null; cancelAnimationFrame(raf); raf = 0; }
    if (v === live) return;
    live = v;
    st.setHint(v ? UI.hintLive : UI.hintManual);
    if (!recorded) st.setBadge(v ? UI.badgeLive : UI.badgeManual);
  }
  function manualTurn(delta) {
    setLive(false);
    heading = normalizeHeading(heading + delta);
    haptic.tap();
    sound.play('tick');
    renderCompass('manual');
  }
  // 传感器朝向（平滑）
  let target = null;
  let raf = 0;
  ctx.motion.onHeading(({ heading: hd }) => {
    if (tab !== 'compass' || hd == null || resultSheet) return;
    setLive(true);
    target = normalizeHeading(hd);
    if (!raf) raf = requestAnimationFrame(smooth);
  });
  function smooth() {
    raf = 0;
    if (target == null) return;
    const diff = angleDiff(target, heading);
    if (Math.abs(diff) < 0.3) {
      heading = target;
    } else {
      heading = normalizeHeading(heading + diff * 0.25);
      raf = requestAnimationFrame(smooth);
    }
    renderCompass('sensor');
  }
  /* ---------- 本命卦页 ---------- */
  const years = [];
  for (let y = YEAR_NOW; y >= 1930; y--) years.push({ value: y, label: `${y} 年` });
  const yearSel = select(years, { value: birthYear, onChange: (v) => setProfile(Number(v), gender) });
  const genderChips = chips(UI.gender, { value: gender, onChange: (v) => setProfile(birthYear, v) });
  genderChips.el.classList.add('fs-gender');
  const guaCard = h('div', { class: 'fs-gua-card' });
  const guaGrid = h('div', { class: 'fs-grid' });
  const guaPane = h('div', { class: 'fs-pane' }, h('div', { class: 'field-row' }, field('出生年', yearSel), field('性别', genderChips.el)), h('p', { class: 'fs-note' }, UI.lichun), guaCard, h('p', { class: 'fs-grid-note' }, UI.northUp), guaGrid);

  function setProfile(y, g) {
    unrecord();
    birthYear = y;
    gender = g;
    gua = mingGua(birthYear, gender);
    commitProfile();
    renderGua();
    haptic.tap();
  }
  function commitProfile() {
    hasProfile = true;
    storage.set('profile', { year: birthYear, gender });
    renderCompass('quiet');
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
  const starPane = h('div', { class: 'fs-pane' }, field('年份', starSel), h('p', { class: 'fs-note' }, UI.lichunYear), starHead, h('p', { class: 'fs-grid-note' }, UI.northUp), starGrid);
  function renderStars() {
    const data = annualStars(starYear);
    clear(starHead);
    starHead.append(h('div', { class: 'fs-gua-symbol' }, String(data.center)), h('div', { class: 'fs-gua-name' }, `${starYear} 年 · ${data.centerInfo.name}入中`), h('div', { class: 'fs-gua-nature' }, data.centerInfo.meaning));
    renderGrid(starGrid, toGrid(data.palaces, { star: data.center, short: data.centerInfo.short, tone: data.centerInfo.tone, name: '中宫' }), (cell) => [
      h('span', { class: 'fs-cell-dir' }, cell.id === 'C' ? '中宫' : cell.name),
      h('b', null, cell.short),
      h('i', null, TONE_LABEL[cell.tone]),
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
      switchTab(v);
      haptic.tap();
    },
  });
  container.append(ritual.progress, tabBar.el, h('div', { class: 'mt-3' }, st.el), paneWrap, kit.actionBar(primaryBtn), ritual.receipt);
  slot = createModelSlot(ctx, { id: MODEL_ID, label: '罗盘', glyph: '北', hint: UI.compassHint });
  slot.el.classList.add('fs-slot');
  if (!slot.el.isConnected) st.scene.append(slot.el); // 没有内置模型时的占位块照常挂上
  // 屏幕拨动罗盘 = 手动转罗盘
  ctx.gesture.spin(slot.el, () => {}, {
    onMove: (dRad) => {
      if (tab !== 'compass' || resultSheet) return;
      setLive(false);
      heading = normalizeHeading(heading + (dRad * 180) / Math.PI);
      renderCompass('spin');
    },
  });

  function switchTab(v) {
    tab = v;
    storage.set('tab', v);
    tabBar.set(v);
    showTab();
  }
  function showTab() {
    clear(paneWrap);
    paneWrap.append(panes[tab]);
    unrecord();
    primaryBtn.setLabel(UI.primary[tab]);
    st.el.hidden = tab !== 'compass';
    if (tab === 'compass') renderCompass('quiet');
  }
  renderGua();
  renderStars();
  showTab();

  /* ---------- 主按钮：记录 / 详解 ---------- */
  function primaryAction() {
    if (resultSheet) return;
    if (tab === 'compass') record();
    else if (tab === 'gua') {
      haptic.light();
      commitProfile(); // 看过详解，即视为确认了这份资料
      openGuaSheet();
    } else {
      haptic.light();
      openStarsSheet();
    }
  }

  function record() {
    const deg = Math.round(normalizeHeading(heading));
    const dir = directionAt(heading);
    const mtn = mountainAt(heading);
    const g = userGua();
    const star = g ? starFor(g, dir.name) : null;
    const info = guaInfo(dir.gua);
    recorded = { heading, deg, dir, mtn, star, info, gua: g };
    sound.play('pop');
    haptic.success();
    ritual.step(1);
    st.setBadge(`${UI.badgeRecorded} · ${dir.full} ${deg}°`);
    stamp();
    ritual.reveal({
      kicker: `${deg}° · ${mtn}山`,
      title: `${dir.full} · ${dir.gua} ${dir.symbol}`,
      text: star ? `对${g}命而言，此方为「${star}」（${STARS8[star].label}）。${STARS8[star].use}` : `${dir.gua}卦 ${dir.symbol}，${info.nature}。${UI.fillHint}`,
      onRead: () => recorded && openCompassSheet(recorded),
    });
    primaryBtn.setLabel(UI.recorded);
    ctx.setTimeout(showReceipt, 90);
  }
  // 记录的视觉反馈：罗盘本体像盖印一样按一下再弹回。只动实物自身，不在画布上方叠任何图层
  // （opacity:0 且带 transform + z-index 的覆盖层，会让深色皮肤下的 canvas 在 Chromium 里整块消失）。
  async function stamp() {
    if (ctx.platform.prefersReducedMotion) return;
    const a = await ritual.animate(slot.el, [
      { transform: 'scale(1)' },
      { transform: 'scale(0.965)', offset: 0.3 },
      { transform: 'scale(1.025)', offset: 0.68 },
      { transform: 'scale(1)' },
    ], { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)' });
    a?.cancel(); // 终态与静止一致，取消 fill 让实物回到无 transform 的干净状态
  }
  // 结果在主按钮下方：刚好露出即可，罗盘仍留在视野里
  function showReceipt() {
    const r = ritual.receipt.getBoundingClientRect();
    const vh = window.visualViewport?.height || window.innerHeight;
    if (r.bottom <= vh - 12) return;
    const top = Math.min(r.bottom - vh + 28, Math.max(0, r.top - 120));
    window.scrollBy({ top, behavior: ctx.platform.prefersReducedMotion ? 'instant' : 'smooth' });
  }
  function unrecord() {
    if (!recorded) return;
    recorded = null;
    ritual.clear();
    ritual.step(0);
    primaryBtn.setLabel(UI.primary.compass);
    st.setBadge(live ? UI.badgeLive : UI.badgeManual);
  }

  function openCompassSheet({ heading: hd, deg, dir, mtn, star, info, gua: g }) {
    ritual.step(2);
    const sections = [
      { label: '方位', text: `${dir.full}，朝向约 ${deg}°，二十四山中的「${mtn}」山。` },
      { label: '八卦', text: `${dir.gua}卦 ${dir.symbol}：${info.nature}。` },
    ];
    if (star) {
      const s = STARS8[star];
      sections.push({ label: star, text: s.text }, { label: '适合', text: s.use }, { label: '避免', text: s.avoid });
    } else {
      sections.push({ label: '提示', text: UI.fillTip });
    }
    sections.push({ label: '校准', text: UI.compassNote });
    const card = resultCard({ kicker: '罗盘所指', title: dir.full, sub: `${dir.gua} ${dir.symbol} · ${mtn}山`, badge: star ? `${star} · ${STARS8[star].label}` : '八方', seal: star ? STARS8[star].label.slice(-1) : dir.name[0], sections, footer: UI.footer });
    openSheet('方位详解', card, compassShareText({ heading: hd, mountain: mtn, direction: dir, gua: g, star }), UI.back.compass);
  }

  // 方位清单：方位 | 星 · 吉凶 / 一句用法
  function dirList(intro, rows) {
    return h('div', { class: 'fs-dirlist' }, intro ? h('p', null, intro) : null, rows.map((r) => h('div', { class: 'fs-dir-row', dataset: { tone: r.tone } }, h('b', null, r.name), h('span', null, r.head), h('small', null, r.body))));
  }

  function openGuaSheet() {
    const info = guaInfo(gua);
    const group = GROUP_TEXT[info.group];
    const { lucky, unlucky } = splitByTone(houseMap(gua));
    const row = (r) => ({ name: r.name, tone: r.tone, head: `${r.star} · ${r.label}`, body: r.use });
    const sections = [
      { label: '命卦', text: `${gua}命（${info.symbol}），${group.name}。${info.trait}` },
      { label: '吉方', node: dirList(group.text, lucky.map(row)), stack: true },
      { label: '凶方', node: dirList(UI.badIntro8, unlucky.map(row)), stack: true },
    ];
    const card = resultCard({ kicker: `${birthYear} 年 · ${gender === 'male' ? '男' : '女'}`, title: `${gua}命`, sub: `${info.symbol} ${group.name} · ${info.nature}`, badge: group.name, seal: gua, sections, footer: UI.footer });
    const all = [...lucky, ...unlucky];
    const share = `【本命卦】${birthYear} 年${gender === 'male' ? '男' : '女'} · ${gua}命（${group.name}）\n四吉方：${luckyDirections(gua).join('、')}\n${all.map((r) => `${r.name}·${r.star}`).join(' / ')}\n—— 来感觉 · 玄学占卜`;
    openSheet('八方详解', card, share, UI.back.gua);
  }

  function openStarsSheet() {
    const data = annualStars(starYear);
    const { lucky, unlucky } = splitByTone(data.palaces);
    const row = (p) => ({ name: p.name, tone: p.tone, head: `${p.starName} · ${TONE_LABEL[p.tone]}`, body: p.advice });
    const sections = [
      { label: '中宫', text: `${data.centerInfo.name}入中。${data.centerInfo.meaning}` },
      { label: '吉方', node: dirList(UI.luckyIntro9, lucky.map(row)), stack: true },
      { label: '凶方', node: dirList(UI.badIntro9, unlucky.map(row)), stack: true },
    ];
    const card = resultCard({ kicker: `${starYear} 年 · 紫白飞星`, title: `${data.centerInfo.short}入中`, sub: data.centerInfo.name, badge: '九宫', seal: data.centerInfo.short[0], sections, footer: UI.footer });
    const share = `【${starYear} 年飞星】${data.centerInfo.name}入中\n${data.palaces.map((p) => `${p.name}·${p.short}`).join(' / ')}\n—— 来感觉 · 玄学占卜`;
    openSheet('飞星详解', card, share, UI.back.stars);
  }

  function openSheet(title, card, shareTextValue, backLabel) {
    resultSheet = sheet({
      title,
      content: h('div', { class: 'm-fengshui' }, card),
      actions: [
        button(backLabel, { variant: 'primary', onClick: () => resultSheet.close() }),
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
        if (ritual.alive && recorded) ritual.step(1);
      },
    });
    resultSheet.open();
  }

  return () => {
    cancelAnimationFrame(raf);
    resultSheet?.close();
  };
}
