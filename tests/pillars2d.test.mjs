// 八字 2D 回退命牌（第 42 轮）：没有 WebGL 时也用 3D 命牌同一套朱漆、奶油牌面、五行色

import test from 'node:test';
import assert from 'node:assert/strict';
import { drawPillars, PILLAR_2D } from '../src/ui/models/objects.js';
import { createPainter } from '../src/ui/models/painter.js';
import { WX as WX_COLORS } from '../src/ui/stage/scenes/pillars.js';

// 记录画布上用过的颜色与文字，不依赖真实 canvas
function fakeCanvas() {
  const fills = [], strokes = [], texts = [];
  const grad = () => ({ addColorStop() {} });
  const ctx = new Proxy({}, {
    get: (t, k) => {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return grad;
      if (k === 'fill') return () => fills.push(String(t.fillStyle));
      if (k === 'stroke') return () => strokes.push(String(t.strokeStyle));
      if (k === 'fillText') return (s) => texts.push({ s: String(s), color: String(t.fillStyle), font: String(t.font) });
      return () => {};
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return { ctx, fills, strokes, texts };
}

const chart = [
  { label: '年柱', gan: '甲', zhi: '子', ganElement: '木', zhiElement: '水', shiShen: '正财' },
  { label: '月柱', gan: '丙', zhi: '午', ganElement: '火', zhiElement: '火', shiShen: '比肩' },
  { label: '日柱', gan: '戊', zhi: '辰', ganElement: '土', zhiElement: '土', shiShen: '日主' },
  { label: '时柱', gan: '庚', zhi: '申', ganElement: '金', zhiElement: '金', shiShen: '七杀' },
];

test('2D 命牌五行色与 3D 命牌一致', () => {
  assert.deepEqual(PILLAR_2D.wx, WX_COLORS);
});

test('排盘后：奶油牌面、朱红框、干支用五行色 900 粗字，不再有旧米灰牌身', () => {
  const { ctx, fills, strokes, texts } = fakeCanvas();
  drawPillars(createPainter(ctx, 360, 360), { pillars: chart, active: false }, 0);
  assert.ok(fills.includes(PILLAR_2D.face), '牌面奶油底');
  assert.ok(strokes.includes(PILLAR_2D.frame), '朱红框');
  assert.ok(!fills.includes('#d6d5ce'), '旧的灰牌身');
  // 描边字先画一层深墨底影，再画本色
  const jia = texts.find((t) => t.s === '甲' && t.color === PILLAR_2D.wx.木);
  assert.ok(jia, '甲 用木色');
  assert.match(jia.font, /^900 /);
  assert.ok(texts.some((t) => t.s === '甲' && t.color === PILLAR_2D.edge), '深墨描边底影');
  assert.ok(texts.some((t) => t.s === '正财' && t.color === PILLAR_2D.tagInk), '十神金色胶囊');
});

test('未排盘：两枚金色问号圆章，不是小点，时辰未知显示「未知」', () => {
  const blank = fakeCanvas();
  drawPillars(createPainter(blank.ctx, 360, 360), { pillars: [], active: false }, 0);
  assert.equal(blank.texts.filter((t) => t.s === '?').length, 8);
  assert.ok(!blank.texts.some((t) => t.s === '·'));
  const three = fakeCanvas();
  drawPillars(createPainter(three.ctx, 360, 360), { pillars: chart.slice(0, 3), active: false }, 0);
  assert.ok(three.texts.some((t) => t.s === '未') && three.texts.some((t) => t.s === '未计入'));
});

test('翻转途中背对镜头时画卡背「命」字', () => {
  const { ctx, texts } = fakeCanvas();
  drawPillars(createPainter(ctx, 360, 360), { pillars: chart, active: true, duration: 2.4 }, 0);
  assert.equal(texts.filter((t) => t.s === '命').length, 4);
});
