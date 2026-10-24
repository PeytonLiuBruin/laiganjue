// 3D 器物舞台：WebGL 渲染、柔和电影感光照、远景雾、倒影水面、风与飘浮粒子、指定材质发光、帧率显示。
// 对外与旧版画布渲染器同一套接口：set(state) / dispose()，由 models/index.js 在支持 WebGL 时选用。
// 舞台在槽位第一次真正可见时才在下一帧初始化（隐藏的那一个不建），初始化失败就换成画布渲染。
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { atmosphereFor, createSky, createWind, createParticles, createReeds, createLilyPads, createMountains, createGlowRegistry } from './atmosphere.js';
import { createWater } from './water.js';
import { toonifyScene, setRimColor } from './toon.js';
import { SCENES } from './scenes/index.js';
import { createBounce, createStarBurst } from './bounce.js';

let webgl = null;
/** 只探测一次（three.js 需要 WebGL2），探测用的上下文立即释放。 */
export function webglAvailable() {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    webgl = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { webgl = false; }
  return webgl;
}
export const hasStageScene = (id) => !!SCENES[id];
/** ?render=canvas 或 localStorage lgj.render=canvas 时强制使用旧版画布渲染（测试与排错用）。 */
export function stageDisabled() {
  try { return /[?&]render=canvas\b/.test(location.search) || localStorage.getItem('lgj.render') === 'canvas'; } catch { return false; }
}

const QUALITY = [
  { ratio: 2, reflect: .5, shadow: 1024, particles: 1 },
  { ratio: 1.5, reflect: .42, shadow: 1024, particles: 1 },
  { ratio: 1.25, reflect: .35, shadow: 512, particles: .7 },
  { ratio: 1, reflect: .28, shadow: 512, particles: .5 },
];

export function createStage(el, ctx, id, fallbackFactory = null) {
  const def = SCENES[id];
  if (!def) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'model-canvas stage-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.dataset.phase = 'idle';
  const fpsEl = document.createElement('span');
  fpsEl.className = 'stage-fps'; fpsEl.setAttribute('aria-hidden', 'true'); fpsEl.textContent = '-- FPS';
  el.replaceChildren(canvas, fpsEl);
  el.classList.add('has-stage');
  el.dataset.renderer = 'webgl';

  let alive = true, core = null, fallback = null, queued = false;
  let pending = {}, speed = 1;
  const shown = () => {
    if (!el.isConnected || el.closest('[hidden]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  function swapToFallback(error) {
    console.warn('[stage] WebGL 舞台不可用，改用画布渲染', id, error);
    core?.dispose(); core = null;
    el.replaceChildren(); el.classList.remove('has-stage'); el.dataset.renderer = 'canvas';
    fallback = fallbackFactory?.() || null;
    fallback?.set(pending);
  }
  function init() {
    if (!alive || core || fallback) return;
    try { core = buildCore(el, ctx, def, canvas, fpsEl); core.set(pending); core.setSpeed(speed); el.dataset.ready = '1'; }
    catch (e) { swapToFallback(e); }
  }
  function request() {
    if (!alive || core || fallback || queued || !shown()) return;
    queued = true;
    requestAnimationFrame(() => setTimeout(() => { queued = false; if (shown()) init(); }, 30));
  }
  const resizeObserver = new ResizeObserver(() => { if (core) core.resize(); else request(); });
  resizeObserver.observe(el);
  const intersection = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
    const visible = entries[entries.length - 1]?.isIntersecting !== false;
    if (core) core.setVisible(visible); else if (visible) request();
  }, { rootMargin: '120px' }) : null;
  intersection?.observe(el);
  const onVisibility = () => core?.setPageVisible(!document.hidden);
  document.addEventListener('visibilitychange', onVisibility);
  const onTheme = () => core?.applyAtmosphere();
  ctx.onTheme?.(onTheme);
  request();

  const stage = {
    renderer: 'webgl',
    set(next) {
      if (!alive) return;
      pending = { ...pending, ...next };
      if (core) core.set(next);
      else if (fallback) fallback.set(next);
      else {
        canvas.dataset.phase = pending.active ? 'active' : pending.revealed || pending.glow ? 'revealed' : 'idle';
        request();
      }
    },
    /** 快进：动画时间按 factor 倍速推进（1 为正常）。 */
    setSpeed(factor = 1) { speed = Math.max(.25, Math.min(4, Number(factor) || 1)); core?.setSpeed(speed); },
    get speed() { return speed; },
    /** 测试与截图用：立即初始化（如未初始化），按固定步长推进 seconds 秒并渲染一帧。 */
    advance(seconds = 1) { if (!core && !fallback) init(); core?.advance(seconds); },
    /** 截图用：停住实时动画，画面保持在 advance 推进到的那一帧。 */
    freeze() { core?.freeze(); },
    /** 分享卡用：返回当前画面的 2D 画布副本（WebGL 渲染后同一任务里立即拷贝，不需要 preserveDrawingBuffer）。 */
    snapshot() {
      if (core) return core.snapshot();
      const c = el.querySelector('canvas');
      return c && c.width > 1 ? c : null;
    },
    get time() { return core?.time || 0; },
    get fps() { return core?.fps || 0; },
    get quality() { return core?.level ?? -1; },
    get ready() { return !!core; },
    inspect() { return core?.inspect() || null; },
    dispose() {
      if (!alive) return; alive = false;
      resizeObserver.disconnect(); intersection?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      core?.dispose(); fallback?.dispose?.();
      fpsEl.remove(); el.classList.remove('has-stage');
    },
  };
  el.__stage = stage;
  return stage;
}

