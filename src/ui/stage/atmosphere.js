// 氛围：随皮肤变化的天空与雾、风场、随风飘的粒子（花瓣 / 落叶 / 金尘 / 微尘）、
// 岸边芦苇、浮萍荷叶、远山，以及只挂在指定材质上的柔光晕。
import * as THREE from 'three';
import { rng, noise, petalGeometry, leafGeometry, softDot, rock } from './organic.js';

/** 每套皮肤的天空、雾、水色与光照强度。 */
export const ATMOSPHERES = {
  paper:    { zenith: '#e6d3b3', horizon: '#f6e3c8', water: '#86a7a2', deep: '#55777a', sun: '#ffe2b0', skyGlow: '#ffe2b0', key: 2.4, hemi: .75, env: .55, exposure: 1.0, stars: 0, dark: false },
  celadon:  { zenith: '#bcd8c9', horizon: '#eaf2ea', water: '#7aa79c', deep: '#4b766f', sun: '#fff1d0', skyGlow: '#fff4dc', key: 2.3, hemi: .8, env: .55, exposure: 1.0, stars: 0, dark: false },
  ink:      { zenith: '#05060b', horizon: '#1f1d27', water: '#2a2f3e', deep: '#0b0d14', sun: '#f3d49a', skyGlow: '#6c74a8', key: 1.7, hemi: .35, env: .35, exposure: 1.05, stars: 1, dark: true },
  cinnabar: { zenith: '#140606', horizon: '#3d1915', water: '#3a2222', deep: '#140909', sun: '#ffb37a', skyGlow: '#b85a3a', key: 1.8, hemi: .38, env: .38, exposure: 1.05, stars: .6, dark: true },
  nebula:   { zenith: '#050616', horizon: '#26214f', water: '#2c2d58', deep: '#0b0b22', sun: '#d9ccff', skyGlow: '#7d6cf0', key: 1.6, hemi: .4, env: .38, exposure: 1.05, stars: 1, dark: true },
};
export function atmosphereFor(theme) { return ATMOSPHERES[theme] || ATMOSPHERES.paper; }

