// UI 组件库（Web DOM 实现）。所有模块的界面都用这里的积木搭，保证风格统一。
// 迁移小程序时：这里的每个函数对应一个 WXML 组件 / 模板（见 docs/PORTING_WEAPP.md）。

/* ------------------------------ DOM 基础 ------------------------------ */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * h('div', {class:'x', style:{color:'red'}, onClick(){}, dataset:{a:1}, attrs:{role:'button'}, html:'<b/>', text:'..'}, ...children)
 * children: string | Node | null | false | Array
 */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props);
  append(el, children);
  return el;
}

function applyProps(el, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v);
    else if (k === 'style') {
      if (typeof v === 'string') el.style.cssText = v;
      else Object.assign(el.style, v);
    } else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'attrs') {
      for (const [a, b] of Object.entries(v)) {
        if (b != null && b !== false) el.setAttribute(a, b === true ? '' : b);
      }
    } else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof v !== 'object') {
      try {
        el[k] = v;
      } catch {
        el.setAttribute(k, v);
      }
    } else el.setAttribute(k, v === true ? '' : v);
  }
}

export function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

/** 从 HTML 字符串建元素（用于 SVG 等） */
export function fromHTML(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** 内联 SVG（viewBox 0 0 24 24，stroke 风格） */
export function svg(inner, { viewBox = '0 0 24 24', size = 24, fill = 'none', stroke = 'currentColor', strokeWidth = 1.6, cls = '' } = {}) {
  const el = fromHTML(
    `<svg xmlns="${SVG_NS}" viewBox="${viewBox}" width="${size}" height="${size}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" class="${cls}" aria-hidden="true">${inner}</svg>`,
  );
  return el;
}

/* ------------------------------ 图标 ------------------------------ */
const ICONS = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-1.8 0-.6-.3-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1 .8-1.5 1.8-1.5H16a5 5 0 0 0 5-5c0-4-4-7-9-7z"/><circle cx="7.5" cy="11.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="7.5" r="1.1" fill="currentColor" stroke="none"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  share: '<path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7"/><path d="M16 6l-4-4-4 4"/><path d="M12 2v13"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  sound: '<path d="M4 10v4h3l4 3V7L7 10z"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11"/>',
  vibrate: '<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M4 8v8M20 8v8M1.5 10v4M22.5 10v4"/>',
  motion: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="5"/><path d="M19 5l-1.5 1.5M5 19l1.5-1.5M5 5l1.5 1.5M19 19l-1.5-1.5"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>',
  home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
  moon: '<path d="M20 14.6A8.6 8.6 0 0 1 9.4 4a8.6 8.6 0 1 0 10.6 10.6z"/><path d="M17 3l.6 1.6L19.2 5.2l-1.6.6L17 7.4l-.6-1.6-1.6-.6 1.6-.6z"/>',
  // 手势
  'g-shake': '<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M4 8v8M20 8v8" stroke-dasharray="1 2"/>',
  'g-toss': '<rect x="8" y="9" width="8" height="12" rx="2"/><path d="M12 6V1M9.5 3.5L12 1l2.5 2.5"/>',
  'g-flick': '<path d="M12 21V8"/><path d="M8 12l4-4 4 4"/><path d="M6 21h12"/>',
  'g-flip': '<rect x="5" y="4" width="14" height="16" rx="2"/><path d="M12 4v16" stroke-dasharray="2 2"/><path d="M2 12h2M20 12h2"/>',
  'g-spin': '<circle cx="12" cy="12" r="8"/><path d="M12 4v8l5 3"/><path d="M20 12a8 8 0 0 1-2.3 5.7"/>',
  'g-tilt': '<rect x="6" y="3" width="12" height="18" rx="2" transform="rotate(-14 12 12)"/><path d="M4 20c2-1 4-1 6 0"/>',
  'g-rub': '<circle cx="12" cy="13" r="7"/><path d="M8 5c1-2 7-2 8 0"/><path d="M9 12c1-2 4-2 5 0" stroke-dasharray="1 2"/>',
  'g-tap': '<path d="M9 11V6a1.5 1.5 0 0 1 3 0v6"/><path d="M12 10a1.5 1.5 0 0 1 3 0v2a1.5 1.5 0 0 1 3 0v1.5a1.5 1.5 0 0 1 3 0V17a5 5 0 0 1-5 5h-3.5a5 5 0 0 1-4.2-2.3L5 15a1.5 1.5 0 0 1 2.5-1.6L9 15"/>',
};

