// 应用壳：路由 / 头部 / 首页 / 皮肤 / 设置 / 体感权限 / 模块生命周期。
import { createPlatform } from '../platform/web.js';
import { kit, h, clear, icon, button, sheet, toast, toggle, hint as gestureHint, wait } from './kit.js';
import * as rng from '../core/rng.js';
import { almanacSummary } from '../core/lunar.js';
import { MODULE_LIST, REGIONS, GESTURE_LABEL, getModuleMeta } from '../modules/list.js';
import { MODULES } from '../modules/registry.js';
import { createZen } from './zen.js';

export const APP_NAME = '来感觉';
export const APP_TAGLINE = 'ORACLE · 日常灵感';
export const THEMES = [
  { id: 'ink', name: '玄墨', swatch: 'radial-gradient(circle at 30% 30%, #d4af5a, #0b0b10 65%)' },
  { id: 'cinnabar', name: '朱砂', swatch: 'radial-gradient(circle at 30% 30%, #e2b04a, #3a1414 40%, #1a0a0a 75%)' },
  { id: 'nebula', name: '星穹', swatch: 'radial-gradient(circle at 30% 30%, #e6dcff, #4b3fa0 40%, #090a18 75%)' },
  { id: 'paper', name: '宣纸', swatch: 'radial-gradient(circle at 30% 30%, #fffaf0, #f1e7d3 50%, #8a5a1c 100%)' },
  { id: 'celadon', name: '青瓷', swatch: 'radial-gradient(circle at 30% 30%, #f2f8f3, #cfe3d6 50%, #2f7d68 100%)' },
];

const MOTION_GESTURES = new Set(['shake', 'toss', 'tilt']);

