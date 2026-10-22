import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { toonifyMaterial, toonable, addOutline, toonifyScene, setRimColor, TOON } from '../src/ui/stage/toon.js';

test('PBR 材质原地改为卡通着色：去金属与清漆、保留引用与发光、着色器改写', () => {
  const gold = new THREE.MeshStandardMaterial({ color: '#e7b257', metalness: 1, roughness: .26, emissive: '#ffcf70', emissiveIntensity: .4 });
  gold.userData.glow = true;
  const same = toonifyMaterial(gold);
  assert.equal(same, gold);
  assert.equal(gold.metalness, 0);
  assert.equal(gold.roughness, 1);
  assert.equal(gold.userData.toon.toonSpec.value, TOON.spec.metal);
  assert.equal(gold.emissiveIntensity, .4, '发光强度不动');
  assert.ok(gold.userData.glow);
  assert.match(gold.customProgramCacheKey(), /toon/);
  const sh = { uniforms: {}, fragmentShader: 'x\n#include <lights_physical_pars_fragment>\ny\n#include <opaque_fragment>\n', vertexShader: '' };
  gold.onBeforeCompile(sh);
  assert.match(sh.fragmentShader, /toonRamp\(dotNL\)/);
  assert.match(sh.fragmentShader, /toonRimColor/);
  assert.ok(sh.uniforms.toonSpec && sh.uniforms.toonRim);
  assert.equal(toonable(gold), false, '不会重复处理');
});

test('物理材质关闭清漆光泽，透射玻璃保持原样', () => {
  const jade = new THREE.MeshPhysicalMaterial({ color: '#46b98a', clearcoat: 1, sheen: .4, roughness: .2 });
  toonifyMaterial(jade);
  assert.equal(jade.clearcoat, 0); assert.equal(jade.sheen, 0);
  assert.equal(jade.userData.toon.toonSpec.value, TOON.spec.gloss);
  const glass = new THREE.MeshPhysicalMaterial({ transmission: 1 });
  assert.equal(toonable(glass), false);
});

test('描边只加在主要实体上：平面、半透明、实例化、过小的物体不加', () => {
  const mat = () => new THREE.MeshStandardMaterial({ color: '#c2342b' });
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat());
  const hull = addOutline(box);
  assert.ok(hull && hull.userData.outline);
  assert.equal(hull.material.side, THREE.BackSide);
  assert.equal(hull.castShadow, false);
  assert.ok(hull.geometry.attributes.normal, '外壳几何有平滑法线');
  assert.ok(hull.geometry.attributes.position.count <= box.geometry.attributes.position.count, '硬边顶点已合并');
  assert.equal(addOutline(hull), null, '描边本身不再描边');
  assert.equal(addOutline(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat())), null);
  const clear = mat(); clear.transparent = true;
  assert.equal(addOutline(new THREE.Mesh(new THREE.SphereGeometry(.5), clear)), null);
  assert.equal(addOutline(new THREE.InstancedMesh(new THREE.BoxGeometry(), mat(), 3)), null);
  assert.equal(addOutline(new THREE.Mesh(new THREE.SphereGeometry(.01), mat())), null);
  const big = new THREE.Mesh(new THREE.SphereGeometry(5), mat());
  addOutline(big);
  const w = big.children[0].material;
  const sh = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '' };
  w.onBeforeCompile(sh);
  assert.ok(sh.uniforms.outlineWidth.value <= TOON.outline.max + 1e-9, '描边宽度有上限');
});

test('整场景处理：跳过天空水面，统计材质与描边，换肤更新边缘光', () => {
  const scene = new THREE.Scene(), world = new THREE.Group(), sky = new THREE.Mesh(new THREE.SphereGeometry(40), new THREE.MeshStandardMaterial());
  scene.add(world, sky);
  world.add(new THREE.Mesh(new THREE.TorusGeometry(.5, .1), new THREE.MeshStandardMaterial({ color: '#d63a30' })));
  const r = toonifyScene(scene, { outlineRoot: world, skip: (o) => o === sky, rimColor: '#ffffff' });
  assert.deepEqual(r, { materials: 1, outlines: 1 });
  assert.equal(sky.material.userData.toon, undefined);
  setRimColor(scene, '#b9a8ff');
  assert.equal(world.children[0].material.userData.toon.toonRimColor.value.getHexString(), 'b9a8ff');
});
