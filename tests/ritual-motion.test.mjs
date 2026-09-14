import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlockMesh, tossPose, FIRST_IMPACT } from '../src/modules/jiaobei/model.js';
import { coinPose, COIN_IMPACTS, dicePose, DICE_SETTLING, DICE_IMPACTS } from '../src/modules/coin/motion.js';
import { diceRotation } from '../src/modules/coin/core.js';
import { overRope } from '../src/modules/omikuji/interaction.js';
import { buildDeck } from '../src/modules/tarot/core.js';
import { readFile } from 'node:fs/promises';

test('筊杯网格具有独立的平面、厚度和弧面，顶点均有效', () => {
  const mesh = createBlockMesh();
  assert(mesh.length > 500);
  const flat = mesh.filter(f => f.flat).flatMap(f => f.points);
  const back = mesh.filter(f => !f.flat).flatMap(f => f.points);
  assert(flat.every(p => p[2] === .09));
  assert(Math.min(...back.map(p => p[2])) < -.45);
  assert(mesh.every(f => f.points.length === 4 && f.points.flat().every(Number.isFinite)));
});

test('强弱投掷均留在运动包络内，最终朝向与抽取结果完全一致', () => {
  for (const power of [.65, 1, 1.65]) for (const face of ['flat', 'round', 'stand']) for (const side of [-1, 1]) {
    for (let i = 0; i <= 100; i++) {
      const p = tossPose(i / 100, { side, power, face, spread: 70, height: 100 });
      assert(Math.abs(p.x) <= 70.001);
      assert(p.y >= -100.001 && p.y <= .001);
    }
    const end = tossPose(1, { side, power, face, spread: 70 });
    const expected = face === 'flat' ? 0 : face === 'round' ? Math.PI : Math.PI / 2;
    assert(Math.abs(end.rx - Math.PI * 2 * (2 + Math.round(power)) - expected) < 1e-8);
    assert(Math.abs(end.y) < 1e-8);
  }
});

test('结签必须在可见签绳区域松手，取消事件永远不结签', () => {
  const rect = { left: 30, right: 330, top: 80, bottom: 154 };
  assert(overRope({ x: 180, y: 105 }, rect));
  assert(overRope({ x: 22, y: 160 }, rect));
  assert(!overRope({ x: 180, y: 250 }, rect));
  assert(!overRope({ x: 400, y: 110 }, rect));
  assert(!overRope({ x: 180, y: 105, cancelled: true }, rect));
});

test('重复掷筊依然完整翻转，起始姿态连续且最终面向正确', () => {
  let start = { x: -65, y: -20, rx: .18, ry: .1, rz: -.3 };
  for (let i = 0; i < 6; i++) {
    const first = tossPose(0, { side: -1, face: 'round', start });
    assert.equal(first.rx, start.rx); assert.equal(first.rz, start.rz);
    const end = tossPose(1, { side: -1, face: 'round', start });
    assert(end.rx - start.rx >= Math.PI * 4);
    assert(Math.abs(Math.cos(end.rx) + 1) < 1e-8);
    start = end;
  }
});

test('筊杯首次触地后持续翻滚，最终朝向只在滚动结束时固定', () => {
  for (const face of ['flat', 'round', 'stand']) {
    const impact = tossPose(FIRST_IMPACT, { face });
    const rolling = tossPose(0.7, { face });
    const final = tossPose(1, { face });
    assert(final.rx - impact.rx > Math.PI);
    assert(Math.abs(rolling.rx - final.rx) > 0.5);
    const at = tossPose(FIRST_IMPACT - 1e-8, { face });
    for (const key of ['x', 'y', 'rx', 'ry', 'rz']) assert(Math.abs(at[key] - impact[key]) < 1e-4, key);
    assert(Math.abs(final.ry) < 1e-8);
  }
});

