import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bufferSize, bufferChanged } from '../src/ui/stage/buffer.js';

test('画布像素尺寸与 three.js setSize 一致（向下取整）', () => {
  assert.deepEqual(bufferSize(393, 360.5, 2), { width: 786, height: 721 });
  assert.deepEqual(bufferSize(393, 360, 1.5), { width: 589, height: 540 });
});

test('尺寸和像素比都没变时不改画布，免得清空缓冲闪白', () => {
  const canvas = { width: 786, height: 720 };
  assert.equal(bufferChanged(canvas, 2, 393, 360, 2), false);
  assert.equal(bufferChanged(canvas, 2, 393.2, 360.1, 2), false, '亚像素抖动不算变化');
  assert.equal(bufferChanged(canvas, 2, 430, 360, 2), true, '宽度变了');
  assert.equal(bufferChanged(canvas, 2, 393, 360, 1.5), true, '降画质改像素比');
  assert.equal(bufferChanged({ width: 300, height: 150 }, 1, 393, 360, 2), true, '新建画布的默认尺寸');
});

test('引擎改了画布尺寸后在同一个函数里立刻补画', async () => {
  const src = await readFile(new URL('../src/ui/stage/engine.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('function resize()'), src.indexOf('function adapt('));
  assert.match(body, /bufferChanged\(/, 'resize 先判断是否需要改尺寸');
  assert.match(body, /if \(changed\) \{ renderer\.setPixelRatio\(ratio\); renderer\.setSize\(/, '只在变化时 setSize');
  assert.match(body, /if \(changed && compiled\) render\(\);/, '改完立即补画一帧');
  assert.ok(body.indexOf('render();') > body.indexOf('updateProjectionMatrix'), '补画在相机更新之后');
});
