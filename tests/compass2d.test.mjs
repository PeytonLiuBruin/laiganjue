// 风水罗盘 2D 回退（第 43 轮）：没有 WebGL 时也用 3D 盘面同一套四圈色带与粗字
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawCompass, COMPASS_2D } from '../src/ui/models/objects.js';
import { createPainter } from '../src/ui/models/painter.js';
import { COMPASS_FACE } from '../src/ui/stage/scenes/compass.js';

function fakeCanvas() {
  const fills = [], texts = [];
  const grad = () => ({ addColorStop() {} });
  const ctx = new Proxy({}, {
    get: (t, k) => {
      if (k in t) return t[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return grad;
      if (k === 'fill') return () => fills.push(String(t.fillStyle));
      if (k === 'fillText') return (s) => texts.push({ s: String(s), color: String(t.fillStyle), font: String(t.font) });
      return () => {};
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return { ctx, fills, texts };
}

test('2D 罗盘色带与 3D 盘面一致', () => {
  for (const k of ['ink', 'red', 'cream', 'jade', 'gold', 'navy']) assert.equal(COMPASS_2D[k], COMPASS_FACE[k], k);
  assert.deepEqual(COMPASS_2D.bands, COMPASS_FACE.bands);
});

test('画出四圈色带，二十四山、八卦、八方都是 900 粗字且不小于 12px', () => {
  const { ctx, fills, texts } = fakeCanvas();
  const p = createPainter(ctx, 360, 360);
  drawCompass(p, { angle: 30 });
  for (const k of ['red', 'cream', 'jade', 'gold', 'navy']) assert.ok(fills.includes(COMPASS_2D[k]), k);
  assert.ok(texts.length >= 24 + 8 + 8);
  for (const t of texts) {
    assert.match(t.font, /^900 /);
    assert.ok(parseFloat(t.font.split(' ')[1]) >= 12, t.s);
  }
  assert.ok(texts.some((t) => t.s === '☵' && t.color === '#ffffff'));
});
