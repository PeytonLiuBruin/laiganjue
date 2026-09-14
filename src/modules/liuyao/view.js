import { createRitual } from '../../ui/ritual.js';
import { createLiuyaoCoins } from './coins.js';
// 六爻 · 界面（Web DOM）。所有逻辑在 core.js，所有文案在 data.js。
import { tossCoins, initSession, reduceSession, sessionValues, buildReading, luckLabel, formatShareText, formatBrief } from './core.js';
import { UI, LINE_POSITIONS } from './data.js';
import { lunarFromDate } from '../../core/lunar.js';

const CN_NUM = ['一', '二', '三', '四', '五', '六'];

export function mount(container, ctx) {
  const { kit, haptic, sound, storage } = ctx;
  const { h, button, stage, hint, resultCard, sheet, input, toast, confetti } = kit;
  const reduce = () => ctx.platform.simpleMotion;

  /* ---------- 状态 ---------- */
  let session = initSession();
  let busy = false;
  let auto = false, autoTimer = null, resultSheet = null;
  let question = '';
  let startedAt = null; // 首掷时间（用于记录干支）
  let lastReading = null;
  let gen = 0; // 会话代数：重起后让仍在飞行中的一掷作废
  let history = storage.get('history', []); // [{ v:[6 值], q, t }]

  /* ---------- 头部：所问 ---------- */
  const qInput = input({ placeholder: UI.questionPlaceholder, maxlength: 40, onInput: (v) => (question = v.trim()) });

  /* ---------- 舞台 ---------- */
  const st = stage({ cls: 'ly-stage', hint: UI.hintIdle, badge: '金钱课 · 待掷', minHeight: null });
  const ritual = createRitual(ctx, st, ['问事', '掷钱', '见爻', '解读']);
  const wait = ritual.pause;
  const mat = h('div', { class: 'ly-mat' }, h('span', { class: 'ly-mat-ring' }));
  const pit = h('div', { class: 'ly-pit' });
  const canvas = h('canvas', { class: 'ly-canvas', attrs: { role: 'img', 'aria-label': '三枚铜钱' } });
  pit.append(canvas);
  const coins = createLiuyaoCoins(canvas, ctx);
  const board = makeBoard();
  const counter = h('div', { class: 'ly-count' }, h('span', { class: 'ly-count-n' }, '○'), h('span', { class: 'ly-count-t' }, '待掷'));
  const reveal = h(
    'button',
    { type: 'button', class: 'ly-reveal', hidden: true, onClick: () => lastReading && showResult(lastReading) },
    h('div', { class: 'ly-reveal-sym' }),
    h('div', { class: 'ly-reveal-name' }),
    h('div', { class: 'ly-reveal-sub' }),
  );
  st.scene.append(mat, pit, board.el, counter, reveal);

  /* ---------- 操作 ---------- */
  const tossBtn = button(UI.tossLabel, { variant: 'primary', size: 'large', primary: true, onClick: () => session.done && lastReading ? showResult(lastReading) : doToss(22) });
  const autoBtn = button(UI.autoLabel, { variant: 'ghost', onClick: toggleAuto });
  const resetBtn = button(UI.resetLabel, { variant: 'ghost', icon: 'refresh', onClick: () => reset() });
  const histEl = h('div', { class: 'ly-hist' });

  container.append(
    h('div', { class: 'ly-top' }, qInput),
    h('div', { class: 'mt-4' }, st.el),
    hint('toss', UI.hintReady),
    kit.actionBar(tossBtn, autoBtn, resetBtn),
    histEl,
  );
  renderHistory();

  /* ---------- 体感 / 手势：三条入口同一件事 ---------- */
  ctx.motion.onToss((e) => doToss(e.intensity));
  ctx.motion.onShake((e) => doToss(e.intensity, { rattle: true }));
  ctx.gesture.flick(pit, (g) => doToss(g.intensity), { minSpeed: 0.5 });
  // 倾斜：钱盘轻微视差；持机微动：铜钱在手里轻颤
  const par = kit.parallax(mat, { max: 5 });
  ctx.motion.onTilt(par);
  let lastTremble = 0;
  ctx.motion.onMotion((m) => {
    if (busy || session.done) return;
    const now = performance.now();
    if (now - lastTremble < 260 || m.smooth < 2.2) return;
    lastTremble = now;
    tremble(Math.min(1, m.smooth / 10));
  });

  /* ---------- 掷钱 ---------- */
  async function doToss(intensity = 20, { rattle = false } = {}) {
    if (busy || !ritual.alive || document.querySelector('.sheet.open')) return;
    if (session.done) reset(true);
    busy = true;
    const g = gen;
    setButtons();
    st.setHint('');
    if (!await ritual.focus() || g !== gen) return;
    if (!startedAt) startedAt = new Date();

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
    if (!completed) { busy = false; setButtons(); return; }

    session = reduceSession(session, toss);
    const idx = session.tosses.length - 1;
    board.light(idx, toss.value);
    sound.play('tick', { delay: 0.02 });
    haptic.tap();
    setCounter(idx + 1);
    st.setBadge(`第 ${idx + 1} 掷 · ${toss.name}${toss.mark ? ' ' + toss.mark : ''}`);

    if (session.done) {
      auto = false;
      if (!await wait(reduce() ? 10 : 480) || g !== gen) return;
      await finish();
    } else if (!auto) {
      st.setHint(`还需 ${6 - session.tosses.length} 掷`);
    }
    busy = false;
    setButtons();
    if (auto && !session.done) autoTimer = ctx.setTimeout(() => { autoTimer = null; if (auto && g === gen) doToss(20); }, reduce() ? 200 : 1400);
  }

  async function finish() {
    const reading = buildReading(sessionValues(session));
    lastReading = reading;
    const { ben, bian, moving } = reading;
    sound.play('gong');
    haptic.success();
    pit.classList.add('dim');
    board.setTitle(ben.name);
    const glyph = reveal.querySelector('.ly-reveal-sym');
    kit.clear(glyph); glyph.append(hexLines(ben, moving));
    reveal.querySelector('.ly-reveal-name').textContent = ben.fullName;
    reveal.querySelector('.ly-reveal-sub').textContent = bian ? `${moving.length} 爻动 → ${bian.fullName}` : UI.eggs.noneMoving;
    reveal.hidden = false;
    reveal.classList.remove('in');
    void reveal.offsetWidth;
    reveal.classList.add('in');
    st.setHint(UI.hintDone);

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
    if (egg || luckLabel(reading.focus.luck).luck === 5) confetti(st.el, { count: 54, origin: { x: 0.36, y: 0.5 } });

    history = history.concat([{ v: reading.values, q: question, t: Date.now() }]).slice(-12);
    storage.set('history', history);
    renderHistory();

    st.setHint('卦象已成，点击卦名展开解读');
  }

  /* ---------- 结果抽屉 ---------- */
  function showResult(reading, { fromHistory = false, when = startedAt, q = question } = {}) {
    if (busy || resultSheet || !ritual.alive) return;
    const { ben, bian, moving, lines, rule, focus } = reading;
    const L = luckLabel(focus.luck);
    const dateText = ganzhiText(when);
    const sections = [];
    if (q) sections.push({ label: '所问', text: q });
    sections.push({ label: '卦象', node: hexPair(reading), stack: true });
    sections.push({ label: '象曰', text: ben.xiang });
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
    sections.push({ label: '事业', text: focus.career }, { label: '感情', text: focus.love }, { label: '财运', text: focus.wealth }, { label: '健康', text: focus.health });

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
    const actions = [
      button('再起一卦', {
        variant: 'primary',
        onClick: () => {
          sh.close();
          reset();
        },
      }),
      button('分享', {
        variant: 'ghost',
        icon: 'share',
        onClick: async () => {
          const r = await ctx.share(formatShareText(reading, { question: q, date: dateText }));
          toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制到剪贴板' : '分享失败');
        },
      }),
    ];
    const sh = sheet({ title: fromHistory ? '往日卦象' : UI.sheetTitle, content, actions, onClose: () => { resultSheet = null; } });
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
    histEl.append(row);
  }

  /* ---------- 控制 ---------- */
  function toggleAuto() {
    if (session.done) reset(true);
    auto = !auto;
    clearTimeout(autoTimer); autoTimer = null;
    setButtons();
    haptic.tap();
    if (auto && !busy) doToss(20);
  }
  function setButtons() {
    tossBtn.setLabel(session.done ? '展开解读' : UI.tossLabel);
    tossBtn.disabled = busy || auto;
    autoBtn.setLabel(auto ? UI.autoStop : UI.autoLabel);
    autoBtn.classList.toggle('soft', auto);
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
    pit.classList.remove('dim');
    reveal.hidden = true;
    reveal.classList.remove('in');
    setCounter(0);
    st.setBadge('金钱课 · 待掷');
    st.setHint(UI.hintIdle);
    setButtons();
    if (!silent) {
      haptic.tap();
      sound.play('flip');
    }
  }
  function setCounter(n) {
    counter.querySelector('.ly-count-n').textContent = n ? CN_NUM[n - 1] : '○';
    counter.querySelector('.ly-count-t').textContent = n ? (n === 6 ? '卦成' : `第${CN_NUM[n - 1]}掷`) : '待掷';
    counter.classList.toggle('done', n === 6);
    counter.classList.remove('bump');
    void counter.offsetWidth;
    if (n) counter.classList.add('bump');
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

  /* ---------- 卦象台：六爻自下而上逐条点亮 ---------- */
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
      setTitle(t) {
        title.textContent = t;
      },
      reset() {
        title.textContent = '六爻';
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
