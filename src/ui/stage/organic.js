// 自然造型工具：噪声岩石、渐细枝干、编织绳环、叶片花瓣、体积云、方孔钱、元宝，以及画布文字贴图。
// 所有造型都是确定性的（固定种子），每次打开看到的是同一块石头、同一棵树。
import * as THREE from 'three';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function rng(seed = 1) {
  let a = seed >>> 0 || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function noise(seed = 1) {
  const n = new SimplexNoise({ random: rng(seed) });
  const n3 = (x, y, z) => n.noise3d(x, y, z);
  const fbm = (x, y, z, octaves = 4) => { let s = 0, a = .5, f = 1; for (let i = 0; i < octaves; i++) { s += a * n3(x * f, y * f, z * f); f *= 2.03; a *= .5; } return s; };
  return { n3, fbm };
}
const clamp01 = v => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/**
 * 岩石：细分二十面体按分形噪声起伏，顶面压平，可选水线以下变深、朝上的面带青苔。
 * 顶点色承担石色变化，材质只需开 vertexColors。
 */
export function rock({ seed = 1, radius = 1, height = .55, flatTop = .45, roughness = .32, detail = 5, stone = '#9a948a', dark = '#5d5852', moss = '#7d9a5a', mossAmount = .5, wetBelow = null } = {}) {
  const base = new THREE.IcosahedronGeometry(1, detail);
  base.deleteAttribute('normal'); base.deleteAttribute('uv');
  const g = mergeVertices(base);
  const pos = g.attributes.position, nz = noise(seed), v = new THREE.Vector3();
  const disp = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const big = nz.fbm(v.x * 1.1, v.y * 1.1, v.z * 1.1, 3), fine = nz.fbm(v.x * 4.2 + 9, v.y * 4.2, v.z * 4.2, 3);
    const r = 1 + big * roughness + fine * roughness * .28;
    disp[i] = big + fine * .3;
    let y = v.y * r * height;
    if (y > flatTop * height) y = flatTop * height + (y - flatTop * height) * .12 + fine * .015;
    pos.setXYZ(i, v.x * r * radius, y, v.z * r * radius);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal, colors = new Float32Array(pos.count * 3);
  const cs = new THREE.Color(stone), cd = new THREE.Color(dark), cm = new THREE.Color(moss), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(cs).lerp(cd, clamp01(.5 - disp[i] * 1.6) * .8);
    c.lerp(cm, smooth(.55, .9, nrm.getY(i)) * mossAmount * clamp01(.4 + nz.n3(pos.getX(i) * 3, 0, pos.getZ(i) * 3)));
    if (wetBelow != null && pos.getY(i) < wetBelow) c.multiplyScalar(.62);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * 卡通石台（手游里的小岛）：低细分二十面体 + 大块起伏，平面着色出现一块块切面，
 * 朝上的顶面是一整块亮草地，侧面是浅暖沙岩，每个切面明度微调像手绘，水线以下偏蓝变深。
 * 顶点色按面写（非索引几何），所以切面之间颜色是硬分界，不会糊成写实石纹。
 */
export const TOON_ROCK = { detail: 3, stone: '#f2dcab', dark: '#cf9f66', grass: '#86dc5c', grassEdge: '#5cbf4c', wet: '#6f9fb8', grassY: .3, grassTop: .86, edgeR: .66, jitter: .045 };
export function toonRock({ seed = 1, radius = 1, height = 1, flatTop = .62, roughness = .2, wetBelow = null, grass = 1, palette = TOON_ROCK } = {}) {
  const base = new THREE.IcosahedronGeometry(1, palette.detail);
  base.deleteAttribute('normal'); base.deleteAttribute('uv');
  const g0 = mergeVertices(base);
  const pos0 = g0.attributes.position, nz = noise(seed), v = new THREE.Vector3();
  const disp = new Float32Array(pos0.count);
  for (let i = 0; i < pos0.count; i++) {
    v.fromBufferAttribute(pos0, i).normalize();
    const big = nz.fbm(v.x * 1.1, v.y * 1.1, v.z * 1.1, 2);
    const r = 1 + big * roughness;
    disp[i] = big;
    let y = v.y * r * height;
    if (y > flatTop * height) y = flatTop * height + (y - flatTop * height) * .1;
    pos0.setXYZ(i, v.x * r * radius, y, v.z * r * radius);
  }
  const g = g0.toNonIndexed(); g0.dispose();
  g.computeVertexNormals(); // 非索引几何：每个面一条法线，即平面着色的切面
  const pos = g.attributes.position, nrm = g.attributes.normal, colors = new Float32Array(pos.count * 3);
  const cs = new THREE.Color(palette.stone), cd = new THREE.Color(palette.dark), cg = new THREE.Color(palette.grass), ce = new THREE.Color(palette.grassEdge), cw = new THREE.Color(palette.wet), c = new THREE.Color();
  const rand = rng(seed * 7 + 3), topY = flatTop * height;
  const band = wetBelow != null ? (wetBelow * height + topY) / 2 : topY * .1; // 侧面浅 / 深两段的分界
  for (let f = 0; f < pos.count; f += 3) {
    const ny = nrm.getY(f), cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
    const k = 1 + (rand() - .5) * 2 * palette.jitter;
    if (grass > 0 && ny > palette.grassY && cy > topY * palette.grassTop) {
      // 顶面草地（按面中心高度判断，草地和岩壁的分界是一圈连续的边）：外圈深一档，像手绘的草边
      const rr = Math.hypot((pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3, (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3) / radius;
      c.copy(rr > palette.edgeR ? ce : cg).multiplyScalar(1 + (k - 1) * .5);
    } else {
      // 侧面：上浅下深两段（不是连续渐变），切面明度微调
      c.copy(cy > band ? cs : cd).multiplyScalar(k);
      if (wetBelow != null && cy < wetBelow * height) c.lerp(cw, .45).multiplyScalar(.85);
    }
    for (let j = 0; j < 3; j++) colors.set([c.r, c.g, c.b], (f + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * 卡通远山（手游背景里的大块山形）：低段数圆锥按噪声歪一歪，平面着色，
 * 每座一个主峰加一个矮肩峰，山顶一圈浅色峰帽，山脚深一档，中间切面明度微调。
 * 顶点色按面写（非索引），颜色硬分界。参数见 visual-direction.md 第 2 节「远山」。
 */
export const TOON_MOUNTAIN = { radial: 8, rings: 4, body: '#86c9b4', foot: '#6bb39f', cap: '#eefaf4', capAt: .7, footAt: .22, jitter: .05 };
export function toonMountain({ seed = 1, palette = TOON_MOUNTAIN, shoulder = true } = {}) {
  const nz = noise(seed), rand = rng(seed * 13 + 5);
  const cone = (s, h, dx, lean) => {
    const g = new THREE.ConeGeometry(1, 1, palette.radial, palette.rings);
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    const m = mergeVertices(g); g.dispose();
    const p = m.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const t = v.y + .5; // 0 山脚 → 1 山尖
      const n = nz.fbm(v.x * 1.3 + dx, v.y * 1.6, v.z * 1.3, 2);
      const r = Math.hypot(v.x, v.z) * (1 + n * .32);
      const a = Math.atan2(v.z, v.x);
      p.setXYZ(i, (Math.cos(a) * r + lean * t) * s + dx, t * h * (1 + (t < 1 ? n * .12 : 0)), Math.sin(a) * r * s);
    }
    const ni = m.toNonIndexed(); m.dispose();
    return ni;
  };
  const parts = [cone(1, 1, 0, (rand() - .5) * .35)];
  if (shoulder) parts.push(cone(.62, .62, (rand() > .5 ? 1 : -1) * (.55 + rand() * .2), (rand() - .5) * .3));
  const g = mergeGeometries(parts); parts.forEach((x) => x.dispose());
  g.computeVertexNormals();
  const pos = g.attributes.position, colors = new Float32Array(pos.count * 3);
  const cb = new THREE.Color(palette.body), cf = new THREE.Color(palette.foot), cc = new THREE.Color(palette.cap), c = new THREE.Color();
  for (let f = 0; f < pos.count; f += 3) {
    const cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
    const k = 1 + (rand() - .5) * 2 * palette.jitter;
    c.copy(cy > palette.capAt ? cc : cy < palette.footAt ? cf : cb).multiplyScalar(cy > palette.capAt ? 1 : k);
    for (let j = 0; j < 3; j++) colors.set([c.r, c.g, c.b], (f + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** 渐细的管：沿样条走，半径按 radius(t) 变化，可加树皮噪声。用于树干、枝条、梯杆、红绳。 */
export function taperedTube(points, radius, { radial = 10, segments = 48, bark = 0, seed = 3, closed = false } = {}) {
  const curve = points instanceof THREE.Curve ? points : new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), closed, 'centripetal');
  const frames = curve.computeFrenetFrames(segments, closed), nz = noise(seed);
  const verts = [], norms = [], uvs = [], idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments; curve.getPointAt(t, P);
    const r0 = typeof radius === 'function' ? radius(t) : radius;
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2, cos = Math.cos(a), sin = Math.sin(a);
      N.set(0, 0, 0).addScaledVector(frames.normals[i], cos).addScaledVector(frames.binormals[i], sin).normalize();
      const r = r0 * (1 + (bark ? bark * nz.fbm(t * 9, cos * 1.7, sin * 1.7, 3) : 0));
      verts.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r); norms.push(N.x, N.y, N.z); uvs.push(j / radial, t * 4);
    }
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  if (bark) g.computeVertexNormals();
  return g;
}

/** 编织绳环：圆环表面按股数与绞距起伏，看起来是几股丝线拧成的。 */
export function braidedRing({ R = .34, r = .085, strands = 3, twists = 16, depth = .2, tubular = 180, radial = 18 } = {}) {
  const verts = [], idx = [], uvs = [];
  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular * Math.PI * 2;
    for (let j = 0; j <= radial; j++) {
      const v = j / radial * Math.PI * 2;
      const rr = r * (1 + depth * Math.cos(strands * v + twists * u) * .5 + depth * .5 * Math.abs(Math.sin((strands * v + twists * u) * .5)) - depth * .25);
      verts.push((R + rr * Math.cos(v)) * Math.cos(u), (R + rr * Math.cos(v)) * Math.sin(u), rr * Math.sin(v));
      uvs.push(i / tubular, j / radial);
    }
  }
  for (let i = 0; i < tubular; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** 叶片：尖卵形轮廓，沿中脉对折并向下弯，像真叶子一样有弧度。原点在叶柄。 */
export function leafGeometry({ length = .16, width = .07, fold = .35, bend = .25, segments = 6 } = {}) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(width * .9, length * .18, width * .75, length * .72, 0, length);
  s.bezierCurveTo(-width * .75, length * .72, -width * .9, length * .18, 0, 0);
  const g = new THREE.ShapeGeometry(s, segments);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), t = y / length;
    p.setZ(i, Math.abs(x) / width * fold * width - bend * length * t * t);
  }
  g.computeVertexNormals();
  return g;
}

/** 花瓣：圆润的勺形，向内微卷。 */
export function petalGeometry({ length = .07, width = .055, cup = .5 } = {}) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(width * .7, length * .1, width * .75, length * .9, width * .12, length);
  s.quadraticCurveTo(0, length * .9, -width * .12, length);
  s.bezierCurveTo(-width * .75, length * .9, -width * .7, length * .1, 0, 0);
  const g = new THREE.ShapeGeometry(s, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, (x / width) ** 2 * cup * width + (y / length) ** 2 * cup * .4 * length);
  }
  g.computeVertexNormals();
  return g;
}

/** 体积云：几团被噪声推挤过的球合在一起，边缘不规则、底部略平。 */
export function cloudGeometry({ seed = 7, puffs = [[0, 0, 0, .5]], flatBottom = -.08, detail = 3 } = {}) {
  const nz = noise(seed), parts = [];
  for (const [x, y, z, r] of puffs) {
    const g0 = new THREE.IcosahedronGeometry(1, detail); g0.deleteAttribute('normal'); g0.deleteAttribute('uv');
    const g = mergeVertices(g0), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const k = 1 + nz.fbm(v.x * 1.8 + x * 3, v.y * 1.8 + y * 3, v.z * 1.8 + z * 3, 3) * .32;
      let yy = y + v.y * r * k;
      if (yy < flatBottom) yy = flatBottom + (yy - flatBottom) * .25;
      p.setXYZ(i, x + v.x * r * k, yy, z + v.z * r * k);
    }
    g.computeVertexNormals();
    parts.push(g);
  }
  return mergeGeometries(parts);
}

/** 方孔铜钱：圆形外缘、方孔，带倒角；正反面 UV 覆盖整个钱面，可贴钱文。厚度沿 Z。 */
export function coinGeometry({ r = .12, hole = .035, depth = .022 } = {}) {
  const s = new THREE.Shape(); s.absarc(0, 0, r, 0, Math.PI * 2, false);
  const h = new THREE.Path(); h.moveTo(-hole, -hole); h.lineTo(-hole, hole); h.lineTo(hole, hole); h.lineTo(hole, -hole); h.lineTo(-hole, -hole);
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * .35, bevelSize: r * .06, bevelSegments: 2, curveSegments: 28 });
  g.translate(0, 0, -depth / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / (2 * r) + .5, uv.getY(i) / (2 * r) + .5);
  return g;
}

