// 揭晓帧卡通化（第 27 轮）：同心结不再泛白发粉，星盘十二支看得清，红线「囍」有描边
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { KNOT_REVEAL } from '../src/ui/stage/scenes/knot.js';
import { SKY_BRANCH } from '../src/ui/stage/scenes/sky.js';
import { XI_TOON } from '../src/ui/stage/scenes/thread.js';

const hsl = (hex) => { const o = {}; new THREE.Color(hex).getHSL(o, THREE.SRGBColorSpace); return o; };
const lum = (hex) => { const c = new THREE.Color(hex); return .2126 * c.r + .7152 * c.g + .0722 * c.b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };

test('同心结揭晓：补光不再是粉色、强度 ≤ 0.6，光晕在金章背后，字面发光 ≤ 0.5', () => {
  const light = hsl(KNOT_REVEAL.light);
  assert.ok(light.h * 360 >= 30 && light.h * 360 <= 60, `补光色相 ${(light.h * 360).toFixed(0)}`);
  assert.ok(KNOT_REVEAL.lightPeak <= .6);
  assert.ok(KNOT_REVEAL.haloZ < 0, '光晕放在金章后面');
  assert.ok(KNOT_REVEAL.textPeak <= .5);
  assert.ok(contrast(KNOT_REVEAL.text, KNOT_REVEAL.textStroke) >= 3);
});

test('星盘十二支：深字浅底对比度 ≥ 7，章面不小于 0.18', () => {
  assert.ok(contrast(SKY_BRANCH.text, SKY_BRANCH.badge) >= 7, contrast(SKY_BRANCH.text, SKY_BRANCH.badge).toFixed(1));
  assert.ok(SKY_BRANCH.size >= .18 && SKY_BRANCH.onSize > SKY_BRANCH.size);
  assert.ok(SKY_BRANCH.font / SKY_BRANCH.px >= .55, '字占章面一半以上');
  // 12 枚圆章排在半径 0.64 的圆上，放大后的那枚也不和邻居重叠
  assert.ok(2 * Math.PI * .64 / 12 > (SKY_BRANCH.size + SKY_BRANCH.onSize) / 2);
});

test('红线「囍」：饱和红字、深色描边与更宽的金边', () => {
  const f = hsl(XI_TOON.fill);
  assert.ok(f.s >= .65 && f.l >= .45 && f.l <= .7);
  assert.ok(contrast(XI_TOON.fill, XI_TOON.stroke) >= 2.5);
  assert.ok(XI_TOON.edgeW > XI_TOON.strokeW && XI_TOON.strokeW >= XI_TOON.font * .08);
  assert.ok(XI_TOON.font + XI_TOON.edgeW / 2 <= XI_TOON.px, '金边不出贴图');
});