function buildCore(el, ctx, def, canvas, fpsEl) {
  const root = document.documentElement;
  let atm = atmosphereFor(root.dataset.theme);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, stencil: false, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const reduced = !!ctx.platform?.prefersReducedMotion;
  const gentle = reduced || !!ctx.platform?.simpleMotion;
  const deviceRatio = Math.min(window.devicePixelRatio || 1, 2);
  const minLevel = deviceRatio < 1.6 ? 2 : 0;
  let level = minLevel;
  const quality = () => QUALITY[level];

  const scene = new THREE.Scene();
  const fogBase = def.fog || [8, 24];
  const [fogNear, fogFar] = fogBase.map((v) => v * (atm.fogScale || 1));
  scene.fog = new THREE.Fog(atm.horizon, fogNear, fogFar);
  const cam = def.camera || {};
  const camera = new THREE.PerspectiveCamera(cam.fov || 30, 1, .05, 90);
  const camBase = new THREE.Vector3(...(cam.position || [0, .55, 7.4]));
  const camTarget = new THREE.Vector3(...(cam.target || [0, -.05, 0]));

  // 柔和的室内环境光照（金属反光、釉面高光都靠它）
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envTex = pmrem.fromScene(roomEnv, .04).texture;
  roomEnv.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
  pmrem.dispose();
  scene.environment = envTex;

  const sky = createSky(atm); scene.add(sky.mesh);
  const water = createWater(atm, { y: def.waterY ?? -1.25, renderer }); water.setFog(fogNear, fogFar); scene.add(water.object);
  // 主光暖、轮廓光冷、天光地光补暗部，阴影柔边
  const hemi = new THREE.HemisphereLight(atm.hemiSky || '#fff6e8', atm.hemiGround || atm.water, atm.hemi); scene.add(hemi);
  const key = new THREE.DirectionalLight(atm.sun, atm.key);
  key.position.set(-3.2, 5.6, 4.4); key.castShadow = true;
  Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: .5, far: 16 });
  key.shadow.mapSize.set(quality().shadow, quality().shadow); key.shadow.bias = -.0004; key.shadow.normalBias = .025; key.shadow.radius = 5;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#cfe0ff', atm.rimLight ?? (atm.dark ? 1.1 : .8)); rim.position.set(2.6, 2.4, -5); scene.add(rim);

  const wind = createWind();
  const world = new THREE.Group(); scene.add(world);
  const glow = createGlowRegistry(world);
  const ambient = [];
  let shakeAmt = 0;
  const api = {
    THREE, scene, world, camera, renderer, wind, water, glow, gentle, reduced,
    get atm() { return atm; },
    particles(kind, opts = {}) {
      const count = Math.max(6, Math.round((opts.count || 40) * quality().particles * (gentle ? .6 : 1)));
      const p = createParticles(kind, { ...opts, count });
      scene.add(p.object); ambient.push(p); return p;
    },
    reeds(opts) { const r = createReeds(opts); scene.add(r.object); ambient.push({ update: (dt, t, w) => r.update(t, w) }); return r; },
    lilies(opts) { const l = createLilyPads(opts); l.object.position.y = water.y; scene.add(l.object); ambient.push({ update: (dt, t) => l.update(t) }); return l; },
    mountains() { const m = createMountains(atm); scene.add(m.object); return m; },
    /** 投影与受影：把场景物体统一打开阴影。 */
    shadows(object, cast = true, receive = true) { object.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } }); return object; },
    shake(amount = .04) { shakeAmt = Math.max(shakeAmt, amount); },
    /** 把 world 里除石台（userData.ground）与 except 以外的物体收进一个组，作为整体做动作弹性的主角。 */
    gather({ except = [] } = {}) {
      const g = new THREE.Group();
      for (const o of [...world.children]) if (!o.userData.ground && !except.includes(o)) g.add(o);
      world.add(g); return g;
    },
  };
  const built = def.build(api);
  // 手游卡通风格：三段明暗、硬高光、边缘光、描边（天空与水面不处理）
  const toon = toonifyScene(scene, { rimColor: atm.rim, outlineRoot: world, skip: (o) => o === sky.mesh || o === water.object });
  built.onQuality?.(level);
  // 动作弹性与揭晓金星（主角由场景的 hero 指定，pivot 是主角自身坐标里不动的高度）
  const heroes = [].concat(built.hero || []).map((h) => (h.isObject3D ? { object: h, pivot: def.pivot || 0 } : h));
  const bounce = createBounce(heroes, { amount: (reduced ? 0 : gentle ? .5 : 1) * (def.bounce ?? 1) });
  const stars = createStarBurst({ count: gentle ? 10 : 18 });
  scene.add(stars.object);
  const heroBox = new THREE.Box3(), heroCenter = new THREE.Vector3();
  function revealBurst() {
    if (reduced || !heroes.length) return;
    heroBox.makeEmpty();
    for (const h of heroes) heroBox.expandByObject(h.object);
    if (heroBox.isEmpty()) return;
    heroBox.getCenter(heroCenter); heroCenter.y = heroBox.min.y + (heroBox.max.y - heroBox.min.y) * .6;
    stars.burst(heroCenter, Math.min(1.2, heroBox.max.x - heroBox.min.x));
  }

  let alive = true, frozen = false, frame = 0, last = null, time = 0, visible = true, pageVisible = !document.hidden, width = 320, height = 320;
  let state = {}, tilt = { x: 0, y: 0 }, targetTilt = { x: 0, y: 0 }, wakeUntil = 2;
  let frames = 0, acc = 0, slow = 0, fast = 0, fps = 0, compiled = false, speed = 1;

  function applyAtmosphere() {
    atm = atmosphereFor(root.dataset.theme);
    scene.fog.color.set(atm.horizon);
    scene.fog.near = fogBase[0] * (atm.fogScale || 1); scene.fog.far = fogBase[1] * (atm.fogScale || 1); water.setFog(scene.fog.near, scene.fog.far);
    const su = sky.mesh.material.uniforms; su.zenith.value.set(atm.zenith); su.horizon.value.set(atm.horizon); su.sunColor.value.set(atm.skyGlow || atm.sun); su.stars.value = atm.stars;
    const wu = water.object.material.uniforms; wu.shallow.value.set(atm.water); wu.deep.value.set(atm.deep); wu.fogColor.value.set(atm.horizon); wu.sunColor.value.set(atm.sun); wu.reflectivity.value = atm.dark ? .75 : .85;
    hemi.color.set(atm.hemiSky || '#fff6e8'); hemi.groundColor.set(atm.hemiGround || atm.water); hemi.intensity = atm.hemi; key.color.set(atm.sun); key.intensity = atm.key; rim.intensity = atm.rimLight ?? (atm.dark ? 1.1 : .8);
    setRimColor(scene, atm.rim || '#fff4d6');
    scene.traverse((o) => o.userData.tint?.(atm));
    scene.environmentIntensity = atm.env; renderer.toneMappingExposure = atm.exposure;
    built.onTheme?.(atm);
    wake();
  }
  function resize() {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) { width = r.width; height = r.height; }
    const q = quality(), ratio = Math.min(deviceRatio, q.ratio);
    renderer.setPixelRatio(ratio); renderer.setSize(width, height, false);
    stars.object.material.uniforms.scale.value = 200 * ratio;
    water.setSize(width * ratio * q.reflect, height * ratio * q.reflect);
    camera.aspect = width / height;
    // 窄屏时后退一点，让器物完整入画
    camera.userData.pull = camera.aspect < 1 ? Math.pow(1 / camera.aspect, .9) : 1;
    camera.updateProjectionMatrix();
    canvas.dataset.quality = String(level);
    wake();
  }
  function adapt(fpsNow) {
    // 连续偏慢就降一档画质（像素比、倒影分辨率、阴影、粒子），持续流畅再升回去。
    if (fpsNow < 42) { slow++; fast = 0; } else if (fpsNow > 57) { fast++; slow = 0; } else { slow = fast = 0; }
    if (slow >= 3 && level < QUALITY.length - 1) {
      level++; slow = 0; resize();
      key.shadow.mapSize.set(quality().shadow, quality().shadow); key.shadow.map?.dispose(); key.shadow.map = null;
      built.onQuality?.(level);
    } else if (fast >= 12 && level > minLevel) { level--; fast = 0; resize(); built.onQuality?.(level); }
  }
  function running() { return alive && !frozen && compiled && visible && pageVisible && el.isConnected && !el.closest('[hidden]'); }
  function schedule() { if (!frame && running()) frame = requestAnimationFrame(tick); }
  function wake(seconds = 2.5) { wakeUntil = Math.max(wakeUntil, time + seconds); schedule(); }
  function step(dt) {
    time += dt;
    wind.update(time, dt); sky.update(time); water.update(time, wind);
    for (const a of ambient) a.update(dt, time, wind);
    bounce.restore();
    built.update(dt, time, state, api);
    bounce.apply(time);
    stars.update(dt);
    const k = 1 - Math.exp(-6 * dt);
    tilt.x += (targetTilt.x - tilt.x) * k; tilt.y += (targetTilt.y - tilt.y) * k;
    const pull = camera.userData.pull || 1;
    shakeAmt = Math.max(0, shakeAmt - dt * .25);
    const sh = shakeAmt * Math.sin(time * 55);
    camera.position.set(camBase.x * pull + tilt.x * .32 + sh, camBase.y + tilt.y * -.16 + sh * .5, camBase.z * pull);
    camera.lookAt(camTarget);
  }
  function render() { renderer.render(scene, camera); }
  function tick(now) {
    frame = 0;
    if (!running()) { last = null; return; }
    const real = last === null ? 1 / 60 : Math.min(.1, (now - last) / 1000);
    last = now;
    step(Math.min(real, 1 / 20) * speed);
    render();
    frames++; acc += real;
    if (acc >= .5) {
      fps = Math.round(frames / acc); frames = 0; acc = 0;
      fpsEl.textContent = `${fps} FPS`; canvas.dataset.fps = String(fps);
      adapt(fps);
    }
    // 系统要求减少动态效果时，只在有动作或刚变化后的几秒内刷新
    if (!reduced || state.active || time < wakeUntil) schedule();
  }

  const move = (e) => { if (gentle) return; const r = el.getBoundingClientRect(); targetTilt = { x: Math.max(-1, Math.min(1, (e.clientX - r.left) / r.width * 2 - 1)), y: Math.max(-1, Math.min(1, (e.clientY - r.top) / r.height * 2 - 1)) }; wake(); };
  const leave = () => { targetTilt = { x: 0, y: 0 }; wake(); };
  el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
  const offTilt = ctx.motion?.onTilt?.(({ gamma, beta }) => { if (gentle || gamma == null || beta == null) return; targetTilt = { x: Math.max(-1, Math.min(1, gamma / 35)), y: Math.max(-1, Math.min(1, (beta - 35) / 50)) }; wake(); });
  const onLost = (e) => { e.preventDefault(); canvas.dataset.lost = '1'; };
  canvas.addEventListener('webglcontextlost', onLost);
  applyAtmosphere();
  resize();
  step(1 / 60);
  // 着色器在后台并行编译（支持时），编完再出第一帧，避免卡住界面
  const parallel = typeof renderer.compileAsync === 'function' && renderer.extensions.has('KHR_parallel_shader_compile');
  const compiling = parallel ? renderer.compileAsync(scene, camera).catch(() => {}) : new Promise((r) => setTimeout(() => { try { renderer.compile(scene, camera); } catch {} r(); }, 0));
  compiling.then(() => { if (!alive) return; compiled = true; render(); el.dataset.compiled = '1'; last = null; schedule(); });

  return {
    get time() { return time; }, get fps() { return fps; }, get level() { return level; },
    resize, applyAtmosphere,
    setVisible(v) { visible = v; if (v) { last = null; schedule(); } else { cancelAnimationFrame(frame); frame = 0; last = null; } },
    setPageVisible(v) { pageVisible = v; if (v) { last = null; schedule(); } else { cancelAnimationFrame(frame); frame = 0; last = null; } },
    set(next) {
      const prev = state;
      state = { ...state, ...next };
      if (next.active && !prev.active) { state.since = time; bounce.trigger(time); }
      if (next.revealed && !prev.revealed) { state.revealedAt = time; bounce.reveal(time); revealBurst(); }
      canvas.dataset.phase = state.active ? 'active' : state.revealed || state.glow ? 'revealed' : 'idle';
      if (next.angle != null) canvas.dataset.angle = String(next.angle);
      if (next.progress != null) canvas.dataset.progress = String(Math.max(0, Math.min(1, next.progress)));
      if (next.result !== undefined) canvas.dataset.result = next.result || '';
      if (next.pillars) canvas.dataset.pillars = next.pillars.map((p) => p.gan + p.zhi).join(' ');
      built.onState?.(prev, state, api);
      wake(state.active ? 6 : 3);
    },
    freeze() { frozen = true; cancelAnimationFrame(frame); frame = 0; },
    setSpeed(v) { speed = v; canvas.dataset.speed = String(v); },
    snapshot() {
      if (!compiled || canvas.width < 2) return null;
      render();
      const out = document.createElement('canvas');
      out.width = canvas.width; out.height = canvas.height;
      out.getContext('2d').drawImage(canvas, 0, 0);
      return out;
    },
    advance(seconds = 1) { const n = Math.max(1, Math.round(seconds * 60)); for (let i = 0; i < n; i++) step(1 / 60); render(); compiled = true; },
    /** 测试用：报告场景用到的氛围与材质，确认只有登记过的材质在发光。 */
    inspect() {
      const mats = new Set(); let meshes = 0;
      scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isSprite || o.isLine) { if (o.isMesh) meshes++; for (const m of [].concat(o.material)) mats.add(m); } });
      const glowing = [...mats].filter((m) => (m.emissive && m.emissive.getHex() !== 0 && m.emissiveIntensity > 0) || m.blending === THREE.AdditiveBlending);
      const rt = water.object.getRenderTarget();
      return {
        fog: [scene.fog.near, scene.fog.far], water: !!water.object.isReflector, reflection: [rt.width, rt.height],
        particles: ambient.filter((a) => a.kind).map((a) => `${a.kind}:${a.count}`), glow: glow.keys(),
        undesignated: glowing.filter((m) => !m.userData.glow).map((m) => m.type), glowing: glowing.length,
        meshes, toon, heroes: bounce.count, bounce: bounce.sample(time), stars: stars.active, toneMapping: renderer.toneMapping, shadows: renderer.shadowMap.enabled, quality: level,
        calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      };
    },
    dispose() {
      if (!alive) return; alive = false;
      cancelAnimationFrame(frame);
      el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('webglcontextlost', onLost);
      if (typeof offTilt === 'function') offTilt();
      built.dispose?.();
      const seen = new Set();
      scene.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        for (const m of [].concat(o.material || [])) {
          if (seen.has(m)) continue; seen.add(m);
          for (const v of Object.values(m)) if (v?.isTexture && !seen.has(v)) { seen.add(v); v.dispose(); }
          for (const u of Object.values(m.uniforms || {})) if (u?.value?.isTexture && !seen.has(u.value)) { seen.add(u.value); u.value.dispose(); }
          m.dispose();
        }
      });
      water.dispose(); envTex.dispose(); glow.texture.dispose();
      renderer.dispose(); renderer.forceContextLoss();
      canvas.width = 1; canvas.height = 1;
    },
  };
}