/** 元宝：船形底、两端翘起，中间鼓起圆顶。 */
export function yuanbaoGeometry(scale = 1) {
  const bowl = new THREE.LatheGeometry([[0, -.09], [.15, -.09], [.23, -.03], [.27, .04], [.25, .065], [.17, .02], [0, .02]].map(([x, y]) => new THREE.Vector2(x, y)), 36);
  const p = bowl.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) * 1.5, z = p.getZ(i) * .82, y = p.getY(i);
    p.setXYZ(i, x, y + (y > -.04 ? 1.1 * x * x : 0), z);
  }
  const dome = new THREE.SphereGeometry(.11, 28, 14, 0, Math.PI * 2, 0, Math.PI * .55);
  dome.translate(0, .01, 0);
  const g = mergeGeometries([bowl.toNonIndexed(), dome.toNonIndexed()]);
  g.deleteAttribute('uv');
  const merged = mergeVertices(g); merged.computeVertexNormals();
  merged.scale(scale, scale, scale);
  return merged;
}

/** 画布贴图：draw(ctx, w, h) 画内容。sRGB、开 mipmap，可作颜色或自发光贴图。 */
export function canvasTexture(width, height, draw) {
  const canvas = typeof OffscreenCanvas !== 'undefined' && !globalThis.document ? new OffscreenCanvas(width, height) : document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const c = canvas.getContext('2d');
  draw(c, width, height);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.userData.redraw = (fn) => { c.clearRect(0, 0, width, height); fn(c, width, height); t.needsUpdate = true; };
  return t;
}
export const FONT = '"PingFang SC", "Hiragino Sans GB", "Noto Serif SC", "Songti SC", "Noto Sans CJK SC", serif';

