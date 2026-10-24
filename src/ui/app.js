// 应用壳：路由 / 头部 / 首页 / 皮肤 / 设置 / 体感权限 / 模块生命周期。
import { createPlatform } from '../platform/web.js';
import { kit, h, clear, icon, button, sheet, toast, toggle, hint as gestureHint, wait } from './kit.js';
import * as rng from '../core/rng.js';
import { almanacSummary } from '../core/lunar.js';
import { MODULE_LIST, REGIONS, GESTURE_LABEL, getModuleMeta } from '../modules/list.js';
import { MODULES } from '../modules/registry.js';
import { createZen } from './zen.js';
import { registerModel, hasModel } from './model-slot.js';
import { ritualArt } from './ritual-art.js';
import { createMotionPrompt } from './motion-prompt.js';
import { openPaywall, TERMS_URL, PRIVACY_URL } from './paywall.js';
import { routeFromUrl } from './deeplink.js';
import { versionText } from './version.js';
import { openShareCard } from './share-card.js';
import { canUseTheme, startSkinTryOn, isFreeTheme } from './skins.js';
import { albumStats, normalizeAlbum, badgeOf, ALBUM_TOTAL } from '../modules/qian/album.js';
import { dayKey } from '../platform/quota.js';

export const APP_NAME = '来感觉';
export const APP_TAGLINE = 'ORACLE · 日常灵感';
export const THEMES = [
  { id: 'ink', name: '玄墨', swatch: 'radial-gradient(circle at 30% 30%, #d4af5a, #0b0b10 65%)' },
  { id: 'cinnabar', name: '朱砂', pro: true, blurb: '朱红漆器配鎏金，喜庆浓烈', swatch: 'radial-gradient(circle at 30% 30%, #e2b04a, #3a1414 40%, #1a0a0a 75%)' },
  { id: 'nebula', name: '星穹', pro: true, blurb: '紫色星空舞台，器物泛着星光', swatch: 'radial-gradient(circle at 30% 30%, #e6dcff, #4b3fa0 40%, #090a18 75%)' },
  { id: 'paper', name: '宣纸', swatch: 'radial-gradient(circle at 30% 30%, #fffaf0, #f1e7d3 50%, #8a5a1c 100%)' },
  { id: 'celadon', name: '青瓷', pro: true, blurb: '青瓷釉色，清爽如雨后', swatch: 'radial-gradient(circle at 30% 30%, #f2f8f3, #cfe3d6 50%, #2f7d68 100%)' },
];

const MOTION_GESTURES = new Set(['shake', 'toss', 'tilt']);

