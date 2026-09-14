// 3D 模型占位块（Model Slot）。
// 舞台里的"实物"先用这个最普通的占位块顶着：一个字、一行状态、一条进度、一个可移动的点。
// 以后做好 3D 模型（three.js / Lottie / Canvas 皆可）的人，只需在应用启动前调用
//   window.__lgj.registerModel('fengshui.compass', (slotEl, ctx) => ({ set(state){…}, dispose(){…} }))
// 占位块就会把渲染交给模型，模块逻辑一行不用改。state 契约见 docs/MODEL_SLOTS.md。
import { h } from './kit.js';

const registry = new Map();

/** 注册某个槽位的渲染器工厂：factory(slotEl, ctx) → { set(state), dispose() } */
export function registerModel(id, factory) {
  registry.set(id, factory);
}
export function hasModel(id) {
  return registry.has(id);
}

/**
 * createModelSlot(ctx, { id, label, glyph, hint, note })
 * → { el, set(state), dispose(), hasModel }
 * state: { text?, glyph?, angle?(deg), progress?(0–1), x?, y?(-1..1), glow?, active? }
 */
export function createModelSlot(ctx, { id, label = '', glyph = '◇', hint = '', note = '3D 模型位' } = {}) {
  const glyphEl = h('div', { class: 'model-slot-glyph' }, glyph);
  const dot = h('i', { class: 'model-slot-dot', hidden: true });
  const statusEl = h('div', { class: 'model-slot-status' }, hint);
  const barFill = h('i');
  const bar = h('span', { class: 'model-slot-bar' }, barFill);
  const el = h(
    'div',
    { class: 'model-slot', dataset: { modelSlot: id }, attrs: { role: 'img', 'aria-label': label } },
    h('div', { class: 'model-slot-body' }, glyphEl, dot),
    h('div', { class: 'model-slot-label' }, label),
    statusEl,
    bar,
    h('div', { class: 'model-slot-note' }, `${note} · ${id}`),
  );
  let impl = null;
  const factory = registry.get(id);
  if (factory) {
    try {
      impl = factory(el, ctx) || null;
      if (impl) el.classList.add('has-model');
    } catch (e) {
      console.error('[model-slot] 渲染器初始化失败', id, e);
      impl = null;
    }
  }
  const api = {
    el,
    get hasModel() {
      return !!impl;
    },
    set(state = {}) {
      if (impl && typeof impl.set === 'function') {
        try {
          impl.set(state);
        } catch (e) {
          console.error('[model-slot] set 失败', id, e);
        }
      }
      if (state.text != null) statusEl.textContent = state.text;
      if (state.glyph != null) glyphEl.textContent = state.glyph;
      if (state.angle != null) glyphEl.style.transform = `rotate(${state.angle}deg)`;
      if (state.progress != null) barFill.style.transform = `scaleX(${Math.max(0, Math.min(1, state.progress))})`;
      if (state.x != null || state.y != null) {
        dot.hidden = false;
        const x = Math.max(-1, Math.min(1, state.x || 0));
        const y = Math.max(-1, Math.min(1, state.y || 0));
        dot.style.left = `${50 + x * 42}%`;
        dot.style.top = `${50 + y * 42}%`;
      }
      if (state.dot != null) dot.hidden = !state.dot;
      if (state.glow != null) el.classList.toggle('glow', !!state.glow);
      if (state.active != null) el.classList.toggle('active', !!state.active);
    },
    dispose() {
      if (impl && typeof impl.dispose === 'function') {
        try {
          impl.dispose();
        } catch {
          /* ignore */
        }
      }
      impl = null;
    },
  };
  ctx.addCleanup(() => api.dispose());
  return api;
}
