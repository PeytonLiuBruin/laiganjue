import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BOUNCE, squashAt, popAt, sideScale, createBounce, createStarBurst } from '../src/ui/stage/bounce.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);

test('动作曲线：预备压扁 8% → 过冲拉长 12% → 阻尼回弹归零', () => {
  near(squashAt(0), 0);
  near(squashAt(BOUNCE.windup), -.08);
  near(squashAt(BOUNCE.windup + BOUNCE.launch), .12);
  let min = 0, max = 0, crossings = 0, prev = squashAt(.29);
  for (let t = .29; t < BOUNCE.settle; t += .005) {
    const q = squashAt(t); min = Math.min(min, q); max = Math.max(max, q);
    if (Math.sign(q) !== Math.sign(prev)) crossings++; prev = q;
  }
  assert.ok(max <= .12 + 1e-9, '过冲后不再超过 12%');
  assert.ok(min < -.02 && min > -.08, `回弹有一次明显下沉但小于预备：${min}`);
  assert.ok(crossings >= 2, '至少来回弹两次');
  assert.ok(Math.abs(squashAt(1.2)) < .004, '1.2 秒后基本静止');
  near(squashAt(BOUNCE.settle + .1), 0); near(squashAt(-1), 0);
});

test('揭晓曲线：放大到 1.08 再弹回 1', () => {
  near(popAt(0), 1); near(popAt(BOUNCE.popRise), 1.08);
  assert.ok(popAt(.4) < 1, '回弹时略小于 1');
  assert.ok(Math.abs(popAt(1.2) - 1) < .003);
  near(popAt(5), 1);
});

test('体积守恒：拉长时横向变窄', () => {
  near(sideScale(.12) ** 2 * 1.12, 1);
  assert.ok(sideScale(-.08) > 1);
});

test('弹性叠加在场景姿态上：不动点保持不动，场景本帧写入的值优先，关闭时不动', () => {
  const o = new THREE.Object3D(); o.position.set(.3, -.95, 0); o.scale.set(1, 1, 1);
  const b = createBounce([{ object: o, pivot: 0 }]);
  b.trigger(0);
  assert.equal(b.apply(BOUNCE.windup), true);
  near(o.scale.y, .92); assert.ok(o.scale.x > 1);
  near(o.position.y, -.95, 1e-9);
  b.restore(); near(o.scale.y, 1); near(o.position.y, -.95);

  // 挂点在顶部（pivot 为 0，物体在下方）与底部不动点（pivot = -0.5）
  const hang = new THREE.Object3D(); hang.position.y = 1;
  const top = new THREE.Vector3(0, -.5, 0);
  const b2 = createBounce([{ object: hang, pivot: -.5 }]); b2.trigger(0); b2.apply(BOUNCE.windup + BOUNCE.launch);
  hang.updateMatrixWorld(true);
  const p = top.clone().applyMatrix4(hang.matrixWorld);
  near(p.y, .5, 1e-9);

  // 场景这一帧自己改了缩放：还原时不覆盖
  const s = new THREE.Object3D();
  const b3 = createBounce([{ object: s }]); b3.trigger(0); b3.apply(.1);
  s.scale.set(2, 2, 2); b3.restore(); near(s.scale.x, 2);

  const off = new THREE.Object3D();
  const b4 = createBounce([{ object: off }], { amount: 0 }); b4.trigger(0); b4.reveal(0);
  assert.equal(b4.apply(.2), false); near(off.scale.y, 1);
  assert.deepEqual(b4.sample(.2), { q: 0, pop: 1 });
});

test('温和模式幅度减半，揭晓放大与动作叠加', () => {
  const o = new THREE.Object3D();
  const b = createBounce([{ object: o }], { amount: .5 });
  b.reveal(0); b.apply(BOUNCE.popRise); near(o.scale.y, 1.04);
});

test('揭晓金星：迸出后落下并在寿命结束时全部消失，不算发光材质', () => {
  const s = createStarBurst({ count: 12, life: 1 });
  assert.equal(s.object.visible, false);
  assert.ok(!s.object.material.userData.glow);
  assert.notEqual(s.object.material.blending, THREE.AdditiveBlending);
  s.burst(new THREE.Vector3(0, 0, 0), .5);
  s.update(.2);
  assert.equal(s.object.visible, true);
  const y = s.object.geometry.attributes.position.array[1];
  assert.ok(y > 0, '先往上飞');
  for (let i = 0; i < 80; i++) s.update(1 / 60);
  assert.equal(s.active, 0); assert.equal(s.object.visible, false);
});
