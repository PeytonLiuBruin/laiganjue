import { DEFAULT_OPTIONS, parseOptions, planDrop } from './core.js';
import { createPlinkoScene } from './scene.js';
import { createRitual } from '../../ui/ritual.js';
import { TEXT } from './data.js';

export function mount(container, ctx) {
  const { kit, storage, haptic, sound, rng } = ctx;
  const { h, button, clear, sheet } = kit;
  const saved = storage.get('options', DEFAULT_OPTIONS);
  const parsed = parseOptions(Array.isArray(saved) ? saved.join('\n') : '');
  let options = parsed.error ? [...DEFAULT_OPTIONS] : parsed.labels;
  let busy = false, alive = true, editor = null;
  const canvas = h('canvas', { class: 'pl-canvas', attrs: { role: 'img', 'aria-label': '落球盘' }, dataset: { phase: 'idle' } });
  const slots = h('div', { class: 'pl-slots' });
  const machine = h('div', { class: 'pl-machine' }, canvas, slots);
  const ritual = createRitual(ctx, { el: machine }, []);
  const message = h('span', { class: 'pl-message' }, TEXT.idle);
  const answer = h('strong', { class: 'pl-answer', hidden: true });
  const result = h('div', { class: 'pl-result', attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' } }, message, answer);
  const edit = button('编辑选项', { variant: 'ghost', size: 'small', onClick: () => openEditor() });
  const primary = button(TEXT.primary, { variant: 'primary', size: 'large', primary: true, onClick: drop });
  const scene = createPlinkoScene(canvas, ctx, phase => {
    if (phase === 'falling') message.textContent = TEXT.falling;
    if (phase === 'landing') message.textContent = TEXT.landing;
  });
  container.append(h('div', { class: 'pl-toolbar' }, h('span', { class: 'pl-wordmark' }, 'PLINKO'), edit), machine, result, kit.actionBar(primary));
  function renderSlots() {
    clear(slots); slots.style.setProperty('--slots', options.length);
    options.forEach((label, index) => slots.append(h('button', {
      type: 'button', class: 'pl-slot',
      attrs: { 'aria-label': `编辑第 ${index + 1} 槽：${label}` },
      onClick: () => openEditor(index),
    }, h('span', null, label))));
    canvas.setAttribute('aria-label', `落球盘，底部选项：${options.join('、')}`);
  }
  function lock(value) {
    busy = value; primary.disabled = value; edit.disabled = value;
    slots.querySelectorAll('button').forEach(el => el.disabled = value);
    machine.setAttribute('aria-busy', String(value));
  }
  async function drop() {
    if (busy || !alive || editor) return;
    const roundOptions = [...options];
    lock(true); answer.hidden = true; message.textContent = TEXT.falling;
    slots.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    result.classList.remove('revealed'); primary.setLabel('小球下落中');
    if (!await ritual.focus() || !alive) return;
    try {
      const plan = planDrop(roundOptions.length, rng.random);
      canvas.setAttribute('aria-label', '小球正在碰撞下落'); sound.play('tick'); haptic.release();
      const chosen = await scene.play(plan);
      if (!alive || chosen === null) return;
      slots.children[chosen].classList.add('selected');
      answer.textContent = roundOptions[chosen]; answer.hidden = false;
      message.textContent = '这次落在'; result.classList.add('revealed');
      canvas.setAttribute('aria-label', `小球已落定：${roundOptions[chosen]}`);
      haptic.settle(); sound.play('shimmer'); primary.setLabel(TEXT.again);
    } catch (error) {
      console.error('[plinko]', error); scene.reset(options.length);
      message.textContent = '这一轮准备失败，点一下重试'; primary.setLabel(TEXT.primary);
    }
    if (alive) lock(false);
  }
  function openEditor(selected = null) {
    if (busy || editor || !alive) return;
    const textarea = h('textarea', {
      class: 'textarea pl-editor-input', rows: 6, value: selected === null ? storage.get('draft', options.join('\n')) : options.join('\n'),
      placeholder: TEXT.placeholder,
      attrs: { 'aria-label': '底部选项，每行一个', maxlength: 400, spellcheck: 'false' },
    });
    const error = h('p', { class: 'pl-editor-error', attrs: { role: 'status', id: 'pl-editor-error' } });
    textarea.setAttribute('aria-describedby', 'pl-editor-error');
    const save = button('使用这些选项', { variant: 'primary', onClick: () => {
      const parsed = parseOptions(textarea.value);
      if (parsed.error) { error.textContent = parsed.error; return; }
      options = parsed.labels; storage.set('options', options); storage.set('draft', options.join('\n'));
      renderSlots(); scene.reset(options.length); answer.hidden = true; message.textContent = TEXT.idle;
      result.classList.remove('revealed'); primary.setLabel(TEXT.primary);
      haptic.tap(); editor.close();
    } });
    const update = () => {
      const parsed = parseOptions(textarea.value);
      error.textContent = parsed.error || `${parsed.labels.length} 个槽位`;
      error.classList.toggle('invalid', !!parsed.error); save.disabled = !!parsed.error;
      textarea.setAttribute('aria-invalid', String(!!parsed.error)); storage.set('draft', textarea.value);
    };
    textarea.addEventListener('input', update); update();
    const content = h('div', { class: 'pl-editor' }, h('p', { class: 'pl-editor-hint' }, TEXT.editorHint), textarea, error);
    content.addEventListener('pointerdown', event => event.stopPropagation());
    editor = sheet({ title: TEXT.editor, content, actions: [save], onClose: () => { editor = null; } });
    editor.el.classList.add('m-plinko'); editor.open();
    if (selected !== null) ctx.setTimeout(() => {
      if (!editor?.opened || !alive) return;
      const start = options.slice(0, selected).reduce((sum, label) => sum + label.length + 1, 0);
      textarea.focus(); textarea.setSelectionRange(start, start + options[selected].length);
    }, 100);
  }
  renderSlots(); scene.reset(options.length);
  return () => { alive = false; editor?.close(); };
}
