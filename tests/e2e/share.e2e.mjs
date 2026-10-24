// 结果分享卡端到端测试：点「分享」先出预览，卡片里有器物画面（WebGL 舞台与 2D 画布回退都要有像素），
// 免费版带「开通 Pro 去掉水印」，Pro 不带。运行：npm run e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildAll } from '../../scripts/build.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';
import { launchBrowser } from '../../scripts/browser.mjs';

const out = path.join(os.tmpdir(), `lgj-share-${process.pid}`);
const BENIGN = [/AudioContext was not allowed/, /ERR_TUNNEL_CONNECTION_FAILED|fonts\.g(oogleapis|static)\.com|Failed to load resource/, /WebGL|GL Driver|GPU stall/];

let server, base;
before(async () => {
  await rm(out, { recursive: true, force: true });
  await buildAll({ out, min: true });
  server = createStaticServer(out);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(async () => {
  server?.close();
  await rm(out, { recursive: true, force: true });
});

async function openCaiyun(browser, extra = {}) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.addInitScript((extra) => {
    try {
      localStorage.setItem('lgj:onboarded', 'true');
      for (const [k, v] of Object.entries(extra)) localStorage.setItem('lgj:' + k, JSON.stringify(v));
    } catch {}
  }, extra);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !BENIGN.some((r) => r.test(m.text()))) errors.push('console: ' + m.text()); });
  await page.goto(base + '#/m/caiyun', { waitUntil: 'load' });
  await page.waitForSelector('.view-module[data-module="caiyun"][data-ready="1"]', { timeout: 30_000 });
  await page.evaluate(() => document.querySelector('.sheet.open .icon-btn')?.click());
  const share = page.locator('.sheet.open .sheet-actions button', { hasText: '分享' });
  const primary = page.locator('.view-module [data-action="primary"]').first();
  const read = page.locator('.view-module .ritual-receipt [data-read="1"]');
  for (let i = 0; i < 40 && !(await share.count()); i++) {
    if (await read.count()) await read.first().click({ force: true }).catch(() => {});
    else if (await primary.isEnabled().catch(() => false)) await primary.click({ force: true }).catch(() => {});
    await page.waitForTimeout(800);
  }
  assert.ok(await share.count(), '财运结果抽屉里有「分享」');
  return { page, context, errors, share };
}

/** 分享卡图片器物区域（上部）的像素差异：纯色块说明没拍到器物。 */
const imageStats = (page) => page.evaluate(async () => {
  const img = document.querySelector('.sheet.open .share-card-img');
  await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(160, 300, 760, 420).data;
  const seen = new Set();
  for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4));
  return { w: img.naturalWidth, h: img.naturalHeight, colors: seen.size };
});

for (const webgl of [false, true]) {
  test(`分享卡预览（${webgl ? 'WebGL 舞台' : '2D 画布回退'}）：有器物画面，免费版有去水印入口`, { timeout: 180_000 }, async () => {
    const browser = await launchBrowser({ webgl });
    try {
      const { page, errors, share } = await openCaiyun(browser);
      await page.waitForTimeout(600); await share.first().evaluate((b) => b.click());
      await page.waitForSelector('.sheet.open .share-card-img', { timeout: 10_000 });
      const s = await imageStats(page);
      assert.equal(s.w, 1080);
      assert.ok(s.h >= 1350, `高度 ${s.h}`);
      assert.ok(s.colors > 12, `器物区域只有 ${s.colors} 种颜色，像是空白`);
      assert.equal(await page.locator('.sheet.open .share-card-pro').count(), 1, '免费版显示去水印入口');
      // 抽屉还在滑入时 Playwright 会判定按钮在视口外（Mac 高负载下偶发），直接派发点击
      await page.locator('.sheet.open .sheet-actions button', { hasText: '只分享文字' }).evaluate((b) => b.click());
      await page.waitForFunction(() => !document.querySelector('.sheet.open .share-card'), null, { timeout: 10_000 });
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}

test('Pro 的分享卡没有去水印入口', { timeout: 180_000 }, async () => {
  const browser = await launchBrowser({ webgl: false });
  try {
    // 权益缓存里预置永久 Pro（网页版没有商店，不会被刷新覆盖）
    const { page, share } = await openCaiyun(browser, { 'iap.state': { pro: true, plan: 'lifetime', until: null } });
    await page.waitForTimeout(600); await share.first().evaluate((b) => b.click());
    await page.waitForSelector('.sheet.open .share-card-img', { timeout: 10_000 });
    assert.equal(await page.locator('.sheet.open .share-card-pro').count(), 0);
  } finally { await browser.close(); }
});

// 没有器物画布的玩法：分享卡用玩法自己画的配图（塔罗牌面、黄历宜忌、星座金币）
for (const mod of ['tarot', 'almanac', 'zodiac']) {
  test(`${mod} 的分享卡使用玩法配图`, { timeout: 180_000 }, async () => {
    const browser = await launchBrowser({ webgl: false });
    try {
      const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'zh-CN', reducedMotion: 'reduce' });
      await context.addInitScript(() => { try { localStorage.setItem('lgj:onboarded', 'true'); } catch {} });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
      await page.goto(base + '#/m/' + mod, { waitUntil: 'load' });
      await page.waitForSelector(`.view-module[data-module="${mod}"][data-ready="1"]`, { timeout: 30_000 });
      await page.evaluate(() => document.querySelector('.sheet.open .icon-btn')?.click());
      const share = page.locator('.sheet.open .sheet-actions button', { hasText: /^分享$/ });
      const primary = page.locator('.view-module [data-action="primary"]').first();
      const read = page.locator('.view-module .ritual-receipt [data-read="1"]');
      for (let i = 0; i < 40 && !(await share.count()); i++) {
        if (await read.count()) await read.first().click({ force: true }).catch(() => {});
        else await primary.click({ force: true }).catch(() => {});
        await page.waitForTimeout(800);
      }
      assert.ok(await share.count(), `${mod} 结果抽屉里有「分享」`);
      await page.waitForTimeout(600); await share.first().evaluate((b) => b.click());
      await page.waitForSelector('.sheet.open .share-card-img[data-art]', { timeout: 10_000 });
      assert.equal(await page.getAttribute('.sheet.open .share-card-img', 'data-art'), '1', '配图画成功');
      const s = await imageStats(page);
      assert.ok(s.colors > 12, `配图区域只有 ${s.colors} 种颜色`);
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
