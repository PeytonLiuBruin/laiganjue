import { createRitual } from '../../ui/ritual.js';
import { createLiuyaoCoins } from './coins.js';
// 六爻 · 界面（Web DOM）。所有逻辑在 core.js，所有文案在 data.js。
// 节奏：掷钱（六次，逐爻点亮）→ 卦成（舞台下方一行卦名与一句白话）→「展开解读」→ 抽屉。
import { tossCoins, initSession, reduceSession, sessionValues, buildReading, luckLabel, formatShareText, formatBrief } from './core.js';
import { UI, LINE_POSITIONS } from './data.js';
import { lunarFromDate } from '../../core/lunar.js';

const CN_NUM = ['一', '二', '三', '四', '五', '六'];
const ASPECTS = [['career', '事业'], ['love', '感情'], ['wealth', '财运'], ['health', '健康']];

export function mount(container, ctx) {
  const { kit, haptic, sound, storage } = ctx;
  const { h, button, stage, resultCard, sheet, input, toast, confetti } = kit;
  const reduce = () => ctx.platform.simpleMotion;

  /* ---------- 状态 ---------- */
  let session = initSession();
  let busy = false;
  let auto = false, autoTimer = null, resultSheet = null;
  let question = String(storage.get('question', '') || '').slice(0, 40);
  let startedAt = null; // 首掷时间（用于记录干支）
  let lastReading = null;
  let gen = 0; // 会话代数：重起后让仍在飞行中的一掷作废
  let doneNudge = 0; // 卦成后体感再来时的轻提示节流
  let history = storage.get('history', []); // [{ v:[6 值], q, t }]

  /* ---------- 头部：所问（记住上次） ---------- */
  const qInput = input({ placeholder: UI.questionPlaceholder, value: question, maxlength: 40, onInput: (v) => { question = v.trim(); storage.set('question', question); } });
  qInput.setAttribute('aria-label', '所问之事');

  /* ---------- 舞台：左为钱盘，右为卦象台 ---------- */
  const st = stage({ cls: 'ly-stage', badge: UI.badgeIdle });
  const ritual = createRitual(ctx, st, ['问事', '掷钱', '见爻', '解读']);
  const wait = ritual.pause;
  const mat = h('div', { class: 'ly-mat', attrs: { 'aria-hidden': 'true' } }, h('span', { class: 'ly-mat-ring' }));
  const pit = h('div', { class: 'ly-pit' });
  const canvas = h('canvas', { class: 'ly-canvas', attrs: { role: 'img', 'aria-label': '三枚铜钱' } });
  pit.append(canvas);
  const coins = createLiuyaoCoins(canvas, ctx);
  const board = makeBoard();
  st.scene.append(mat, pit, board.el);

  /* ---------- 唯一的一句提示 + 操作 ---------- */
  const hintEl = kit.hint('toss', UI.hints.idle);
  hintEl.classList.add('ly-hint');
  const setHint = (t, quiet = false) => {
    if (hintEl.lastChild.textContent !== t) hintEl.lastChild.textContent = t;
    hintEl.classList.toggle('ly-quiet', quiet);
  };
  const tossBtn = button(UI.tossLabel, { variant: 'primary', size: 'large', primary: true, onClick: () => (session.done && lastReading ? showResult(lastReading) : doToss(22)) });
  const autoBtn = button(UI.autoLabel, { variant: 'ghost', onClick: toggleAuto });
  const resetBtn = button('', { variant: 'ghost', icon: 'refresh', cls: 'ly-reset', onClick: () => reset() });
  resetBtn.setAttribute('aria-label', UI.resetLabel);
  const actions = kit.actionBar(tossBtn, autoBtn, resetBtn);
  const histEl = h('div', { class: 'ly-hist' });

  container.append(h('div', { class: 'ly-top' }, qInput), st.el, hintEl, ritual.receipt, actions, histEl);
  renderHistory();
  setButtons();

  /* ---------- 体感 / 手势：三条入口同一件事 ---------- */
  ctx.motion.onToss((e) => sensorToss(e.intensity));
  ctx.motion.onShake((e) => sensorToss(e.intensity, true));
  ctx.gesture.flick(pit, (g) => {
    if (session.done) { if (lastReading) showResult(lastReading); return; }
    doToss(g.intensity);
  }, { minSpeed: 0.5 });
  // 卦成之后，体感不再改动结果：六掷得来的卦，不该被一次误摇抹掉
  function sensorToss(intensity, rattle = false) {
    if (session.done && !busy) {
      const now = performance.now();
      if (!resultSheet && now - doneNudge > 2500) { doneNudge = now; toast(UI.hints.done); }
      return;
    }
    doToss(intensity, { rattle });
  }
  // 倾斜：钱盘轻微视差；持机微动：铜钱在手里轻颤
  const par = kit.parallax(mat, { max: 5 });
  ctx.motion.onTilt(par);
  let lastTremble = 0;
  ctx.motion.onMotion((m) => {
    if (busy || session.done || resultSheet) return;
    const now = performance.now();
    if (now - lastTremble < 260 || m.smooth < 2.2) return;
    lastTremble = now;
    tremble(Math.min(1, m.smooth / 10));
  });

  /* ---------- 掷钱 ---------- */
  async function doToss(intensity = 20, { rattle = false } = {}) {
    if (busy || !ritual.alive || resultSheet) return;
    if (session.done) reset(true);
    busy = true;
    const g = gen;
    const n = session.tosses.length + 1;
    setButtons();
    if (!await ritual.focus() || g !== gen) return;
    if (!startedAt) startedAt = new Date();
    st.setBadge(`第 ${n} 掷`);
    setHint(UI.hints.flight, true);

    if (rattle) {
      sound.play('shake');
      haptic.rattle();
      await tremble(1, reduce() ? 10 : 220);
    }
    if (!ritual.alive || g !== gen) return;
    const toss = tossCoins(ctx.rng.random);
    sound.play('whoosh');
    haptic.light();
    const completed = await coins.toss(toss.coins, intensity);
    if (!ritual.alive || g !== gen) return;
    if (!completed) { busy = false; setButtons(); setHint(UI.hints.idle); st.setBadge(n > 1 ? `第 ${n - 1} 掷` : UI.badgeIdle); return; }

    session = reduceSession(session, toss);
    const idx = session.tosses.length - 1;
    board.light(idx, toss.value);
    sound.play('tick', { delay: 0.02 });
    haptic.tap();
    st.setBadge(`第 ${idx + 1} 掷 · ${toss.name}${toss.mark ? ' ' + toss.mark : ''}`);

    if (session.done) {
      auto = false;
      lastReading = buildReading(sessionValues(session));
      // The sixth coin must settle before any reading action becomes usable.
      setButtons();
      if (!await wait(reduce() ? 10 : 460) || g !== gen) return;
      finish(lastReading);
      busy = false;
      setButtons();
      return;
    }
    busy = false;
    setButtons();
    setHint(UI.hints.idle);
    if (auto) autoTimer = ctx.setTimeout(() => { autoTimer = null; if (auto && g === gen) doToss(20); }, reduce() ? 200 : 900);
  }

  /** 卦成：舞台上卦象台换上卦名，舞台下方给出卦名与一句白话 */
  function finish(reading) {
    const { ben, bian, moving, focus } = reading;
    sound.play('gong');
    haptic.success();
    board.done(ben.fullName);
    st.setBadge(`卦成 · ${moving.length ? `${moving.length} 爻动 → ${bian.name}` : '六爻皆静'}`);
    setHint(UI.hints.done, true);
    ritual.reveal({ kicker: `本卦 · 上${ben.upper.name}下${ben.lower.name}${bian ? ` · 变 ${bian.fullName}` : ''}`, title: ben.fullName, text: focus.gist });

    // 彩蛋：纯卦 / 六爻皆动 / 大吉
    const bits = ben.bits;
    let egg = null;
    if (bits === '111111') egg = UI.eggs.pureYang;
    else if (bits === '000000') egg = UI.eggs.pureYin;
    else if (moving.length === 6) egg = UI.eggs.allMoving;
    if (egg) {
      sound.play('shimmer', { delay: 0.3 });
      toast(egg);
    }
    if (egg || luckLabel(focus.luck).luck === 5) confetti(st.el, { count: 54, origin: { x: 0.34, y: 0.5 } });

    history = history.concat([{ v: reading.values, q: question, t: Date.now() }]).slice(-12);
    storage.set('history', history);
    renderHistory();
    revealScroll();
  }

  /** 结果行与按钮若被首屏截断，轻轻滚到能看见为止（不把结果行推出头部之下） */
  function revealScroll() {
    const vh = window.visualViewport?.height || window.innerHeight;
    const over = actions.getBoundingClientRect().bottom - (vh - 12);
    if (over <= 0) return;
    const room = Math.max(0, ritual.receipt.getBoundingClientRect().top - 84);
    window.scrollBy({ top: Math.min(over, room), behavior: ctx.platform.prefersReducedMotion ? 'instant' : 'smooth' });
  }

  /* ---------- 结果抽屉 ---------- */
  function showResult(reading, { fromHistory = false, when = startedAt, q = question } = {}) {
    if (busy || resultSheet || !ritual.alive) return;
    const { ben, bian, rule, focus } = reading;
    const L = luckLabel(focus.luck);
    const dateText = ganzhiText(when);
    const sections = [];
    if (q) sections.push({ label: '所问', text: q });
    sections.push({ label: '卦象', node: h('div', null, hexPair(reading), h('div', { class: 'ly-xiang' }, h('span', { class: 'ly-xiang-k' }, '象曰'), ben.xiang)), stack: true });
    sections.push({ label: '白话', node: h('div', null, h('div', { class: 'ly-gist' }, focus.gist), h('div', null, focus.meaning)) });
    sections.push({ label: '动爻', node: movingNode(reading) });
    if (bian) {
      sections.push({
        label: '变卦',
        node: h(
          'div',
          null,
          h('div', { class: 'ly-bian-head' }, h('span', { class: 'ly-bian-sym' }, bian.symbol), h('b', null, bian.fullName), h('span', { class: 't-faint' }, ` · 上${bian.upper.name}下${bian.lower.name}`)),
          h('div', null, bian.gist),
          rule.key === 'all' ? h('div', { class: 't-faint ly-note' }, '六爻皆动，以下分项皆依变卦而断。') : null,
        ),
      });
    }
    sections.push({ label: '分项', node: aspects(focus), stack: true });

    const card = resultCard({
      kicker: `本卦 · 上${ben.upper.name}下${ben.lower.name}`,
      title: ben.fullName,
      badge: L.badge,
      seal: L.seal,
      sub: `${ben.symbol}　第 ${ben.no} 卦${dateText ? ' · ' + dateText + '起' : ''}`,
      verse: ben.guaci,
      sections,
      footer: UI.footer,
    });
    // 抽屉挂在 body 下，包一层 .m-liuyao 让模块样式在抽屉内同样生效
    const content = h('div', { class: 'm-liuyao ly-sheet' }, card);
    const share = button('分享', {
      variant: fromHistory ? 'primary' : 'ghost',
      icon: 'share',
      onClick: async () => {
        const r = await ctx.share(formatShareText(reading, { question: q, date: dateText }));
        toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制到剪贴板' : '分享失败');
      },
    });
    const again = button(UI.againLabel, { variant: 'primary', onClick: () => { sh.close(); reset(); } });
    const sh = sheet({ title: fromHistory ? UI.historySheetTitle : UI.sheetTitle, content, actions: fromHistory ? [share] : [again, share], onClose: () => { resultSheet = null; } });
    resultSheet = sh;
    sh.open();
    return sh;
  }

  /** 本卦 → 变卦 的小卦象对照 */
  function hexPair(reading) {
    const { ben, bian, moving } = reading;
    const wrap = h('div', { class: 'ly-pair' }, miniHex(ben, moving, '本卦'));
    if (bian) wrap.append(h('span', { class: 'ly-pair-arrow' }, '→'), miniHex(bian, [], '变卦'));
    else wrap.append(h('span', { class: 'ly-pair-still' }, '六爻皆静'));
    return wrap;
  }
  function hexLines(hex, moving) {
    const lines = h('div', { class: 'ly-mini' });
    for (let i = 5; i >= 0; i--) lines.append(h('span', { class: ['ly-mini-line', hex.bits[i] === '1' ? 'yang' : 'yin', moving.includes(i) && 'moving'] }));
    return lines;
  }
  function miniHex(hex, moving, label) {
    return h('div', { class: 'ly-mini-wrap' }, h('span', { class: 'ly-mini-label' }, label), hexLines(hex, moving), h('span', { class: 'ly-mini-name' }, hex.fullName));
  }
  function movingNode(reading) {
    const { moving, lines, rule } = reading;
    const el = h('div', { class: 'ly-mv' }, h('div', { class: 'ly-mv-rule' }, h('b', null, rule.title), ' ', rule.text));
    for (const i of moving) {
      const l = lines[i];
      el.append(h('div', { class: 'ly-mv-item' }, h('div', { class: 'ly-mv-head' }, h('span', { class: 'ly-mv-mark' }, l.mark), h('b', null, `${l.name} · ${l.position.short}动`), h('span', { class: 't-faint' }, ` ${l.kind}，${l.yang ? '阳变阴' : '阴变阳'}`)), h('div', { class: 'ly-mv-text' }, l.position.text)));
    }
    return el;
  }
  /** 事业 / 感情 / 财运 / 健康 四格 */
  function aspects(hex) {
    return h('div', { class: 'ly-aspects' }, ASPECTS.map(([k, label]) => h('div', { class: 'ly-aspect' }, h('b', null, label), h('span', null, hex[k]))));
  }

  /* ---------- 历史 ---------- */
  function renderHistory() {
    kit.clear(histEl);
    if (!history.length) return;
    histEl.append(h('div', { class: 'ly-hist-title' }, UI.historyTitle));
    const row = h('div', { class: 'ly-hist-row' });
    for (const it of history.slice().reverse()) {
      let r;
      try {
        r = buildReading(it.v);
      } catch {
        continue;
      }
      row.append(
        h(
          'button',
          {
            type: 'button',
            class: 'ly-hist-item',
            attrs: { 'aria-label': `往日卦象 ${formatBrief(r)}` },
            onClick: () => {
              haptic.tap();
              sound.play('paper');
              showResult(r, { fromHistory: true, when: it.t ? new Date(it.t) : null, q: it.q || '' });
            },
          },
          formatBrief(r),
        ),
      );
    }
    histEl.append(h('div', { class: 'ly-hist-scroll' }, row));
  }

  /* ---------- 控制 ---------- */
  function toggleAuto() {
    if (session.done) return;
    auto = !auto;
    clearTimeout(autoTimer); autoTimer = null;
    setButtons();
    haptic.tap();
    if (auto && !busy) doToss(20);
  }
  /** 按钮文案跟着状态走：掷钱起卦 → 掷第 N 爻 → 展开解读；连掷六次 → 连掷余下 / 停止；重起在未掷前不出现 */
  function setButtons() {
    const n = session.tosses.length, done = session.done;
    qInput.disabled = busy || n > 0;
    tossBtn.setLabel(done ? UI.readLabel : n ? `掷第${CN_NUM[n]}爻` : UI.tossLabel);
    tossBtn.disabled = busy || auto;
    autoBtn.hidden = done;
    autoBtn.setLabel(auto ? UI.autoStop : n ? UI.autoRest : UI.autoLabel);
    autoBtn.classList.toggle('soft', auto);
    autoBtn.setAttribute('aria-pressed', String(auto));
    resetBtn.hidden = !n && !done;
    resetBtn.setLabel(done ? UI.againLabel : '');
    resetBtn.setAttribute('aria-label', done ? UI.againLabel : UI.resetLabel);
    resetBtn.classList.toggle('ly-reset-icon', !done);
    resetBtn.disabled = busy && !auto;
  }
  function reset(silent = false) {
    auto = false; busy = false;
    clearTimeout(autoTimer); autoTimer = null;
    gen++;
    session = initSession();
    startedAt = null;
    lastReading = null;
    coins.reset();
    board.reset();
    ritual.clear();
    st.setBadge(UI.badgeIdle);
    setHint(UI.hints.idle);
    setButtons();
    if (!silent) {
      haptic.tap();
      sound.play('flip');
      ritual.focus();
    }
  }
  function ganzhiText(when) {
    if (!when) return '';
    try {
      const l = lunarFromDate(when);
      return `${l.getDayInGanZhi()}日 ${l.getTimeZhi()}时`;
    } catch {
      return '';
    }
  }
  function tremble(strength = 1, dur = 200) {
    if (reduce()) return Promise.resolve();
    const a = ritual.track(pit.animate(
      [
        { transform: 'translate(0,0) rotate(0)' },
        { transform: `translate(${-3 * strength}px, ${2 * strength}px) rotate(${-2 * strength}deg)` },
        { transform: `translate(${3 * strength}px, ${-2 * strength}px) rotate(${2 * strength}deg)` },
        { transform: `translate(${-2 * strength}px, ${-1 * strength}px) rotate(${-1 * strength}deg)` },
        { transform: 'translate(0,0) rotate(0)' },
      ],
      { duration: dur, iterations: 1, easing: 'ease-in-out' },
    ));
    return a.finished.catch(() => {});
  }

  /* ---------- 卦象台：六爻自下而上逐条点亮，卦成后换上卦名 ---------- */
  function makeBoard() {
    const title = h('div', { class: 'ly-board-title' }, '六爻');
    const rows = [];
    const list = h('div', { class: 'ly-lines' });
    for (let i = 5; i >= 0; i--) {
      const row = h(
        'button',
        {
          type: 'button',
          class: 'ly-line empty',
          dataset: { i },
          attrs: { 'aria-label': LINE_POSITIONS[i].short },
          onClick: () => {
            const t = session.tosses[i];
            if (!t) return;
            haptic.tap();
            toast(`${LINE_POSITIONS[i].short} ${t.name}${t.mark ? ' ' + t.mark : ''} · ${t.desc}`);
          },
        },
        h('span', { class: 'ly-line-pos' }, LINE_POSITIONS[i].name),
        h('span', { class: 'ly-bar' }),
        h('span', { class: 'ly-mark' }),
      );
      rows[i] = row;
      list.append(row);
    }
    const el = h('div', { class: 'ly-board' }, title, list, h('div', { class: 'ly-board-foot' }, '自下而上'));
    return {
      el,
      light(i, value) {
        const row = rows[i];
        const yang = value === 7 || value === 9;
        const moving = value === 6 || value === 9;
        row.className = ['ly-line', yang ? 'yang' : 'yin', moving && 'moving', 'lit'].filter(Boolean).join(' ');
        row.setAttribute('aria-label', `${LINE_POSITIONS[i].short}，${session.tosses[i].name}`);
        row.querySelector('.ly-mark').textContent = moving ? (value === 9 ? '○' : '×') : '';
      },
      done(name) {
        title.textContent = name;
        el.classList.add('done');
      },
      reset() {
        title.textContent = '六爻';
        el.classList.remove('done');
        rows.forEach((row, i) => {
          row.className = 'ly-line empty';
          row.setAttribute('aria-label', LINE_POSITIONS[i].short);
          row.querySelector('.ly-mark').textContent = '';
        });
      },
    };
  }

  return () => {
    auto = false; gen++;
    clearTimeout(autoTimer); resultSheet?.close();
    coins.dispose();
    pit.getAnimations().forEach((a) => a.cancel());
  };
}