export function icon(name, opts = {}) {
  return svg(ICONS[name] || ICONS.sparkle, { size: 24, ...opts });
}

/* ------------------------------ 按钮 / 芯片 / 标签 ------------------------------ */
/**
 * button('掷筊', {variant:'primary'|'ghost'|'soft'|'danger', size:'small'|'large', block, icon:'refresh', onClick, primary:true(data-action=primary), disabled})
 */
export function button(label, { variant = '', size = '', block = false, icon: ic = null, onClick, primary = false, disabled = false, cls = '' } = {}) {
  const el = h(
    'button',
    {
      class: ['btn', variant, size, block && 'block', cls],
      type: 'button',
      onClick,
      dataset: primary ? { action: 'primary' } : undefined,
    },
    ic ? icon(ic) : null,
    h('span', null, label),
  );
  if (disabled) el.disabled = true;
  el.setLabel = (t) => {
    el.lastChild.textContent = t;
  };
  return el;
}

export function actionBar(...buttons) {
  return h('div', { class: 'action-bar' }, buttons);
}

/** 单选芯片。items: [{value, label}] 或 字符串数组 */
export function chips(items, { value, onChange, scroll = false } = {}) {
  const norm = items.map((it) => (typeof it === 'string' ? { value: it, label: it } : it));
  let current = value ?? norm[0]?.value;
  const el = h('div', { class: ['chips', scroll && 'scroll'] });
  const render = () => {
    clear(el);
    for (const it of norm) {
      el.append(
        h(
          'button',
          {
            type: 'button',
            class: ['chip', it.value === current && 'active'],
            onClick: () => {
              if (it.value === current) return;
              current = it.value;
              render();
              onChange && onChange(current, it);
            },
          },
          it.label,
        ),
      );
    }
  };
  render();
  return {
    el,
    get value() {
      return current;
    },
    set(v) {
      current = v;
      render();
    },
  };
}

/** 分段标签页 */
export function tabs(items, { value, onChange } = {}) {
  const norm = items.map((it) => (typeof it === 'string' ? { value: it, label: it } : it));
  let current = value ?? norm[0]?.value;
  const el = h('div', { class: 'tabs', attrs: { role: 'tablist' } });
  const render = () => {
    clear(el);
    for (const it of norm) {
      el.append(
        h(
          'button',
          {
            type: 'button',
            class: ['tab', it.value === current && 'active'],
            attrs: { role: 'tab', 'aria-selected': it.value === current ? 'true' : 'false' },
            onClick: () => {
              if (it.value === current) return;
              current = it.value;
              render();
              onChange && onChange(current, it);
            },
          },
          it.label,
        ),
      );
    }
  };
  render();
  return {
    el,
    get value() {
      return current;
    },
    set(v) {
      current = v;
      render();
    },
  };
}

/* ------------------------------ 表单 ------------------------------ */
export function field(label, control) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control);
}

export function input({ placeholder = '', value = '', type = 'text', onInput, onEnter, maxlength, cls = '' } = {}) {
  const el = h('input', {
    class: ['input', cls],
    type,
    placeholder,
    value,
    attrs: { maxlength: maxlength || null, autocomplete: 'off', autocorrect: 'off' },
    onInput: (e) => onInput && onInput(e.target.value, e),
    onKeydown: (e) => {
      if (e.key === 'Enter' && onEnter) {
        e.preventDefault();
        onEnter(e.target.value);
        e.target.blur();
      }
    },
  });
  return el;
}

