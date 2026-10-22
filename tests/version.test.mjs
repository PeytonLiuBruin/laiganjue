import test from 'node:test';
import assert from 'node:assert/strict';
import { versionText } from '../src/ui/version.js';
import { buildInfo } from '../scripts/build.mjs';

test('版本行：版本号、构建号、本地时间、提交', () => {
  const info = { version: '1.0.0', build: 92, commit: 'cd09825', time: '2026-10-22T23:40:00.000Z' };
  assert.equal(versionText(info, 'America/Los_Angeles'), '版本 1.0.0 · 第 92 版 · 10月22日 16:40 · cd09825');
  assert.equal(versionText(info, 'Asia/Shanghai'), '版本 1.0.0 · 第 92 版 · 10月23日 07:40 · cd09825');
  assert.equal(versionText(null), '版本 开发模式');
});

test('构建信息来自 package.json 与 git', async () => {
  const info = await buildInfo();
  assert.match(info.version, /^\d+\.\d+\.\d+$/);
  assert.ok(info.build > 0, '构建号是提交数');
  assert.match(info.commit, /^[0-9a-f]{7,}\+?$|^dev$/);
});
