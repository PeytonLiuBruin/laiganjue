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

  // 黄历只用点按，不会弹「用手机动作来玩」邀请（那个抽屉打开时焦点归抽屉，是对的）
  await page.evaluate(() => { location.hash = '#/m/almanac'; });
  await page.waitForSelector('.view-module[data-module="almanac"][data-ready="1"]', { timeout: STAGE_TIMEOUT });
  await page.waitForFunction(() => document.querySelector('[role="status"].sr-only')?.textContent === '黄历');
  assert.equal(await page.title(), '黄历 · 来感觉');
  assert.equal(await page.evaluate(() => document.querySelector('.sheet.open') ? 'sheet' : document.activeElement?.classList.contains('hd-title')), true, '焦点在顶栏标题');

  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForFunction(() => document.querySelector('[role="status"].sr-only')?.textContent === '首页');
  assert.match(await page.title(), /^来感觉/);
  await context.close();
});

test('阅读字号：设置里选「特大」后示例句与结果条放大 1.25 倍，重开 App 仍保留', async () => {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  await context.addInitScript(() => { try { localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:zen.auto', 'false'); } catch {} });
  const page = await context.newPage();
  await page.goto(base + '#/', { waitUntil: 'load' });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.textSize), 'normal');
  await page.click('.app-header [aria-label="设置"]');
  await page.waitForSelector('.sheet.open .text-size-sample');
  const zoomOf = (sel) => page.evaluate((s) => getComputedStyle(document.querySelector(s)).zoom, sel);
  assert.equal(await zoomOf('.sheet.open .text-size-sample'), '1');
  await page.locator('.sheet.open .chip', { hasText: '特大' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.textSize), 'xl');
  assert.equal(await zoomOf('.sheet.open .text-size-sample'), '1.25');
  // 设置抽屉本身不放大，开关行不会挤成两行
  assert.equal(await zoomOf('.sheet.open .settings-body'), '1');
  assert.equal(await page.evaluate(() => localStorage.getItem('lgj:text.size')), '"xl"');

  await page.goto(base + '#/m/coin', { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.textSize), 'xl');
  await page.waitForSelector('.view-module[data-module="coin"][data-ready="1"]', { timeout: STAGE_TIMEOUT });
  await page.evaluate(() => document.querySelector('.sheet.open .icon-btn')?.click());
  await page.locator('.view-module [data-action="primary"]').first().click();
  await page.waitForSelector('.ritual-receipt [data-read]', { timeout: STAGE_TIMEOUT });
  assert.equal(await zoomOf('.ritual-receipt .ritual-receipt-copy'), '1.25');
  assert.equal(await zoomOf('.ritual-receipt .ritual-receipt-actions'), '1', '结果条里的按钮不放大');
  await context.close();
});
