// 第 24 轮：11 件 3D 器物在正方形舞台里从静止、动作（预备 → 过冲 → 回弹）到揭晓放大全程不顶出画面。
// 用真实场景在无头 Chromium 里逐帧投影主角的全部顶点（scripts/stage-frame.mjs），比只算几个关键点更可靠。
// 标准见 visual-direction.md 第 2 节「动效」：最高点 ndc.y < 0.9，左右与下沿留 5% 以上。
import test from 'node:test';
import assert from 'node:assert/strict';
import { measureFrames, FRAME_STATES } from '../../scripts/stage-frame.mjs';
import { scaled } from '../../scripts/stage-timeout.mjs';

test('11 件器物过冲与揭晓时不顶出画面', { timeout: scaled(600_000) }, async () => {
  const res = await measureFrames();
  assert.equal(Object.keys(res).length, Object.keys(FRAME_STATES).length, '每件器物都测到');
  const bad = [];
  for (const [id, phases] of Object.entries(res)) {
    for (const [phase, b] of Object.entries(phases)) {
      if (!b) { bad.push(`${id} ${phase} 没有可见主角`); continue; }
      if (b.maxY >= .9) bad.push(`${id} ${phase} 顶 ${b.maxY.toFixed(3)}`);
      if (b.minY <= -.95) bad.push(`${id} ${phase} 底 ${b.minY.toFixed(3)}`);
      if (Math.max(-b.minX, b.maxX) >= .95) bad.push(`${id} ${phase} 左右 ${b.minX.toFixed(3)} / ${b.maxX.toFixed(3)}`);
    }
  }
  assert.deepEqual(bad, []);
});
