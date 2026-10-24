// 卡通着色：把场景里的 PBR 材质（MeshStandard / MeshPhysical）原地改成手游风格——
// 漫反射三段明暗、一块硬边高光、菲涅尔边缘光、去掉金属与清漆反射、颜色提饱和；
// 再给主要物体加反向外壳描边。材质对象不替换（场景代码持有的引用、发光登记照常生效）。
// 参数见 docs/claude-plan/visual-direction.md 第 2 节。
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const TOON = {
  ramp: [.42, .78, 1.0], // 暗 / 中 / 亮 三段
  edges: [.2, .58], // 段落分界（N·L）
  soft: .02, // 分界过渡半宽
  spec: { metal: .55, gloss: .4, base: .12 },
  rim: .6, // 乘本体色，所以比文档里的 0.35 略大
  outline: { ratio: .022, min: .006, max: .03, minRadius: .045, maxInstances: 160 },
};

const RAMP_GLSL = `
uniform float toonSpec; uniform float toonRim; uniform vec3 toonRimColor;
float toonRamp(float x) {
  float a = smoothstep(${(TOON.edges[0] - TOON.soft).toFixed(3)}, ${(TOON.edges[0] + TOON.soft).toFixed(3)}, x);
  float b = smoothstep(${(TOON.edges[1] - TOON.soft).toFixed(3)}, ${(TOON.edges[1] + TOON.soft).toFixed(3)}, x);
  return mix(${TOON.ramp[0].toFixed(3)}, mix(${TOON.ramp[1].toFixed(3)}, ${TOON.ramp[2].toFixed(3)}, b), a);
}
`;
const DIRECT_FROM = 'vec3 irradiance = dotNL * directLight.color;';
const DIRECT_TO = `vec3 irradiance = toonRamp(dotNL) * directLight.color;
	reflectedLight.directSpecular += directLight.color * mix(vec3(1.0), min(material.diffuseColor * 1.8, vec3(1.0)), .6) * toonSpec * smoothstep(.2, .4, dotNL) * smoothstep(.955, .975, dot(reflect(-directLight.direction, geometryNormal), geometryViewDir));`;
// 原版 GGX 高光乘的是 irradiance：卡通三段明暗让背光面（dotNL≈0）也有 0.42 的 irradiance，
// 轮廓处 dotNV 也≈0 时 GGX 分母趋零、高光冲到无穷大，石台边缘出现纯白碎边。高光改回按真实 dotNL 计算。
const GGX_FROM = 'reflectedLight.directSpecular += irradiance * BRDF_GGX(';
const GGX_TO = 'reflectedLight.directSpecular += dotNL * directLight.color * BRDF_GGX(';
const RIM = `outgoingLight += diffuseColor.rgb * toonRimColor * toonRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
	#include <opaque_fragment>`;

/** 是否可以卡通化：标准 / 物理材质、未手动排除（透射玻璃先由 glassify 改成卡通半透明）。 */
export function toonable(m) {
  return !!m && m.isMeshStandardMaterial && !m.userData.toon && !m.userData.noToon && !(m.transmission > 0);
}

/**
 * 透射材质（写实玻璃、水晶）在三段明暗下会发黑或像塑料：改为卡通半透明——
 * 关掉透射、按透射程度设不透明度、颜色提亮一点，之后照常走卡通着色（硬高光 + 边缘光）。
 */
export function glassify(m) {
  if (!m?.isMeshPhysicalMaterial || !(m.transmission > 0) || m.userData.noToon) return m;
  const t = m.transmission;
  m.transmission = 0; m.thickness = 0;
  m.transparent = true; m.opacity = Math.min(m.opacity, 1 - t * .45);
  m.depthWrite = false;
  const hsl = {}; m.color.getHSL(hsl); m.color.setHSL(hsl.h, hsl.s, Math.min(.8, hsl.l + .08));
  m.userData.glass = true;
  m.needsUpdate = true;
  return m;
}

/** 把一个材质原地改为卡通着色，返回它自己。 */
export function toonifyMaterial(m, { rimColor = '#fff4d6' } = {}) {
  if (!toonable(m)) return m;
  const spec = m.metalness > .5 ? TOON.spec.metal : (m.clearcoat > .5 || m.sheen > .5 || m.roughness < .3) ? TOON.spec.gloss : TOON.spec.base;
  const metal = m.metalness > .5;
  if (!m.vertexColors && !m.map) {
    const hsl = {}; m.color.getHSL(hsl);
    // 去掉金属反射后颜色会变闷：提饱和，金属再提一点亮度
    m.color.setHSL(hsl.h, Math.min(1, hsl.s * (metal ? 1.35 : 1.18)), Math.min(.82, hsl.l + (metal ? .1 : .02)));
  }
  m.metalness = 0; m.roughness = 1; m.envMapIntensity = .15;
  if (m.isMeshPhysicalMaterial) { m.clearcoat = 0; m.sheen = 0; m.iridescence = 0; m.specularIntensity = .5; }
  // 岩石、远山这类顶点色材质不加边缘光（轮廓处会出现白边）
  // 硬高光只在朝光的面出现，顶点色的岩石、远山不要高光（卡通石头是哑光的）
  const uniforms = { toonSpec: { value: m.vertexColors ? 0 : spec }, toonRim: { value: m.vertexColors ? 0 : TOON.rim }, toonRimColor: { value: new THREE.Color(rimColor) } };
  m.userData.toon = uniforms;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) {
    prev?.call(this, sh, r);
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_physical_pars_fragment>', RAMP_GLSL + THREE.ShaderChunk.lights_physical_pars_fragment.replace(DIRECT_FROM, DIRECT_TO).replace(GGX_FROM, GGX_TO))
      .replace('#include <opaque_fragment>', RIM);
  };
  m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|toon'; };
  m.needsUpdate = true;
  return m;
}