export function startApp(root) {
  const platform = createPlatform();
  const { storage } = platform;

  /* ---------------- 皮肤 ---------------- */
  const themeListeners = new Set();
  let theme = storage.get('theme', 'paper');
  if (!THEMES.some((t) => t.id === theme)) theme = 'paper';
  const applyTheme = (id) => {
    theme = id;
    document.documentElement.dataset.theme = id;
    storage.set('theme', id);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0b0b10';
    for (const cb of themeListeners) cb(id);
  };
  applyTheme(theme);

  /* ---------------- 屏保 · 静观 ---------------- */
  const zen = createZen({
    platform,
    getAccent: () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d4af5a',
    onExit: () => {
      if (location.hash.startsWith('#/zen')) history.replaceState(null, '', '#/');
    },
  });
  let lastActive = performance.now();
  const bump = () => {
    lastActive = performance.now();
  };
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart']) window.addEventListener(ev, bump, { passive: true });
  setInterval(() => {
    const auto = storage.get('zen.auto', true);
    const mins = Number(storage.get('zen.minutes', 3)) || 3;
    if (auto && !zen.active && document.visibilityState === 'visible' && performance.now() - lastActive > mins * 60000) zen.enter({ fullscreen: false });
  }, 10000);

  /* ---------------- 骨架 ---------------- */
  clear(root);
  const backBtn = h('button', { type: 'button', class: 'icon-btn', attrs: { 'aria-label': '返回' }, onClick: () => navigate('#/') }, icon('back'));
  const zenBtn = h(
    'button',
    {
      type: 'button',
      class: 'icon-btn',
      attrs: { 'aria-label': '屏保 · 静观' },
      onClick: () => {
        platform.haptic.tap();
        zen.enter({ fullscreen: true });
      },
    },
    icon('moon'),
  );
  const titleEl = h('div', { class: 'hd-title' });
  const themeBtn = h('button', { type: 'button', class: 'icon-btn', attrs: { 'aria-label': '换皮肤' }, onClick: openThemeSheet }, icon('palette'));
  const settingsBtn = h('button', { type: 'button', class: 'icon-btn', attrs: { 'aria-label': '设置' }, onClick: openSettings }, icon('settings'));
  const header = h('header', { class: 'app-header' }, backBtn, zenBtn, titleEl, themeBtn, settingsBtn);
  const views = h('main', { class: 'views' });
  root.append(header, views);

  /* ---------------- 路由 ---------------- */
  let current = null; // { id, el, unmount }
  function navigate(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  }
  window.addEventListener('hashchange', render);

  async function render() {
    const hash = location.hash || '#/';
    if (hash.startsWith('#/zen')) {
      if (!current) {
        const el = renderHome();
        views.append(el);
        current = { id: 'home', el, unmount: null };
        setHeader(null);
      }
      zen.enter({ fullscreen: false });
      return;
    }
    const m = hash.match(/^#\/m\/([a-z0-9_-]+)/i);
    const target = m ? m[1] : 'home';
    if (current && current.id === target) return;
    if (current) {
      try {
        current.unmount && current.unmount();
      } catch (e) {
        console.error('[unmount]', e);
      }
      current.el.remove();
      current = null;
    }
    if (target === 'home') {
      const el = renderHome();
      views.append(el);
      current = { id: 'home', el, unmount: null };
      setHeader(null);
      window.scrollTo(0, 0);
      return;
    }
    const meta = getModuleMeta(target);
    const impl = MODULES[target];
    if (!meta || !impl) {
      toast('没有这个功能');
      navigate('#/');
      return;
    }
    const el = h('section', { class: ['view', 'view-module', 'm-' + target], dataset: { module: target } });
    views.append(el);
    setHeader(meta);
    window.scrollTo(0, 0);
    const ctx = createContext(meta, el);
    if (meta.gestures.some((g) => MOTION_GESTURES.has(g))) el.append(motionBanner(ctx));
    try {
      const un = await impl.mount(el, ctx);
      ctx.addCleanup(typeof un === 'function' ? un : null);
      el.dataset.ready = '1';
    } catch (e) {
      console.error(`[module:${target}] mount failed`, e);
      el.append(kit.placeholder(meta.glyph, '开坛失败', '这个功能暂时打不开，请稍后再试'));
    }
    current = { id: target, el, unmount: () => ctx.cleanup() };
  }

  function setHeader(meta) {
    clear(titleEl);
    if (!meta) {
      backBtn.hidden = true;
      zenBtn.hidden = false;
      titleEl.append(h('span', null, APP_NAME), h('small', null, APP_TAGLINE));
    } else {
      backBtn.hidden = false;
      zenBtn.hidden = true;
      titleEl.append(h('span', null, meta.title), h('small', null, meta.gestures.map((g) => GESTURE_LABEL[g]).join(' · ')));
    }
  }

  /* ---------------- 模块上下文 ---------------- */
  function createContext(meta, el) {
    const cleanups = [];
    const addCleanup = (fn) => fn && cleanups.push(fn);
    const wrapSub = (sub) => (cb) => {
      const off = sub(cb);
      addCleanup(off);
      return off;
    };
    const wrapGesture = (fn) => (...args) => {
      const off = fn(...args);
      addCleanup(off);
      return off;
    };
    const motion = {
      onShake: wrapSub(platform.motion.onShake),
      onToss: wrapSub(platform.motion.onToss),
      onMotion: wrapSub(platform.motion.onMotion),
      onTilt: wrapSub(platform.motion.onTilt),
      onHeading: wrapSub(platform.motion.onHeading),
      simulate: platform.motion.simulate,
      requestPermission: platform.motion.requestPermission,
      get state() {
        return platform.motion.state;
      },
      get live() {
        return platform.motion.live;
      },
      get needsPermission() {
        return platform.motion.needsPermission;
      },
      get supported() {
        return platform.motion.supported;
      },
    };
    const gesture = {};
    for (const [k, fn] of Object.entries(platform.gesture)) gesture[k] = wrapGesture(fn);
    const timers = new Set();
    const ctx = {
      id: meta.id,
      meta,
      root: el,
      kit,
      rng,
      platform,
      motion,
      gesture,
      haptic: platform.haptic,
      sound: platform.sound,
      storage: storage.namespace(meta.id),
      share: platform.share,
      navigate,
      toast,
      setTitle(text) {
        const s = titleEl.querySelector('span');
        if (s) s.textContent = text;
      },
      get theme() {
        return theme;
      },
      onTheme(cb) {
        themeListeners.add(cb);
        addCleanup(() => themeListeners.delete(cb));
      },
      ensureMotion: () => ensureMotion(ctx),
      setTimeout(fn, ms) {
        const t = setTimeout(() => {
          timers.delete(t);
          fn();
        }, ms);
        timers.add(t);
        return t;
      },
      addCleanup,
      cleanup() {
        for (const t of timers) clearTimeout(t);
        timers.clear();
        while (cleanups.length) {
          const fn = cleanups.pop();
          try {
            fn();
          } catch (e) {
            console.error('[cleanup]', e);
          }
        }
      },
    };
    return ctx;
  }

  /* ---------------- 体感权限 ---------------- */
  function motionBanner(ctx) {
    const pm = platform.motion;
    if (!pm.supported || pm.state === 'granted') return document.createComment('motion ok');
    if (pm.state === 'denied' || pm.state === 'unsupported') return document.createComment('motion unavailable');
    const wrap = h('div', { class: 'motion-banner' });
    const btn = button('开启体感', {
      variant: 'primary',
      size: 'small',
      onClick: async () => {
        const r = await pm.requestPermission();
        if (r === 'granted') {
          toast('体感已开启，摇一摇 / 甩一甩试试');
          platform.haptic.success();
          wrap.remove();
        } else {
          toast('未获得体感权限，仍可用屏幕手势和按钮');
          wrap.remove();
        }
      },
    });
    wrap.append(h('span', { class: 'grow' }, '摇动手机，也能与器物互动'), btn);
    return wrap;
  }
  async function ensureMotion() {
    const pm = platform.motion;
    if (pm.state === 'granted' || !pm.supported) return pm.state;
    return pm.requestPermission();
  }

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    const el = h('section', { class: 'view view-home', dataset: { view: 'home' } });
    el.append(h('div', { class: 'home-intro' }, h('span', { class: 'home-eyebrow' }, '片刻留白 · 一点灵感'), h('h1', null, '此刻，想问什么？')), renderHero());
    for (const region of REGIONS) {
      const mods = MODULE_LIST.filter((m) => m.region === region.id);
      if (!mods.length) continue;
      el.append(kit.sectionHead(region.title, region.kicker));
      const grid = h('div', { class: 'tile-grid' });
      mods.forEach((m, i) => {
        const wide = mods.length % 2 === 1 && i === mods.length - 1;
        grid.append(
          h(
            'button',
            {
              type: 'button',
              class: ['tile', wide && 'wide'],
              dataset: { ritual: m.id },
              onClick: () => {
                platform.haptic.tap();
                platform.sound.play('pop');
                navigate('#/m/' + m.id);
              },
            },
            h('span', { class: 'tile-head' }, h('span', { class: 'medal' }, m.glyph), h('span', { class: 'tile-gest' }, m.gestures.slice(0, 1).map((g) => GESTURE_LABEL[g]).join(' · '))),
            h('span', { class: 'col grow', style: { gap: '4px' } }, h('span', { class: 'tile-title' }, m.title), h('span', { class: 'tile-sub' }, m.subtitle)),
          ),
        );
      });
      el.append(grid);
    }
    el.append(
      h(
        'p',
        { class: 't-faint t-center mt-6', style: { fontSize: '12px', letterSpacing: '0.1em' } },
        '所有结果皆为随机与传统文化演绎，仅供娱乐与自我觉察，不构成任何决策依据。',
      ),
    );
    return el;
  }

  function renderHero() {
    let a;
    try {
      a = almanacSummary(new Date());
    } catch (e) {
      console.error('[almanac]', e);
      return h('div', { class: 'hero' }, h('div', { class: 't-display' }, '今日'));
    }
    const today = new Date();
    return h('button', { type: 'button', class: 'home-calendar', onClick: () => navigate('#/m/almanac'), attrs: { 'aria-label': '查看今日黄历' } },
      h('span', { class: 'home-calendar-day' }, String(today.getDate()).padStart(2, '0')),
      h('span', { class: 'home-calendar-date' }, h('b', null, `${today.getMonth() + 1}月 · ${a.week}`), h('small', null, `${a.yearGanZhi}年 ${a.lunarText}`)),
      h('span', { class: 'home-calendar-yi' }, h('i', null, '宜'), a.yi.slice(0, 2).join(' · ') || '从容度日'),
      icon('chevron', { size: 18 }));
  }

  /* ---------------- 皮肤抽屉 ---------------- */
  function openThemeSheet() {
    const grid = h('div', { class: 'theme-grid' });
    const renderSwatches = () => {
      clear(grid);
      for (const t of THEMES) {
        grid.append(
          h(
            'button',
            {
              type: 'button',
              class: ['theme-swatch', t.id === theme && 'active'],
              onClick: () => {
                applyTheme(t.id);
                platform.haptic.tap();
                platform.sound.play('flip');
                renderSwatches();
              },
            },
            h('span', { class: 'swatch-ball', style: { background: t.swatch } }),
            h('span', null, t.name),
          ),
        );
      }
    };
    renderSwatches();
    sheet({ title: '换一身皮肤', content: [h('p', { class: 't-muted mb-3', style: { fontSize: '13px' } }, '所有界面颜色即时切换，选择会记住。'), grid] }).open();
  }

  /* ---------------- 设置抽屉 ---------------- */
  function openSettings() {
    const pm = platform.motion;
    const row = (label, desc, control) => h('div', { class: 'setting-row' }, h('div', null, h('div', { class: 'setting-label' }, label), h('div', { class: 'setting-desc' }, desc)), control);
    const motionState = () => ({ idle: '未开启', granted: pm.live ? '已开启 · 传感器正常' : '已开启', denied: '已拒绝（请在浏览器设置中允许"运动与方向"）', unsupported: '此设备/浏览器不支持' })[pm.state];
    const motionDesc = h('div', { class: 'setting-desc' }, motionState());
    const motionControl =
      pm.state === 'idle' && pm.supported
        ? button('开启体感', {
            variant: 'primary',
            size: 'small',
            onClick: async () => {
              await pm.requestPermission();
              motionDesc.textContent = motionState();
            },
          })
        : h('span', { class: 't-faint', style: { fontSize: '12px' } }, pm.state === 'granted' ? '✓' : '—');
    const content = h(
      'div',
      null,
      row('音效', '合成音效：木块、铜钱、洗牌…', toggle(platform.sound.enabled, (v) => platform.sound.setEnabled(v))),
      row('震动反馈', platform.haptic.supported ? '落地、揭晓时轻微震动' : '此设备不支持震动', toggle(platform.haptic.enabled, (v) => platform.haptic.setEnabled(v))),
      h('div', { class: 'setting-row' }, h('div', null, h('div', { class: 'setting-label' }, '体感（摇一摇 / 甩一甩）'), motionDesc), motionControl),
      h('div', { class: 'mt-4' }, gestureHint('shake', '摇动手机 = 洗牌 / 摇签'), gestureHint('toss', '向上甩手机 = 掷筊 / 掷钱'), gestureHint('flick', '屏幕上快速上滑 = 同样效果'), gestureHint('tilt', '倾斜或转动 = 罗盘 / 灵摆')),
      h(
        'div',
        { class: 'setting-row' },
        h('div', null, h('div', { class: 'setting-label' }, '屏保 · 静观'), h('div', { class: 'setting-desc' }, '闲置后自动进入：大字时间、农历宜忌、一句古语，屏幕保持常亮')),
        toggle(storage.get('zen.auto', true), (v) => storage.set('zen.auto', v)),
      ),
      h(
        'div',
        { class: 'setting-row' },
        h('div', null, h('div', { class: 'setting-label' }, '闲置几分钟后进入')),
        kit.chips(
          [
            { value: 1, label: '1' },
            { value: 3, label: '3' },
            { value: 5, label: '5' },
            { value: 10, label: '10' },
          ],
          { value: Number(storage.get('zen.minutes', 3)) || 3, onChange: (v) => storage.set('zen.minutes', v) },
        ).el,
      ),
      h(
        'div',
        { class: 'mt-3' },
        button('现在进入屏保', {
          variant: 'soft',
          block: true,
          icon: 'moon',
          onClick: () => {
            sh.close();
            setTimeout(() => zen.enter({ fullscreen: true }), 200);
          },
        }),
      ),
      h('p', { class: 't-faint mt-3', style: { fontSize: '12px', lineHeight: '1.8' } }, 'iPhone：在 Safari 里点「分享 → 添加到主屏幕」，从主屏幕打开即为全屏、无地址栏，屏保效果最佳。安卓 Chrome：菜单 → 添加到主屏幕。'),
      h('div', { class: 'ornament' }, icon('sparkle', { size: 18 })),
      h('p', { class: 't-faint', style: { fontSize: '12px', lineHeight: '1.8' } }, `${APP_NAME} · 玄学占卜合集。所有结果均由随机算法与传统文化文本生成，仅供娱乐与自我觉察，请勿据此做出医疗、财务、法律等重要决定。`),
      h('p', { class: 't-faint mt-2', style: { fontSize: '11px' } }, `构建时间 ${typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__.slice(0, 16).replace('T', ' ') : '开发模式'}`),
    );
    const sh = sheet({ title: '设置', content });
    sh.open();
  }

  /* ---------------- 调试 / 自动化钩子 ---------------- */
  window.__lgj = {
    navigate,
    platform,
    kit,
    zen,
    simulate: (type, payload) => platform.motion.simulate(type, payload),
    setTheme: applyTheme,
    get current() {
      return current && current.id;
    },
  };

  render();
  // 首屏一点仪式感
  wait(60).then(() => platform.sound.enabled && platform.sound.play('pop'));
}
