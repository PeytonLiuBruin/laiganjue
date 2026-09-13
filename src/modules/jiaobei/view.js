// 筊杯 · 界面（Web DOM）。所有逻辑在 core.js，所有文案在 data.js。
import { throwJiaobei, initSession, reduceSession, OUTCOME } from './core.js';
import { OUTCOMES, MODES, QUESTION_PLACEHOLDER, THREE_MODE_INTRO, SESSION_TEXT, STREAK_LABELS } from './data.js';

export function mount(container, ctx) {
  const { kit, haptic, sound, storage } = ctx;
  const { h, button, chips, stage, hint, resultCard, sheet, input, toast, wait, confetti, historyBar } = kit;

  /* ---------- 状态 ---------- */
  let mode = storage.get('mode', 'single');
  let session = initSession();
  let busy = false;
  let question = '';
  let history = storage.get('history', []); // 最近 12 次 outcome

  /* ---------- 头部：问题 + 模式 ---------- */
  const qInput = input({ placeholder: QUESTION_PLACEHOLDER, maxlength: 40, onInput: (v) => (question = v.trim()) });
  const modeChips = chips(MODES, {
    value: mode,
    onChange: (v) => {
      mode = v;
      storage.set('mode', v);
      session = initSession();
      renderStreak();
      st.setBadge(mode === 'three' ? '连掷三圣杯 · 第 1 掷' : '单掷问事');
      st.setHint(mode === 'three' ? THREE_MODE_INTRO : '心中默念所求之事');
      haptic.tap();
    },
  });

  /* ---------- 舞台：两枚筊杯 ---------- */
  const st = stage({ cls: 'jb-stage', hint: mode === 'three' ? THREE_MODE_INTRO : '心中默念所求之事', badge: mode === 'three' ? '连掷三圣杯 · 第 1 掷' : '单掷问事', minHeight: 320 });
  const blockA = makeBlock('a');
  const blockB = makeBlock('b');
  const altar = h('div', { class: 'jb-altar' });
  const incense = h('div', { class: 'jb-incense' }, h('span', { class: 'jb-smoke' }), h('span', { class: 'jb-smoke s2' }), h('span', { class: 'jb-smoke s3' }));
  st.scene.append(altar, incense, blockA.el, blockB.el);

  const streakEl = h('div', { class: 'jb-streak', hidden: mode !== 'three' });
  const renderStreak = () => {
    streakEl.hidden = mode !== 'three';
    streakEl.textContent = STREAK_LABELS[Math.min(3, session.streak)];
  };
  renderStreak();

  /* ---------- 操作 ---------- */
  const tossBtn = button('掷 筊', { variant: 'primary', size: 'large', primary: true, onClick: () => doThrow(22) });
  const resetBtn = button('重来', { variant: 'ghost', icon: 'refresh', onClick: () => reset() });
  const histEl = h('div', { class: 'jb-history' });
  const renderHistory = () => {
    kit.clear(histEl);
    if (history.length) histEl.append(historyBar(history.slice(-10), (o) => OUTCOMES[o].name));
  };
  renderHistory();

  container.append(
    h('div', { class: 'jb-top' }, qInput, h('div', { class: 'mt-3' }, modeChips.el)),
    h('div', { class: 'mt-4' }, st.el),
    streakEl,
    hint('toss', '向上甩动手机，或在筊杯上向上快滑'),
    kit.actionBar(tossBtn, resetBtn),
    histEl,
  );

  /* ---------- 体感 / 手势 ---------- */
  ctx.motion.onToss((e) => doThrow(e.intensity));
  ctx.gesture.flick(st.el, (g) => doThrow(g.intensity), { minSpeed: 0.5 });
  // 轻微倾斜视差：让香烟与筊杯有一点"空间"
  const par = kit.parallax(incense, { max: 6 });
  ctx.motion.onTilt(par);

  /* ---------- 投掷 ---------- */
  async function doThrow(intensity = 20) {
    if (busy) return;
    if (session.done) {
      toast(session.success ? '已得三圣杯，点"重来"再问' : '今日不允，点"重来"改日再问');
      return;
    }
    busy = true;
    tossBtn.disabled = true;
    st.setHint('');
    haptic.light();
    sound.play('whoosh');
    if (mode === 'three') st.setBadge(`连掷三圣杯 · 第 ${session.throws.length + 1} 掷`);

    const result = throwJiaobei();
    const power = Math.max(0.7, Math.min(1.5, intensity / 20));
    // 两枚各自飞行，落地时间略有先后
    await Promise.all([blockA.fly(result.a, power, 0), blockB.fly(result.b, power, 90)]);
    haptic.heavy();

    // 落地判定
    const o = OUTCOMES[result.outcome];
    if (result.outcome === OUTCOME.LI) {
      sound.play('gong');
      haptic.success();
      confetti(st.el, { count: 60, origin: { x: 0.5, y: 0.45 } });
    } else if (result.outcome === OUTCOME.SHENG) {
      sound.play('chime', { delay: 0.05 });
      haptic.success();
    } else if (result.outcome === OUTCOME.XIAO) {
      sound.play('pop', { delay: 0.05 });
    } else {
      sound.play('low', { delay: 0.05 });
    }

    history = history.concat([result.outcome]).slice(-12);
    storage.set('history', history);
    renderHistory();

    if (mode === 'three') {
      session = reduceSession(session, result);
      renderStreak();
      await wait(350);
      showResult(result, o);
    } else {
      await wait(350);
      showResult(result, o);
    }
    busy = false;
    tossBtn.disabled = false;
  }

  function showResult(result, o) {
    const verse = o.verses[Math.floor(Math.random() * o.verses.length)];
    const sections = [
      { label: '解曰', text: o.meaning },
      { label: '建议', text: o.advice },
    ];
    if (question) sections.unshift({ label: '所问', text: question });
    let kicker = o.kicker;
    let title = o.name;
    let sub = o.alias;
    if (mode === 'three') {
      if (session.done) {
        const t = session.miracle ? SESSION_TEXT.miracle : session.success ? SESSION_TEXT.success : SESSION_TEXT.fail;
        kicker = `第 ${session.throws.length} 掷 · ${o.name}`;
        title = t.title;
        sub = t.sub;
        sections.unshift({ label: '结论', text: t.meaning });
      } else {
        kicker = `第 ${session.throws.length} 掷 · ${o.kicker}`;
        sub = `${o.alias} · 已连得 ${session.streak} 圣杯，还需 ${3 - session.streak} 次`;
      }
    }
    const card = resultCard({ kicker, title, sub, badge: o.badge, seal: o.seal, verse, sections, footer: '仅供娱乐 · 心诚则灵' });
    const actions = [];
    if (mode === 'three' && !session.done) {
      actions.push(
        button('继续掷', {
          variant: 'primary',
          onClick: () => {
            sh.close();
            wait(380).then(() => doThrow(22));
          },
        }),
      );
    } else {
      actions.push(
        button('再问一次', {
          variant: 'primary',
          onClick: () => {
            sh.close();
            if (mode === 'three') reset(true);
          },
        }),
      );
    }
    actions.push(
      button('分享', {
        variant: 'ghost',
        icon: 'share',
        onClick: async () => {
          const text = `【筊杯】${question ? '问：' + question + '\n' : ''}得「${title}」— ${verse}\n${o.meaning}\n—— 来感觉 · 玄学占卜`;
          const r = await ctx.share(text);
          toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制到剪贴板' : '分享失败');
        },
      }),
    );
    const sh = sheet({ title: '筊杯启示', content: card, actions });
    sh.open();
  }

  function reset(silent = false) {
    session = initSession();
    renderStreak();
    blockA.rest();
    blockB.rest();
    st.setBadge(mode === 'three' ? '连掷三圣杯 · 第 1 掷' : '单掷问事');
    st.setHint(mode === 'three' ? THREE_MODE_INTRO : '心中默念所求之事');
    if (!silent) {
      haptic.tap();
      sound.play('flip');
    }
  }

  /* ---------- 筊杯元素 ---------- */
  function makeBlock(which) {
    // 一枚筊杯：3D 翻转体，flat 面朝上 = 平；round 面朝上 = 凸
    const el = h(
      'div',
      { class: ['jb-block', 'jb-' + which] },
      h('div', { class: 'jb-body' }, h('div', { class: 'jb-face jb-flat' }, h('span', { class: 'jb-grain' })), h('div', { class: 'jb-face jb-round' }, h('span', { class: 'jb-shine' }))),
      h('div', { class: 'jb-shadow' }),
    );
    const body = el.querySelector('.jb-body');
    const shadow = el.querySelector('.jb-shadow');
    let anim = null;
    const restPose = which === 'a' ? 'translateX(-58px) rotateZ(-10deg)' : 'translateX(58px) rotateZ(12deg)';
    el.style.transform = restPose;
    body.style.transform = 'rotateX(0deg)';

    const faceRot = (face) => (face === 'flat' ? 0 : face === 'round' ? 180 : 90);

    async function fly(face, power = 1, delay = 0) {
      if (delay) await wait(delay);
      if (anim) anim.cancel();
      const reduce = ctx.platform.prefersReducedMotion;
      const height = -(180 + 120 * power);
      const spins = (2 + Math.round(power * 2)) * 360;
      const endX = (which === 'a' ? -1 : 1) * (40 + Math.random() * 40);
      const endZ = (Math.random() - 0.5) * 60;
      const dur = reduce ? 10 : 900 + power * 220;
      // 外层位移 + 内层翻转分开做，落地带一点弹跳
      el.animate(
        [
          { transform: restPose, offset: 0 },
          { transform: `translate(${endX * 0.5}px, ${height}px) rotateZ(${endZ * 0.5}deg)`, offset: 0.45, easing: 'cubic-bezier(.2,.9,.4,1)' },
          { transform: `translate(${endX}px, 0px) rotateZ(${endZ}deg)`, offset: 0.82, easing: 'cubic-bezier(.6,0,.9,.4)' },
          { transform: `translate(${endX}px, -14px) rotateZ(${endZ}deg)`, offset: 0.9 },
          { transform: `translate(${endX}px, 0px) rotateZ(${endZ}deg)`, offset: 1 },
        ],
        { duration: dur, fill: 'forwards' },
      );
      shadow.animate(
        [
          { transform: 'scale(1)', opacity: 0.55 },
          { transform: 'scale(0.4)', opacity: 0.15, offset: 0.45 },
          { transform: 'scale(1.05)', opacity: 0.55, offset: 0.82 },
          { transform: 'scale(1)', opacity: 0.55 },
        ],
        { duration: dur, fill: 'forwards' },
      );
      const finalRot = faceRot(face);
      anim = body.animate(
        [{ transform: 'rotateX(0deg) rotateY(0deg)' }, { transform: `rotateX(${spins + finalRot}deg) rotateY(${(Math.random() - 0.5) * 40}deg)`, offset: 0.82, easing: 'cubic-bezier(.3,.7,.5,1)' }, { transform: `rotateX(${spins + finalRot}deg) rotateY(0deg)` }],
        { duration: dur, fill: 'forwards' },
      );
      await wait(dur * 0.82);
      sound.play('clack');
      haptic.medium();
      await wait(dur * 0.18 + 20);
      el.dataset.face = face;
      if (face === 'stand') el.classList.add('standing');
    }
    function rest() {
      if (anim) anim.cancel();
      el.getAnimations().forEach((a) => a.cancel());
      shadow.getAnimations().forEach((a) => a.cancel());
      body.getAnimations().forEach((a) => a.cancel());
      el.style.transform = restPose;
      body.style.transform = 'rotateX(0deg)';
      el.classList.remove('standing');
      delete el.dataset.face;
    }
    return { el, fly, rest };
  }

  return () => {
    // 所有 motion/gesture 订阅由 ctx 自动清理；这里清理动画即可
    blockA.rest();
    blockB.rest();
  };
}
