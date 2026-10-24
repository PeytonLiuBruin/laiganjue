import { createStickScene } from '../../ui/stick-scene.js';
import { drawLot, getLot, lotLabel, formatPoemLines, levelMeta, createShakeMeter, shareText, isFated } from './core.js';
import { normalizeAlbum, backfillAlbum, collectLot, albumStats, crossedMilestone, completedLevel, badgeOf, MILESTONES } from './album.js';
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
  // 签纸收集册：抽到过的每支签都收进来。旧版只有最近 8 条历史，第一次打开时补录。
  let album = backfillAlbum(normalizeAlbum(storage.get('album', null)), history);
  storage.set('album', album);
  let albumSheet = null;
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
    const before = album, prevCount = albumStats(before).count;
    const got = collectLot(album, lot.no, ctx.rng.dateKey()); album = got.album; storage.set('album', album); renderHistory();
    const s = albumStats(album);
    const mile = got.fresh ? crossedMilestone(prevCount, s.count) : null;
    const levelDone = got.fresh ? completedLevel(before, album) : null;
    if (mile) {
      // 里程碑：金星彩屑 + 徽章提示，下次打开收集册时新徽章跳一下。
      storage.set('badgeNew', mile.id);
      kit.confetti(st.el, { count: mile.stars, colors: ['#ffc93c', '#ff9f3c', '#fff4d6', '#e8463c', '#4fb8ff'], origin: { x: 0.5, y: 0.42 }, spread: 240 });
      haptic.success();
      kit.toast(s.complete ? `收集册集齐了 · 解锁「${mile.name}」徽章` : `解锁签册徽章「${mile.name}」 · 分享卡会带上它`, { duration: 2600 });
    } else if (fated) kit.toast(FATED_TOAST);
    else if (levelDone) kit.toast(`${levelDone}签全部集齐 · ${s.count}/${s.total}`, { duration: 2400 });
    else if (got.fresh) kit.toast(`新签入册 · ${s.count}/${s.total}`);
    if (!await ritual.pause(gentle || instant ? 80 : 900)) return;
    phase = 'paper'; primary.setLabel(AGAIN_LABEL); lock(false); setGuide('tap', REVEALED_HINT);
    const result = lot, resultQuestion = asked;
    ritual.reveal({ kicker: `${lotLabel(lot)} · ${lot.title}`, title: lot.level + '签', text: lot.gist, onRead: () => read(result, resultQuestion), gate: true });
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
    const s = albumStats(album);
    const albumBtn = h('button', { type: 'button', class: 'qn-album-btn', dataset: { album: s.count }, onClick: () => openAlbum() },
      h('b', null, '签纸收集册'), h('span', { class: 'qn-album-bar' }, h('i', { style: { width: `${(s.count / s.total) * 100}%` } })), h('span', { class: 'qn-album-count' }, `${s.count}/${s.total}`));
    if (history.length) {
      hist.append(
        h('span', { class: 't-kicker' }, HISTORY_KICKER),
        h('div', { class: 'qn-history-row' }, history.slice(-5).reverse().map((x) => {
          const l = getLot(x.no);
          return button(`${lotLabel(x.no)} · ${l.level}`, { variant: 'soft', size: 'small', onClick: () => read(l, x.question, { review: true }) });
        })),
      );
    }
    hist.append(albumBtn);
  }
  // 收集册抽屉：8 列签格，抽到过的按等级上色、可点开回看，没抽到的只露签号。
  function openAlbum() {
    if (busy || reading || albumSheet) return;
    haptic.tap();
    const s = albumStats(album);
    const levels = h('div', { class: 'qn-album-levels' }, s.byLevel.map((x) => h('span', { class: `qn-album-level tone-${x.tone}${x.total && x.have === x.total ? ' done' : ''}` }, h('b', null, x.id), ` ${x.have}/${x.total}`)));
    // 徽章行：5 枚，点亮的是金色描边圆章，没到的是灰色虚线圆和所需数量。刚解锁的那枚跳一下。
    const fresh = storage.get('badgeNew', '');
    if (fresh) storage.set('badgeNew', '');
    const next = MILESTONES.find((m) => s.count < m.at);
    const badges = h('div', { class: 'qn-badges', attrs: { role: 'list', 'aria-label': '签册徽章' } }, MILESTONES.map((m) => {
      const on = s.count >= m.at;
      return h('span', { class: `qn-badge${on ? ' on' : ''}${on && m.id === fresh ? ' pop' : ''}`, dataset: { badge: m.id }, attrs: { role: 'listitem', 'aria-label': on ? `徽章「${m.name}」已点亮` : `集到 ${m.at} 支点亮「${m.name}」` } },
        h('i', null, on ? m.name[0] : String(m.at)), h('small', null, m.name));
    }));
    const badgeNote = h('p', { class: 'qn-badge-note' }, next
      ? `再集 ${next.at - s.count} 支点亮「${next.name}」${badgeOf(s.count) ? '，最高徽章会印在分享卡上' : ''}`
      : '五枚徽章全部点亮，分享卡上印着「圆满」。');
    const grid = h('div', { class: 'qn-album-grid', attrs: { role: 'list' } });
    for (let no = 1; no <= s.total; no++) {
      const l = getLot(no), have = album[no];
      grid.append(have
        ? h('button', { type: 'button', class: `qn-cell tone-${levelMeta(l.level)?.tone || 'neutral'}`, dataset: { no }, attrs: { role: 'listitem', 'aria-label': `${lotLabel(no)} · ${l.level}签 · 抽到 ${have.times} 次` },
            onClick: () => { const sh = albumSheet; albumSheet = null; sh?.close(); setTimeout(() => read(l, '', { review: true }), 220); } },
            h('span', { class: 'qn-cell-no' }, String(no)), h('small', null, l.level), have.times > 1 ? h('em', null, `×${have.times}`) : null)
        : h('span', { class: 'qn-cell empty', dataset: { no }, attrs: { role: 'listitem', 'aria-label': `${lotLabel(no)} · 还没抽到` } }, h('span', { class: 'qn-cell-no' }, String(no)), h('small', null, '?')));
    }
    const head = h('div', { class: 'qn-album-head' },
      h('div', null, h('b', null, `${s.count}`), h('span', null, ` / ${s.total} 支`)),
      h('span', { class: 'qn-album-bar big' }, h('i', { style: { width: `${(s.count / s.total) * 100}%` } })),
      h('p', null, s.complete ? '六十四支签全部集齐，诸事圆满。' : s.count ? '每天摇一支，看看哪天能集齐。点亮的签可以回看签诗。' : '还没有收到签。摇一支签，它就会收进册子里。'));
    albumSheet = sheet({ title: '签纸收集册', content: [head, badges, badgeNote, levels, grid], onClose: () => { albumSheet = null; } });
    albumSheet.open();
  }
  // 从首页「收集册」入口进来：#/m/qian/album 直接打开册子。
  if (/^#\/m\/qian\/album/.test(location.hash)) { window.history.replaceState(null, '', '#/m/qian'); openAlbum(); }
  return () => { albumSheet?.close(); reading?.close(); st.el.getAnimations({ subtree: true }).forEach((a) => a.cancel()); };
}
