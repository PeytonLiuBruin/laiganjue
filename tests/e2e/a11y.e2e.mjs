// 读屏端到端测试：切换页面时隐藏的播报区只念新页面名，焦点落到顶栏标题，网页标题跟着变；首次打开不播报。
// 运行：npm run e2e（用 2D 画布回退，跑得快）
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildAll } from '../../scripts/build.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';
import { launchBrowser } from '../../scripts/browser.mjs';
import { STAGE_TIMEOUT } from '../../scripts/stage-timeout.mjs';

const out = path.join(os.tmpdir(), `lgj-a11y-${process.pid}`);

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

const announcer = (page) => page.evaluate(() => document.querySelector('[role="status"].sr-only')?.textContent ?? null);

test('切换页面只播报新页面名，焦点移到标题，网页标题跟着变', async () => {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  await context.addInitScript(() => { try { localStorage.setItem('lgj:onboarded', 'true'); } catch {} });
  const page = await context.newPage();
  await page.goto(base + '#/', { waitUntil: 'load' });
  await page.waitForSelector('.app-header .hd-title');
  await page.waitForTimeout(200);
  assert.equal(await announcer(page), '', '首次打开不播报');
  assert.equal(await page.evaluate(() => document.getElementById('app').hasAttribute('aria-live')), false);

  await page.evaluate(() => { location.hash = '#/m/coin'; });
  await page.waitForSelector('.view-module[data-module="coin"]', { timeout: STAGE_TIMEOUT });
  await page.waitForFunction(() => document.querySelector('[role="status"].sr-only')?.textContent === '硬币骰子');
  assert.equal(await page.title(), '硬币骰子 · 来感觉');
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains('hd-title')), true, '焦点在顶栏标题');

  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForFunction(() => document.querySelector('[role="status"].sr-only')?.textContent === '首页');
  assert.match(await page.title(), /^来感觉/);
  await context.close();
});
