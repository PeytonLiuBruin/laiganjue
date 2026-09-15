// 黄历 · 界面（Web DOM）。所有逻辑在 core.js，所有文案在 data.js。
// 舞台里挂着一本老黄历：木条挂板 + 铁环 + 带孔的纸头 + 可撕的日历纸。
// 三条入口做同一件事——翻到另一天：日期条与「撕一页」按钮 / 纸页上左右快滑 / 摇一摇回到今天。
// 纸面本身保留原生阅读与滚动，宜忌、时辰、方位都能点开一句释义。
import {
  buildDay,
  shiftDay,
  hourIndex,
  dailyQuote,
  dayRating,
  pengZuPlain,
  termMeaning,
  jiShenMeaning,
  xiongShaMeaning,
  liuYaoMeaning,
  findGoodDay,
  shareText,
  toKey,
  fromKey,
  isSameDay,
  dayDiff,
  relativeLabel,
  inRange,
  MIN_YEAR,
  MAX_YEAR,
} from './core.js';
import { TIAN_SHEN, ZHI_XING, XIU, POSITIONS, DIRECTION_DEG, HOURS, GLOSSARY, PICK_TERMS, TEXT } from './data.js';

const CALENDAR_ICON = '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>';

export function mount(container, ctx) {
  const { kit, haptic, sound, storage } = ctx;
  const { h, button, stage, hint, resultCard, sheet, toast, wait, confetti, stars, clear } = kit;
  const reduce = ctx.platform.prefersReducedMotion;
  const D = (ms) => (reduce ? 10 : ms);

  /* ---------- 状态 ---------- */
  let current = new Date();
  let day = buildDay(current);
  let quote = dailyQuote(current);
  let busy = false, alive = true;
  let pageEl = null;
  let detailSheet = null;
  let heightTimer = null;
  let swipedAt = 0;
  let recent = (storage.get('recent', []) || []).filter((k) => fromKey(k));

  /* ---------- 顶部：日期条 ---------- */
  // 原生日期控件负责弹选择器，但它的显示格式随系统而变；上面盖一行统一的中文日期。
  const dateText = h('span', { class: 'al-date-text' });
  const dateInput = h('input', {
    class: 'al-date',
    type: 'date',
    value: toKey(current),
    attrs: { min: `${MIN_YEAR}-01-01`, max: `${MAX_YEAR}-12-31`, 'aria-label': '选择日期' },
    onChange: (e) => {
      const d = fromKey(e.target.value);
      if (!d || busy) { dateInput.value = toKey(current); return; }
      goTo(d);
    },
  });
  const dateField = h('label', { class: 'input al-date-field' }, kit.svg(CALENDAR_ICON, { size: 16, strokeWidth: 1.7 }), dateText, dateInput);
  const prevBtn = button('', { variant: 'ghost', icon: 'chevron', cls: 'al-arrow al-prev', onClick: () => flip(-1) });
  prevBtn.setAttribute('aria-label', '前一天');
  const nextBtn = button('', { variant: 'ghost', icon: 'chevron', cls: 'al-arrow', onClick: () => flip(1) });
  nextBtn.setAttribute('aria-label', '后一天');
  const todayBtn = button('今天', { variant: 'soft', size: 'small', cls: 'al-today', onClick: () => goToday() });
  const dateBar = h('div', { class: 'al-datebar' }, prevBtn, dateField, todayBtn, nextBtn);

  /* ---------- 舞台：挂历 ---------- */
  const st = stage({ cls: 'al-stage', badge: relativeLabel(current) });
  const board = h('div', { class: 'al-board' });
  const ringL = h('i', { class: 'al-ring al-ring-l' });
  const ringR = h('i', { class: 'al-ring al-ring-r' });
  const stub = h('div', { class: 'al-stub paper-slip' }, h('i', { class: 'al-hole al-hole-l' }), h('i', { class: 'al-hole al-hole-r' }));
  const stack = h('div', { class: 'al-stack' }, h('i', { class: 'al-sheet s2' }), h('i', { class: 'al-sheet s1' }));
  const holder = h('div', { class: 'al-holder' }, stack);
  const wall = h('div', { class: 'al-wall' }, board, ringL, ringR, h('div', { class: 'al-hang' }, stub, holder));
  st.scene.remove();
  st.el.append(wall);

  pageEl = renderPage(day, quote);
  holder.append(pageEl);

  /* ---------- 操作：解读（主）+ 撕一页 ---------- */
  const detailBtn = button(TEXT.readFar, { variant: 'primary', size: 'large', primary: true, onClick: () => openDetail() });
  const tearBtn = button(TEXT.tear, { variant: 'ghost', cls: 'al-tear', onClick: () => flip(1) });
  const actions = kit.actionBar(detailBtn, tearBtn);
  actions.classList.add('al-actions');
  const recentEl = h('div', { class: 'al-recent' });

  container.append(dateBar, h('div', { class: 'al-body' }, st.el, hint('flick', TEXT.hint), actions), recentEl);
  syncControls();
  renderRecent();
  ctx.setTitle(`黄历 · ${day.lunar.text}`);

  /* ---------- 三条入口 ---------- */
  // 纸页上左右快滑：向左撕掉这页看后一天，向右翻回前一天。竖向滚动交给浏览器（touch-action: pan-y）。
  // The binding strip is the page-turn handle; the paper below remains a
  // reading surface. A diagonal scroll through 宜忌 must never change dates.
  ctx.gesture.flick(
    stub,
    (g) => {
      if (busy || !alive || detailSheet) return;
      swipedAt = performance.now();
      flip(g.direction === 'left' ? 1 : -1, null, g.intensity);
    },
    { axis: 'x', direction: 'any', minDist: 80, minSpeed: 0.65 },
  );
  // 摇一摇：翻回今天；已是今天则纸页在环上晃两下。
  ctx.motion.onShake(() => {
    if (busy || !alive || detailSheet) return;
    goToday(true);
  });

  // Native clicks preserve scrolling, text selection and keyboard activation.
  // 手势跟踪可能把 click 的 target 记到挂板上，所以按坐标再找一次真正被点的元素。
  wall.addEventListener('click', (e) => {
    if (busy || !alive) return;
    if (performance.now() - swipedAt < 400) return;
    const target = e.target === wall || e.target === holder ? document.elementFromPoint(e.clientX, e.clientY) : e.target;
    if (!target) return;
    const chip = target.closest('.al-chip[data-term]');
    if (chip) return explain(chip.dataset.term, chip.dataset.kind);
    const hr = target.closest('.al-hour');
    if (hr) return explainHour(Number(hr.dataset.index));
    const pos = target.closest('.al-pos-item');
    if (pos) return explainPos(pos.dataset.key);
    const cell = target.closest('.al-cell, .al-fine-row');
    if (cell?.dataset.term) explainCell(cell.dataset.term);
  });

  // 每分钟刷新一次"当前时辰"高亮
  let clockDay = toKey(new Date());
  const tickNow = () => {
    const todayKey = toKey(new Date());
    if (todayKey !== clockDay && !busy && !detailSheet) {
      const followToday = toKey(current) === clockDay;
      clockDay = todayKey;
      if (followToday) goTo(new Date());
      else syncControls();
    }
    markNow();
    ctx.setTimeout(tickNow, 60000);
  };
  tickNow();
  // 开场：印章落下
  ctx.setTimeout(() => stampIn(pageEl, true), D(520));

  /* ---------- 翻页 ---------- */
  /**
   * flip(dir, target?, intensity?) → Promise<boolean>
   * dir>0 撕掉当前页看后一天；dir<0 从上方翻回前一天；target 指定则按日期差决定方向。
   */
  async function flip(dir, target = null, intensity = 20) {
    if (busy || !alive || detailSheet?.opened) return false;
    const to = target || shiftDay(current, dir);
    if (!inRange(to)) {
      toast(dir > 0 ? TEXT.edgeMax : TEXT.edgeMin);
      haptic.tap();
      return false;
    }
    const n = dayDiff(current, to);
    if (n === 0) {
      toast(TEXT.sameDay);
      return false;
    }
    dir = n > 0 ? 1 : -1;
    busy = true;
    syncControls();

    const nextDay = buildDay(to);
    const q = dailyQuote(to);
    const next = renderPage(nextDay, q);
    const old = pageEl;
    const power = Math.max(0.8, Math.min(1.4, intensity / 20));

    // 高度：先钉住旧高度，换页后过渡到新高度
    clearTimeout(heightTimer);
    holder.style.height = holder.offsetHeight + 'px';
    old.classList.add('leaving');
    holder.append(next);
    const newH = next.offsetHeight;
    await kit.nextFrame();
    if (!alive) return false;
    holder.style.height = newH + 'px';

    sound.play('paper');
    haptic.light();

    if (dir > 0) {
      // 起—飞：当前页沿顶边被撕起，向上飞出画面
      const dur = D(540);
      old.style.zIndex = '6';
      old.animate(
        [
          { transform: 'rotateX(0deg) translateY(0)', opacity: 1, offset: 0 },
          { transform: 'rotateX(16deg) translateY(-4px)', opacity: 1, offset: 0.28, easing: 'cubic-bezier(.2,.9,.4,1)' },
          { transform: `rotateX(${70 + 12 * power}deg) translateY(${-110 * power}px) translateZ(90px)`, opacity: 1, offset: 0.72, easing: 'cubic-bezier(.5,0,.8,.5)' },
          { transform: `rotateX(${96 + 12 * power}deg) translateY(${-200 * power}px) translateZ(140px)`, opacity: 0, offset: 1 },
        ],
        { duration: dur, fill: 'forwards' },
      );
      next.animate(
        [
          { transform: 'translateY(6px) scale(0.985)', opacity: 0.86 },
          { transform: 'translateY(6px) scale(0.985)', opacity: 0.86, offset: 0.35 },
          { transform: 'translateY(0) scale(1)', opacity: 1 },
        ],
        { duration: dur, fill: 'forwards', easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
      await wait(dur * 0.78);
      if (!alive) return false;
      sound.play('flip');
      haptic.medium();
      await wait(dur * 0.22 + 20);
    } else {
      // 落：前一天的页从上方翻下来，挂回环上，带一点回弹
      const dur = D(600);
      next.style.zIndex = '6';
      next.animate(
        [
          { transform: 'rotateX(92deg) translateY(-40px) translateZ(80px)', opacity: 0, offset: 0 },
          { transform: 'rotateX(80deg) translateY(-30px) translateZ(60px)', opacity: 1, offset: 0.18 },
          { transform: 'rotateX(0deg) translateY(0) translateZ(0)', opacity: 1, offset: 0.7, easing: 'cubic-bezier(.4,0,.7,.6)' },
          { transform: 'rotateX(-6deg) translateY(0) translateZ(0)', opacity: 1, offset: 0.84 },
          { transform: 'rotateX(0deg) translateY(0) translateZ(0)', opacity: 1, offset: 1 },
        ],
        { duration: dur, fill: 'forwards', easing: 'cubic-bezier(.2,.8,.2,1)' },
      );
      old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px) scale(0.985)' }], { duration: dur * 0.6, delay: dur * 0.3, fill: 'forwards' });
      await wait(dur * 0.7);
      if (!alive) return false;
      sound.play('flip');
      haptic.medium();
      await wait(dur * 0.3 + 20);
    }

    if (!alive) return false;
    // 落定
    old.remove();
    next.getAnimations().forEach((a) => a.cancel());
    next.style.zIndex = '';
    pageEl = next;
    current = to;
    day = nextDay;
    quote = q;
    ctx.setTitle(`黄历 · ${day.lunar.text}`);
    markNow();
    pushRecent();
    heightTimer = ctx.setTimeout(() => (holder.style.height = ''), D(620));

    // 揭：盖印 + 彩蛋
    await wait(D(90));
    if (!alive) return false;
    stampIn(next);
    const rating = dayRating(day);
    if (day.festivals.length) {
      sound.play('chime', { delay: 0.12 });
      confetti(st.el, { count: 44, origin: { x: 0.5, y: 0.3 } });
    } else if (day.jieqi) {
      sound.play('shimmer', { delay: 0.1 });
    } else if (rating.score >= 5) {
      sound.play('success', { delay: 0.12 });
    } else if (day.allBad) {
      sound.play('low', { delay: 0.15 });
    }
    busy = false;
    syncControls();
    return true;
  }

  function goTo(date) {
    if (isSameDay(date, current)) return;
    flip(0, date);
  }

  function goToday(byShake = false) {
    const t = new Date();
    if (isSameDay(current, t)) {
      toast(TEXT.alreadyToday);
      haptic.tap();
      if (byShake) shiver();
      return;
    }
    if (byShake) haptic.light();
    flip(0, t, byShake ? 26 : 20).then((ok) => ok && toast(TEXT.backToday));
  }

  /** 摇一摇但已是今天：纸在环上晃两下 */
  function shiver() {
    if (!pageEl || busy) return;
    sound.play('shake');
    pageEl.animate(
      [{ transform: 'rotateZ(0)' }, { transform: 'rotateZ(-1.8deg) translateX(-2px)' }, { transform: 'rotateZ(1.4deg) translateX(2px)' }, { transform: 'rotateZ(-0.8deg)' }, { transform: 'rotateZ(0.4deg)' }, { transform: 'rotateZ(0)' }],
      { duration: D(760), easing: 'ease-in-out' },
    );
    stub.animate([{ transform: 'rotateZ(0)' }, { transform: 'rotateZ(-0.8deg)' }, { transform: 'rotateZ(0.6deg)' }, { transform: 'rotateZ(0)' }], { duration: D(760), easing: 'ease-in-out' });
  }

  /** 所有控件跟着状态走：主按钮写明解读的是哪一天，「今天」在今天时不可点，翻页中一律禁用。 */
  function syncControls() {
    const rel = relativeLabel(current);
    const isToday = isSameDay(current, new Date());
    detailBtn.setLabel(rel.length <= 2 ? `${TEXT.readPrefix}${rel}` : TEXT.readFar);
    detailBtn.disabled = busy;
    tearBtn.disabled = busy;
    prevBtn.disabled = busy || !inRange(shiftDay(current, -1));
    nextBtn.disabled = busy || !inRange(shiftDay(current, 1));
    tearBtn.disabled = nextBtn.disabled;
    todayBtn.disabled = busy || isToday;
    dateInput.disabled = busy;
    dateInput.value = toKey(current);
    dateText.textContent = dateLabel();
    st.setBadge(rel);
  }

  /** 日期条上的中文日期：今年只写月日与星期，往年 / 来年带年份。 */
  function dateLabel() {
    const s = day.solar;
    return s.year === new Date().getFullYear() ? `${s.month}月${s.day}日 · 周${s.week}` : `${s.year}年${s.month}月${s.day}日`;
  }

  function stampIn(page, silent = false) {
    const s = page.querySelector('.al-stamp');
    if (!s) return;
    s.classList.add('show');
    if (!silent) {
      sound.play('thud');
      haptic.heavy();
    }
  }

  function markNow() {
    if (!pageEl) return;
    const isToday = isSameDay(current, new Date());
    const idx = hourIndex(new Date());
    pageEl.querySelectorAll('.al-hour').forEach((el) => el.classList.toggle('now', isToday && Number(el.dataset.index) === idx));
  }

  /* ---------- 最近翻到 ---------- */
  function pushRecent() {
    if (isSameDay(current, new Date())) return;
    const k = toKey(current);
    recent = [k, ...recent.filter((x) => x !== k)].slice(0, 6);
    storage.set('recent', recent);
    renderRecent();
  }
  function renderRecent() {
    clear(recentEl);
    if (!recent.length) {
      recentEl.hidden = true;
      return;
    }
    recentEl.hidden = false;
    recentEl.append(
      h('span', { class: 'al-recent-label' }, TEXT.recentLabel),
      h(
        'div',
        { class: 'chips scroll al-recent-row' },
        recent.map((k) => {
          const d = fromKey(k);
          return h(
            'button',
            {
              type: 'button',
              class: 'chip al-recent-chip',
              onClick: () => {
                haptic.tap();
                goTo(d);
              },
            },
            `${d.getMonth() + 1}月${d.getDate()}日`,
          );
        }),
      ),
    );
  }

  /* ---------- 名词轻提示 ---------- */
  function explain(term, kind) {
    const meaning = kind === 'jishen' ? jiShenMeaning(term) : kind === 'xiongsha' ? xiongShaMeaning(term) : termMeaning(term);
    if (!meaning) return;
    haptic.tap();
    sound.play('tick');
    kit.toast(`${term} · ${meaning}`, { duration: 2600 });
  }
  function explainHour(i) {
    const hr = day.hours[i];
    if (!hr) return;
    haptic.tap();
    sound.play('tick');
    kit.toast(`${hr.zhi}时 ${hr.range} · ${hr.ganZhi} ${hr.tianShen}${hr.luck} · ${HOURS[i].text}`, { duration: 3000 });
  }
  function explainPos(key) {
    const p = POSITIONS.find((x) => x.key === key);
    if (!p) return;
    haptic.tap();
    sound.play('tick');
    kit.toast(`${p.name} ${day.positions[key].desc} · ${p.text}`, { duration: 3000 });
  }
  function explainCell(term) {
    // 彭祖百忌直接给两句白话，比名词定义更有用
    const text = term === '彭祖百忌' ? pengZuPlain(day).join('') : GLOSSARY[term];
    if (!text) return;
    haptic.tap();
    sound.play('tick');
    kit.toast(`${term} · ${text}`, { duration: 3200 });
  }

  /* ---------- 渲染一页黄历纸 ---------- */
  function renderPage(dd, q) {
    const s = dd.solar;
    const l = dd.lunar;
    const tags = [dd.jieqi, ...dd.festivals].filter(Boolean);
    const red = s.weekIndex === 0 || dd.festivals.length > 0;
    const rating = dayRating(dd);
    const extra = [dd.shuJiu, dd.fu].filter(Boolean);

    const chipList = (items, kind) =>
      h(
        'div',
        { class: 'al-chips' },
        items.length ? items.map((t) => h('button', { type: 'button', class: ['al-chip', kind], dataset: { term: t, kind } }, t)) : h('span', { class: 'al-chip empty' }, '无'),
      );
    const col = (label, items, kind) => h('div', { class: ['al-col', kind] }, h('span', { class: 'al-mark' }, label), chipList(items, kind));
    const cell = (label, value, tone = '') => h('button', { type: 'button', class: ['al-cell', tone === '吉' && 'good', tone === '凶' && 'bad'], dataset: { term: label } }, h('i', null, label), h('b', null, value));
    const fine = (label, value) => h('button', { type: 'button', class: 'al-fine-row', dataset: { term: label } }, h('i', null, label), h('b', null, value));
    const posVal = (key) => {
      const p = dd.positions[key];
      if (key === 'tai') return p.desc.split(' ').pop();
      return p.desc;
    };

    return h(
      'div',
      { class: ['al-page', 'paper-slip', dd.allBad && 'all-bad'] },
      h(
        'div',
        { class: 'al-head' },
        h('span', { class: 'al-head-date' }, `${s.text} · ${s.weekText}`),
        tags.length ? h('span', { class: 'al-tags' }, tags.map((t) => h('em', { class: 'al-tag' }, t))) : h('span', { class: 'al-tags al-next' }, `${dd.nextJieqi.name} · ${dd.nextJieqi.days} 天后`),
      ),
      h(
        'div',
        { class: 'al-hero' },
        h('div', { class: ['al-num', red && 'red'] }, String(s.day)),
        h(
          'div',
          { class: 'al-meta' },
          h('b', null, `${l.yearText} ${l.text}`),
          h('span', null, `${l.monthGanZhi}月 · ${l.dayGanZhi}日 · 属${l.zodiac}`),
          h('span', { class: 'al-meta-sub' }, [dd.xingzuo, `${dd.yueXiang}月`, ...extra].join(' · ')),
        ),
        h('span', { class: 'al-stamp', attrs: { 'aria-hidden': 'true' } }, rating.seal),
      ),
      h('div', { class: 'al-yiji' }, col('宜', dd.yi, 'yi'), col('忌', dd.ji, 'ji')),
      h(
        'div',
        { class: 'al-grid' },
        cell('冲煞', `冲${dd.chong.shengXiao}(${dd.chong.ganZhi}) 煞${dd.sha}`),
        cell('值神', `${dd.tianShen.name} ${dd.tianShen.type}${dd.tianShen.luck}`, dd.tianShen.luck),
        cell('建除', `${dd.zhiXing}日`),
        cell('星宿', `${dd.xiu.full} ${dd.xiu.luck}`, dd.xiu.luck),
      ),
      // 小字两行：纳音与彭祖百忌，像老黄历纸下方的细印
      h('div', { class: 'al-fine' }, fine('纳音', dd.naYin.day), fine('彭祖百忌', dd.pengZu.join(' · '))),
      h(
        'div',
        { class: 'al-pos' },
        POSITIONS.map((p) => h('button', { type: 'button', class: 'al-pos-item', dataset: { key: p.key } }, h('i', null, p.name), h('b', null, posVal(p.key)))),
      ),
      h(
        'div',
        { class: 'al-hours' },
        dd.hours.map((hr) => h('button', { type: 'button', class: ['al-hour', hr.luck === '吉' ? 'good' : 'bad'], dataset: { index: hr.index } }, h('b', null, hr.zhi), h('i', null, hr.luck))),
      ),
      h('div', { class: 'al-quote' }, h('span', null, `「${q.text}」`), h('small', null, q.source)),
    );
  }

  /* ---------- 黄历详解抽屉：七个章节 ---------- */
  function openDetail() {
    if (busy || !alive || detailSheet?.opened) return;
    const rating = dayRating(day);
    const isToday = isSameDay(current, new Date());
    const nowIdx = hourIndex(new Date());
    const tags = [day.jieqi, ...day.festivals].filter(Boolean);

    const sections = [
      { label: '气象', node: h('div', { class: 'al-rating' }, h('div', { class: 'row' }, stars(rating.score), h('b', { class: 'al-rating-label' }, rating.label)), h('div', null, rating.text)) },
      { label: '解曰', text: readingText() },
      {
        label: '宜忌',
        node: h(
          'div',
          { class: 'al-yiji-read' },
          h('div', { class: 'al-yj-row yi' }, h('span', { class: 'al-mark' }, '宜'), termList(day.yi, 'yi', termMeaning)),
          h('div', { class: 'al-yj-row ji' }, h('span', { class: 'al-mark' }, '忌'), termList(day.ji, 'ji', termMeaning)),
        ),
        stack: true,
      },
      {
        label: '冲煞方位',
        node: h(
          'div',
          { class: 'al-chong' },
          h('p', { class: 'al-chong-text' }, `冲${day.chong.shengXiao}（${day.chong.ganZhi}）煞${day.sha}。属${day.chong.shengXiao}的朋友当日办大事多留一分心，${day.sha}方不宜作为出行、动土的朝向。`),
          compassNode(),
        ),
        stack: true,
      },
      { label: '时辰吉凶', node: hoursNode(isToday ? nowIdx : -1), stack: true },
      { label: '细目', node: fineNode(), stack: true },
      { label: '择日', node: pickNode(), stack: true },
    ];

    const card = resultCard({
      kicker: `${day.solar.text} · ${day.solar.weekText}`,
      title: day.lunar.text,
      badge: `${relativeLabel(current)} · ${rating.label}`,
      sub: `${day.lunar.yearText} ${day.lunar.monthGanZhi}月 ${day.lunar.dayGanZhi}日 · 属${day.lunar.zodiac} · ${day.xingzuo}${tags.length ? ' · ' + tags.join(' · ') : ''}`,
      seal: rating.seal,
      verse: `${quote.text}\n—— ${quote.source}`,
      sections,
      footer: TEXT.footer,
    });

    const actions = [
      button(TEXT.tear, {
        variant: 'primary',
        onClick: () => {
          const s = detailSheet;
          if (!s) return;
          s.close();
          wait(D(420)).then(() => alive && flip(1));
        },
      }),
      button('分享', {
        variant: 'ghost',
        icon: 'share',
        onClick: async () => {
          const r = await ctx.share(shareText(day, quote));
          toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制到剪贴板' : '分享失败');
        },
      }),
    ];
    // 抽屉挂在 body 上，用 .m-almanac 包一层，让模块样式作用到抽屉内容
    detailSheet = sheet({ title: TEXT.sheetTitle, content: h('div', { class: 'm-almanac al-reading' }, card), actions, onClose: () => { detailSheet = null; } });
    detailSheet.open();
    sound.play('pop');
  }

  /** 解曰：值神 + 建除两句，控制在一百二十字内；星宿与神煞放到「细目」。 */
  function readingText() {
    const ts = TIAN_SHEN[day.tianShen.name];
    const zx = ZHI_XING[day.zhiXing];
    return `${day.tianShen.name}值日，${day.tianShen.type}${day.tianShen.luck === '吉' ? '吉日' : '之日'}。${ts ? ts.text : ''}建除逢「${day.zhiXing}」，${zx ? zx.text : ''}`;
  }

  function termList(items, kind, meaningOf) {
    return h(
      'div',
      { class: 'al-terms' },
      items.length
        ? items.map((t) =>
            h(
              'button',
              {
                type: 'button',
                class: ['al-term', kind],
                onClick: () => {
                  haptic.tap();
                  sound.play('tick');
                  kit.toast(`${t} · ${meaningOf(t)}`, { duration: 2600 });
                },
              },
              t,
            ),
          )
        : h('span', { class: 't-faint' }, '无'),
    );
  }

  function hoursNode(nowIdx) {
    const cells = day.hours.map((hr) =>
      h(
        'button',
        {
          type: 'button',
          class: ['al-hcell', hr.luck === '吉' ? 'good' : 'bad', hr.index === nowIdx && 'now'],
          onClick: () => {
            haptic.tap();
            sound.play('tick');
            kit.toast(`${hr.zhi}时 ${hr.range} · 宜 ${hr.yi.slice(0, 4).join(' ') || '无'} · 忌 ${hr.ji.slice(0, 4).join(' ') || '无'}`, { duration: 3000 });
          },
        },
        h('b', null, hr.zhi),
        h('span', null, `${hr.ganZhi} · ${hr.tianShen}`),
        h('i', null, hr.luck),
        h('small', null, hr.range),
      ),
    );
    const hr = day.hours[nowIdx];
    const now = hr
      ? h(
          'div',
          { class: 'al-now' },
          h('b', null, `此刻 ${hr.zhi}时 · ${HOURS[nowIdx].name} ${hr.range}`),
          h('span', null, `${hr.ganZhi} ${hr.tianShen}${hr.luck}。宜 ${hr.yi.slice(0, 4).join(' ') || '无'}，忌 ${hr.ji.slice(0, 3).join(' ') || '无'}。${HOURS[nowIdx].text}`),
        )
      : null;
    return h(
      'div',
      null,
      now,
      h('div', { class: 'al-hgrid' }, cells),
      day.lateZi ? h('div', { class: 'al-latezi' }, `晚子时 ${day.lateZi.range} · ${day.lateZi.ganZhi} · ${day.lateZi.tianShen}${day.lateZi.luck}`) : null,
      h('div', { class: 'al-note' }, GLOSSARY.时辰),
    );
  }

  /** 细目：星宿 / 纳音 / 彭祖百忌 / 吉神 / 凶煞 / 月相物候，一行一条，点左侧名目看解释。 */
  function fineNode() {
    const [pzGan, pzZhi] = pengZuPlain(day);
    const row = (label, ...content) =>
      h(
        'div',
        { class: 'al-dl-row' },
        h('button', { type: 'button', class: 'al-dl-label', onClick: () => explainCell(label) }, label),
        h('div', { class: 'al-dl-text' }, ...content),
      );
    const xiuText = XIU[day.xiu.full] || '';
    const moon = [`${day.yueXiang}月`, day.wuHou, day.hou, day.shuJiu, day.fu].filter(Boolean).join(' · ');
    return h(
      'div',
      { class: 'al-dl' },
      row('星宿', h('div', null, `${day.xiu.full}（${day.xiu.luck}）· ${day.xiu.gong}方${day.xiu.shou}。${xiuText}`), day.xiu.song ? h('div', { class: 'al-song' }, day.xiu.song) : null),
      row('纳音', `日 ${day.naYin.day} · 月 ${day.naYin.month} · 年 ${day.naYin.year}`),
      row('彭祖百忌', h('div', { class: 'al-pz' }, h('div', null, h('b', null, day.pengZu[0]), h('span', null, pzGan)), h('div', null, h('b', null, day.pengZu[1]), h('span', null, pzZhi)))),
      row('吉神宜趋', termList(day.jiShen, 'jishen', jiShenMeaning)),
      row('凶神宜忌', termList(day.xiongSha, 'xiongsha', xiongShaMeaning)),
      row('月相物候', `${moon}。六曜「${day.liuYao}」：${liuYaoMeaning(day.liuYao)}${day.lu ? ` 日禄：${day.lu}。` : ''}`),
    );
  }

  function compassNode() {
    const R = 100;
    const dirs = Object.entries(DIRECTION_DEG);
    const ring = dirs
      .map(([name, deg]) => {
        const a = (deg * Math.PI) / 180;
        const x = R + 84 * Math.sin(a);
        const y = R - 84 * Math.cos(a);
        return `<text x="${x.toFixed(1)}" y="${(y + 3.5).toFixed(1)}" text-anchor="middle" font-size="10" letter-spacing="1" style="fill:var(--text-3);stroke:none">${name.replace('正', '')}</text>`;
      })
      .join('');
    const ticks = dirs
      .map(([, deg]) => {
        const a = (deg * Math.PI) / 180;
        return `<line x1="${(R + 66 * Math.sin(a)).toFixed(1)}" y1="${(R - 66 * Math.cos(a)).toFixed(1)}" x2="${(R + 72 * Math.sin(a)).toFixed(1)}" y2="${(R - 72 * Math.cos(a)).toFixed(1)}"/>`;
      })
      .join('');
    // 同一方位多位神 → 由外向内依次排列
    const groups = {};
    for (const p of POSITIONS) {
      if (p.key === 'tai') continue;
      const desc = day.positions[p.key].desc;
      (groups[desc] ||= []).push(p);
    }
    let marks = '';
    for (const [desc, list] of Object.entries(groups)) {
      const deg = DIRECTION_DEG[desc];
      if (deg == null) continue;
      const a = (deg * Math.PI) / 180;
      list.forEach((p, i) => {
        const r = 54 - i * 20;
        const x = R + r * Math.sin(a);
        const y = R - r * Math.cos(a);
        marks += `<g><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="9.5" style="fill:var(--accent);stroke:none"/><text x="${x.toFixed(1)}" y="${(y + 3.6).toFixed(1)}" text-anchor="middle" font-size="10" font-weight="700" style="fill:var(--accent-ink);stroke:none">${p.name[0]}</text></g>`;
      });
    }
    const inner = `<circle cx="${R}" cy="${R}" r="72" opacity=".9"/><circle cx="${R}" cy="${R}" r="58" opacity=".35" stroke-dasharray="2 4"/><circle cx="${R}" cy="${R}" r="2" style="fill:currentColor;stroke:none"/>${ticks}${ring}${marks}`;
    const svg = kit.svg(inner, { viewBox: '0 0 200 200', size: 200, strokeWidth: 1, cls: 'al-rose' });
    const legend = h(
      'div',
      { class: 'al-legend' },
      POSITIONS.map((p) =>
        h(
          'button',
          {
            type: 'button',
            class: 'al-legend-item',
            onClick: () => {
              haptic.tap();
              kit.toast(`${p.name} · ${p.text}`, { duration: 3000 });
            },
          },
          h('b', null, p.name),
          h('span', null, day.positions[p.key].desc),
        ),
      ),
    );
    return h('div', { class: 'al-compass' }, svg, legend, h('div', { class: 'al-note' }, GLOSSARY.吉神方位));
  }

  function pickNode() {
    const row = h(
      'div',
      { class: 'chips scroll al-picks' },
      PICK_TERMS.map((t) =>
        h(
          'button',
          {
            type: 'button',
            class: 'chip al-pick',
            onClick: () => {
              haptic.tap();
              const r = findGoodDay(t.value, current);
              if (!r) {
                toast(TEXT.pickNone);
                return;
              }
              sound.play('coin');
              toast(`最近宜${t.label}：${r.day.solar.month}月${r.day.solar.day}日 · ${r.daysAhead} 天后`);
              detailSheet.close();
              wait(D(420)).then(() => alive && flip(0, r.date));
            },
          },
          t.label,
        ),
      ),
    );
    return h('div', null, h('div', { class: 'al-note al-pick-note' }, TEXT.pickLabel), row);
  }

  /* ---------- 卸载 ---------- */
  return () => {
    alive = false;
    clearTimeout(heightTimer);
    holder.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    if (pageEl) pageEl.getAnimations().forEach((a) => a.cancel());
    if (detailSheet && detailSheet.opened) detailSheet.close();
  };
}