/** select(options:[{value,label}]|string[], {value, onChange}) */
export function select(options, { value, onChange } = {}) {
  const el = h('select', { class: 'select', onChange: (e) => onChange && onChange(e.target.value, e) });
  for (const o of options) {
    const it = typeof o === 'string' ? { value: o, label: o } : o;
    const op = h('option', { value: it.value }, it.label);
    if (String(it.value) === String(value)) op.selected = true;
    el.append(op);
  }
  return el;
}

export function toggle(on, onChange) {
  const el = h('button', { type: 'button', class: ['switch', on && 'on'], attrs: { role: 'switch', 'aria-checked': on ? 'true' : 'false' } });
  el.addEventListener('click', () => {
    const next = !el.classList.contains('on');
    el.classList.toggle('on', next);
    el.setAttribute('aria-checked', next ? 'true' : 'false');
    onChange && onChange(next);
  });
  return el;
}

/* ------------------------------ 舞台 ------------------------------ */
/**
 * stage({cls, hint:'向上甩动手机', badge:'第一掷', minHeight})
 * → {el, scene, setHint(text|null), setBadge(text)}
 */
export function stage({ cls = '', hint = '', badge = '', minHeight = null } = {}) {
  const scene = h('div', { class: 'stage-scene' });
  const hintEl = h('div', { class: ['stage-hint', !hint && 'hidden'] }, hint);
  const badgeEl = h('div', { class: 'stage-badge' }, badge);
  const el = h('div', { class: ['stage', cls], style: minHeight ? { minHeight: typeof minHeight === 'number' ? minHeight + 'px' : minHeight } : null }, h('div', { class: 'stage-floor' }), scene, badgeEl, hintEl);
  return {
    el,
    scene,
    setHint(text) {
      hintEl.textContent = text || '';
      hintEl.classList.toggle('hidden', !text);
    },
    setBadge(text) {
      badgeEl.textContent = text || '';
    },
  };
}

/** 体感提示：hint('toss', '向上甩动手机，或在屏幕上向上快滑') */
export function hint(gesture, text) {
  return h('div', { class: 'hint' }, h('span', { class: ['hint-glyph', gesture] }, icon('g-' + gesture)), h('span', null, text));
}

/* ------------------------------ 结果卡 ------------------------------ */
/**
 * resultCard({
 *   kicker:'一平一凸', title:'圣杯', titleGold:true, badge:'吉', sub:'神明允诺', seal:'允',
 *   verse:'诗句\n诗句', sections:[{label:'解曰', text:'...'}, {label:'宜', node: el, stack:true}], footer:'仅供娱乐'
 * })
 */
export function resultCard({ kicker, title, titleGold = true, badge, sub, seal: sealText, verse, sections = [], footer, cls = '' } = {}) {
  const el = h(
    'div',
    { class: ['result', cls] },
    sealText ? seal(sealText, { stamp: true }) : null,
    kicker ? h('div', { class: 'result-kicker' }, kicker) : null,
    badge ? h('div', { class: 'result-badge-wrap' }, h('span', { class: 'result-badge' }, badge)) : null,
    title ? h('div', { class: ['result-title', titleGold && 'gold'] }, title) : null,
    sub ? h('div', { class: 'result-sub' }, sub) : null,
    verse ? h('div', { class: 'result-verse' }, ...String(verse).split('\n').flatMap((line, i) => (i ? [h('br'), line] : [line]))) : null,
    sections.length
      ? h(
          'div',
          { class: 'result-sections' },
          sections.filter(Boolean).map((s) =>
            h(
              'div',
              { class: ['result-section', s.stack && 'stack'] },
              h('div', { class: 'result-section-label' }, s.label),
              h('div', { class: 'result-section-text' }, s.node || s.text),
            ),
          ),
        )
      : null,
    footer ? h('div', { class: 'result-footer' }, footer) : null,
  );
  return el;
}

