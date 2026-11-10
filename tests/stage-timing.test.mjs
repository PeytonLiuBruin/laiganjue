// 第 54 轮：舞台初始化分段计时与探针脚本、官印揭晓时印文朝向镜头。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const engine = readFileSync(new URL('../src/ui/stage/engine.js', import.meta.url), 'utf8');
const seal = readFileSync(new URL('../src/ui/stage/scenes/seal.js', import.meta.url), 'utf8');
const probe = readFileSync(new URL('../scripts/stage-probe.mjs', import.meta.url), 'utf8');

test('舞台 inspect() 带分段耗时、着色器程序数与材质数', () => {
  for (const k of ['timing.setup', 'timing.build', 'timing.toon', 'timing.compile', 'timing.firstFrame']) assert.ok(engine.includes(k), k);
  assert.match(engine, /programs: renderer\.info\.programs\?\.length/);
  assert.match(engine, /timing: \{ \.\.\.timing \}/);
});

test('探针脚本覆盖全部带 3D 舞台的玩法页并读取 inspect()', () => {
  for (const r of ['m/crystal', 'm/caiyun', 'm/yinyuan', 'm/shiye', 'm/zodiac', 'm/bazi', 'm/fengshui']) assert.ok(probe.includes(`'${r}'`), r);
  assert.match(probe, /__stage/);
  assert.match(probe, /inspect\(\)/);
});

test('官印揭晓后印文翘起朝向镜头并放大，镂空处补纸色', () => {
  assert.match(seal, /stamp\.rotation\.x = -Math\.PI \/ 2 \+ aside \* \.\d+/);
  assert.match(seal, /\(1 \+ aside \* \.\d+\)/);
  assert.match(seal, /destination-over/);
});
