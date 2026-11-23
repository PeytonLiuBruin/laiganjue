// 星仪卡通化（第 69 轮）：浑仪三道环不再是青铜橙褐，刻度少而粗
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SKY_TOON } from '../src/ui/stage/scenes/sky.js';

const hsl = (hex) => { const o = {}; new THREE.Color(hex).getHSL(o, THREE.SRGBColorSpace); return o; };

test('环是饱和亮金（色相 35° 到 55°，饱和度 ≥ 85%，明度 ≥ 55%），不是青铜橙褐', () => {
  const c = hsl(SKY_TOON.ring);
  assert.ok(c.h * 360 >= 35 && c.h * 360 <= 55, `色相 ${(c.h * 360).toFixed(0)}`);
  assert.ok(c.s >= .85 && c.l >= .55, `s ${c.s.toFixed(2)} l ${c.l.toFixed(2)}`);
});

test('刻度不超过 12 道且足够粗（原来 36 道 0.012 宽，手机上糊成锯齿）', () => {
  assert.ok(SKY_TOON.ticks <= 12);
  assert.ok(SKY_TOON.tickSize[0] >= .03);
});

test('环管径 ≥ 0.045，子午环与底座和环的颜色不同，层次分得开', () => {
  assert.ok(SKY_TOON.ringTube >= .045 && SKY_TOON.meridianTube >= .045);
  assert.notEqual(SKY_TOON.meridian, SKY_TOON.ring);
  assert.notEqual(SKY_TOON.stand, SKY_TOON.ring);
});
