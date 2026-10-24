import test from 'node:test';
import assert from 'node:assert/strict';
import { woodGrainPlan, WOOD_TOON } from '../src/ui/stage/organic.js';

test('卡通木纹：只有少量粗纹，没有细年轮', () => {
  for (const seed of [12, 34, 45, 72, 92, 112]) {
    const p = woodGrainPlan(seed);
    assert.ok(p.bands.length <= 3, '至多 3 道纹');
    for (const b of p.bands) assert.ok(b.width >= WOOD_TOON.bandWidth[0], `纹宽 ${b.width} 不低于 ${WOOD_TOON.bandWidth[0]}px`);
    assert.ok(p.knots.length <= 1, '至多 1 个节疤');
  }
});

test('卡通木纹：横向可无缝平铺，纵向不出边', () => {
  for (const seed of [12, 34, 45, 72, 92, 112]) {
    const p = woodGrainPlan(seed);
    for (const b of p.bands) {
      const cycles = b.freq * p.size / (Math.PI * 2);
      assert.ok(Math.abs(cycles - Math.round(cycles)) < 1e-9, '正弦在贴图宽度内整周期');
      assert.ok(b.y - b.width * .62 - b.amp - 3 > 0 && b.y + b.amp + b.width / 2 < p.size, '纹路留在贴图内');
    }
  }
});

test('卡通木纹：同一种子结果稳定，深纹透明度克制', () => {
  assert.deepEqual(woodGrainPlan(72), woodGrainPlan(72));
  assert.ok(WOOD_TOON.dark <= .25 && WOOD_TOON.light <= .25);
});
