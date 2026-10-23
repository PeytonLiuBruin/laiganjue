// 场景共用：材质、动画曲线、常用小部件（流苏、石台、文字牌）。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rock, canvasTexture, FONT, taperedTube } from '../organic.js';

export { THREE, RoundedBoxGeometry };
export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const ease = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const backOut = (t) => { t = clamp(t); const k = 1.7; return 1 + (k + 1) * (t - 1) ** 3 + k * (t - 1) ** 2; };
export const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));
/** 弹簧：返回 {x, v}，用于摆动与回弹。 */
export function spring(x = 0) { return { x, v: 0, step(target, k, c, dt) { const a = (target - this.x) * k - this.v * c; this.v += a * dt; this.x += this.v * dt; return this.x; } }; }

export const MAT = {
  gold: () => new THREE.MeshStandardMaterial({ color: '#e7b257', metalness: 1, roughness: .26 }),
  goldSoft: () => new THREE.MeshStandardMaterial({ color: '#d9a24a', metalness: .9, roughness: .4 }),
  bronze: () => new THREE.MeshStandardMaterial({ color: '#b07a45', metalness: .85, roughness: .38 }),
  jade: (color = '#46b98a') => new THREE.MeshPhysicalMaterial({ color, roughness: .22, metalness: 0, clearcoat: 1, clearcoatRoughness: .12, sheen: .4, sheenColor: new THREE.Color('#d7ffe9') }),
  silk: (color = '#d63a30') => new THREE.MeshPhysicalMaterial({ color, roughness: .55, metalness: 0, sheen: 1, sheenRoughness: .35, sheenColor: new THREE.Color('#ffb0a0') }),
  lacquer: (color = '#c2342b') => new THREE.MeshPhysicalMaterial({ color, roughness: .3, metalness: 0, clearcoat: .9, clearcoatRoughness: .18 }),
  ceramic: (color = '#c73a30') => new THREE.MeshPhysicalMaterial({ color, roughness: .18, metalness: 0, clearcoat: 1, clearcoatRoughness: .06 }),
  wood: (map = null, color = '#ffffff') => new THREE.MeshStandardMaterial({ color, map, roughness: .72, metalness: 0 }),
  stone: () => new THREE.MeshStandardMaterial({ vertexColors: true, color: '#ffe6c4', roughness: .93, metalness: 0 }),
  matte: (color) => new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: 0 }),
};

/** 水中的石台：顶面平整可放器物，水线以下颜色变深。返回 mesh，顶面高度 top。 */
export function plinth(api, { x = 0, z = 0, radius = 1.1, height = .5, seed = 3, top = -.98, moss = .45, scaleZ = .8 } = {}) {
  const waterY = api.water.y;
  const g = rock({ seed, radius: 1, height: 1, flatTop: .62, roughness: .26, detail: 5, mossAmount: moss, wetBelow: (waterY + .04 - (top - height * .62)) / height });
  const mesh = new THREE.Mesh(g, MAT.stone());
  mesh.scale.set(radius, height, radius * scaleZ);
  mesh.position.set(x, top - height * .62, z);
  api.shadows(mesh, true, true);
  mesh.userData.ground = true; // 石台不参与动作弹性
  return mesh;
}

/** 流苏：几十根丝线组成，上端金色束口，整体随风和动作摆动（摆动由外部旋转 group 实现）。 */
export function tassel({ length = .42, spread = .07, strands = 34, color = '#d63a30', capColor = null, seed = 1 } = {}) {
  const group = new THREE.Group();
  const strand = new THREE.CylinderGeometry(.0045, .006, length, 4, 1); strand.translate(0, -length / 2, 0);
  const mat = MAT.silk(color);
  const mesh = new THREE.InstancedMesh(strand, mat, strands);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1);
  let r = seed * 9301 + 49297;
  const rand = () => (r = (r * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < strands; i++) {
    const a = i / strands * Math.PI * 2 + rand() * .3, d = spread * (.3 + rand() * .7) / length;
    e.set(Math.sin(a) * d, 0, Math.cos(a) * d); q.setFromEuler(e); s.set(1, .88 + rand() * .14, 1);
    m.compose(new THREE.Vector3(Math.cos(a) * .012, 0, Math.sin(a) * .012), q, s); mesh.setMatrixAt(i, m);
  }
  const band = new THREE.Mesh(new THREE.CylinderGeometry(.03, .026, .05, 18), capColor ? MAT.gold() : MAT.gold());
  band.position.y = -.03;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.03, 16, 10), MAT.gold()); knob.position.y = .01;
  group.add(mesh, band, knob);
  group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return group;
}

/** 文字贴图：圆角底牌上的竖排或横排字。 */
export function textTexture(text, { w = 256, h = 256, size = 150, color = '#fff5df', bg = null, stroke = null, font = FONT, weight = 800, vertical = false } = {}) {
  return canvasTexture(w, h, (c) => drawText(c, w, h, text, { size, color, bg, stroke, font, weight, vertical }));
}
export function drawText(c, w, h, text, { size = 150, color = '#fff5df', bg = null, stroke = null, font = FONT, weight = 800, vertical = false } = {}) {
  c.clearRect(0, 0, w, h);
  if (bg) { c.fillStyle = bg; c.fillRect(0, 0, w, h); }
  c.font = `${weight} ${size}px ${font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  const chars = vertical ? [...text] : [text];
  chars.forEach((ch, i) => {
    const y = vertical ? h / 2 + (i - (chars.length - 1) / 2) * size * 1.05 : h / 2 + size * .04;
    if (stroke) { c.lineJoin = 'round'; c.lineWidth = size * .12; c.strokeStyle = stroke; c.strokeText(ch, w / 2, y); }
    c.fillStyle = color; c.fillText(ch, w / 2, y);
  });
}

/** 细绳：两点之间自然下垂的红绳（每帧可重建）。 */
export function cord(points, radius = .012, color = '#c8342c') {
  const mesh = new THREE.Mesh(taperedTube(points, radius, { radial: 6, segments: 24 }), MAT.silk(color));
  mesh.castShadow = true;
  mesh.userData.rebuild = (pts) => { mesh.geometry.dispose(); mesh.geometry = taperedTube(pts, radius, { radial: 6, segments: 24 }); };
  return mesh;
}
