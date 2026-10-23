import test from 'node:test';
import assert from 'node:assert/strict';
import { toonSolidColor, solidEdgeColor } from '../src/ui/solid-scene.js';
import { paintBoard, paintBall } from '../src/modules/plinko/scene.js';
import { makeBoard } from '../src/modules/plinko/core.js';

const lum = (css) => css.match(/\d+/g).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3;
const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };

test('2D 器物三段明暗：背光、侧光、迎光三档分明，不是连续渐变', () => {
  const dark = lum(toonSolidColor('wood', unit([0.4, 0.5, -0.3])));
  const mid = lum(toonSolidColor('wood', unit([0.3, -0.9, 0.1])));
  const lit = lum(toonSolidColor('wood', unit([-0.35, -0.45, 0.82])));
  assert.ok(dark < mid && mid < lit, `${dark} < ${mid} < ${lit}`);
  // 迎光附近两个方向落在同一段，颜色几乎一样（色块而不是渐变）
  const lit2 = lum(toonSolidColor('wood', unit([-0.2, -0.5, 0.84])));
  assert.ok(Math.abs(lit - lit2) < 12);
});

test('金色饱和、象牙白正面不发灰、轮廓比本色深得多', () => {
  const [r, g, b] = toonSolidColor('brass', unit([0, -0.2, 1])).match(/\d+/g).map(Number);
  assert.ok(r > 230 && g > 170 && b < 90, `brass ${r},${g},${b}`);
  assert.ok(lum(toonSolidColor('ivory', [0, -1, 0])) > 200);
  assert.ok(lum(solidEdgeColor('brass')) < 80);
});

test('落球盘画布：钉子、隔板、小球都能画出来，不抛错', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (t, k) => k in t ? t[k] : (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : (...a) => calls.push(k)),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const board = makeBoard(3);
  const colors = { bg: '#eaf6ff', surface: '#ffffff', line: '#ddd', edge: '#bbb', accent: '#e8463c', accent2: '#ff6a4d', accent3: '#b8302a', ink: '#2b2240', ballEdge: '#5c1815', dark: false };
  paintBoard(ctx, board, colors);
  paintBall(ctx, { x: 180, y: 30, angle: 0.3 }, board.ballRadius, colors);
  assert.ok(calls.filter((k) => k === 'arc').length >= board.pins.length * 3);
});

test('深色皮肤：骰子桌垫不用白垫，落球盘底槽用不透明度较高的宝石色', async () => {
  const { isDarkTheme, plateColors } = await import('../src/ui/solid-scene.js');
  const { SLOT_TINTS_DARK } = await import('../src/modules/plinko/scene.js');
  assert.equal(isDarkTheme('ink'), true);
  assert.equal(isDarkTheme('nebula'), true);
  assert.equal(isDarkTheme('cinnabar'), true);
  assert.equal(isDarkTheme('paper'), false);
  assert.equal(isDarkTheme(undefined), false);
  const alpha = (css) => Number(css.match(/[\d.]+\)$/)[0].slice(0, -1));
  assert.ok(alpha(plateColors(true).fill) <= 0.15, '深色桌垫几乎透明');
  assert.ok(alpha(plateColors(false).fill) >= 0.5, '浅色桌垫是白垫');
  for (const hex of SLOT_TINTS_DARK) {
    const l = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).reduce((a, b) => a + b) / 3;
    assert.ok(l > 50 && l < 140, `${hex} 明度 ${l} 应在深底上可见又不刺眼`);
  }
});