test('硬币保留三维滚动过程，头尾立三种结果均准确停在抽取的面上', () => {
  for (const start of [0, 90, 180]) for (const face of [0, 90, 180]) {
    const target = 1080 + face;
    const opts = { start, target, height: 90, wobble: -3, endWobble: 4 };
    const first = coinPose(0, opts), end = coinPose(1, opts);
    assert.equal(first.rx, start); assert.equal(first.rz, -3);
    assert.equal(end.rx, target); assert.equal(end.rz, 4);
    assert(Math.abs(end.x) < 1e-8 && Math.abs(end.y) < 1e-8 && Math.abs(end.ry) < 1e-8);
    assert(target - coinPose(COIN_IMPACTS[0], opts).rx > 180);
    for (let i = 0; i <= 200; i++) {
      const pose = coinPose(i / 200, opts);
      assert(Object.values(pose).every(Number.isFinite));
      assert(pose.y >= -90.0001 && pose.y <= 0.0001);
      assert(Math.abs(pose.x) <= 20.0001);
    }
  }
});

test('硬币弹跳的轨迹连续，弹跳高度和最终晃动逐次减小', () => {
  for (const impact of COIN_IMPACTS) {
    const before = coinPose(impact - 1e-8), after = coinPose(impact + 1e-8);
    for (const key of ['x', 'y', 'rx', 'ry', 'rz']) assert(Math.abs(before[key] - after[key]) < 0.001, key);
  }
  assert(Math.abs(coinPose(0.475).y) > Math.abs(coinPose(0.615).y));
  assert(Math.abs(coinPose(0.9).rx - 1440) > Math.abs(coinPose(0.99).rx - 1440));
});

test('图集覆盖 78 张牌且映射唯一，力量与正义沿用经典牌号', async () => {
  const map = JSON.parse(await readFile(new URL('../assets/tarot/sources.json', import.meta.url)));
  const deck = buildDeck();
  assert.equal(Object.keys(map).length, 78);
  assert.equal(new Set(Object.values(map).map(x => x.index)).size, 78);
  for (const c of deck) assert(map[c.id], c.id);
  assert.equal(map.M8.name, 'strength');
  assert.equal(map.M11.name, 'justice');
  assert.equal(map.W11.name, 'page-of-wands');
  assert.equal(map.P14.name, 'king-of-pentacles');
});

test('骰子每个点数都先倚在棱边，再倾倒；任何旋转下都不穿透托盘', () => {
  for (let value = 1; value <= 6; value++) for (const power of [.7, 1.5]) for (const sign of [-1, 1]) {
    const rot = diceRotation(value), target = { rx: rot.rx + sign * 1080, ry: rot.ry + sign * 1080 };
    const opts = { target, power };
    const near = dicePose(DICE_SETTLING, opts), hold = dicePose(.83, opts), final = dicePose(1, opts);
    assert(Math.abs(final.rx - near.rx) >= 40);
    assert(Math.abs(hold.rx - near.rx) <= 6, '棱边短暂慢下来');
    assert.equal(final.rx, target.rx); assert.equal(final.ry, target.ry);
    assert(Math.abs(final.z - 26) < 1e-8); assert(Math.abs(final.x) < 1e-8); assert(Math.abs(final.y) < 1e-8);
    for (let i = 0; i <= 300; i++) {
      const p = dicePose(i / 300, opts), x = p.rx * Math.PI / 180, y = p.ry * Math.PI / 180;
      assert(Object.values(p).every(Number.isFinite));
      const bottom = p.z - 26 * (Math.abs(Math.cos(x) * Math.sin(y)) + Math.abs(Math.sin(x)) + Math.abs(Math.cos(x) * Math.cos(y)));
      assert(bottom > -1e-8, '骰子棱角不能没入桌面');
    }
    for (const t of DICE_IMPACTS) {
      const before = dicePose(t - 1e-8, opts), after = dicePose(t + 1e-8, opts);
      for (const key of Object.keys(before)) assert(Math.abs(before[key] - after[key]) < .001, key);
    }
  }
});

test('硬币与筊杯在结果落定之前保留可见的倾斜，随后才回到最终面', () => {
  assert(Math.abs(coinPose(.8).rx - coinPose(1).rx) > 50);
  assert(Math.abs(tossPose(.8).rx - tossPose(1).rx) > .9);
});