/** 几何最细方向的半厚度（包围盒最小边的一半）。 */
function thinness(geo) {
  if (!geo.boundingBox) geo.computeBoundingBox();
  const d = new THREE.Vector3(); geo.boundingBox.getSize(d);
  return Math.max(1e-4, Math.min(d.x, d.y, d.z) / 2);
}

const FLAT = new Set(['PlaneGeometry', 'CircleGeometry', 'ShapeGeometry', 'RingGeometry']);
const outlineCache = new WeakMap();

function outlineColor(material) {
  const base = material?.color ? material.color.clone() : new THREE.Color('#ffffff');
  const hsl = {}; base.getHSL(hsl);
  // 本体色压暗做描边，浅色 / 贴图物体落到暖深棕
  const c = new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 1.1), Math.min(hsl.l, .6) * .28);
  if (material?.map || hsl.l > .85 || material?.vertexColors) c.lerp(new THREE.Color('#2b1a12'), .6);
  return c;
}

function outlineMaterial(color, width) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide, fog: true });
  m.userData.outline = true;
  const u = { outlineWidth: { value: width } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.outlineWidth = u.outlineWidth;
    sh.vertexShader = 'uniform float outlineWidth;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\ttransformed += normalize(normal) * outlineWidth;');
  };
  m.customProgramCacheKey = () => 'outline';
  return m;
}

/** 平滑法线的外壳几何：硬边几何（方盒、圆柱盖）拆开的法线会让描边裂开，这里按位置合并后重算法线。 */
function hullGeometry(geo) {
  if (outlineCache.has(geo)) return outlineCache.get(geo);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.attributes.position.clone());
  if (geo.index) g.setIndex(geo.index.clone());
  const merged = mergeVertices(g, 1e-4); g.dispose();
  merged.computeVertexNormals();
  outlineCache.set(geo, merged);
  return merged;
}

/** 给一个网格加描边，返回描边网格（不符合条件时返回 null）。 */
export function addOutline(mesh) {
  if (!mesh.isMesh || mesh.userData.outline || mesh.userData.noOutline || mesh.userData.rebuild) return null;
  if (mesh.isInstancedMesh && mesh.count > TOON.outline.maxInstances) return null;
  const mat = Array.isArray(mesh.material) ? mesh.material[mesh.material.length - 1] : mesh.material;
  if (!mat || !mat.isMeshStandardMaterial || mat.transparent || mat.userData.noOutline || !(mat.side === THREE.FrontSide)) return null;
  const geo = mesh.geometry;
  if (!geo?.attributes?.position || FLAT.has(geo.type)) return null;
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  const s = new THREE.Vector3(); mesh.updateWorldMatrix(true, false); mesh.getWorldScale(s);
  const scale = Math.max(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)) || 1;
  const worldR = geo.boundingSphere.radius * scale;
  if (worldR < TOON.outline.minRadius) return null;
  let width = Math.min(TOON.outline.max, Math.max(TOON.outline.min, worldR * TOON.outline.ratio)) / scale;
  // 细长物体（丝线、流苏、链环）：描边不超过最细方向半径的 45%，否则整根会被描成黑线
  width = Math.min(width, thinness(geo) * .45);
  const hullGeo = hullGeometry(geo), hullMat = outlineMaterial(outlineColor(mat), width);
  let hull;
  if (mesh.isInstancedMesh) {
    // 实例化物体（叶片、流苏丝、链环、铆钉）：外壳与本体共用同一份实例矩阵，数量每帧跟随
    hull = new THREE.InstancedMesh(hullGeo, hullMat, mesh.instanceMatrix.count);
    hull.instanceMatrix = mesh.instanceMatrix;
    hull.count = mesh.count;
    hull.frustumCulled = false;
    hull.onBeforeRender = () => { hull.count = mesh.count; };
  } else hull = new THREE.Mesh(hullGeo, hullMat);
  hull.userData.outline = true; hull.castShadow = false; hull.receiveShadow = false;
  hull.raycast = () => {};
  mesh.add(hull);
  return hull;
}

/**
 * 整个场景卡通化：所有可卡通化的材质改着色，主要物体加描边。
 * skip(object) 返回 true 的子树不处理（天空、水面）。返回 { materials, outlines } 计数。
 */
export function toonifyScene(root, { rimColor, outlineRoot = root, skip = () => false } = {}) {
  let materials = 0, outlines = 0;
  const visit = (o, fn) => { if (skip(o)) return; fn(o); for (const c of [...o.children]) visit(c, fn); };
  visit(root, (o) => {
    for (const m of [].concat(o.material || [])) { glassify(m); if (toonable(m)) { toonifyMaterial(m, { rimColor }); materials++; } }
  });
  const meshes = [];
  visit(outlineRoot, (o) => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) if (addOutline(m)) outlines++;
  return { materials, outlines };
}

/** 换皮肤时更新边缘光颜色。 */
export function setRimColor(root, color) {
  root.traverse((o) => { for (const m of [].concat(o.material || [])) m.userData.toon?.toonRimColor.value.set(color); });
}
