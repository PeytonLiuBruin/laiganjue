// 黄历 · 界面（Web DOM）。所有逻辑在 core.js，所有文案在 data.js。
// 舞台里挂着一本老黄历：木条挂板 + 铁环 + 带孔的纸头 + 可撕的日历纸。
// 日期仅由明确的按钮和日期选择器切换，纸面保留原生阅读与滚动。
import {
  buildDay,
  shiftDay,
  hourIndex,
  dailyQuote,
  dayRating,
  summarize,
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
  let recent = (storage.get('recent', []) || []).filter((k) => fromKey(k));

  /* ---------- 顶部：日期选择 ---------- */
  const dateInput = h('input', {
    class: 'input al-date',
    type: 'date',
    value: toKey(current),
    attrs: { min: `${MIN_YEAR}-01-01`, max: `${MAX_YEAR}-12-31`, 'aria-label': '选择日期' },
    onChange: (e) => {
      const d = fromKey(e.target.value);
      if (!d || busy) { dateInput.value = toKey(current); return; }
      goTo(d);
    },
  });
  const prevBtn = button('', { variant: 'ghost', icon: 'chevron', cls: 'al-arrow al-prev', onClick: () => flip(-1) });
  prevBtn.setAttribute('aria-label', '前一天');
  const nextBtn = button('', { variant: 'ghost', icon: 'chevron', cls: 'al-arrow', onClick: () => flip(1) });
  nextBtn.setAttribute('aria-label', '后一天');
  const todayBtn = button('今天', {
    variant: 'soft',
    size: 'small',
    cls: 'al-today',
    onClick: () => {
      goToday();
    },
  });
  const dateBar = h('div', { class: 'al-datebar' }, prevBtn, dateInput, todayBtn, nextBtn);

  /* ---------- 舞台：挂历 ---------- */
  const st = stage({ cls: 'al-stage', hint: TEXT.stageHint, badge: relativeLabel(current) });
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

  /* ---------- 操作 ---------- */
  const tomorrowBtn = button('后一天', {
    variant: 'ghost',
    onClick: () => {
      flip(1);
    },
  });
  const detailBtn = button('查看这一天', { variant: 'primary', size: 'large', primary: true, onClick: () => openDetail() });
  const recentEl = h('div', { class: 'al-recent' });

  container.append(
    dateBar,
    h('div', { class: 'mt-3' }, st.el),
    hint('tap', TEXT.hint),
    kit.actionBar(detailBtn, tomorrowBtn),
    recentEl,
  );
  renderRecent();
  ctx.setTitle(`黄历 · ${day.lunar.text}`);

  // Native clicks preserve scrolling, text selection and keyboard activation.
  wall.addEventListener('click', (e) => {
    if (busy || !alive) return;
    const chip = e.target.closest('.al-chip[data-term]');
    if (chip) return explain(chip.dataset.term, chip.dataset.kind);
    const hr = e.target.closest('.al-hour');
    if (hr) return explainHour(Number(hr.dataset.index));
    const pos = e.target.closest('.al-pos-item');
    if (pos) return explainPos(pos.dataset.key);
    const cell = e.target.closest('.al-cell');
    if (cell?.dataset.term) explainCell(cell.dataset.term);
  });

  // 每分钟刷新一次"当前时辰"高亮
  const tickNow = () => {
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
    setBusy(true);
    st.setHint('');

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
    dateInput.value = toKey(current);
    st.setBadge(relativeLabel(current));
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
    st.setHint(TEXT.stageHint);
    busy = false;
    setBusy(false);
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
    flip(0, t).then((ok) => ok && toast(TEXT.backToday));
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

  function setBusy(b) {
    tomorrowBtn.disabled = b;
    detailBtn.disabled = b;
    prevBtn.disabled = b;
    nextBtn.disabled = b;
    todayBtn.disabled = b;
    dateInput.disabled = b;
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
      ...recent.map((k) => {
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
    const g = GLOSSARY[term];
    if (!g) return;
    haptic.tap();
    sound.play('tick');
    kit.toast(`${term} · ${g}`, { duration: 3000 });
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
    const cell = (label, value, tone = '', cls = '') => h('button', { type: 'button', class: ['al-cell', tone === '吉' && 'good', tone === '凶' && 'bad', cls], dataset: { term: label } }, h('i', null, label), h('b', null, value));
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
        cell('纳音', dd.naYin.day),
        cell('彭祖百忌', dd.pengZu.join('\n'), '', 'pz'),
      ),
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

  /* ---------- 黄历详解抽屉 ---------- */
  function openDetail() {
    if (busy || !alive || detailSheet?.opened) return;
    const rating = dayRating(day);
    const isToday = isSameDay(current, new Date());
    const nowIdx = hourIndex(new Date());
    const ts = TIAN_SHEN[day.tianShen.name];
    const zx = ZHI_XING[day.zhiXing];
    const xiuText = XIU[day.xiu.full] || '';
    const [pzGan, pzZhi] = pengZuPlain(day);
    const tags = [day.jieqi, ...day.festivals].filter(Boolean);

    const termList = (items, kind, meaningOf) =>
      h(
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

    const sections = [
      { label: '今日气象', node: h('div', { class: 'al-rating' }, h('div', { class: 'row' }, stars(rating.score), h('b', { class: 'al-rating-label' }, rating.label)), h('div', null, rating.text)) },
      { label: '解曰', text: summarize(day) },
      { label: '宜', node: termList(day.yi, 'yi', termMeaning), stack: true },
      { label: '忌', node: termList(day.ji, 'ji', termMeaning), stack: true },
      {
        label: '冲煞',
        text: `冲${day.chong.shengXiao}（${day.chong.ganZhi}）煞${day.sha}。属${day.chong.shengXiao}的朋友今天办大事多留一分心；${day.sha}方不宜作为出行、动土的朝向。${GLOSSARY.冲煞}`,
      },
      { label: '值神', text: `${day.tianShen.name} · ${day.tianShen.type}${day.tianShen.luck === '吉' ? '吉日' : ''}。${ts ? ts.text : ''}${GLOSSARY.值神}` },
      { label: '建除', text: `${day.zhiXing}日。${zx ? zx.text : ''}` },
      {
        label: '星宿',
        node: h('div', null, h('div', null, `${day.xiu.full}（${day.xiu.luck}）· ${day.xiu.gong}方${day.xiu.shou}。${xiuText}`), day.xiu.song ? h('div', { class: 'al-song' }, day.xiu.song) : null),
      },
      { label: '纳音', text: `日 ${day.naYin.day} · 月 ${day.naYin.month} · 年 ${day.naYin.year}。${GLOSSARY.纳音}` },
      {
        label: '彭祖百忌',
        node: h('div', { class: 'al-pz' }, h('div', null, h('b', null, day.pengZu[0]), h('span', null, pzGan)), h('div', null, h('b', null, day.pengZu[1]), h('span', null, pzZhi))),
        stack: true,
      },
      { label: '吉神宜趋', node: termList(day.jiShen, 'jishen', jiShenMeaning), stack: true },
      { label: '凶神宜忌', node: termList(day.xiongSha, 'xiongsha', xiongShaMeaning), stack: true },
      { label: '吉神方位', node: compassNode(), stack: true },
      { label: '时辰吉凶', node: hoursNode(isToday ? nowIdx : -1), stack: true },
      isToday ? { label: '此刻', text: nowText(nowIdx) } : null,
      {
        label: '月相物候',
        text: `${day.yueXiang}月 · ${day.wuHou} · ${day.hou}${day.shuJiu ? ' · ' + day.shuJiu : ''}${day.fu ? ' · ' + day.fu : ''}。六曜「${day.liuYao}」：${liuYaoMeaning(day.liuYao)}${day.lu ? ` 日禄：${day.lu}。` : ''}`,
      },
      { label: '择日', node: pickNode(), stack: true },
    ];

    const card = resultCard({
      kicker: `${day.solar.text} · ${day.solar.weekText}`,
      title: day.lunar.text,
      badge: `${day.tianShen.name} · ${day.tianShen.type}${day.tianShen.luck === '吉' ? '吉日' : ''} · ${relativeLabel(current)}`,
      sub: `${day.lunar.yearText} ${day.lunar.monthGanZhi}月 ${day.lunar.dayGanZhi}日 · 属${day.lunar.zodiac} · ${day.xingzuo}${tags.length ? ' · ' + tags.join(' · ') : ''}`,
      seal: rating.seal,
      verse: `${quote.text}\n—— ${quote.source}`,
      sections,
      footer: TEXT.footer,
    });

    const actions = [
      button('回到黄历', {
        variant: 'primary',
        onClick: () => {
          detailSheet.close();
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

  function nowText(idx) {
    const hr = day.hours[idx];
    if (!hr) return '';
    const yi = hr.yi.length ? hr.yi.join(' ') : '无';
    const ji = hr.ji.length ? hr.ji.join(' ') : '无';
    return `${hr.zhi}时（${HOURS[idx].name} ${hr.range}）· ${hr.ganZhi} · ${hr.tianShen}${hr.luck}。此时宜：${yi}；忌：${ji}。喜神${hr.xi}，财神${hr.cai}。${HOURS[idx].text}`;
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
    return h(
      'div',
      null,
      h('div', { class: 'al-hgrid' }, cells),
      day.lateZi ? h('div', { class: 'al-latezi' }, `晚子时 ${day.lateZi.range} · ${day.lateZi.ganZhi} · ${day.lateZi.tianShen}${day.lateZi.luck}`) : null,
      h('div', { class: 'al-note' }, GLOSSARY.时辰),
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
    const svg = kit.svg(inner, { viewBox: '0 0 200 200', size: 220, strokeWidth: 1, cls: 'al-rose' });
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
    const chipsEl = h(
      'div',
      { class: 'al-terms' },
      PICK_TERMS.map((t) =>
        h(
          'button',
          {
            type: 'button',
            class: 'al-term pick',
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
              wait(D(420)).then(() => flip(0, r.date));
            },
          },
          t.label,
        ),
      ),
    );
    return h('div', null, h('div', { class: 'al-note', style: { marginBottom: '8px' } }, TEXT.pickLabel), chipsEl);
  }

  /* ---------- 卸载 ---------- */
  return () => {
    alive = false; clearTimeout(heightTimer);
    holder.getAnimations({ subtree: true }).forEach((a) => a.cancel());
    if (pageEl) pageEl.getAnimations().forEach((a) => a.cancel());
    if (detailSheet && detailSheet.opened) detailSheet.close();
  };
}
