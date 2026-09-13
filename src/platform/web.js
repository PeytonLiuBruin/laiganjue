// 平台层（Web 实现）。模块只通过这里拿"体感 / 手势 / 震动 / 音效 / 存储 / 分享"，
// 迁移微信小程序时只需实现同名接口的 weapp.js（映射表见 docs/PORTING_WEAPP.md）。
//
// motion:  onShake(cb) | onToss(cb) | onMotion(cb) | onTilt(cb) | onHeading(cb) → 返回取消函数
//          requestPermission() → 'granted' | 'denied' | 'unsupported'
//          simulate(type, payload) 手动触发（屏幕手势回退 / 自动化测试用）
// gesture: flick(el, cb) | drag(el, handlers) | spin(el, cb) | rub(el, cb) | tap(el, cb) | longPress(el, cb)
// haptic:  tap() light() medium() heavy() success() double() rattle() pattern([])
// sound:   play(name) | setEnabled(bool) | enabled  （全部 WebAudio 合成，无音频文件）
// storage: get(key, def) | set(key, val) | remove(key)
// share(text) → Promise<'shared'|'copied'|'failed'>

const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
const isIOS = isBrowser && /iP(hone|ad|od)/.test(navigator.userAgent) && !window.MSStream;

/* ---------------------------------- 体感 ---------------------------------- */
function createMotion() {
  const listeners = { shake: new Set(), toss: new Set(), motion: new Set(), tilt: new Set(), heading: new Set() };
  const emit = (type, payload) => {
    for (const cb of Array.from(listeners[type])) {
      try {
        cb(payload);
      } catch (e) {
        console.error(`[motion:${type}]`, e);
      }
    }
  };
  const on = (type) => (cb) => {
    listeners[type].add(cb);
    return () => listeners[type].delete(cb);
  };

  const state = {
    permission: 'idle', // idle | granted | denied | unsupported
    started: false,
    live: false, // 是否已经收到过真实传感器事件
    lastEventAt: 0,
  };

  // 阈值（m/s²，去重力后的线性加速度）
  const PEAK = 13;
  const REFRACTORY = 90; // ms，两次峰值最小间隔
  const WINDOW = 900; // ms，峰值统计窗口
  const TOSS_WAIT = 380; // ms，单次爆发后等待多久确认为"甩"
  const SHAKE_COOLDOWN = 800;

  const grav = { x: 0, y: 0, z: 9.8 };
  let peaks = [];
  let lastPeakAt = 0;
  let lastShakeAt = 0;
  let tossTimer = null;
  let peakSum = 0;

  function handlePeak(t, mag, vec) {
    peaks.push({ t, mag, vec });
    peaks = peaks.filter((p) => t - p.t < WINDOW);
    if (peaks.length >= 3) {
      clearTimeout(tossTimer);
      tossTimer = null;
      if (t - lastShakeAt > SHAKE_COOLDOWN) {
        lastShakeAt = t;
        const intensity = peaks.reduce((s, p) => s + p.mag, 0) / peaks.length;
        emit('shake', { intensity, count: peaks.length, source: 'sensor' });
      }
      peaks = [];
      return;
    }
    if (peaks.length === 1) {
      clearTimeout(tossTimer);
      tossTimer = setTimeout(() => {
        tossTimer = null;
        if (peaks.length && peaks.length <= 2 && performance.now() - lastShakeAt > SHAKE_COOLDOWN) {
          const p = peaks.reduce((a, b) => (b.mag > a.mag ? b : a), peaks[0]);
          emit('toss', { intensity: p.mag, vec: p.vec, source: 'sensor' });
        }
        peaks = [];
      }, TOSS_WAIT);
    }
  }

  function onDeviceMotion(e) {
    const t = performance.now();
    state.live = true;
    state.lastEventAt = t;
    let ax;
    let ay;
    let az;
    if (e.acceleration && e.acceleration.x != null) {
      ax = e.acceleration.x;
      ay = e.acceleration.y;
      az = e.acceleration.z;
    } else if (e.accelerationIncludingGravity && e.accelerationIncludingGravity.x != null) {
      const a = e.accelerationIncludingGravity;
      const k = 0.85;
      grav.x = k * grav.x + (1 - k) * a.x;
      grav.y = k * grav.y + (1 - k) * a.y;
      grav.z = k * grav.z + (1 - k) * a.z;
      ax = a.x - grav.x;
      ay = a.y - grav.y;
      az = a.z - grav.z;
    } else {
      return;
    }
    const mag = Math.hypot(ax || 0, ay || 0, az || 0);
    peakSum = peakSum * 0.8 + mag * 0.2;
    emit('motion', { mag, smooth: peakSum, ax, ay, az, t });
    if (mag > PEAK && t - lastPeakAt > REFRACTORY) {
      lastPeakAt = t;
      handlePeak(t, mag, { x: ax, y: ay, z: az });
    }
  }

  function onOrientation(e) {
    const alpha = e.alpha;
    const beta = e.beta;
    const gamma = e.gamma;
    if (beta == null && gamma == null) return;
    state.live = true;
    emit('tilt', { alpha, beta, gamma, absolute: !!e.absolute });
    let heading = null;
    if (typeof e.webkitCompassHeading === 'number' && !Number.isNaN(e.webkitCompassHeading)) {
      heading = e.webkitCompassHeading;
    } else if (e.absolute && typeof alpha === 'number') {
      heading = (360 - alpha) % 360;
    } else if (!isIOS && typeof alpha === 'number' && e.type === 'deviceorientationabsolute') {
      heading = (360 - alpha) % 360;
    }
    if (heading != null) emit('heading', { heading, accuracy: e.webkitCompassAccuracy ?? null });
  }

  function start() {
    if (!isBrowser || state.started) return;
    state.started = true;
    window.addEventListener('devicemotion', onDeviceMotion, { passive: true });
    if ('ondeviceorientationabsolute' in window) {
      window.addEventListener('deviceorientationabsolute', onOrientation, { passive: true });
    }
    window.addEventListener('deviceorientation', onOrientation, { passive: true });
  }

  const needsPermission = isBrowser && typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function';

  async function requestPermission() {
    if (!isBrowser || typeof DeviceMotionEvent === 'undefined') {
      state.permission = 'unsupported';
      return state.permission;
    }
    if (needsPermission) {
      try {
        const r = await DeviceMotionEvent.requestPermission();
        state.permission = r === 'granted' ? 'granted' : 'denied';
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          try {
            await DeviceOrientationEvent.requestPermission();
          } catch {
            /* 方向权限可选 */
          }
        }
      } catch {
        state.permission = 'denied';
      }
    } else {
      state.permission = 'granted';
    }
    if (state.permission === 'granted') start();
    return state.permission;
  }

  // 非 iOS：无需权限，直接监听
  if (isBrowser && !needsPermission && typeof DeviceMotionEvent !== 'undefined') {
    state.permission = 'granted';
    start();
  } else if (isBrowser && typeof DeviceMotionEvent === 'undefined') {
    state.permission = 'unsupported';
  }

  /** 手动触发（屏幕回退手势 / 自动化）。type: shake | toss | tilt | heading | motion */
  function simulate(type, payload = {}) {
    if (!listeners[type]) throw new Error('unknown motion type: ' + type);
    emit(type, { intensity: 20, source: 'simulate', ...payload });
  }

  return {
    onShake: on('shake'),
    onToss: on('toss'),
    onMotion: on('motion'),
    onTilt: on('tilt'),
    onHeading: on('heading'),
    requestPermission,
    simulate,
    get state() {
      return state.permission;
    },
    get live() {
      return state.live;
    },
    get needsPermission() {
      return needsPermission;
    },
    get supported() {
      return isBrowser && typeof DeviceMotionEvent !== 'undefined';
    },
  };
}