/** 天空穹顶：天顶到地平线的渐变、太阳方向的柔光，深色皮肤带闪烁星点。 */
export function createSky(atm) {
  const uniforms = {
    zenith: { value: new THREE.Color(atm.zenith) }, horizon: { value: new THREE.Color(atm.horizon) },
    sunDir: { value: new THREE.Vector3(-.5, .35, -.8).normalize() }, sunColor: { value: new THREE.Color(atm.skyGlow || atm.sun) },
    stars: { value: atm.stars }, time: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float stars; uniform float time;
      varying vec3 vDir;
      float hash(vec3 p){ p = fract(p*vec3(443.897,441.423,437.195)); p += dot(p,p.yzx+19.19); return fract((p.x+p.y)*p.z); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(horizon, zenith, smoothstep(-.02, .55, h));
        float s = max(dot(d, sunDir), 0.);
        col += sunColor * (pow(s, 6.) * .12 + pow(s, 48.) * .25);
        if (stars > 0.) {
          vec3 cell = floor(d * 260.);
          float st = step(.9965, hash(cell));
          float tw = .55 + .45 * sin(time * 2.3 + hash(cell + 3.1) * 40.);
          col += vec3(1., .96, .88) * st * tw * stars * smoothstep(.04, .35, h) * .9;
        }
        gl_FragColor = vec4(col, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(48, 32, 16), mat);
  mesh.renderOrder = -10; mesh.frustumCulled = false;
  return { mesh, update(t) { uniforms.time.value = t; } };
}

/** 风：基础风向缓慢摆动，叠加阵风。strength 约 0.2–1。 */
export function createWind(seed = 11) {
  const nz = noise(seed), dir = new THREE.Vector2(1, 0);
  const api = { dir, strength: .4, gust: 0, time: 0, push: 0,
    update(t, dt) {
      api.time = t;
      const a = -.25 + nz.n3(t * .05, 0, 0) * .6;
      dir.set(Math.cos(a), Math.sin(a));
      api.gust = Math.max(0, nz.n3(t * .35, 4, 0)) * .9;
      api.push = Math.max(0, api.push - dt * .8);
      api.strength = .3 + api.gust * .7 + api.push;
    },
    /** 动作触发时来一阵风（摇树、甩结）。 */
    blow(amount = .8) { api.push = Math.min(1.6, api.push + amount); },
    sway(phase = 0, speed = 1.3) { return Math.sin(api.time * speed + phase) * .5 * api.strength + api.gust * .35; },
  };
  return api;
}

/**
 * 飘浮粒子。kind：petals 花瓣、leaves 落叶（实体小片，随风翻转）；motes 金尘、dust 微尘（发光点）。
 * 粒子在一个盒子范围内循环，被风推着走，越出范围就从上风处重新出现。
 */
export function createParticles(kind, { count = 40, box = [6, 3.6, 4], center = [0, .4, 0], seed = 21, colors = null, glow = false } = {}) {
  const r = rng(seed), [bx, by, bz] = box;
  const items = Array.from({ length: count }, () => ({
    p: new THREE.Vector3(center[0] + (r() - .5) * bx, center[1] + (r() - .5) * by, center[2] + (r() - .5) * bz),
    v: new THREE.Vector3(), spin: new THREE.Vector3(r() * 6, r() * 6, r() * 6), rate: new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1),
    fall: .05 + r() * .12, phase: r() * 10, size: .6 + r() * .7, burst: 0,
  }));
  const solid = kind === 'petals' || kind === 'leaves';
  let object, update;
  if (solid) {
    const geo = kind === 'petals' ? petalGeometry({ length: .065, width: .05 }) : leafGeometry({ length: .1, width: .045, bend: .4 });
    const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .55, metalness: 0 });
    object = new THREE.InstancedMesh(geo, mat, count);
    object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const palette = (colors || (kind === 'petals' ? ['#ffc4cf', '#ff9fb2', '#fff0f2', '#ffb3c1'] : ['#7fb04a', '#b9c24a', '#d89a3a', '#6e9c3f'])).map(c => new THREE.Color(c));
    items.forEach((it, i) => object.setColorAt(i, palette[i % palette.length]));
    object.castShadow = false;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3();
    update = (dt, t, wind) => {
      items.forEach((it, i) => {
        const w = wind.strength;
        it.v.x += ((wind.dir.x * (.35 + w * .9)) - it.v.x) * Math.min(1, dt * 1.5);
        it.v.z += ((wind.dir.y * (.25 + w * .5)) - it.v.z) * Math.min(1, dt * 1.5);
        it.v.y = -it.fall + Math.sin(t * 1.7 + it.phase) * .08 + it.burst;
        it.burst = Math.max(0, it.burst - dt * 1.2);
        it.p.addScaledVector(it.v, dt);
        it.spin.addScaledVector(it.rate, dt * (1.2 + w * 2));
        wrap(it);
        e.set(it.spin.x, it.spin.y, it.spin.z); q.setFromEuler(e); s.setScalar(it.size);
        m.compose(it.p, q, s); object.setMatrixAt(i, m);
      });
      object.instanceMatrix.needsUpdate = true;
    };
  } else {
    const geo = new THREE.BufferGeometry(), pos = new Float32Array(count * 3), sizes = new Float32Array(count), phases = new Float32Array(count);
    items.forEach((it, i) => { sizes[i] = it.size; phases[i] = it.phase; });
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    const tint = new THREE.Color(colors?.[0] || (kind === 'motes' ? '#ffd27a' : '#ffffff'));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: softDot(64, .1) }, color: { value: tint }, time: { value: 0 }, scale: { value: 60 }, intensity: { value: kind === 'motes' ? 1.6 : .55 } }]),
      vertexShader: `attribute float size; attribute float phase; uniform float time; uniform float scale; varying float vTw;
        #include <fog_pars_vertex>
        void main(){ vec4 mvPosition = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mvPosition; vTw = .55 + .45 * sin(time * 2.2 + phase * 6.);
          gl_PointSize = size * scale / -mvPosition.z;
          #include <fog_vertex>
        }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 color; uniform float intensity; varying float vTw;
        #include <fog_pars_fragment>
        void main(){ vec4 tex = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color * intensity, tex.a * vTw);
          #include <fog_fragment>
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    if (glow) mat.userData.glow = true;
    object = new THREE.Points(geo, mat);
    object.frustumCulled = false;
    update = (dt, t, wind) => {
      mat.uniforms.time.value = t;
      items.forEach((it, i) => {
        it.v.x += ((wind.dir.x * (.12 + wind.strength * .35)) - it.v.x) * Math.min(1, dt);
        it.v.z += ((wind.dir.y * (.08 + wind.strength * .2)) - it.v.z) * Math.min(1, dt);
        it.v.y = Math.sin(t * .6 + it.phase) * .05 + (kind === 'motes' ? .03 : -.01) + it.burst;
        it.burst = Math.max(0, it.burst - dt * 1.5);
        it.p.addScaledVector(it.v, dt);
        wrap(it);
        pos[i * 3] = it.p.x; pos[i * 3 + 1] = it.p.y; pos[i * 3 + 2] = it.p.z;
      });
      geo.attributes.position.needsUpdate = true;
    };
  }
  function wrap(it) {
    const hx = bx / 2, hy = by / 2, hz = bz / 2;
    if (it.p.x > center[0] + hx) it.p.x -= bx; if (it.p.x < center[0] - hx) it.p.x += bx;
    if (it.p.z > center[2] + hz) it.p.z -= bz; if (it.p.z < center[2] - hz) it.p.z += bz;
    if (it.p.y < center[1] - hy) { it.p.y += by; it.p.x = center[0] - hx + r() * bx * .4; }
    if (it.p.y > center[1] + hy) it.p.y -= by;
  }
  return {
    object, kind, count,
    update,
    /** 从某点向外迸散（开箱、落印、摇树时用）。 */
    burst(at, power = 1) {
      items.forEach((it, i) => {
        if (i % 2) return;
        it.p.set(at[0] + (r() - .5) * .5, at[1] + r() * .3, at[2] + (r() - .5) * .4);
        it.v.set((r() - .5) * 1.4 * power, 0, (r() - .5) * .8 * power);
        it.burst = (.4 + r() * .8) * power;
      });
    },
    setVisible(v) { object.visible = v; },
  };
}

/** 芦苇：细长叶片，顶点着色器里随风弯曲，越靠上弯得越多。 */
export function createReeds({ spots = [[-2.2, -1.25, -.6]], perSpot = 14, seed = 31, height = 1.1, color = '#7b8f4e' } = {}) {
  const r = rng(seed);
  const blade = new THREE.PlaneGeometry(.035, 1, 1, 6); blade.translate(0, .5, 0);
  const p = blade.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) * (1 - y * .85)); }
  const mat = new THREE.MeshStandardMaterial({ color, side: THREE.DoubleSide, roughness: .8 });
  const uniforms = { time: { value: 0 }, wind: { value: .4 } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = 'uniform float time; uniform float wind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float ph = instanceMatrix[3].x * 2.1 + instanceMatrix[3].z * 1.3;
      float bend = position.y * position.y;
      transformed.x += bend * (wind * .22 + sin(time * 1.6 + ph) * .05 * (.5 + wind));
      transformed.z += bend * sin(time * 1.1 + ph * 1.7) * .03;`);
  };
  const n = spots.length * perSpot;
  const mesh = new THREE.InstancedMesh(blade, mat, n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
  let k = 0;
  for (const [x, y, z] of spots) for (let i = 0; i < perSpot; i++) {
    e.set((r() - .5) * .25, r() * Math.PI, (r() - .5) * .3); q.setFromEuler(e);
    s.set(1, height * (.55 + r() * .6), 1);
    m.compose(new THREE.Vector3(x + (r() - .5) * .45, y, z + (r() - .5) * .35), q, s); mesh.setMatrixAt(k++, m);
  }
  mesh.castShadow = false;
  return { object: mesh, update(t, wind) { uniforms.time.value = t; uniforms.wind.value = wind.strength; } };
}