export function seal(text, { stamp = false } = {}) {
  return h('span', { class: ['seal', stamp && 'stamp'] }, text);
}

export function ornament() {
  return h('div', { class: 'ornament' }, icon('sparkle', { size: 18 }));
}

export function sectionHead(title, kicker) {
  return h('div', { class: 'section-head' }, h('h2', { class: 't-display' }, title), kicker ? h('span', { class: 't-kicker' }, kicker) : null);
}

/** 星级 ★★★☆☆ */
export function stars(n, max = 5) {
  const el = h('span', { class: 'stars', attrs: { 'aria-label': `${n}/${max}` } });
  for (let i = 0; i < max; i++) el.append(h('span', { class: i < n ? 'on' : 'off' }, '★'));
  return el;
}

/* ------------------------------ Toast / 抽屉 ------------------------------ */
let toastEl = null;
let toastTimer = null;
export function toast(msg, { duration = 1800 } = {}) {
  if (!toastEl) {
    toastEl = h('div', { class: 'toast', attrs: { role: 'status' } });
    document.body.append(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), duration);
}

/**
 * sheet({title, content: Node|Node[], actions:[button...], onClose, dismissible:true})
 * → {el, open(), close(), setContent(node), body}
 */
export function sheet({ title = '', content = null, actions = null, onClose, dismissible = true } = {}) {
  const body = h('div', { class: 'sheet-body' });
  if (content) append(body, [content]);
  const closeBtn = h('button', { type: 'button', class: 'icon-btn', attrs: { 'aria-label': '关闭' }, onClick: () => api.close() }, icon('close'));
  const el = h(
    'div',
    { class: 'sheet', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': title } },
    h('div', { class: 'sheet-grip' }),
    h('div', { class: 'sheet-head' }, h('div', { class: 'sheet-title' }, title), closeBtn),
    body,
    actions && actions.length ? h('div', { class: 'sheet-actions' }, actions) : null,
  );
  const backdrop = h('div', { class: 'sheet-backdrop', onClick: () => dismissible && api.close() });
  let opened = false;
  let previousFocus = null;
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dismissible) { e.preventDefault(); api.close(); }
    if (e.key !== 'Tab') return;
    const controls = [...el.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]')].filter((node) => !node.hidden);
    const first = controls[0], last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  });
  // 下拉关闭
  let startY = null;
  el.addEventListener(
    'pointerdown',
    (e) => {
      if (e.target.closest('.sheet-body') && body.scrollTop > 0) return;
      startY = e.clientY;
    },
    { passive: true },
  );
  el.addEventListener(
    'pointermove',
    (e) => {
      if (startY == null) return;
      const dy = e.clientY - startY;
      if (dy > 0) el.style.transform = `translate(-50%, ${dy}px)`;
    },
    { passive: true },
  );
  const endDrag = (e) => {
    if (startY == null) return;
    const dy = e.clientY - startY;
    startY = null;
    el.style.transform = '';
    if (dy > 90 && dismissible) api.close();
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  const api = {
    el,
    body,
    get opened() {
      return opened;
    },
    open() {
      if (opened) return api;
      opened = true;
      previousFocus = document.activeElement;
      document.body.append(backdrop, el);
      requestAnimationFrame(() => {
        if (!opened) return;
        backdrop.classList.add('open');
        el.classList.add('open');
        closeBtn.focus({ preventScroll: true });
      });
      return api;
    },
    close() {
      if (!opened) return api;
      opened = false;
      backdrop.classList.remove('open');
      el.classList.remove('open');
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      setTimeout(() => {
        backdrop.remove();
        el.remove();
        onClose && onClose();
      }, 420);
      return api;
    },
    setTitle(t) {
      el.querySelector('.sheet-title').textContent = t;
    },
    setContent(node) {
      clear(body);
      append(body, [node]);
      body.scrollTop = 0;
    },
  };
  return api;
}

/* ------------------------------ 动效 / 工具 ------------------------------ */
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

