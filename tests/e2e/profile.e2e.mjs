// 共享生辰端到端测试：在姻缘、财运、事业里填过的生辰，第一次打开八字时自动带入，八字自己存过的生辰优先。
// 运行：npm run e2e（用 2D 画布回退，跑得快）
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildAll } from '../../scripts/build.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';
import { launchBrowser } from '../../scripts/browser.mjs';

const out = path.join(os.tmpdir(), `lgj-profile-${process.pid}`);
let server, base, browser;
before(async () => {
  await rm(out, { recursive: true, force: true });
  await buildAll({ out, min: true });
  server = createStaticServer(out);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await launchBrowser({ webgl: false });
});
after(async () => {
  await browser?.close();
  server?.close();
  await rm(out, { recursive: true, force: true });
});

async function baziForm(seed) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  await context.addInitScript((s) => { try { localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:zen.auto', 'false'); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); } catch {} }, seed);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '#/m/bazi', { waitUntil: 'load' });
  await page.waitForSelector('.view-module[data-module="bazi"][data-ready="1"]', { timeout: 30_000 });
  const values = await page.$$eval('.bz-form select', (els) => els.map((e) => e.value));
  await context.close();
  return { values, errors };
}

test('八字没存过生辰时带入共享生辰', async () => {
  const { values, errors } = await baziForm({ 'lgj:profile:self': { y: 2001, m: 3, d: 9, hour: -1, gender: 'female' } });
  assert.deepEqual(errors, []);
  assert.deepEqual(values.slice(0, 3), ['2001', '3', '9']);
});

test('八字自己存过的生辰优先于共享生辰', async () => {
  const { values } = await baziForm({ 'lgj:profile:self': { y: 2001, m: 3, d: 9, hour: -1, gender: 'female' }, 'lgj:bazi:birth': { y: 1999, m: 12, d: 1, hour: -1, gender: 'male' } });
  assert.deepEqual(values.slice(0, 3), ['1999', '12', '1']);
});
