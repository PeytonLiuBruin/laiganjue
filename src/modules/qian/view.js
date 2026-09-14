import { createStickScene } from '../../ui/stick-scene.js';
import { drawLot, getLot, lotLabel, formatPoemLines, levelMeta, createShakeMeter, shareText, isFated } from './core.js';
import {
  ITEM_KEYS, QUESTION_PLACEHOLDER, IDLE_HINT, SHAKING_HINT, SENSOR_HINT, DRAWN_HINT, UNFOLD_HINT, REVEALED_HINT,
  IDLE_BADGE, SHAKING_BADGE, SHEET_TITLE, FOOTER, TAKE_LABEL, SHAKE_LABEL, AGAIN_LABEL, SHARE_LABEL,
  HISTORY_KICKER, ITEMS_LABEL, FATED_TOAST, REVIEW_KICKER,
} from './data.js';
import { createRitual } from '../../ui/ritual.js';

export function mount(container, ctx) {
  const { kit, sound, haptic, storage } = ctx;
  const { h, button, input, stage, sheet, resultCard } = kit;
  const gentle = ctx.platform.simpleMotion, instant = ctx.platform.prefersReducedMotion;
  let suppressClickUntil = 0;
  let phase = 'idle', busy = false, held = false, lot = null, reading = null;
  let question = String(storage.get('question', '') || '').slice(0, 60);
  let asked = question;
  let history = storage.get('history', []).filter((x) => getLot(x.no)).slice(-8);
  // 舞台高度按签的飞行高度定：竹签抛到最高点仍在框内，顶部不留大块空白。
  const st = stage({ cls: 'qn-stage', badge: IDLE_BADGE, minHeight: 384 });
  const ritual = createRitual(ctx, st, ['问事', '摇签', '出签', '展签']);
  const q = input({ placeholder: QUESTION_PLACEHOLDER, value: question, maxlength: 60, onInput: (v) => { question = v.trim(); storage.set('question', question); } });
  q.setAttribute('aria-label', '灵签所问之事');
  const canvas = h('canvas', { class: 'stick-canvas', attrs: { 'aria-hidden': 'true' } });
  const vessel = h('button', { type: 'button', class: 'qn-vessel stick-scene', attrs: { 'aria-label': '摇动灵签筒' }, onClick: () => { if (phase === 'idle' && performance.now() > suppressClickUntil) shake(); } }, canvas);
  const picked = h('button', { type: 'button', class: 'stick-pick-target', hidden: true, attrs: { 'aria-label': '取出灵签，展开签纸' }, onClick: () => unfold() });
  const bundle = createStickScene(ctx, canvas, { pickTarget: picked });
  const paper = h('div', { class: 'qn-paper paper-slip', hidden: true });
  st.scene.append(vessel, picked, paper);
  st.el.append(ritual.energy);
  const primary = button(SHAKE_LABEL, { variant: 'primary', size: 'large', primary: true, onClick: () => phase === 'idle' ? shake() : phase === 'drawn' ? unfold() : reset() });
  // 舞台下方唯一的一句操作提示：随阶段改字与手势图标（舞台内 stage-hint 不再重复一份）。
  const guide = kit.hint('shake', IDLE_HINT);
  guide.lastChild.setAttribute('aria-live', 'polite');
  const hist = h('div', { class: 'qn-history' });
  container.append(ritual.progress, q, st.el, guide, kit.actionBar(primary), ritual.receipt, hist);
  renderHistory(); ritual.power(0, '左右轻摇，收住后出签');

  const meter = createShakeMeter({ need: 3, minSwing: 20 });
  ctx.gesture.drag(vessel, {
    onStart() { if (busy || reading || phase !== 'idle') return; held = true; meter.reset(); haptic.tap(); },
    onMove(g) {
      if (!held) return;
      if (Math.abs(g.dx) > 8) suppressClickUntil = performance.now() + 500;
      const state = meter.push(g.dx); bundle.preview(g.dx / 4);
      ritual.power(state.progress, state.done ? '松手出签' : '左右轻摇');
    },
    onEnd(g) {
      if (!held) return; held = false;
      if (g.cancelled || Math.abs(g.dx || 0) > 8) suppressClickUntil = performance.now() + 500;
      if (!g.cancelled && meter.state.done) shake(24, { replay: false });
      else ritual.power(0, '左右轻摇签筒');
    },
  });
  ctx.motion.onShake((e) => { if (busy || reading) return; if (phase !== 'idle') reset(); shake(e.intensity); });
  ctx.motion.onMotion((m) => {
    if (held || reading || !ritual.alive) return;
    if (busy) { bundle.feed(m); return; }
    const moving = Math.hypot(m.ax || 0, m.ay || 0, m.az || 0) > 5.5;
    if (moving && phase !== 'idle') reset();
    if (phase !== 'idle') return;
    bundle.feed(m);
    if (moving) shake(20, { continuous: true });
  });
  function lock(value) { busy = value; primary.disabled = value; q.disabled = value || phase !== 'idle'; vessel.disabled = value || phase !== 'idle'; picked.disabled = value; }
  function setGuide(gesture, text) {
    const glyph = guide.firstChild;
    if (!glyph.classList.contains(gesture)) { glyph.className = 'hint-glyph ' + gesture; kit.clear(glyph); glyph.append(kit.icon('g-' + gesture)); }
    guide.lastChild.textContent = text;
  }

  async function shake(intensity = 20, { continuous = false, replay = true } = {}) {
    if (busy || reading || phase !== 'idle' || !ritual.alive) return;
    asked = question;
    lock(true); ritual.clear();
    if (!await ritual.focus()) return;
    ritual.step(1); setGuide('shake', continuous ? SENSOR_HINT : SHAKING_HINT); st.setBadge(SHAKING_BADGE);
    if (!await bundle.draw({ power: intensity / 20, continuous, replay })) { if (ritual.alive) { st.setBadge(IDLE_BADGE); setGuide('shake', IDLE_HINT); lock(false); } return; }
    if (!await ritual.pause(320)) return;
    lot = drawLot(ctx.rng.random); bundle.setLabel(lotLabel(lot)); picked.hidden = false;
    sound.play('tick'); haptic.light();
    phase = 'drawn'; ritual.step(2); setGuide('tap', DRAWN_HINT); st.setBadge(lotLabel(lot));
    primary.setLabel(TAKE_LABEL); lock(false);
  }

  async function unfold() {
    if (busy || reading || phase !== 'drawn' || !lot || !ritual.alive) return;
    lock(true); haptic.tap(); setGuide('tap', UNFOLD_HINT);
    if (!await ritual.focus()) return;
    ritual.step(3); kit.clear(paper);
    const seal = h('b', { class: 'qn-seal' }, lot.level);
    paper.append(h('span', { class: 'qn-paper-no' }, lotLabel(lot)), h('h2', null, lot.title), h('div', { class: 'qn-poem' }, lot.poem.map((line) => h('p', null, line))), seal);
    paper.hidden = false; picked.hidden = true; vessel.classList.add('qn-dim');
    sound.play('paper');
    await ritual.animate(paper, [
      { transform: 'translateY(-16px) rotateX(-68deg) scaleY(.15)', opacity: 0 },
      { transform: 'translateY(-7px) rotateX(-22deg) scaleY(.72)', opacity: 1, offset: 0.5 },
      { transform: 'translateY(0) rotateX(0deg) scaleY(1)' },
    ], { duration: instant ? 240 : 1400, easing: 'cubic-bezier(.3,.2,.2,1)' });
    if (!ritual.alive) return;
    paper.getAnimations().forEach((a) => a.cancel()); seal.classList.add('show');
    sound.play('chime'); haptic.success(); st.setBadge(`${lotLabel(lot)} · ${lot.level}`);
    const fated = isFated(history, lot.no);
    history = history.concat({ no: lot.no, question: asked, date: ctx.rng.dateKey() }).slice(-8); storage.set('history', history); renderHistory();
    if (fated) kit.toast(FATED_TOAST);
    if (!await ritual.pause(gentle || instant ? 80 : 900)) return;
    phase = 'paper'; primary.setLabel(AGAIN_LABEL); lock(false); setGuide('tap', REVEALED_HINT);
    const result = lot, resultQuestion = asked;
    ritual.reveal({ kicker: `${lotLabel(lot)} · ${lot.title}`, title: lot.level + '签', text: lot.gist, onRead: () => read(result, resultQuestion) });
  }
  function read(value, asked = '', { review = false } = {}) {
    if (busy || reading || !ritual.alive) return;
    const meta = levelMeta(value.level);
    // 六项分述合成一段两栏小表，抽屉不超过四段。
    const items = h('div', { class: 'qn-items' }, ITEM_KEYS.map((k) => h('div', { class: 'qn-item' }, h('b', null, k), h('span', null, value.items[k]))));
    const sections = [{ label: '签语', text: value.gist }, { label: '解曰', text: value.explain }, { label: ITEMS_LABEL, node: items, stack: true }];
    if (asked) sections.unshift({ label: '所问', text: asked });
    // 层次：签号 → 等级小牌 → 典故大题 → 一句等级总评（sub），印章在右上，窄屏也不相撞。
    const card = resultCard({ cls: 'm-qian', kicker: lotLabel(value), badge: `${value.level}签`, title: value.title, sub: meta?.brief, seal: value.level, verse: formatPoemLines(value.poem), sections, footer: FOOTER });
    reading = sheet({ title: review ? `${SHEET_TITLE} · ${REVIEW_KICKER}` : SHEET_TITLE, content: card, actions: [
      button(AGAIN_LABEL, { variant: 'primary', onClick: () => { const s = reading; reading = null; s.close(); reset(); } }),
      button(SHARE_LABEL, { variant: 'ghost', icon: 'share', onClick: async () => { const r = await ctx.share(shareText(value, asked)); kit.toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制' : '分享已取消'); } }),
    ], onClose: () => { reading = null; } });
    reading.open();
  }
  function reset() {
    if (busy || reading) return;
    const fresh = phase === 'idle' && !lot;
    phase = 'idle'; lot = null; paper.hidden = true; picked.hidden = true;
    vessel.classList.remove('qn-dim'); bundle.reset();
    ritual.clear(); ritual.step(0); ritual.power(0, '左右轻摇签筒'); primary.setLabel(SHAKE_LABEL); lock(false);
    st.setBadge(IDLE_BADGE); setGuide('shake', IDLE_HINT);
    if (!fresh) { haptic.tap(); sound.play('tick'); }
  }
  function renderHistory() {
    kit.clear(hist);
    if (!history.length) return;
    hist.append(
      h('span', { class: 't-kicker' }, HISTORY_KICKER),
      h('div', { class: 'qn-history-row' }, history.slice(-5).reverse().map((x) => {
        const l = getLot(x.no);
        return button(`${lotLabel(x.no)} · ${l.level}`, { variant: 'soft', size: 'small', onClick: () => read(l, x.question, { review: true }) });
      })),
    );
  }
  return () => { reading?.close(); st.el.getAnimations({ subtree: true }).forEach((a) => a.cancel()); };
}
