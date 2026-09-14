import { DEFAULT_OPTIONS, parseOptions, planDrop } from './core.js';
import { createPlinkoScene } from './scene.js';
import { createRitual } from '../../ui/ritual.js';
import { TEXT, BRIEFS, VERSES, READINGS, ADVICE, FOOTER, SHARE_SIGN } from './data.js';

export function mount(container, ctx) {
  const { kit, storage, haptic, sound, rng } = ctx;
  const { h, button, clear, sheet, resultCard, toast } = kit;
  const saved = storage.get('options', DEFAULT_OPTIONS);
  const parsed = parseOptions(Array.isArray(saved) ? saved.join('\n') : '');
  let options = parsed.error ? [...DEFAULT_OPTIONS] : parsed.labels;
  let round = Number(storage.get('rounds', 0)) || 0;
  let busy = false, alive = true, editor = null, resultSheet = null, lastResult = null;
  const canvas = h('canvas', { class: 'pl-canvas', attrs: { role: 'img', 'aria-label': TEXT.title }, dataset: { phase: 'idle' } });
  const slots = h('div', { class: 'pl-slots' });
  const machine = h('div', { class: 'pl-machine' }, canvas, slots);
  const ritual = createRitual(ctx, { el: machine }, []);
  const count = h('span', { class: 'pl-kicker' });
  const edit = button(TEXT.edit, { variant: 'ghost', size: 'small', onClick: () => openEditor() });
  const primary = button(TEXT.primary, { variant: 'primary', size: 'large', primary: true, onClick: () => drop() });
  // 舞台下只此一行：要么是操作指引（带手势图标），要么是状态说明（不带）。
  const hintEl = kit.hint('tap', idleHint());
  hintEl.classList.add('pl-hint');
  const spacer = h('div', { class: 'pl-spacer', attrs: { 'aria-hidden': 'true' } });
  const scene = createPlinkoScene(canvas, ctx, phase => {
    if (phase === 'falling') setHint(TEXT.falling);
    if (phase === 'landing') setHint(TEXT.landing);
  });
  container.append(h('div', { class: 'pl-toolbar' }, count, edit), machine, hintEl, kit.actionBar(primary), ritual.receipt, spacer);

  // 三条入口做同一件事：点舞台上的小球 / 摇一摇或向上甩 / 主按钮。
  ctx.gesture.tap(canvas, () => drop());
  ctx.motion.onShake(() => drop());
  ctx.motion.onToss(() => drop());

  function idleHint() { return ctx.motion.supported ? TEXT.hintMotion : TEXT.hintTap; }
  function setHint(text) {
    if (hintEl.lastChild.textContent !== text) hintEl.lastChild.textContent = text;
    hintEl.classList.toggle('pl-quiet', busy || !!lastResult);
  }
  function renderSlots() {
    clear(slots); slots.style.setProperty('--slots', options.length);
    options.forEach((label, index) => slots.append(h('button', {
      type: 'button', class: 'pl-slot',
      attrs: { 'aria-label': `编辑第 ${index + 1} 格：${label}` },
      onClick: () => openEditor(index),
    }, h('span', null, label))));
    count.textContent = `${options.length}${TEXT.countSuffix}`;
    canvas.setAttribute('aria-label', `${TEXT.title}，底部选项：${options.join('、')}`);
  }
  function lock(value) {
    busy = value; primary.disabled = value; edit.disabled = value;
    slots.querySelectorAll('button').forEach(el => el.disabled = value);
    machine.setAttribute('aria-busy', String(value));
  }
  // 结果条收起时页面会变短，浏览器会把滚动位置硬拉回；用占位撑住，等新结果出现再放开。
  function holdSpace() {
    const r = ritual.receipt;
    if (r.hidden) return;
    const cs = getComputedStyle(r);
    spacer.style.height = `${r.offsetHeight + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom)}px`;
  }
  function releaseSpace() { spacer.style.height = '0px'; }
  /** 结果条若被首屏截断，轻轻滚到能看见「展开解读」为止。 */
  function revealScroll() {
    const r = ritual.receipt.getBoundingClientRect();
    const vh = window.visualViewport?.height || window.innerHeight;
    const over = r.bottom - (vh - 12);
    if (over > 0) window.scrollBy({ top: Math.min(over, Math.max(0, r.top - 84)), behavior: ctx.platform.prefersReducedMotion ? 'instant' : 'smooth' });
  }
  function clearResult() {
    lastResult = null; holdSpace(); ritual.clear();
    slots.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
  }
  async function drop() {
    if (busy || !alive || editor || resultSheet) return;
    const roundOptions = [...options];
    lock(true); clearResult(); setHint(TEXT.falling); primary.setLabel(TEXT.busy);
    if (!await ritual.focus() || !alive) return;
    try {
      const plan = planDrop(roundOptions.length, rng.random);
      canvas.setAttribute('aria-label', '小球正在碰撞下落'); sound.play('tick'); haptic.release();
      const chosen = await scene.play(plan);
      if (!alive) return;
      if (chosen === null) { lock(false); releaseSpace(); primary.setLabel(TEXT.primary); setHint(idleHint()); return; }
      slots.children[chosen]?.classList.add('selected');
      canvas.setAttribute('aria-label', `小球已落定：${roundOptions[chosen]}`);
      haptic.settle(); sound.play('shimmer');
      round += 1; storage.set('rounds', round);
      lastResult = {
        chosen: roundOptions[chosen], slot: chosen, count: roundOptions.length, round,
        others: roundOptions.filter((_, i) => i !== chosen),
        pinHits: plan.pinHits, seconds: Math.round(plan.playbackDuration),
        brief: rng.pick(BRIEFS), verse: rng.pick(VERSES), reading: rng.pick(READINGS), advice: rng.pick(ADVICE),
      };
      setHint(TEXT.landed);
      // 先让人看清小球停在哪一格，再出现解读入口。
      if (!await ritual.pause(ctx.platform.simpleMotion ? 150 : 600)) return;
      ritual.reveal({ kicker: `${TEXT.receiptKicker} · ${lastResult.count} 选 1`, title: lastResult.chosen, text: lastResult.brief, onRead: showResult });
      releaseSpace(); primary.setLabel(TEXT.again);
      revealScroll();
    } catch (error) {
      console.error('[plinko]', error); scene.reset(options.length);
      setHint(TEXT.failed); primary.setLabel(TEXT.primary); releaseSpace();
    }
    if (alive) lock(false);
  }
  function showResult() {
    if (!lastResult || busy || resultSheet || !alive) return;
    const r = lastResult;
    const sections = [
      { label: '解曰', text: r.reading },
      r.others.length ? { label: '其余选项', text: `${r.others.join('、')}。这次没被选上，不代表不好。` } : null,
      { label: '轨迹', text: `碰了 ${r.pinHits} 下钉子，弹了约 ${r.seconds} 秒，停在左起第 ${r.slot + 1} 格（共 ${r.count} 格）。` },
      { label: '建议', text: r.advice },
    ];
    const card = resultCard({ kicker: `${TEXT.title} · ${r.count} 选 1`, title: r.chosen, badge: `第 ${r.round} 次`, seal: '落', verse: r.verse, sections, footer: FOOTER });
    if ([...r.chosen].length > 4) card.querySelector('.result-title')?.classList.add('long');
    const again = button(TEXT.again, { variant: 'primary', icon: 'refresh', onClick: () => {
      const s = resultSheet; resultSheet = null; s.close();
      ctx.setTimeout(() => { if (alive) drop(); }, 400);
    } });
    const share = button('分享', { variant: 'ghost', icon: 'share', onClick: async () => {
      const lines = [`【${TEXT.title}】${options.join(' / ')}`, `小球落在：「${r.chosen}」`, r.verse, r.reading, SHARE_SIGN];
      const res = await ctx.share(lines.join('\n'));
      toast(res === 'shared' ? '已分享' : res === 'copied' ? '已复制到剪贴板' : '分享已取消');
    } });
    resultSheet = sheet({ title: TEXT.sheetTitle, content: card, actions: [again, share], onClose: () => { resultSheet = null; } });
    resultSheet.el.classList.add('m-plinko'); resultSheet.open();
    haptic.tap();
  }
  function openEditor(selected = null) {
    if (busy || editor || !alive) return;
    const textarea = h('textarea', {
      class: 'textarea pl-editor-input', rows: 6, value: selected === null ? storage.get('draft', options.join('\n')) : options.join('\n'),
      placeholder: TEXT.placeholder,
      attrs: { 'aria-label': '底部选项，每行一个', maxlength: 400, spellcheck: 'false' },
    });
    const error = h('p', { class: 'pl-editor-error', attrs: { role: 'status', id: 'pl-editor-error' } });
    const preview = h('div', { class: 'pl-editor-preview', attrs: { 'aria-label': '选项预览' } });
    textarea.setAttribute('aria-describedby', 'pl-editor-error');
    const save = button(TEXT.save, { variant: 'primary', onClick: () => {
      const parsed = parseOptions(textarea.value);
      if (parsed.error) { error.textContent = parsed.error; return; }
      options = parsed.labels; storage.set('options', options); storage.set('draft', options.join('\n'));
      clearResult(); renderSlots(); scene.reset(options.length);
      setHint(idleHint()); primary.setLabel(TEXT.primary);
      haptic.tap(); sound.play('paper'); editor.close();
      ctx.setTimeout(releaseSpace, 450);
    } });
    const update = () => {
      const parsed = parseOptions(textarea.value);
      error.textContent = parsed.error || `${parsed.labels.length} 格`;
      error.classList.toggle('invalid', !!parsed.error); save.disabled = !!parsed.error;
      textarea.setAttribute('aria-invalid', String(!!parsed.error)); storage.set('draft', textarea.value);
      clear(preview);
      if (!parsed.error) preview.append(...parsed.labels.map((label, i) => h('span', null, `${i + 1} · ${label}`)));
    };
    const restore = button('恢复默认', { variant: 'ghost', onClick: () => { textarea.value = DEFAULT_OPTIONS.join('\n'); update(); textarea.focus(); } });
    textarea.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !save.disabled) { e.preventDefault(); save.click(); } });
    textarea.addEventListener('input', update); update();
    const content = h('div', { class: 'pl-editor' }, h('p', { class: 'pl-editor-hint' }, TEXT.editorHint), textarea, error, preview);
    content.addEventListener('pointerdown', event => event.stopPropagation());
    editor = sheet({ title: TEXT.editor, content, actions: [save, restore], onClose: () => { editor = null; } });
    editor.el.classList.add('m-plinko'); editor.open();
    if (selected !== null) ctx.setTimeout(() => {
      if (!editor?.opened || !alive) return;
      const start = options.slice(0, selected).reduce((sum, label) => sum + label.length + 1, 0);
      textarea.focus(); textarea.setSelectionRange(start, start + options[selected].length);
    }, 100);
  }
  renderSlots(); scene.reset(options.length);
  return () => { alive = false; editor?.close(); resultSheet?.close(); };
}
