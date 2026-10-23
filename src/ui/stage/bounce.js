// 器物动作弹性（visual-direction.md 第 2 节「动效」）：
// 触发动作时「预备压扁 8% → 冲起 → 过冲拉长 12% → 阻尼 0.35 回弹」，揭晓时整体放大 1.08 再弹回 1，同时迸出一圈卡通金星。
// 弹性只叠加在场景每帧算好的姿态上：每帧更新前先还原，更新后再叠加，场景自己的缩放与位移动画不受影响。
import * as THREE from 'three';

export const BOUNCE = {
  squash: .08,       // 预备压扁
  stretch: .12,      // 过冲拉长
  zeta: .35,         // 回弹阻尼比
  freq: 2.6,         // 回弹频率（赫兹）
  windup: .14,       // 预备时长
  launch: .14,       // 从压扁冲到过冲的时长
  pop: .08,          // 揭晓放大
  popRise: .12,      // 放大到峰值的时长
  settle: 1.3,       // 超过这个时长视为静止
};
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const omega = () => 2 * Math.PI * BOUNCE.freq;
/** 阻尼振荡：从 amp 出发，按阻尼比 zeta 衰减回 0。 */
function ring(amp, t) {
  const w = omega(), z = BOUNCE.zeta, wd = w * Math.sqrt(1 - z * z);
  return amp * Math.exp(-z * w * t) * Math.cos(wd * t);
}

/** 动作开始后 t 秒的纵向伸缩量 q（负为压扁、正为拉长），纵向缩放 1+q。 */
export function squashAt(t) {
  const { squash, stretch, windup, launch, settle } = BOUNCE;
  if (!(t >= 0) || t >= settle) return 0;
  if (t < windup) return -squash * smooth(t / windup);
  if (t < windup + launch) { const k = smooth((t - windup) / launch); return -squash + (stretch + squash) * k; }
  return ring(stretch, t - windup - launch);
}
/** 揭晓后 t 秒的整体缩放倍数。 */
export function popAt(t) {
  const { pop, popRise, settle } = BOUNCE;
  if (!(t >= 0) || t >= settle) return 1;
  if (t < popRise) return 1 + pop * smooth(t / popRise);
  return 1 + ring(pop, t - popRise);
}
/** 体积守恒：纵向 1+q 时横向缩放。 */
export const sideScale = (q) => 1 / Math.sqrt(1 + q);

/**
 * entries：[{ object, pivot }]，pivot 是物体自身坐标里不动的那一点的高度（一般是底面，悬挂物是挂点）。
 * amount：0 关闭（系统要求减少动态效果），0.5 温和模式，1 完整。
 */
export function createBounce(entries, { amount = 1 } = {}) {
  const list = entries.filter((e) => e?.object).map((e) => ({ ...e, pivot: e.pivot || 0, base: null, applied: null }));
  let actionAt = -1e9, revealAt = -1e9;
  const up = new THREE.Vector3();
  return {
    get count() { return list.length; },
    trigger(time) { if (amount > 0) actionAt = time; },
    reveal(time) { if (amount > 0) revealAt = time; },
    /** 当前叠加量，测试与截图检查用。 */
    sample(time) { return { q: squashAt(time - actionAt) * amount, pop: 1 + (popAt(time - revealAt) - 1) * amount }; },
    /** 场景更新前：把上一帧叠加的弹性还原（场景本帧改过的值以场景为准）。 */
    restore() {
      for (const e of list) {
        if (!e.applied) continue;
        const o = e.object;
        if (o.scale.equals(e.applied.scale)) o.scale.copy(e.base.scale);
        if (o.position.equals(e.applied.position)) o.position.copy(e.base.position);
        e.applied = null;
      }
    },
    /** 场景更新后：在场景姿态上叠加压扁、拉长与放大。 */
    apply(time) {
      const { q, pop } = this.sample(time);
      if (q === 0 && pop === 1) return false;
      const sy = (1 + q) * pop, sx = sideScale(q) * pop;
      for (const e of list) {
        const o = e.object;
        e.base = { scale: o.scale.clone(), position: o.position.clone() };
        o.scale.set(e.base.scale.x * sx, e.base.scale.y * sy, e.base.scale.z * sx);
        // 让 pivot 那一点保持不动：位置沿物体自身的上方向补偿
        up.set(0, 1, 0).applyQuaternion(o.quaternion);
        o.position.addScaledVector(up, e.pivot * (e.base.scale.y - o.scale.y));
        e.applied = { scale: o.scale.clone(), position: o.position.clone() };
      }
      return true;
    },
  };
}