/** 荷叶：带缺口、边缘微翘的圆叶，在水面轻轻起伏。 */
export function createLilyPads({ pads = [[1.6, .6, .32]], seed = 41, color = '#5d8f45', flower = true } = {}) {
  const r = rng(seed), group = new THREE.Group(), items = [];
  const mat = new THREE.MeshStandardMaterial({ color, roughness: .45, side: THREE.DoubleSide });
  for (const [x, z, size] of pads) {
    const g = new THREE.CircleGeometry(1, 40, .22, Math.PI * 2 - .44); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const d = Math.hypot(p.getX(i), p.getZ(i)); p.setY(i, d ** 4 * .08 + Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 5) * d ** 3 * .02); }
    g.computeVertexNormals();
    const pad = new THREE.Mesh(g, mat); pad.scale.setScalar(size); pad.position.set(x, 0, z); pad.rotation.y = r() * 6.28;
    group.add(pad); items.push({ mesh: pad, phase: r() * 6 });
  }
  if (flower) {
    const petal = petalGeometry({ length: .16, width: .085, cup: .9 });
    const pm = new THREE.MeshStandardMaterial({ color: '#ffd4de', roughness: .5, side: THREE.DoubleSide });
    const lotus = new THREE.Group();
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(petal, pm); const a = i / 7 * Math.PI * 2 + ring * .45;
      m.rotation.set(0, 0, 0); m.rotateY(a); m.rotateX(-(.35 + ring * .5)); m.scale.setScalar(1 - ring * .25);
      lotus.add(m);
    }
    const heart = new THREE.Mesh(new THREE.SphereGeometry(.035, 12, 8), new THREE.MeshStandardMaterial({ color: '#f2c94c', roughness: .6 }));
    heart.position.y = .03; lotus.add(heart);
    const [x, z] = pads[0]; lotus.position.set(x - .05, .02, z + .02); lotus.scale.setScalar(.9);
    group.add(lotus); items.push({ mesh: lotus, phase: 1.3 });
  }
  return { object: group, update(t) { for (const it of items) { it.mesh.position.y = Math.sin(t * .9 + it.phase) * .006 + (it.mesh.isGroup ? .02 : 0); it.mesh.rotation.z = Math.sin(t * .7 + it.phase) * .02; } } };
}