/** 柔和圆点贴图（粒子、光晕用）。 */
export function softDot(size = 64, hard = .0) {
  return canvasTexture(size, size, (c, w) => {
    const g = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(Math.max(.05, hard), 'rgba(255,255,255,.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, w);
  });
}

/** 木纹贴图：横向年轮细纹，带少量节疤。 */
export function woodTexture(base = '#a8673a', seed = 5) {
  const r = rng(seed);
  return canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const y = r() * h, a = .04 + r() * .08;
      c.strokeStyle = r() > .5 ? `rgba(60,30,10,${a})` : `rgba(255,220,180,${a * .7})`;
      c.lineWidth = .6 + r() * 1.8; c.beginPath(); c.moveTo(0, y);
      for (let x = 0; x <= w; x += 16) c.lineTo(x, y + Math.sin(x * .03 + i) * 2.5);
      c.stroke();
    }
    for (let k = 0; k < 2; k++) { const x = r() * w, y = r() * h; c.strokeStyle = 'rgba(60,30,10,.25)'; for (let i = 1; i < 5; i++) { c.beginPath(); c.ellipse(x, y, i * 4, i * 2, 0, 0, Math.PI * 2); c.stroke(); } }
  });
}

/** 纸纹贴图：宣纸纤维与淡色边框。 */
export function paperTexture(base = '#f7ecd6', border = '#d9b98c', seed = 9) {
  const r = rng(seed);
  return canvasTexture(512, 320, (c, w, h) => {
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      const x = r() * w, y = r() * h, l = 4 + r() * 16, a = r() * Math.PI;
      c.strokeStyle = `rgba(140,110,70,${.04 + r() * .06})`; c.lineWidth = .5;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); c.stroke();
    }
    c.strokeStyle = border; c.lineWidth = 3; c.strokeRect(22, 22, w - 44, h - 44);
    c.lineWidth = 1; c.strokeRect(30, 30, w - 60, h - 60);
  });
}
