// 第 23 轮：动作弹性过冲拉长时器物不顶出画面（灵摆曲臂原来会顶出上沿），以及命牌背面不再是素红
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BOUNCE } from '../src/ui/stage/bounce.js';
import pendulum from '../src/ui/stage/scenes/pendulum.js';
import { drawTabletBack, TABLET_BACK, TABLET_TEX } from '../src/ui/stage/scenes/pillars.js';

function cameraOf(def) {
  const { position, target, fov } = def.camera;
  const cam = new THREE.PerspectiveCamera(fov, 1, .05, 90); // 手机上舞台接近正方形
  cam.position.set(...position); cam.lookAt(new THREE.Vector3(...target)); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  return cam;
}
const ndc = (cam, p) => new THREE.Vector3(...p).project(cam);

test('灵摆：过冲拉长时曲臂顶端仍在画面内，石台前沿不出下沿', () => {
  const cam = cameraOf(pendulum);
  const s = 1 + BOUNCE.stretch * (pendulum.bounce ?? 1);
  const up = (y) => pendulum.pivot + (y - pendulum.pivot) * s;
  // 曲臂最高处（含顶端金珠半径）
  for (const [x, y, z] of [[0, 1.33, 0], [.6, 1.35, -.22], [1.0, 1.05, -.5]]) {
    const p = ndc(cam, [x, up(y), z]);
    assert.ok(p.y < .9, `曲臂 (${x}, ${y}) 过冲后 ndc.y = ${p.y.toFixed(3)}`);
    assert.ok(Math.abs(p.x) < .9);
  }
  const front = ndc(cam, [0, -1.16, 1.16]);
  assert.ok(front.y > -.9, `石台前沿 ndc.y = ${front.y.toFixed(3)}`);
});

test('命牌背面：深朱底、金框与中间「命」字圆章', () => {
  const calls = [];
  const ctx = { fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', lineJoin: '' };
  for (const n of ['clearRect', 'fillRect', 'beginPath', 'roundRect', 'rect', 'arc', 'fill', 'stroke', 'fillText']) ctx[n] = (...a) => calls.push({ n, a, fill: ctx.fillStyle, stroke: ctx.strokeStyle });
  drawTabletBack(ctx, ...TABLET_TEX);
  assert.equal(calls.find((c) => c.n === 'fillRect').fill, TABLET_BACK.base);
  assert.ok(calls.filter((c) => c.n === 'stroke' && c.stroke === TABLET_BACK.gold).length >= 2, '至少两道金框');
  const text = calls.find((c) => c.n === 'fillText');
  assert.equal(text.a[0], '命'); assert.equal(text.fill, TABLET_BACK.ink);
});

// 第 24 轮：青云梯揭晓时顶端金星原来随放大 1.08 顶到 ndc.y 0.99；金星改为正对镜头的饱和金
import ladder, { LADDER_STAR } from '../src/ui/stage/scenes/ladder.js';
test('青云梯：揭晓放大时金星顶端仍在画面内，金星只左右摆不整圈自转', () => {
  const cam = cameraOf(ladder);
  const pop = 1 + BOUNCE.pop, pivot = ladder.pivot;
  // 梯顶 (.5, 1.32, -.5) 加金星偏移 (.05, .74, .2)，再加半径
  const starTop = [.55 * pop, pivot + (1.32 + .74 + LADDER_STAR.radius - pivot) * pop, -.3 * pop];
  const p = ndc(cam, starTop);
  assert.ok(p.y < .9, `金星顶端 ndc.y = ${p.y.toFixed(3)}`);
  assert.ok(LADDER_STAR.sway < Math.PI / 4, '摆幅小于 45°，不会侧对镜头变成细条');
  assert.ok(LADDER_STAR.radius >= .22 && LADDER_STAR.glowPeak <= .6);
});
