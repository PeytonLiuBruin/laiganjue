// e2e 舞台等待可用 LGJ_STAGE_TIMEOUT 放宽（第 28 轮）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStageTimeout, scaled, DEFAULT_STAGE_TIMEOUT } from '../scripts/stage-timeout.mjs';

test('未设置或无效时用默认 120 秒', () => {
  for (const v of [undefined, null, '', '  ', 'abc', '-5', '1000', 'NaN']) {
    assert.equal(parseStageTimeout(v), DEFAULT_STAGE_TIMEOUT, String(v));
  }
});

test('合法值按毫秒解析，支持下划线分隔', () => {
  assert.equal(parseStageTimeout('240000'), 240_000);
  assert.equal(parseStageTimeout('240_000'), 240_000);
  assert.equal(parseStageTimeout(30_000), 30_000);
});

test('测试级超时按放宽倍数放大，只放大不缩小', () => {
  assert.equal(scaled(900_000, 2), 1_800_000);
  assert.equal(scaled(15_000, 1.5), 22_500);
  assert.equal(scaled(300_000, .5), 300_000);
});