/** 远山：雾里几座低矮山影，给画面纵深。 */
export function createMountains(atm, seed = 51) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const tone = new THREE.Color(atm.dark ? '#2b2c38' : '#8f9a96');
  [[-9, -20, 6, 2.4], [-2, -24, 8, 3.2], [7, -21, 6.5, 2.6], [14, -26, 9, 3.6]].forEach(([x, z, w, h], i) => {
    const g = rock({ seed: seed + i, radius: 1, height: 1, flatTop: 2, roughness: .45, detail: 3, stone: '#' + tone.getHexString(), dark: '#' + tone.clone().multiplyScalar(.7).getHexString(), mossAmount: 0 });
    const m = new THREE.Mesh(g, mat); m.scale.set(w, h, w * .4); m.position.set(x, -1.5, z); group.add(m);
  });
  return { object: group };
}

/**
 * 指定发光：只给传入的物体挂一个加色光晕精灵，并调它材质的 emissiveIntensity。
 * 场景里只有登记过的材质会发光，其余一律不自发光。
 */
export function createGlowRegistry(parent = null) {
  const tex = softDot(128, 0);
  const entries = new Map();
  return {
    texture: tex,
    add(key, { object = null, materials = [], color = '#ffd27a', size = .6, base = 0, peak = 1.6, haloAt = null } = {}) {
      let sprite = null;
      if (object || haloAt) {
        sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: true }));
        sprite.scale.setScalar(size); sprite.material.userData.glow = true;
        if (haloAt) sprite.position.set(...haloAt);
        (object || parent)?.add(sprite);
      }
      for (const m of materials) { m.userData.glow = true; if (!m.emissive) continue; m.emissive.set(color); m.emissiveIntensity = base; }
      const e = { sprite, materials, base, peak, value: 0, size };
      entries.set(key, e);
      return e;
    },
    /** v 为 0–1：0 时只保留 base，1 时达到 peak。 */
    set(key, v) {
      const e = entries.get(key); if (!e) return; e.value = v;
      for (const m of e.materials) if (m.emissive) m.emissiveIntensity = e.base + (e.peak - e.base) * v;
      if (e.sprite) { e.sprite.material.opacity = Math.min(1, v) * .5; e.sprite.visible = v > .01; }
    },
    get(key) { return entries.get(key)?.value || 0; },
    keys() { return [...entries.keys()]; },
  };
}
