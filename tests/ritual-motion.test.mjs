import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlockMesh, tossPose } from '../src/modules/jiaobei/model.js';
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
