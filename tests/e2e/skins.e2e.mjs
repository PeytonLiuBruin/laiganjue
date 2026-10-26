// 皮肤商店端到端测试：付费皮肤带「Pro · 试穿」角标，点了先试穿（顶部倒计时条），
// 结束试穿换回原皮肤且不写入存储，点「解锁」出单套皮肤购买卡，Pro 用户直接换上。运行：npm run e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildAll } from '../../scripts/build.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';
import { launchBrowser } from '../../scripts/browser.mjs';

const out = path.join(os.tmpdir(), `lgj-skins-${process.pid}`);
const BENIGN = [/AudioContext was not allowed/, /ERR_TUNNEL_CONNECTION_FAILED|fonts\.g(oogleapis|static)\.com|Failed to load resource/, /WebGL|GL Driver|GPU stall/];

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

async function open(extra = {}) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.addInitScript((extra) => {
    try {
      localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:zen.auto', 'false');
      for (const [k, v] of Object.entries(extra)) localStorage.setItem('lgj:' + k, JSON.stringify(v));
    } catch {}
  }, extra);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !BENIGN.some((r) => r.test(m.text()))) errors.push('console: ' + m.text()); });
  await page.goto(base, { waitUntil: 'load' });
  await page.locator('.app-header button[aria-label="换皮肤"]').click();
  await page.waitForSelector('.sheet.open .theme-grid');
  return { page, context, errors };
}
const themeNow = (page) => page.evaluate(() => [document.documentElement.dataset.theme, localStorage.getItem('lgj:theme')]);

test('付费皮肤：试穿后结束换回原皮肤，不写入存储', { timeout: 60_000 }, async () => {
  const { page, context, errors } = await open({ theme: 'paper' });
  assert.equal(await page.locator('.sheet.open .swatch-tag.is-locked').count(), 3, '三套付费皮肤带试穿角标');
  assert.equal(await page.locator('.sheet.open .skin-pro-card').count(), 1, '皮肤抽屉里有 Pro 入口');
  await page.locator('.sheet.open .theme-swatch[data-skin="nebula"]').click();
  await page.waitForSelector('.skin-try.in', { timeout: 5_000 });
  assert.deepEqual(await themeNow(page), ['nebula', '"paper"'], '试穿时换装但不保存');
  assert.match(await page.locator('.skin-try').innerText(), /试穿「星穹」/);
  await page.locator('.skin-try-close').click();
  await page.waitForFunction(() => !document.querySelector('.skin-try'), null, { timeout: 5_000 });
  assert.deepEqual(await themeNow(page), ['paper', '"paper"']);
  assert.deepEqual(errors, []);
  await context.close();
});

test('付费皮肤：点「解锁」出购买卡，关掉没买换回原皮肤', { timeout: 60_000 }, async () => {
  const { page, context, errors } = await open({ theme: 'ink' });
  await page.locator('.sheet.open .theme-swatch[data-skin="cinnabar"]').click();
  await page.waitForSelector('.skin-try.in');
  await page.locator('.skin-try-unlock').click();
  await page.waitForSelector('.sheet.open.skin-sheet', { timeout: 5_000 });
  const text = await page.locator('.sheet.open.skin-sheet').innerText();
  assert.match(text, /「朱砂」皮肤/);
  assert.match(text, /开通 Pro · 解锁全部皮肤/);
  assert.match(text, /网页版不提供购买/);
  assert.match(text, /不会自动续费/);
  assert.equal(await themeNow(page).then((t) => t[0]), 'cinnabar', '购买卡打开时仍在试穿');
  await page.locator('.sheet.open.skin-sheet .sheet-head .icon-btn').click();
  await page.waitForFunction(() => !document.querySelector('.skin-try'), null, { timeout: 5_000 });
  assert.deepEqual(await themeNow(page), ['ink', '"ink"']);
  assert.deepEqual(errors, []);
  await context.close();
});

test('Pro：付费皮肤直接换上并保存，没有 Pro 入口卡', { timeout: 60_000 }, async () => {
  const { page, context, errors } = await open({ theme: 'paper', 'dev.pro': true });
  assert.equal(await page.locator('.sheet.open .swatch-tag.is-locked').count(), 0);
  assert.equal(await page.locator('.sheet.open .skin-pro-card').count(), 0);
  await page.locator('.sheet.open .theme-swatch[data-skin="celadon"]').click();
  assert.deepEqual(await themeNow(page), ['celadon', '"celadon"']);
  assert.equal(await page.locator('.skin-try').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('存储里是没买的付费皮肤时，启动换回宣纸', { timeout: 60_000 }, async () => {
  const { page, context } = await open({ theme: 'nebula' });
  assert.equal((await themeNow(page))[0], 'paper');
  await context.close();
});
