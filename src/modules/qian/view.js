import { drawLot, getLot, lotLabel, formatPoem, createShakeMeter, shareText } from './core.js';
import { ITEM_KEYS } from './data.js';
import { createRitual } from '../../ui/ritual.js';

export function mount(container, ctx) {
  const { kit, sound, haptic, storage } = ctx;
  const { h, button, input, stage, sheet, resultCard } = kit;
  const reduce = ctx.platform.prefersReducedMotion;
  let phase = 'idle', busy = false, held = false, lot = null, reading = null, question = '';
  let history = storage.get('history', []).filter((x) => getLot(x.no)).slice(-8);
  const st = stage({ cls: 'qn-stage', badge: '灵签 · 六十四签', hint: '左右轻摇签筒，让一支签慢慢浮出', minHeight: 420 });
  const ritual = createRitual(ctx, st, ['问事', '摇签', '出签', '展签']);
  const q = input({ placeholder: '心中所问之事（选填）', maxlength: 60, onInput: (v) => { question = v.trim(); } });
  q.setAttribute('aria-label', '灵签所问之事');
  const bamboos = Array.from({ length: 9 }, (_, i) => h('i', { class: 'qn-bamboo', style: { left: `${12 + i * 9}%`, transform: `rotate(${(i - 4) * 3}deg) translateY(${i % 3 * 8}px)` } }));
  const vessel = h('button', { type: 'button', class: 'qn-vessel', attrs: { 'aria-label': '摇动灵签筒' }, onClick: () => { if (phase === 'idle') shake(); } },
    h('span', { class: 'qn-sticks' }, bamboos), h('span', { class: 'qn-rim' }),
    h('span', { class: 'qn-cylinder' }, h('i', { class: 'qn-band' }), h('b', { class: 'qn-sign' }, '灵签'), h('i', { class: 'qn-band lower' })));
  const stickLabel = h('span');
  const picked = h('button', { type: 'button', class: 'qn-picked', hidden: true, attrs: { 'aria-label': '取出灵签，展开签纸' }, onClick: () => unfold() }, stickLabel);
  const paper = h('div', { class: 'qn-paper paper-slip', hidden: true });
  st.scene.append(h('div', { class: 'qn-ground' }), vessel, picked, paper);
  st.el.append(ritual.energy);
  const primary = button('摇一签', { variant: 'primary', size: 'large', primary: true, onClick: () => phase === 'idle' ? shake() : phase === 'drawn' ? unfold() : reset() });
  const hist = h('div', { class: 'qn-history' });
  container.append(ritual.progress, q, st.el, kit.hint('shake', '摇一摇手机，或按住签筒左右摇动'), kit.actionBar(primary), ritual.receipt, hist);
  renderHistory();

  const meter = createShakeMeter({ need: 3, minSwing: 20 });
  ctx.gesture.drag(vessel, {
    onStart() { if (busy || reading || phase !== 'idle') return; held = true; meter.reset(); haptic.tap(); },
    onMove(g) {
      if (!held) return;
      const state = meter.push(g.dx);
      vessel.style.transform = `translateX(${Math.max(-24, Math.min(24, g.dx * 0.35))}px) rotate(${Math.max(-9, Math.min(9, g.dx / 7))}deg)`;
      ritual.power(state.progress, state.done ? '松手出签' : '左右轻摇');
    },
    onEnd(g) {
      if (!held) return; held = false; vessel.style.transform = '';
      if (!g.cancelled && meter.state.done) shake(24);
      else ritual.power(0, '左右轻摇签筒');
    },
  });
  ctx.motion.onShake((e) => { if (phase === 'idle') shake(e.intensity); });
  function lock(value) { busy = value; primary.disabled = value; q.disabled = value; vessel.disabled = value || phase !== 'idle'; picked.disabled = value; }

  async function shake(intensity = 20) {
    if (busy || reading || phase !== 'idle' || !ritual.alive) return;
    lock(true); ritual.clear();
    if (!await ritual.focus()) return;
    ritual.step(1); st.setHint('竹签轻碰，心念渐明');
    const power = Math.max(0.7, Math.min(1.4, intensity / 20));
    ritual.power(power / 1.4, '摇签中'); sound.play('shake'); haptic.rattle();
    const duration = 2500 + power * 200;
    const motion = Array.from({ length: 49 }, (_, i) => {
      const t = i / 48, wave = Math.sin(t * Math.PI * 12) * Math.sin(t * Math.PI);
      return { transform: `translate(${wave * 10 * power}px,${-Math.abs(wave) * 8}px) rotate(${wave * 8 * power}deg)`, offset: t };
    });
    const shuffle = ritual.animate(vessel, motion, { duration, easing: 'linear' });
    const stems = bamboos.map((stem, i) => ritual.animate(stem, [
      { transform: stem.style.transform }, { transform: stem.style.transform + ` translateY(${-8 - i % 3 * 3}px)` }, { transform: stem.style.transform },
    ], { duration: reduce ? 1 : 450 + i * 12, iterations: reduce ? 1 : 5, easing: 'ease-in-out' }));
    for (let i = 0; i < 4; i++) { if (!await ritual.pause(reduce ? 1 : 510)) return; sound.play('rattle'); }
    await shuffle; await Promise.all(stems);
    if (!ritual.alive) return;
    vessel.getAnimations().forEach((a) => a.cancel()); bamboos.forEach((el) => el.getAnimations().forEach((a) => a.cancel()));
    lot = drawLot(ctx.rng.random); picked.hidden = false; stickLabel.textContent = '';
    const final = 'translate(65px,70px) rotate(12deg)';
    await ritual.animate(picked, [
      { transform: 'translate(0,0) rotate(0)', opacity: 1 },
      { transform: 'translate(6px,-58px) rotate(4deg)', offset: 0.46 },
      { transform: 'translate(46px,-28px) rotate(20deg)', offset: 0.7 },
      { transform: 'translate(66px,75px) rotate(14deg)', offset: 0.91 },
      { transform: final },
    ], { duration: 1600, easing: 'cubic-bezier(.35,.1,.32,1)' });
    if (!ritual.alive) return;
    picked.style.transform = final; picked.getAnimations().forEach((a) => a.cancel());
    sound.play('clack'); haptic.medium();
    if (!await ritual.pause(reduce ? 60 : 500)) return;
    stickLabel.textContent = lotLabel(lot); phase = 'drawn'; ritual.step(2);
    ritual.power(0, '一支签已落定'); st.setHint('点竹签，亲手展开这一签'); st.setBadge(lotLabel(lot));
    primary.setLabel('取签展开'); lock(false);
  }

  async function unfold() {
    if (busy || reading || phase !== 'drawn' || !lot || !ritual.alive) return;
    lock(true);
    if (!await ritual.focus()) return;
    ritual.step(3); kit.clear(paper);
    const seal = h('b', { class: 'qn-seal' }, lot.level);
    paper.append(h('span', { class: 'qn-paper-no' }, lotLabel(lot)), h('h2', null, lot.title), h('div', { class: 'qn-poem' }, lot.poem.map((line) => h('p', null, line))), seal);
    paper.hidden = false; vessel.classList.add('qn-dim'); picked.classList.add('qn-dim');
    sound.play('paper');
    await ritual.animate(paper, [
      { transform: 'translateY(-16px) rotateX(-68deg) scaleY(.15)', opacity: 0 },
      { transform: 'translateY(-7px) rotateX(-22deg) scaleY(.72)', opacity: 1, offset: 0.5 },
      { transform: 'translateY(0) rotateX(0deg) scaleY(1)' },
    ], { duration: 1700, easing: 'cubic-bezier(.3,.2,.2,1)' });
    if (!ritual.alive) return;
    paper.getAnimations().forEach((a) => a.cancel()); seal.classList.add('show');
    sound.play('chime'); haptic.success(); st.setHint('签诗已展开，留片刻读一读');
    history = history.concat({ no: lot.no, question, date: ctx.rng.dateKey() }).slice(-8); storage.set('history', history); renderHistory();
    if (!await ritual.pause(reduce ? 80 : 1100)) return;
    phase = 'paper'; primary.setLabel('再求一签'); lock(false);
    ritual.reveal({ kicker: lotLabel(lot), title: lot.level + '签', text: lot.gist, onRead: () => read(lot, question) });
  }
  function read(value, asked = '') {
    if (busy || reading || !ritual.alive) return;
    const sections = [{ label: '签语', text: value.gist }, { label: '解曰', text: value.explain }, ...ITEM_KEYS.map((label) => ({ label, text: value.items[label] }))];
    if (asked) sections.unshift({ label: '所问', text: asked });
    reading = sheet({ title: '灵签解读', content: resultCard({ kicker: lotLabel(value), title: value.title, badge: value.level + '签', seal: value.level, verse: formatPoem(value.poem), sections, footer: '原创签诗 · 传统文化演绎与自我觉察' }), actions: [
      button('回到签纸', { variant: 'primary', onClick: () => reading.close() }),
      button('分享', { variant: 'ghost', onClick: async () => { const r = await ctx.share(shareText(value, asked)); kit.toast(r === 'shared' ? '已分享' : r === 'copied' ? '已复制' : '分享已取消'); } }),
    ], onClose: () => { reading = null; } });
    reading.open();
  }
  function reset() {
    if (busy || reading) return;
    phase = 'idle'; lot = null; paper.hidden = true; picked.hidden = true;
    vessel.classList.remove('qn-dim'); picked.classList.remove('qn-dim'); picked.style.transform = '';
    ritual.clear(); ritual.step(0); ritual.power(0, '左右轻摇签筒'); primary.setLabel('摇一签'); lock(false);
    st.setBadge('灵签 · 六十四签'); st.setHint('左右轻摇签筒，让一支签慢慢浮出');
  }
  function renderHistory() {
    kit.clear(hist);
    if (history.length) hist.append(h('span', { class: 't-kicker' }, '最近的签'), history.slice(-5).reverse().map((x) => button(lotLabel(x.no), { variant: 'ghost', size: 'small', onClick: () => read(getLot(x.no), x.question) })));
  }
  return () => { reading?.close(); st.el.getAnimations({ subtree: true }).forEach((a) => a.cancel()); };
}