export function startApp(root) {
  const platform = createPlatform();
  const { storage } = platform;
  // 共享生辰档案：姻缘 / 财运 / 事业共用；未填过时沿用八字模块保存的生辰。
  const profileStore = storage.namespace('profile');
  const normalizeProfile = (b) => (b && Number(b.y) ? { y: Number(b.y), m: Number(b.m) || 1, d: Number(b.d) || 1, hour: b.hour == null || Number(b.hour) < 0 ? -1 : Number(b.hour), gender: b.gender === 'female' ? 'female' : 'male' } : null);
  const profile = {
    get(key = 'self') {
      const own = normalizeProfile(profileStore.get(key, null));
      if (own || key !== 'self') return own;
      return normalizeProfile(storage.namespace('bazi').get('birth', null));
    },
    set(key, value) {
      if (value && typeof value === 'object' && key === undefined) return;
      if (typeof key === 'object') { value = key; key = 'self'; }
      profileStore.set(key, normalizeProfile(value));
    },
    has(key = 'self') {
      return !!normalizeProfile(profileStore.get(key, null)) || (key === 'self' && !!normalizeProfile(storage.namespace('bazi').get('birth', null)));
    },
  };
  let motionPrompt = null, motionRequest = null;

  /* ---------------- 皮肤 ---------------- */
  const themeListeners = new Set();
  document.documentElement.dataset.fps = storage.get('stage.fps', false) ? 'on' : 'off';
  let theme = storage.get('theme', 'paper');
  if (!THEMES.some((t) => t.id === theme) || !canUseTheme(platform.purchases, theme)) theme = 'paper';
  // 已选定的皮肤（试穿时不写入，试穿结束据此换回）
  let savedTheme = theme;
  let tryOn = null;
  const applyTheme = (id, { persist = true } = {}) => {
    theme = id;
    document.documentElement.dataset.theme = id;
    if (persist) { savedTheme = id; storage.set('theme', id); }
    const meta = document.querySelector('meta[name="theme-color"]');
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#0b0b10';
    if (meta) meta.content = bg;
    platform.native.setBarStyle(bg);
    for (const cb of themeListeners) cb(id);
  };
  applyTheme(theme);
  // 订阅到期或退款后，付费皮肤换回宣纸（试穿中不打断）
  platform.purchases.onChange?.(() => {
    if (!tryOn && !canUseTheme(platform.purchases, savedTheme)) applyTheme('paper');
  });

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
    let prompt = null;
    if (meta.gestures.some((g) => MOTION_GESTURES.has(g))) {
      prompt = createMotionPrompt({ motion: platform.motion, meta, requestPermission: ensureMotion, haptic: platform.haptic, inApp: platform.inApp });
      motionPrompt = prompt;
      el.append(prompt.el);
      ctx.addCleanup(() => { prompt.dispose(); if (motionPrompt === prompt) motionPrompt = null; });
    }
    try {
      const un = await impl.mount(el, ctx);
      ctx.addCleanup(typeof un === 'function' ? un : null);
      // 体感邀请放到器物舞台正下方，作为一行轻提示，首屏先看到器物
      if (prompt) {
        let anchor = el.querySelector('.stage');
        while (anchor && anchor.parentElement !== el) anchor = anchor.parentElement;
        if (anchor) anchor.after(prompt.el);
      }
      el.dataset.ready = '1';
    } catch (e) {
      console.error(`[module:${target}] mount failed`, e);
      el.append(kit.placeholder(meta.glyph, '开坛失败', '这个功能暂时打不开，请稍后再试'));
    }
    current = { id: target, el, unmount: () => ctx.cleanup() };
    if (prompt && (storage.get('onboarded', false) || navigator.webdriver)) prompt.enter();
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
      titleEl.append(h('span', null, meta.title));
    }
  }

  /* ---------------- 模块上下文 ---------------- */
  function createContext(meta, el) {
    platform.motion.resetInput();
    const cleanups = [];
    const addCleanup = (fn) => fn && cleanups.push(fn);
    const wrapSub = (sub) => (cb) => {
      const off = sub((event) => {
        // Motion is an input only while the object is visible and the user is
        // not typing or reading a sheet. Turning the phone must not reset a result.
        if (document.hidden || document.querySelector('.sheet.open') || document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) {
          platform.motion.resetInput(); return;
        }
        cb(event);
      });
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
      requestPermission: ensureMotion,
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
      profile,
      share: (text, opts) => openShareCard(platform, text, { badge: albumBadge(), ...opts }),
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
        platform.motion.resetInput(); platform.haptic.cancel();
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
  async function ensureMotion() {
    const pm = platform.motion;
    if (pm.state === 'granted' || !pm.supported) return pm.state;
    if (motionRequest) return motionRequest;
    motionRequest = pm.requestPermission();
    try { return await motionRequest; }
    finally { motionRequest = null; motionPrompt?.sync(); }
  }
  // iPhone App 里系统直接放行运动权限、不弹窗：第一次触屏时顺手开启，体感提示就不必出现。
  if (platform.inApp && platform.motion.needsPermission) {
    const kinds = ['touchend', 'click'];
    const once = () => {
      kinds.forEach((k) => window.removeEventListener(k, once, true));
      if (platform.motion.state === 'idle') ensureMotion();
    };
    kinds.forEach((k) => window.addEventListener(k, once, true));
  }

  /* ---------------- 安卓返回键（App） ---------------- */
  // 先关最上层的抽屉，再退屏保，再回首页；已在首页则退到后台。
  platform.native.onBack(() => {
    const top = [...document.querySelectorAll('.sheet.open')].pop();
    if (top) top.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    else if (zen.active) zen.exit();
    else if (document.querySelector('.onboard')) return;
    else if ((location.hash || '#/') !== '#/') navigate('#/');
    else platform.native.minimize();
  });

  /* ---------------- 深链（App） ---------------- */
  // laiganjue://pro 打开付费卡，laiganjue://m/<玩法> 打开玩法页。
  platform.native.onUrlOpen?.((url) => {
    const r = routeFromUrl(url, MODULES);
    if (!r) return;
    if (r.paywall) openPaywall(platform);
    else if (r.hash) navigate(r.hash);
  });

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    const el = h('section', { class: 'view view-home', dataset: { view: 'home' } });
    el.append(h('div', { class: 'home-intro' }, h('span', { class: 'home-eyebrow' }, '片刻留白 · 一点灵感'), h('h1', null, '此刻，想问什么？')), renderHero(), renderStreak());
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
            h('span', { class: 'tile-head' }, ritualArt(m.id), h('span', { class: 'tile-gest' }, m.gestures.slice(0, 1).map((g) => GESTURE_LABEL[g]).join(' · '))),
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

  // 签册最高徽章：所有玩法的分享卡都印上它（集到 8 支起）。
  function albumBadge() {
    try { return badgeOf(albumStats(normalizeAlbum(storage.namespace('qian').get('album', null))).count); }
    catch (e) { console.error('[album]', e); return null; }
  }

  // 连续天数 + 签纸收集册进度：每天回来的小理由，点开直接到收集册。
  function renderStreak() {
    let n = 0, today = false, s = { count: 0, total: ALBUM_TOTAL };
    try {
      n = platform.streak?.days() || 0;
      const raw = storage.get('streak', null);
      today = !!raw && raw.last === dayKey(Date.now());
      s = albumStats(normalizeAlbum(storage.namespace('qian').get('album', null)));
    } catch (e) { console.error('[streak]', e); }
    const lit = Math.min(7, n);
    return h('button', { type: 'button', class: 'home-streak', dataset: { streak: n }, onClick: () => { platform.haptic.tap(); navigate('#/m/qian/album'); }, attrs: { 'aria-label': `连续 ${n} 天，签纸收集册 ${s.count}/${s.total}` } },
      h('span', { class: 'home-streak-days' }, h('b', null, n ? `连续 ${n} 天` : '开始连续打卡'), h('small', null, n ? (today ? '今天已来过' : '今天来一签就能续上') : '每天来一次，签纸收进册子')),
      h('span', { class: 'home-streak-dots', attrs: { 'aria-hidden': 'true' } }, Array.from({ length: 7 }, (_, i) => h('i', { class: i < lit ? 'on' : '' }))),
      h('span', { class: 'qn-album-bar', attrs: { 'aria-hidden': 'true' } }, h('i', { style: { width: `${(s.count / s.total) * 100}%` } })),
      h('span', { class: 'home-streak-album' }, `签册 ${s.count}/${s.total}`),
      icon('chevron', { size: 16 }));
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
    tryOn?.end();
    const iap = platform.purchases;
    const grid = h('div', { class: 'theme-grid' });
    let sh = null;
    const renderSwatches = () => {
      clear(grid);
      for (const t of THEMES) {
        const locked = !canUseTheme(iap, t.id);
        grid.append(
          h(
            'button',
            {
              type: 'button',
              class: ['theme-swatch', t.id === theme && 'active', locked && 'locked'],
              dataset: { skin: t.id },
              attrs: { 'aria-label': locked ? `${t.name}，付费皮肤，可试穿 10 秒` : t.name },
              onClick: () => {
                platform.haptic.tap();
                platform.sound.play('flip');
                if (locked) {
                  sh?.close();
                  setTimeout(() => {
                    const mine = startSkinTryOn({ platform, theme: t, openPaywall, apply: applyTheme, revert: () => applyTheme(savedTheme), onDone: () => { if (tryOn === mine) tryOn = null; } });
                    tryOn = mine;
                  }, 220);
                  return;
                }
                applyTheme(t.id);
                renderSwatches();
              },
            },
            h('span', { class: 'swatch-ball', style: { background: t.swatch } }),
            h('span', null, t.name),
            isFreeTheme(t.id) ? h('span', { class: 'swatch-tag is-free' }, '免费') : h('span', { class: ['swatch-tag', locked ? 'is-locked' : 'is-owned'] }, locked ? 'Pro · 试穿' : '已解锁'),
          ),
        );
      }
    };
    renderSwatches();
    const proCard = iap.pro
      ? null
      : h('div', { class: 'skin-pro-card' },
          h('div', null, h('b', null, '来感觉 Pro'), h('span', null, '全部皮肤 · 无限解读 · 无水印分享')),
          button('了解 Pro', { variant: 'primary', size: 'small', onClick: () => openPaywall(platform, { reason: '全部皮肤，外加无限深度解读' }).then(() => { renderSwatches(); if (iap.pro) proCard.remove(); }) }));
    sh = sheet({ title: '换一身皮肤', content: [h('p', { class: 't-muted mb-3', style: { fontSize: '13px' } }, '界面与 3D 舞台即时换装。付费皮肤可以先试穿 10 秒。'), grid, proCard] });
    sh.open();
  }

  /* ---------------- 设置抽屉 ---------------- */
  function openSettings() {
    const pm = platform.motion;
    const row = (label, desc, control) => h('div', { class: 'setting-row' }, h('div', null, h('div', { class: 'setting-label' }, label), h('div', { class: 'setting-desc' }, desc)), control);
    const motionState = () => ({ idle: '未开启', granted: pm.live ? '已开启 · 传感器正常' : '已开启', denied: platform.inApp ? '未能开启，请返回玩法页重试' : '已拒绝（请在浏览器设置中允许"运动与方向"）', unsupported: platform.inApp ? '此设备不支持' : '此设备/浏览器不支持' })[pm.state];
    const motionDesc = h('div', { class: 'setting-desc' }, motionState());
    const motionControl =
      pm.state === 'idle' && pm.supported
        ? button('开启体感', {
            variant: 'primary',
            size: 'small',
            onClick: async () => {
              await ensureMotion();
              motionDesc.textContent = motionState();
            },
          })
        : h('span', { class: 't-faint', style: { fontSize: '12px' } }, pm.state === 'granted' ? '✓' : '—');
    const hp = platform.haptic;
    const hapticDesc = h('div', { class: 'setting-desc' }, hp.supported ? '出手、碰撞、落定时震动' : '当前浏览器不支持网页震动；iPhone Safari 暂未开放');
    const hapticControls = h('div', { class: 'setting-haptic-controls' });
    if (hp.supported) {
      const test = button('试一下', { variant: 'ghost', size: 'small', onClick: () => {
        const sent = hp.pattern([45, 80, 55]);
        hapticDesc.textContent = sent ? '已发出震动；无感觉时可检查手机的震动设置' : '震动未触发，请检查手机设置';
      } });
      test.disabled = !hp.enabled;
      hapticControls.append(toggle(hp.enabled, (v) => { hp.setEnabled(v); test.disabled = !v; if (v) hp.settle(); }), test);
    } else hapticControls.append(h('span', { class: 't-faint' }, '不支持'));
    const iap = platform.purchases;
    const planName = { yearly: '年度', monthly: '月度', lifetime: '永久' };
    const proDesc = () => (iap.pro ? `已开通 · ${planName[iap.plan] || 'Pro'}${iap.until ? ' · 续期日 ' + new Date(iap.until).toLocaleDateString('zh-CN') : ''}` : `无限解读 · 全部皮肤 · 无水印分享${iap.credits ? ` · 剩余单次解读 ${iap.credits} 次` : ''}`);
    const proDescEl = h('div', { class: 'setting-desc' }, proDesc());
    const proControls = h('div', { class: 'setting-pro' });
    const renderPro = () => {
      proDescEl.textContent = proDesc();
      proControls.replaceChildren(
        iap.pro
          ? (iap.available && iap.plan !== 'lifetime' ? button('管理订阅', { variant: 'ghost', size: 'small', onClick: () => iap.manage() }) : h('span', { class: 't-faint' }, '✓'))
          : button('了解 Pro', { variant: 'primary', size: 'small', onClick: () => openPaywall(platform).then(renderPro) }),
        button('恢复购买', { variant: 'ghost', size: 'small', onClick: async () => {
          if (!iap.available) { toast('请在 App 中恢复购买'); return; }
          const r = await iap.restore();
          toast(r.ok ? (r.pro ? '已恢复来感觉 Pro' : '没有找到可恢复的购买') : '恢复失败，请检查网络后再试');
          renderPro();
        } }),
      );
    };
    renderPro();
    const content = h(
      'div',
      null,
      h('div', { class: 'setting-row setting-row-pro' }, h('div', null, h('div', { class: 'setting-label' }, '来感觉 Pro'), proDescEl), proControls),
      row('器物动画', '投掷、翻滚与翻牌', kit.chips([{ value: 'full', label: '完整' }, { value: 'gentle', label: '轻柔' }], { value: platform.simpleMotion ? 'gentle' : 'full', onChange: (v) => platform.setMotionStyle(v) }).el),
      row('音效', '合成音效：木块、铜钱、洗牌…', toggle(platform.sound.enabled, (v) => platform.sound.setEnabled(v))),
      row('帧率显示', '在 3D 器物舞台右上角显示每秒帧数', toggle(storage.get('stage.fps', false), (v) => { storage.set('stage.fps', v); document.documentElement.dataset.fps = v ? 'on' : 'off'; })),
      h('div', { class: 'setting-row' }, h('div', null, h('div', { class: 'setting-label' }, '震动反馈'), hapticDesc), hapticControls),
      h('div', { class: 'setting-row' }, h('div', null, h('div', { class: 'setting-label' }, '体感（摇一摇 / 甩一甩）'), motionDesc), motionControl),
      h('div', { class: 'mt-4' }, gestureHint('shake', '轻摇后收住 = 洗牌 / 摇签 / 掷骰'), gestureHint('toss', '向上轻甩后收住 = 掷筊 / 掷钱'), gestureHint('flick', '屏幕上快速上滑 = 同样效果'), gestureHint('tilt', '倾斜或转动 = 罗盘 / 灵摆')),
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
      platform.inApp ? null : h('p', { class: 't-faint mt-3', style: { fontSize: '12px', lineHeight: '1.8' } }, 'iPhone：在 Safari 里点「分享 → 添加到主屏幕」，从主屏幕打开即为全屏、无地址栏，屏保效果最佳。安卓 Chrome：菜单 → 添加到主屏幕。'),
      h('div', { class: 'mt-3' }, button('重看新手引导', { variant: 'ghost', block: true, onClick: () => { sh.close(); setTimeout(() => openOnboarding(true), 300); } })),
      h('div', { class: 'ornament' }, icon('sparkle', { size: 18 })),
      h('p', { class: 't-faint', style: { fontSize: '12px', lineHeight: '1.8' } }, `${APP_NAME} · 玄学占卜合集。所有结果均由随机算法与传统文化文本生成，仅供娱乐与自我觉察，请勿据此做出医疗、财务、法律等重要决定。`),
      h('p', { class: 'setting-legal t-faint mt-2' },
        h('a', { attrs: { href: TERMS_URL, target: '_blank', rel: 'noopener' } }, '使用条款'),
        h('span', null, ' · '),
        h('a', { attrs: { href: PRIVACY_URL, target: '_blank', rel: 'noopener' } }, '隐私政策')),
      h('p', { class: 'setting-version t-faint mt-2', dataset: { version: '1' } }, versionText(typeof __BUILD_INFO__ !== 'undefined' ? __BUILD_INFO__ : null)),
    );
    const sh = sheet({ title: '设置', content });
    sh.open();
  }

  /* ---------------- 首次引导 ---------------- */
  function openOnboarding(force = false) {
    if (!force && storage.get('onboarded', false)) return;
    if (document.querySelector('.onboard')) return;
    const rows = [
      ['摇', '摇一摇 · 甩一甩', '手机就是你的筊杯、签筒与铜钱。也可以在屏幕上滑动，或直接点按钮。'],
      ['问', '一问一答', '每个玩法只有一个主按钮，跟着它走：先出手，看见结果，再展开解读。'],
      ['静', '静观屏保', platform.inApp ? '左上角的月亮进入屏保；闲置时它就是一面素雅的时钟。' : '左上角的月亮进入屏保；把网页加到主屏幕，闲置时它就是一面素雅的时钟。'],
    ];
    const el = h(
      'div',
      { class: 'onboard', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': '欢迎' } },
      h(
        'div',
        { class: 'onboard-card' },
        h('div', { class: 'onboard-mark' }, '感'),
        h('div', { class: 'onboard-title' }, APP_NAME),
        h('div', { class: 'onboard-sub' }, '片刻留白 · 一点灵感'),
        h('div', { class: 'onboard-rows' }, rows.map(([g, t, d]) => h('div', { class: 'onboard-row' }, h('span', { class: 'onboard-glyph' }, g), h('div', null, h('b', null, t), h('p', null, d))))),
        button('开始', {
          variant: 'primary',
          size: 'large',
          block: true,
          onClick: () => {
            storage.set('onboarded', true);
            el.classList.remove('show');
            platform.haptic.tap();
            setTimeout(() => { el.remove(); motionPrompt?.enter(); }, 400);
          },
        }),
        h('p', { class: 'onboard-foot' }, '传统文化演绎 · 仅供娱乐与自我觉察'),
      ),
    );
    document.body.append(el);
    requestAnimationFrame(() => el.classList.add('show'));
  }
  if (!location.hash.startsWith('#/zen') && !navigator.webdriver) wait(500).then(() => openOnboarding());

  /* ---------------- 调试 / 自动化钩子 ---------------- */
  window.__lgj = {
    navigate,
    platform,
    kit,
    zen,
    registerModel,
    hasModel,
    openOnboarding,
    openPaywall: (opts) => openPaywall(platform, opts),
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
