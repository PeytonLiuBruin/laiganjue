// 四柱命牌卡通化（第 21 轮）：五行色饱和、牌面贴图比例与牌面一致、字带深墨描边、未排盘时是问号圆章
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WX, TABLET_TEX, drawTablet } from '../src/ui/stage/scenes/pillars.js';

function fakeCtx() {
  const calls = [];
  const rec = (name) => (...a) => calls.push({ name, a, fill: ctx.fillStyle, stroke: ctx.strokeStyle });
  const ctx = { calls, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', lineJoin: '' };
  for (const n of ['clearRect', 'fillRect', 'strokeRect', 'beginPath', 'roundRect', 'rect', 'arc', 'fill', 'stroke', 'fillText', 'strokeText']) ctx[n] = rec(n);
  ctx.measureText = (t) => ({ width: t.length * 40 });
  return ctx;
}

test('五行色饱和度 ≥ 65%，明度在 45%–70%', () => {
  for (const [el, hex] of Object.entries(WX)) {
    const hsl = {}; new THREE.Color(hex).getHSL(hsl, THREE.SRGBColorSpace);
    assert.ok(hsl.s >= .65, `${el} 饱和度 ${hsl.s.toFixed(2)}`);
    assert.ok(hsl.l >= .45 && hsl.l <= .7, `${el} 明度 ${hsl.l.toFixed(2)}`);
  }
});

test('牌面贴图与 0.44 × 1.29 的牌面同比例（字不被拉长）', () => {
  const [w, h] = TABLET_TEX;
  assert.ok(Math.abs(w / h - .44 / 1.29) < .01);
});

test('排盘后干支带深墨描边并按五行着色，未排盘时画问号', () => {
  const c = fakeCtx();
  drawTablet(c, ...TABLET_TEX, { label: '日柱', gan: '庚', zhi: '辰', ganElement: '金', zhiElement: '土', shiShen: '日主' }, 2, false);
  const strokes = c.calls.filter((x) => x.name === 'strokeText').map((x) => x.a[0]);
  assert.deepEqual(strokes, ['庚', '辰']);
  const fills = Object.fromEntries(c.calls.filter((x) => x.name === 'fillText').map((x) => [x.a[0], x.fill]));
  assert.equal(fills['庚'], WX.金); assert.equal(fills['辰'], WX.土);
  assert.ok('日主' in fills && '日柱' in fills);

  const e = fakeCtx();
  drawTablet(e, ...TABLET_TEX, null, 0, false);
  const texts = e.calls.filter((x) => x.name === 'fillText').map((x) => x.a[0]);
  assert.deepEqual(texts, ['年柱', '?', '?']);
});