/* ---------------------------------- 手势 ---------------------------------- */
function createGesture() {
  const now = () => performance.now();

  /** 追踪指针，返回速度（px/ms）等；仅主指针 */
  function track(el, { onStart, onMove, onEnd, prevent = true }) {
    let id = null;
    let samples = [];
    let start = null;
    const down = (e) => {
      if (id !== null) return;
      if (e.button != null && e.button !== 0) return;
      id = e.pointerId;
      samples = [{ t: now(), x: e.clientX, y: e.clientY }];
      start = samples[0];
      try {
        el.setPointerCapture(id);
      } catch {
        /* ignore */
      }
      onStart && onStart({ x: e.clientX, y: e.clientY, event: e });
    };
    const move = (e) => {
      if (e.pointerId !== id) return;
      if (prevent && e.cancelable) e.preventDefault();
      const s = { t: now(), x: e.clientX, y: e.clientY };
      samples.push(s);
      if (samples.length > 12) samples.shift();
      onMove && onMove({ x: s.x, y: s.y, dx: s.x - start.x, dy: s.y - start.y, event: e, start });
    };
    const up = (e) => {
      if (e.pointerId !== id) return;
      const cancelled = e.type === 'pointercancel';
      id = null;
      const t = now();
      samples.push({ t, x: e.clientX, y: e.clientY });
      const recent = samples.filter((s) => t - s.t <= 110);
      const a = recent[0] || samples[0];
      const b = samples[samples.length - 1];
      const dt = Math.max(1, b.t - a.t);
      const vx = (b.x - a.x) / dt;
      const vy = (b.y - a.y) / dt;
      onEnd &&
        onEnd({
          x: b.x,
          y: b.y,
          dx: b.x - start.x,
          dy: b.y - start.y,
          vx,
          vy,
          speed: Math.hypot(vx, vy),
          duration: t - start.t,
          cancelled,
          event: e,
          start,
        });
      samples = [];
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.classList.add('no-touch');
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }

  /** 快速甩动：默认向上（dy<0）。cb({direction, speed, dx, dy}) */
  function flick(el, cb, { minSpeed = 0.55, minDist = 40, axis = 'y', direction = 'up' } = {}) {
    return track(el, {
      onEnd: (g) => {
        const dist = axis === 'y' ? -g.dy : g.dx;
        const v = axis === 'y' ? -g.vy : g.vx;
        const okDir = direction === 'any' ? Math.abs(dist) >= minDist : direction === 'up' || direction === 'right' ? dist >= minDist : -dist >= minDist;
        if (!g.cancelled && okDir && Math.abs(v) >= minSpeed) {
          cb({
            direction: axis === 'y' ? (g.dy < 0 ? 'up' : 'down') : g.dx > 0 ? 'right' : 'left',
            speed: Math.abs(v),
            dx: g.dx,
            dy: g.dy,
            intensity: Math.min(40, 10 + Math.abs(v) * 14),
          });
        }
      },
    });
  }

  /** 拖拽 */
  function drag(el, handlers) {
    return track(el, handlers);
  }

  /** 拨动旋转：以元素中心为轴，onMove(deltaRad) 实时，cb(omega rad/s) 松手时 */
  function spin(el, cb, { onMove } = {}) {
    let lastAngle = null;
    let lastT = 0;
    let omegaSamples = [];
    const center = () => {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    return track(el, {
      onStart: (g) => {
        const c = center();
        lastAngle = Math.atan2(g.y - c.y, g.x - c.x);
        lastT = now();
        omegaSamples = [];
      },
      onMove: (g) => {
        const c = center();
        const a = Math.atan2(g.y - c.y, g.x - c.x);
        let d = a - lastAngle;
        if (d > Math.PI) d -= 2 * Math.PI;
        if (d < -Math.PI) d += 2 * Math.PI;
        const t = now();
        const dt = Math.max(1, t - lastT);
        omegaSamples.push({ t, w: (d / dt) * 1000 });
        if (omegaSamples.length > 6) omegaSamples.shift();
        lastAngle = a;
        lastT = t;
        onMove && onMove(d);
      },
      onEnd: (g) => {
        if (g.cancelled) return;
        const t = now();
        const recent = omegaSamples.filter((s) => t - s.t < 120);
        const w = recent.length ? recent.reduce((s, x) => s + x.w, 0) / recent.length : 0;
        cb(w);
      },
    });
  }

  /** 摩擦：手指在元素上来回摩擦，cb({intensity}) 按节流触发 */
  function rub(el, cb, { throttle = 120 } = {}) {
    let acc = 0;
    let last = null;
    let lastEmit = 0;
    return track(el, {
      onStart: (g) => {
        last = g;
      },
      onMove: (g) => {
        if (last) acc += Math.hypot(g.x - last.x, g.y - last.y);
        last = g;
        const t = now();
        if (t - lastEmit > throttle && acc > 0) {
          lastEmit = t;
          cb({ intensity: Math.min(1, acc / 260), distance: acc, x: g.x, y: g.y });
          acc = 0;
        }
      },
      onEnd: () => {
        last = null;
        acc = 0;
      },
    });
  }

  /** 点击（区分拖动） */
  function tap(el, cb) {
    return track(el, {
      onEnd: (g) => {
        if (!g.cancelled && Math.hypot(g.dx, g.dy) < 10 && g.duration < 400) cb(g);
      },
      prevent: false,
    });
  }

  /** 长按 */
  function longPress(el, cb, { ms = 500 } = {}) {
    let timer = null;
    return track(el, {
      onStart: (g) => {
        timer = setTimeout(() => cb(g), ms);
      },
      onMove: (g) => {
        if (Math.hypot(g.dx, g.dy) > 12) clearTimeout(timer);
      },
      onEnd: () => clearTimeout(timer),
      prevent: false,
    });
  }

  return { track, flick, drag, spin, rub, tap, longPress };
}

/* ---------------------------------- 震动 ---------------------------------- */
function createHaptic(storage) {
  let enabled = storage.get('haptic', true);
  const can = isBrowser && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  const pattern = (p) => {
    if (!enabled || !can) return false;
    try {
      return navigator.vibrate(p);
    } catch {
      return false;
    }
  };
  return {
    pattern,
    tap: () => pattern(10),
    light: () => pattern(15),
    medium: () => pattern(30),
    heavy: () => pattern([55]),
    success: () => pattern([20, 40, 20]),
    double: () => pattern([15, 60, 15]),
    rattle: () => pattern([8, 18, 8, 18, 8, 18, 8]),
    get enabled() {
      return enabled;
    },
    setEnabled(v) {
      enabled = !!v;
      storage.set('haptic', enabled);
    },
    get supported() {
      return can;
    },
  };
}

/* ---------------------------------- 音效（合成） ---------------------------------- */
function createSound(storage) {
  let enabled = storage.get('sound', true);
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (!isBrowser) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 1.2;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  // 首次任何交互时解锁音频上下文
  if (isBrowser) {
    const unlock = () => {
      if (enabled) ensure();
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  const env = (g, t0, a, peak, d, sustain = 0.0001) => {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(sustain, t0 + a + d);
  };

  function noise(t0, { dur = 0.08, type = 'bandpass', freq = 1800, q = 4, peak = 0.5, attack = 0.002, sweepTo = null } = {}) {
    const c = ctx;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    f.Q.value = q;
    const g = c.createGain();
    env(g, t0, attack, peak, dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
    src.stop(t0 + dur + attack + 0.05);
  }

  function tone(t0, { freq = 440, type = 'sine', dur = 0.3, peak = 0.3, attack = 0.003, sweepTo = null, detune = 0 } = {}) {
    const c = ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.detune.value = detune;
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = c.createGain();
    env(g, t0, attack, peak, dur);
    o.connect(g).connect(master);
    o.start(t0);
    o.stop(t0 + dur + attack + 0.05);
  }

  const recipes = {
    // 木块/筊杯落地
    clack(t) {
      noise(t, { dur: 0.09, freq: 1500, q: 5, peak: 0.6 });
      noise(t, { dur: 0.05, freq: 4000, q: 2, peak: 0.25, type: 'highpass' });
      tone(t, { freq: 190, dur: 0.07, peak: 0.35, type: 'triangle', sweepTo: 90 });
    },
    // 铜钱/硬币
    coin(t) {
      [3520, 5274, 7040].forEach((f, i) => tone(t + i * 0.004, { freq: f, dur: 0.55 - i * 0.1, peak: 0.12 / (i + 1), detune: (i - 1) * 6 }));
      noise(t, { dur: 0.02, freq: 6000, q: 1, peak: 0.15, type: 'highpass' });
    },
    // 摇晃（竹签/骰子/卡牌）
    shake(t) {
      for (let i = 0; i < 7; i++) {
        const dt = i * 0.045 + Math.random() * 0.02;
        noise(t + dt, { dur: 0.035, freq: 1200 + Math.random() * 1600, q: 6, peak: 0.28 });
      }
    },
    rattle(t) {
      for (let i = 0; i < 4; i++) noise(t + i * 0.05, { dur: 0.03, freq: 2200 + Math.random() * 800, q: 8, peak: 0.2 });
    },
    // 甩出 / 飞行
    whoosh(t) {
      noise(t, { dur: 0.38, freq: 400, sweepTo: 2600, q: 1.2, peak: 0.35, attack: 0.03 });
    },
    // 翻牌
    flip(t) {
      noise(t, { dur: 0.06, freq: 900, sweepTo: 2400, q: 2, peak: 0.28 });
      tone(t + 0.01, { freq: 880, dur: 0.05, peak: 0.08, type: 'triangle' });
    },
    // 铃音 / 圣杯
    chime(t) {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(t + i * 0.09, { freq: f, dur: 1.4, peak: 0.16, attack: 0.008 }));
    },
    // 转盘刻度
    tick(t) {
      noise(t, { dur: 0.012, freq: 3200, q: 3, peak: 0.25, type: 'highpass' });
      tone(t, { freq: 1200, dur: 0.02, peak: 0.08, type: 'square' });
    },
    // 钟 / 揭晓
    gong(t) {
      tone(t, { freq: 110, dur: 2.2, peak: 0.35, attack: 0.01 });
      tone(t, { freq: 165, dur: 1.8, peak: 0.18, attack: 0.01, detune: 8 });
      tone(t, { freq: 330, dur: 1.2, peak: 0.1, attack: 0.01 });
      noise(t, { dur: 0.25, freq: 600, q: 0.8, peak: 0.2, attack: 0.005 });
    },
    // 轻响 / 提示
    pop(t) {
      tone(t, { freq: 620, sweepTo: 220, dur: 0.09, peak: 0.25, type: 'sine' });
    },
    // 落地厚重（骰子 / 石头）
    thud(t) {
      tone(t, { freq: 120, sweepTo: 60, dur: 0.16, peak: 0.45, type: 'sine' });
      noise(t, { dur: 0.06, freq: 700, q: 2, peak: 0.3 });
    },
    // 纸张 / 撕页
    paper(t) {
      noise(t, { dur: 0.3, freq: 1800, sweepTo: 800, q: 0.9, peak: 0.28, attack: 0.02 });
    },
    // 神秘揭示（水晶球 / 塔罗）
    shimmer(t) {
      [880, 1108.7, 1318.5, 1760, 2217].forEach((f, i) => tone(t + i * 0.06, { freq: f, dur: 0.9, peak: 0.07, attack: 0.02 }));
    },
    // 失败 / 凶
    low(t) {
      tone(t, { freq: 220, sweepTo: 110, dur: 0.6, peak: 0.25, type: 'triangle' });
    },
    // 成功 / 吉
    success(t) {
      [659.25, 830.6, 987.77].forEach((f, i) => tone(t + i * 0.08, { freq: f, dur: 0.5, peak: 0.16 }));
    },
  };

  function play(name, { delay = 0 } = {}) {
    if (!enabled) return false;
    const c = ensure();
    if (!c || !recipes[name]) return false;
    try {
      recipes[name](c.currentTime + delay);
      return true;
    } catch (e) {
      console.warn('[sound]', name, e);
      return false;
    }
  }

  return {
    play,
    names: Object.keys(recipes),
    get enabled() {
      return enabled;
    },
    setEnabled(v) {
      enabled = !!v;
      storage.set('sound', enabled);
      if (enabled) ensure();
    },
  };
}

/* ---------------------------------- 存储 ---------------------------------- */
export function createStorage(prefix = 'lgj:') {
  const mem = new Map();
  const has = isBrowser && (() => {
    try {
      const k = prefix + '__t';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  })();
  return {
    get(key, def) {
      const k = prefix + key;
      try {
        const raw = has ? localStorage.getItem(k) : mem.get(k);
        if (raw == null) return def;
        return JSON.parse(raw);
      } catch {
        return def;
      }
    },
    set(key, val) {
      const k = prefix + key;
      try {
        const raw = JSON.stringify(val);
        if (has) localStorage.setItem(k, raw);
        else mem.set(k, raw);
      } catch {
        /* ignore quota */
      }
    },
    remove(key) {
      const k = prefix + key;
      try {
        if (has) localStorage.removeItem(k);
        else mem.delete(k);
      } catch {
        /* ignore */
      }
    },
    namespace(ns) {
      return createStorage(prefix + ns + ':');
    },
  };
}

/* ---------------------------------- 分享 ---------------------------------- */
async function share(text, { title = '来感觉 · 玄学占卜' } = {}) {
  if (!isBrowser) return 'failed';
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'failed';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return 'copied';
    } catch {
      return 'failed';
    }
  }
}

/* ---------------------------------- 组装 ---------------------------------- */
export function createPlatform() {
  const storage = createStorage();
  const motion = createMotion();
  const gesture = createGesture();
  const haptic = createHaptic(storage);
  const sound = createSound(storage);
  return {
    name: 'web',
    isIOS,
    isTouch: isBrowser && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window),
    prefersReducedMotion: isBrowser && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    motion,
    gesture,
    haptic,
    sound,
    storage,
    share,
  };
}