/** Web Animations 封装，返回 Promise（动画结束）。reduce-motion 时立即完成。 */
export function animate(el, keyframes, options = {}) {
  const opts = typeof options === 'number' ? { duration: options } : options;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const a = el.animate(keyframes, { fill: 'forwards', easing: 'cubic-bezier(.2,.8,.2,1)', ...opts, duration: reduce ? 1 : opts.duration ?? 300 });
  return a.finished.catch(() => {}).then(() => a);
}

/** 逐字显示（神谕感） */
export function typewriter(el, text, { speed = 45, onDone } = {}) {
  el.textContent = '';
  let i = 0;
  let stopped = false;
  const step = () => {
    if (stopped) return;
    if (i >= text.length) {
      onDone && onDone();
      return;
    }
    el.textContent += text[i++];
    setTimeout(step, speed + (/[，。！？、；：]/.test(text[i - 1]) ? speed * 3 : 0));
  };
  step();
  return () => {
    stopped = true;
    el.textContent = text;
  };
}

/** 数字滚动 */
export function countUp(el, to, { duration = 800, decimals = 0 } = {}) {
  const t0 = performance.now();
  const from = Number(el.textContent) || 0;
  const tick = (t) => {
    const p = Math.min(1, (t - t0) / duration);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = (from + (to - from) * e).toFixed(decimals);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** 五彩纸屑爆发（容器需 position:relative 或 absolute 子元素可见） */
export function confetti(container, { count = 36, colors = null, origin = { x: 0.5, y: 0.5 }, spread = 220 } = {}) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const cs = colors || ['var(--accent)', 'var(--accent-2)', 'var(--seal)', '#fff', 'var(--success)'];
  const rect = container.getBoundingClientRect();
  const ox = rect.width * origin.x;
  const oy = rect.height * origin.y;
  for (let i = 0; i < count; i++) {
    const p = h('span', { class: 'confetti-piece', style: { left: ox + 'px', top: oy + 'px', background: cs[i % cs.length] } });
    container.append(p);
    const ang = Math.random() * Math.PI * 2;
    const dist = spread * (0.4 + Math.random() * 0.6);
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist - 60;
    const rot = (Math.random() - 0.5) * 900;
    p.animate(
      [
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${dx * 0.7}px, ${dy * 0.7}px) rotate(${rot * 0.6}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${dx}px, ${dy + 160}px) rotate(${rot}deg)`, opacity: 0 },
      ],
      { duration: 1100 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' },
    ).onfinish = () => p.remove();
  }
}

/** 轻微视差：根据倾斜数据移动元素。返回 apply(tilt) */
export function parallax(el, { max = 10 } = {}) {
  return ({ beta, gamma }) => {
    if (beta == null || gamma == null) return;
    const x = Math.max(-1, Math.min(1, gamma / 30)) * max;
    const y = Math.max(-1, Math.min(1, (beta - 45) / 30)) * max;
    el.style.transform = `translate(${x}px, ${y}px)`;
  };
}

/** 简易历史小记条 */
export function historyBar(items, format = (x) => String(x)) {
  const el = h('div', { class: 'history' });
  for (const it of items) el.append(h('span', { class: 'history-item' }, format(it)));
  return el;
}

/** 空态 / 建设中 */
export function placeholder(glyph, title, desc) {
  return h('div', { class: 'placeholder' }, h('div', { class: 'medal' }, glyph), h('div', { class: 't-display', style: { fontSize: '22px', color: 'var(--text)' } }, title), h('div', null, desc));
}

export const kit = {
  h,
  append,
  clear,
  fromHTML,
  svg,
  icon,
  button,
  actionBar,
  chips,
  tabs,
  field,
  input,
  select,
  toggle,
  stage,
  hint,
  resultCard,
  seal,
  ornament,
  sectionHead,
  stars,
  toast,
  sheet,
  wait,
  nextFrame,
  animate,
  typewriter,
  countUp,
  confetti,
  parallax,
  historyBar,
  placeholder,
};
export default kit;
