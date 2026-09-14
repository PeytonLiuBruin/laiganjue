import { throwJiaobei, initSession, reduceSession, OUTCOME } from './core.js';
import { OUTCOMES, MODES, SESSION_TEXT, QUESTION_PLACEHOLDER, THREE_MODE_INTRO, HINTS, BRIEFS, STREAK_BRIEFS, SHARE_SIGN } from './data.js';
import { clamp } from './model.js';
import { createJiaobeiPhysical } from './physical.js';
import { createRitual } from '../../ui/ritual.js';

const THROW_DY = 36; // 手指上滑超过这个距离，松手即掷出

export function mount(container, ctx) {
  const { kit, haptic, sound, storage } = ctx;
  const { h, button, chips, stage, resultCard, sheet, input, toast } = kit;
  let mode = storage.get('mode', 'single');
  if (!MODES.some((m) => m.value === mode)) mode = 'single';
  let session = initSession(), busy = false, lastResult = null, resultSheet = null;
  let question = String(storage.get('question', '') || '').slice(0, 40);
  let history = storage.get('history', []);
  let held = false, armed = false, throwCount = 0;
  const qInput = input({ placeholder: QUESTION_PLACEHOLDER, value: question, maxlength: 40, onInput: (v) => { question = v.trim(); storage.set('question', question); } });
  qInput.setAttribute('aria-label', '想问筊杯的问题');
  const modeChips = chips(MODES, { value: mode, onChange(v) {
    if (busy) { modeChips.set(mode); return; }
    mode = v; storage.set('mode', v); reset();
  } });
  const st = stage({ cls: 'jb-stage', badge: '第 1 掷' });
  const ritual = createRitual(ctx, st, ['问事', '掷筊', '见筊', '解读']);
  const mat = h('div', { class: 'jb-mat', attrs: { 'aria-hidden': 'true' } });
  const canvas = h('canvas', { class: 'jb-canvas', attrs: { role: 'img', 'aria-label': '两枚朱红色月牙筊杯，平面与弧面组成完整立体木块' } });
  const faceLabels = h('div', { class: 'jb-face-labels', hidden: true }, h('span'), h('span'));
  const streak = h('div', { class: 'jb-streak', hidden: mode !== 'three', attrs: { role: 'img' } });
  st.scene.append(mat, canvas, faceLabels);
  st.el.append(streak, ritual.energy);
  const model = createJiaobeiPhysical(canvas, ctx);
  const hintEl = kit.hint('toss', HINTS.idle);
  hintEl.classList.add('jb-hint');
  // 这一行要么是操作指引（带手势图标），要么是状态说明（不带）。
  const setHint = (t) => { if (hintEl.lastChild.textContent !== t) hintEl.lastChild.textContent = t; hintEl.classList.toggle('jb-quiet', busy || session.done); };
  const idleHint = () => (session.done ? HINTS.done : HINTS.idle);
  const throwNo = () => (mode === 'three' ? session.throws.length : throwCount) + 1;
  const sessionText = () => (session.miracle ? SESSION_TEXT.miracle : session.success ? SESSION_TEXT.success : SESSION_TEXT.fail);
  function setBadge(suffix) { st.setBadge(`第 ${throwNo()} 掷${suffix ? ' · ' + suffix : ''}`); }
  // 结果条收起时页面会变短，浏览器会把滚动位置硬拉回顶部；用占位撑住，等新结果出现再放开。
  function holdSpace() {
    const r = ritual.receipt;
    if (r.hidden) return;
    const cs = getComputedStyle(r);
    spacer.style.height = `${r.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom)}px`;
  }
  function releaseSpace() { spacer.style.height = '0px'; }
  const tossBtn = button('掷筊', { variant: 'primary', size: 'large', primary: true, onClick: () => { if (session.done) reset(); else doThrow(22); } });
  const resetBtn = button('重新问事', { variant: 'ghost', onClick: reset });
  const histEl = h('div', { class: 'jb-history' });
  const spacer = h('div', { class: 'jb-spacer', attrs: { 'aria-hidden': 'true' } });
  container.append(ritual.progress, h('div', { class: 'jb-top' }, qInput, modeChips.el), st.el, hintEl, kit.actionBar(tossBtn, resetBtn), ritual.receipt, spacer, histEl);
  renderStreak(); renderHistory(); setBadge(); syncButtons();

  ctx.motion.onToss(sensorThrow);
  ctx.motion.onShake(sensorThrow);
  function sensorThrow(e) { if (busy || resultSheet) return; if (session.done) reset(); doThrow(e.intensity); }
  ctx.motion.onTilt(({ gamma }) => { if (!ctx.platform.simpleMotion) model.tilt((gamma || 0) / 160); });
  ctx.motion.onMotion(({ ax, ay, phase, progress }) => {
    if (busy || held || resultSheet || ctx.platform.simpleMotion) return;
    model.preview(-clamp(ax || 0, -8, 8) * 2, -clamp(ay || 0, -4, 20));
    ritual.power(progress || 0);
    setHint(phase === 'ready' ? HINTS.ready : phase === 'charging' ? HINTS.charging : idleHint());
  });
  ctx.gesture.drag(canvas, {
    onStart() {
      if (busy || session.done || resultSheet) return;
      held = true; armed = false; haptic.tap(); holdSpace(); ritual.clear(); faceLabels.hidden = true; ritual.step(0); setHint(HINTS.drag);
    },
    onMove(g) {
      if (!held) return;
      model.preview(g.dx, g.dy * 1.4);
      ritual.power(clamp(-g.dy / 160, 0, 1));
      const ready = -g.dy > THROW_DY;
      if (ready !== armed) { armed = ready; if (ready) haptic.light(); setHint(ready ? HINTS.release : HINTS.drag); }
    },
    onEnd(g) {
      if (!held) return;
      held = false;
      if (!g.cancelled && -g.dy > THROW_DY) doThrow(clamp(12 + Math.max(-g.vy * 12, -g.dy / 9), 12, 38));
      else { model.rest(); setHint(idleHint()); restoreResult(); }
    },
  });

  function setBusy(value) {
    busy = value; tossBtn.disabled = value; resetBtn.disabled = value;
    qInput.disabled = value || mode === 'three' && session.throws.length > 0;
    modeChips.el.querySelectorAll('button').forEach((b) => { b.disabled = value; });
  }
  /** 主按钮文案跟着状态走：掷筊 → 再掷一次 / 继续掷筊 → 重新问事（定局后） */
  function syncButtons() {
    const started = lastResult || session.throws.length > 0;
    qInput.disabled = busy || mode === 'three' && session.throws.length > 0;
    tossBtn.setLabel(session.done ? '重新问事' : !started ? '掷筊' : mode === 'three' ? '继续掷筊' : '再掷一次');
    resetBtn.hidden = session.done;
    tossBtn.disabled = busy;
  }
  async function doThrow(intensity = 20) {
    if (busy || !ritual.alive || resultSheet) return;
    if (session.done) { toast('本次问事已完成，可展开解读或重新问事'); return; }
    setBusy(true); lastResult = null; holdSpace(); ritual.clear(); faceLabels.hidden = true;
    if (!await ritual.focus()) return;
    ritual.step(1); setBadge('已掷出'); setHint(HINTS.flight); ritual.power(intensity / 40);
    sound.play('whoosh'); haptic.release();
    const result = throwJiaobei(ctx.rng.random);
    const ok = await model.toss(result, intensity, (phase) => { if (phase === 'settling') setHint(HINTS.settling); });
    if (!ok || !ritual.alive) { if (ritual.alive) { setBusy(false); syncButtons(); setHint(idleHint()); } return; }
    ritual.step(2); ritual.power(0);
    const o = OUTCOMES[result.outcome];
    canvas.setAttribute('aria-label', `筊杯落地：${o.kicker}，${o.name}`);
    placeFaceLabels(result);
    sound.play(result.outcome === OUTCOME.LI ? 'gong' : result.outcome === OUTCOME.SHENG ? 'chime' : 'pop');
    haptic.settle();
    if (mode === 'three') session = reduceSession(session, result); else throwCount++;
    renderStreak();
    lastResult = { result, o, question, verse: o.verses[Math.floor(ctx.rng.random() * o.verses.length)] };
    st.setBadge(`${o.name} · ${o.kicker}`); setHint(HINTS.landed);
    history = history.concat(result.outcome).slice(-12); storage.set('history', history); renderHistory();
    // Always leave time to see the final face before any reading control appears.
    if (!await ritual.pause(ctx.platform.simpleMotion ? 180 : 850)) return;
    restoreResult(); setBusy(false); syncButtons(); setHint(idleHint());
    revealScroll();
  }
  /** 面向标签放到各杯正下方；两杯太近时左右让开，避免重叠。 */
  function placeFaceLabels(result) {
    const xs = model.landing();
    const w = canvas.clientWidth || 0;
    if (xs.length === 2 && Math.abs(xs[0] - xs[1]) < 100) {
      const mid = (xs[0] + xs[1]) / 2, dir = xs[0] <= xs[1] ? 1 : -1;
      xs[0] = mid - 50 * dir; xs[1] = mid + 50 * dir;
    }
    [result.a, result.b].forEach((face, i) => {
      const el = faceLabels.children[i];
      el.textContent = face === 'flat' ? '平面 · 阳' : face === 'round' ? '弧面 · 阴' : '直立';
      if (w && xs[i] != null) el.style.left = `${clamp(xs[i], 44, w - 44)}px`;
    });
    faceLabels.hidden = false;
  }
  /** 结果条若被首屏截断，轻轻滚到能看见「展开解读」为止。 */
  function revealScroll() {
    const r = ritual.receipt.getBoundingClientRect();
    const vh = window.visualViewport?.height || window.innerHeight;
    const over = r.bottom - (vh - 12);
    if (over > 0) window.scrollBy({ top: Math.min(over, Math.max(0, r.top - 84)), behavior: ctx.platform.prefersReducedMotion ? 'instant' : 'smooth' });
  }
  function restoreResult() {
    if (!lastResult) return;
    const { o, result } = lastResult;
    faceLabels.hidden = false;
    const t = mode === 'three' && session.done ? sessionText() : null;
    const text = t ? t.sub : mode === 'three' ? (result.outcome === OUTCOME.SHENG ? STREAK_BRIEFS.sheng[session.streak] : STREAK_BRIEFS.xiao) : BRIEFS[result.outcome];
    ritual.reveal({ kicker: o.kicker, title: t?.title || o.name, text, onRead: showResult });
    releaseSpace();
  }
  function showResult() {
    if (!lastResult || busy || resultSheet || !ritual.alive) return;
    ritual.step(3);
    const { o, verse, question: q } = lastResult;
    const done = mode === 'three' && session.done;
    const sections = [];
    if (q) sections.push({ label: '所问', text: q });
    if (done) sections.push({ label: '本次问事', text: sessionText().meaning });
    sections.push({ label: '解曰', text: o.meaning }, { label: '建议', text: o.advice });
    if (mode === 'three') sections.push({ label: '规矩', text: THREE_MODE_INTRO });
    const card = resultCard({ kicker: o.kicker, title: o.name, sub: o.alias, badge: o.badge, seal: o.seal, verse, sections, footer: '传统文化演绎 · 仅供娱乐与自我觉察' });
    const again = button(done ? '重新问事' : mode === 'three' ? '继续掷筊' : '再掷一次', { variant: 'primary', onClick: () => {
      const s = resultSheet; resultSheet = null; s.close();
      if (done) reset(); else ctx.setTimeout(() => { if (ritual.alive) doThrow(22); }, 400);
    } });
    const share = button('分享', { variant: 'ghost', icon: 'share', onClick: async () => {
      const lines = [`【筊杯】${q || ''}`.trim(), `${o.name} · ${o.kicker}`, verse];
      if (done) lines.push(`连掷三圣杯：${sessionText().title}，${sessionText().sub}`);
      lines.push(o.meaning, SHARE_SIGN);
      const r = await ctx.share(lines.join('\n'));
      toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制' : '分享已取消');
    } });
    resultSheet = sheet({ title: '筊杯解读', content: card, actions: [again, share], onClose: () => { resultSheet = null; if (ritual.alive) ritual.step(2); } });
    resultSheet.open();
  }
  /** 连掷三圣杯的进度：舞台右上角三枚小印，得一圣杯点亮一枚。 */
  function renderStreak() {
    streak.hidden = mode !== 'three'; st.el.classList.toggle('jb-three', mode === 'three'); kit.clear(streak);
    if (mode !== 'three') return;
    streak.setAttribute('aria-label', `连掷三圣杯，已得 ${session.streak} / 3`);
    for (let i = 0; i < 3; i++) streak.append(h('span', { class: [i < session.streak && 'earned', i === session.streak - 1 && 'fresh'] }, i < session.streak ? '圣' : ''));
  }
  function renderHistory() {
    kit.clear(histEl);
    if (history.length) histEl.append(h('span', { class: 't-kicker' }, '最近几掷'), kit.historyBar(history.slice(-6), (o) => OUTCOMES[o]?.name || ''));
  }
  function reset() {
    if (busy) return;
    holdSpace();
    session = initSession(); lastResult = null; throwCount = 0; faceLabels.hidden = true; model.reset(); ritual.clear(); ritual.step(0); ritual.power(0); renderStreak();
    setBadge(); setHint(HINTS.idle); syncButtons(); haptic.tap();
    if (window.scrollY > 0 && !ctx.platform.prefersReducedMotion) { window.scrollTo({ top: 0, behavior: 'smooth' }); ctx.setTimeout(releaseSpace, 450); }
    else releaseSpace();
  }
  return () => { model.dispose(); resultSheet?.close(); };
}
