// 罗盘盘面卡通化（第 26 轮）：纯色色带、粗分隔线、大号粗字，八卦符号带描边
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { COMPASS_FACE, drawFace } from '../src/ui/stage/scenes/compass.js';

function fakeCtx() {
  const calls = [];
  const ctx = { calls, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', lineJoin: '', lineCap: '' };
  const rec = (name) => (...a) => calls.push({ name, a, fill: ctx.fillStyle, stroke: ctx.strokeStyle, font: ctx.font, lw: ctx.lineWidth });
  for (const n of ['beginPath', 'arc', 'fill', 'stroke', 'moveTo', 'lineTo', 'fillText', 'strokeText', 'save', 'restore', 'translate', 'rotate', 'createRadialGradient']) ctx[n] = rec(n);
  return ctx;
}

test('色带由外到内递减，四圈颜色两两不同且饱和', () => {
  const b = COMPASS_FACE.bands;
  for (let i = 1; i < b.length; i++) assert.ok(b[i] < b[i - 1]);
  const cols = ['red', 'cream', 'jade', 'gold', 'navy'].map((k) => COMPASS_FACE[k]);
  assert.equal(new Set(cols).size, cols.length);
  for (const k of ['red', 'jade', 'gold']) {
    const hsl = {}; new THREE.Color(COMPASS_FACE[k]).getHSL(hsl, THREE.SRGBColorSpace);
    assert.ok(hsl.s >= .6, `${k} 饱和度 ${hsl.s.toFixed(2)}`);
  }
});

test('盘面不用渐变，字号 ≥ 54px 且为 900 粗体，八卦符号带深色描边', () => {
  const c = fakeCtx();
  drawFace(c, 1024);
  assert.equal(c.calls.filter((x) => x.name === 'createRadialGradient').length, 0);
  const texts = c.calls.filter((x) => x.name === 'fillText');
  assert.equal(texts.length, 24 + 8 + 8);
  for (const t of texts) {
    const m = /^900 (\d+)px/.exec(t.font);
    assert.ok(m && +m[1] >= 54, `字体 ${t.font}`);
  }
  const outlined = c.calls.filter((x) => x.name === 'strokeText');
  assert.equal(outlined.length, 8);
  for (const o of outlined) assert.equal(o.stroke, COMPASS_FACE.ink);
});

test('细刻度不超过 24 道（原来 120 道细线在手机上是噪点）', () => {
  const c = fakeCtx();
  drawFace(c, 1024);
  const thin = c.calls.filter((x) => x.name === 'stroke' && x.lw < 3);
  assert.equal(thin.length, 0);
});
