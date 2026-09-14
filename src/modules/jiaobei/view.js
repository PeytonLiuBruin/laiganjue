import { throwJiaobei, initSession, reduceSession, OUTCOME } from './core.js';
import { OUTCOMES, MODES, SESSION_TEXT } from './data.js';
import { createJiaobeiScene, clamp } from './model.js';
import { createRitual } from '../../ui/ritual.js';

export function mount(container, ctx) {
  const { kit, haptic, sound, storage } = ctx;
  const { h, button, chips, stage, resultCard, sheet, input, toast } = kit;
  let mode = storage.get('mode', 'single');
  if (!MODES.some((m) => m.value === mode)) mode = 'single';
  let session = initSession(), busy = false, question = '', lastResult = null, resultSheet = null;
  let history = storage.get('history', []);
  let held = false;
  const qInput = input({ placeholder: '此刻想问什么？（选填）', maxlength: 40, onInput: (v) => { question = v.trim(); } });
  qInput.setAttribute('aria-label', '想问筊杯的问题');
  const modeChips = chips(MODES, { value: mode, onChange(v) {
    if (busy) { modeChips.set(mode); return; }
    mode = v; storage.set('mode', v); reset();
  } });
  const st = stage({ cls: 'jb-stage', hint: '按住筊杯向上滑，松手掷出', badge: '单掷问事' });
  const ritual = createRitual(ctx, st, ['问事', '掷筊', '见筊', '解读']);
  const canvas = h('canvas', { class: 'jb-canvas', attrs: { role: 'img', 'aria-label': '两枚朱红色月牙筊杯，平面与弧面组成完整立体木块' } });
  const faceLabels = h('div', { class: 'jb-face-labels', hidden: true }, h('span'), h('span'));
  st.scene.append(canvas, faceLabels);
  const model = createJiaobeiScene(canvas, ctx);
  st.el.append(ritual.energy);
  const streak = h('div', { class: 'jb-streak', hidden: mode !== 'three' });
  const tossBtn = button('掷筊', { variant: 'primary', size: 'large', primary: true, onClick: () => doThrow(22) });
  const resetBtn = button('重新问事', { variant: 'ghost', onClick: reset });
  const histEl = h('div', { class: 'jb-history' });
  container.append(ritual.progress, h('div', { class: 'jb-top' }, qInput, modeChips.el), st.el, streak, kit.actionBar(tossBtn, resetBtn), ritual.receipt, histEl);
  renderStreak(); renderHistory();
  st.setBadge(mode === 'three' ? '连掷三圣杯 · 第 1 掷' : '单掷问事');

  ctx.motion.onToss((e) => { if (!resultSheet && !lastResult) doThrow(e.intensity); });
  ctx.motion.onTilt(({ gamma }) => { if (!ctx.platform.prefersReducedMotion) model.tilt((gamma || 0) / 160); });
  ctx.motion.onMotion(({ mag, ax, ay, phase, progress }) => {
    if (busy || held || lastResult || resultSheet || ctx.platform.prefersReducedMotion) return;
    model.preview(-clamp(ax || 0, -8, 8) * 2, -clamp(ay || 0, -4, 20));
    ritual.power(progress || 0, phase === 'ready' ? '收住动作，筊杯即将出手' : '向上轻甩，收住后掷出');
  });
  ctx.gesture.drag(canvas, {
    onStart() { if (busy || session.done || resultSheet) return; held = true; haptic.tap(); ritual.clear(); faceLabels.hidden = true; ritual.step(0); },
    onMove(g) {
      if (!held) return;
      model.preview(g.dx, g.dy);
      ritual.power(clamp(-g.dy / 160, 0, 1), -g.dy > 42 ? '松手掷出' : '向上滑动');
    },
    onEnd(g) {
      if (!held) return;
      held = false;
      if (!g.cancelled && g.dy < -32) doThrow(clamp(12 + Math.max(-g.vy * 12, -g.dy / 9), 12, 38));
      else { model.rest(); ritual.power(0, '按住向上滑'); restoreResult(); }
    },
  });

  function setBusy(value) {
    busy = value; tossBtn.disabled = value; resetBtn.disabled = value; qInput.disabled = value;
    modeChips.el.querySelectorAll('button').forEach((b) => { b.disabled = value; });
  }
  async function doThrow(intensity = 20) {
    if (busy || !ritual.alive || resultSheet) return;
    if (session.done) { toast('本次问事已完成，可以查看解读或重新问事'); return; }
    setBusy(true); lastResult = null; ritual.clear(); faceLabels.hidden = true;
    if (!await ritual.focus()) return;
    ritual.step(1); st.setHint(''); ritual.power(intensity / 40, '腾空 · 弹跳 · 滚动 · 落定');
    st.setBadge(mode === 'three' ? `连掷三圣杯 · 第 ${session.throws.length + 1} 掷` : '筊杯已掷出');
    sound.play('whoosh'); haptic.release();
    const result = throwJiaobei(ctx.rng.random);
    if (!await model.toss(result, intensity, (phase) => { if (phase === 'settling') { ritual.power(0, '最后一轮晃动'); st.setHint('杯沿轻晃，等它落向最后一面'); } }) || !ritual.alive) return;
    ritual.step(2); ritual.power(0, '筊杯已落定');
    const o = OUTCOMES[result.outcome];
    canvas.setAttribute('aria-label', `筊杯落地：${o.kicker}，${o.name}`);
    [result.a, result.b].forEach((face, i) => { faceLabels.children[i].textContent = face === 'flat' ? '平面 · 阳' : face === 'round' ? '弧面 · 阴' : '直立'; });
    faceLabels.hidden = false;
    sound.play(result.outcome === OUTCOME.LI ? 'gong' : result.outcome === OUTCOME.SHENG ? 'chime' : 'pop');
    haptic.settle();
    if (mode === 'three') session = reduceSession(session, result);
    renderStreak();
    lastResult = { result, o, question, verse: o.verses[Math.floor(ctx.rng.random() * o.verses.length)] };
    st.setBadge(o.name + ' · ' + o.kicker);
    st.setHint('看看两枚筊杯朝上的一面');
    history = history.concat(result.outcome).slice(-12); storage.set('history', history); renderHistory();
    // Always leave time to see the final face before any reading control appears.
    if (!await ritual.pause(ctx.platform.prefersReducedMotion ? 180 : 850)) return;
    restoreResult(); setBusy(false);
    tossBtn.setLabel(mode === 'three' ? (session.done ? '问事已完成' : '继续掷筊') : '再掷一次');
    tossBtn.disabled = session.done;
  }
  function restoreResult() {
    if (!lastResult) return;
    const { o } = lastResult;
    faceLabels.hidden = false;
    const t = mode === 'three' && session.done ? (session.miracle ? SESSION_TEXT.miracle : session.success ? SESSION_TEXT.success : SESSION_TEXT.fail) : null;
    const brief = { sheng: '把心中的计划，化成一个具体行动。', xiao: '把问题想清楚，再听一次回应。', yin: '留一点时间，重新看看事情的方向。', li: '这一刻的心念，值得认真记下。' };
    ritual.reveal({ kicker: o.kicker, title: t?.title || o.name, text: t?.sub || brief[lastResult.result.outcome], onRead: showResult });
  }
  function showResult() {
    if (!lastResult || busy || resultSheet || !ritual.alive) return;
    ritual.step(3);
    const { o, verse, question: q } = lastResult;
    const sections = [{ label: '解曰', text: o.meaning }, { label: '建议', text: o.advice }];
    if (q) sections.unshift({ label: '所问', text: q });
    if (mode === 'three' && session.done) sections.unshift({ label: '本次问事', text: (session.miracle ? SESSION_TEXT.miracle : session.success ? SESSION_TEXT.success : SESSION_TEXT.fail).meaning });
    const card = resultCard({ kicker: o.kicker, title: o.name, sub: o.alias, badge: o.badge, seal: o.seal, verse, sections, footer: '传统文化演绎 · 仅供娱乐与自我觉察' });
    resultSheet = sheet({ title: '筊杯解读', content: card, actions: [
      button('回到筊杯', { variant: 'primary', onClick: () => resultSheet.close() }),
      button('分享', { variant: 'ghost', icon: 'share', onClick: async () => { const r = await ctx.share(`【筊杯】${q ? q + '\n' : ''}${o.name} · ${o.kicker}\n${verse}\n${o.meaning}`); toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制' : '分享已取消'); } }),
    ], onClose: () => { resultSheet = null; if (ritual.alive) ritual.step(2); } });
    resultSheet.open();
  }
  function renderStreak() {
    streak.hidden = mode !== 'three'; kit.clear(streak);
    for (let i = 0; i < 3; i++) streak.append(h('span', { class: i < session.streak ? 'earned' : '', attrs: { 'aria-label': `第${i + 1}圣杯${i < session.streak ? '已获得' : '待获得'}` } }, i < session.streak ? '圣' : '—'));
    if (mode === 'three') streak.append(h('small', null, `已得 ${session.streak} / 3 圣杯`));
  }
  function renderHistory() { kit.clear(histEl); if (history.length) histEl.append(kit.historyBar(history.slice(-6), (o) => OUTCOMES[o]?.name || '')); }
  function reset() {
    if (busy) return;
    session = initSession(); lastResult = null; faceLabels.hidden = true; model.reset(); ritual.clear(); ritual.step(0); ritual.power(0, '轻触或上滑'); renderStreak();
    st.setBadge(mode === 'three' ? '连掷三圣杯 · 第 1 掷' : '单掷问事'); st.setHint('按住筊杯向上滑，松手掷出'); tossBtn.setLabel('掷筊'); tossBtn.disabled = false; haptic.tap();
  }
  return () => { model.dispose(); resultSheet?.close(); };
}