function starTexture() {
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  const star = (r1, r2) => { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? r2 : r1; g.lineTo(s / 2 + Math.cos(a) * r, s / 2 + Math.sin(a) * r); } g.closePath(); };
  g.lineJoin = 'round';
  star(28, 13); g.fillStyle = '#a85a0c'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#a85a0c'; g.stroke();
  star(24, 10.5); g.fillStyle = '#ffd23f'; g.fill();
  g.beginPath(); g.ellipse(s / 2 - 4, s / 2 - 7, 4, 6, -.5, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,235,.95)'; g.fill();
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 揭晓金星：一圈有深色描边的卡通五角星从器物中心向外上方迸出、落下、缩小消失（普通混合，不算发光）。 */
export function createStarBurst({ count = 18, life = 1.1 } = {}) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3), size = new Float32Array(count), alpha = new Float32Array(count);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, scale: { value: 70 } }]),
    vertexShader: `attribute float size; attribute float alpha; uniform float scale; varying float vA;
      #include <fog_pars_vertex>
      void main(){ vec4 mvPosition = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mvPosition; vA = alpha;
        gl_PointSize = size * scale / -mvPosition.z;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform sampler2D map; varying float vA;
      #include <fog_pars_fragment>
      void main(){ vec4 tex = texture2D(map, gl_PointCoord); if (tex.a * vA < .02) discard; gl_FragColor = vec4(tex.rgb, tex.a * vA);
        #include <fog_fragment>
        #include <colorspace_fragment>
      }`,
  });
  mat.uniforms.map.value = typeof document !== 'undefined' ? starTexture() : null;
  mat.userData.noToon = true;
  const object = new THREE.Points(geo, mat);
  object.frustumCulled = false; object.visible = false; object.renderOrder = 5;
  const items = Array.from({ length: count }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), age: life, size: 1 }));
  let alive = 0;
  return {
    object, kind: null,
    burst(center, radius = .5) {
      items.forEach((it, i) => {
        const a = i / count * Math.PI * 2 + (i % 2) * .17, up = .35 + (i % 3) * .22, speed = 1.5 + (i % 4) * .28;
        it.p.set(center.x + Math.cos(a) * radius * .3, center.y, center.z + Math.sin(a) * radius * .3);
        it.v.set(Math.cos(a) * speed, 1.4 + up * 2.2, Math.sin(a) * speed * .6);
        it.age = -(i % 3) * .03; it.size = .7 + (i % 5) * .12;
      });
      alive = count; object.visible = true;
    },
    update(dt) {
      if (!alive) return;
      alive = 0;
      items.forEach((it, i) => {
        it.age += dt;
        const k = it.age / life;
        if (k < 1) alive++;
        if (it.age >= 0 && k < 1) {
          it.v.y -= 4.2 * dt; it.v.multiplyScalar(Math.exp(-1.6 * dt));
          it.p.addScaledVector(it.v, dt);
        }
        pos[i * 3] = it.p.x; pos[i * 3 + 1] = it.p.y; pos[i * 3 + 2] = it.p.z;
        const on = it.age >= 0 && k < 1;
        // 先弹大再慢慢缩小，最后 25% 淡出
        size[i] = on ? it.size * Math.min(1, it.age / .08) * (1 - .45 * k) : 0;
        alpha[i] = on ? Math.min(1, (1 - k) / .25) : 0;
      });
      geo.attributes.position.needsUpdate = geo.attributes.size.needsUpdate = geo.attributes.alpha.needsUpdate = true;
      if (!alive) object.visible = false;
    },
    get active() { return alive; },
  };
}
