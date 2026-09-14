import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { rm } from 'node:fs/promises';
import { buildAll } from './build.mjs';
import { createStaticServer } from './serve.mjs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmpOut = path.join(os.tmpdir(), `lgj-rn-dbg-${process.pid}`);
await rm(tmpOut, { recursive: true, force: true });
await buildAll({ out: tmpOut, min: false, only: ['runes'] });
const server = createStaticServer(tmpOut);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const { chromium } = await import('playwright');
async function launchBrowser() {
  try { return await chromium.launch(); } catch (e) {
    const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'; const c = [];
    if (fs.existsSync(b)) for (const d of fs.readdirSync(b)) for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome']) { const q = path.join(b, d, sub); if (fs.existsSync(q)) c.push(q); }
    if (!c.length) throw e; return chromium.launch({ executablePath: c[0] });
  }
}
const browser = await launchBrowser();
for (const [vw, vh] of [[375, 667], [390, 844]]) {
  for (const mode of ['click', 'touch']) {
    const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' });
    await context.addInitScript(() => { try { localStorage.setItem('lgj:theme', JSON.stringify('paper')); } catch {} });
    const page = await context.newPage();
    page.on('console', (m) => { if (m.type() === 'error') console.log('console.error', m.text()); });
    page.on('pageerror', (e) => console.log('pageerror', e.message));
    await page.goto(base + '#/m/runes', { waitUntil: 'load' });
    await page.waitForSelector('.view-module[data-module="runes"][data-ready="1"]');
    await sleep(400);
    await page.evaluate(() => window.__lgj?.simulate?.('shake', { intensity: 25 }));
    await sleep(4400);
    const primary = await page.$('[data-action="primary"]:not([disabled])');
    await primary.click({ force: true });
    await sleep(4200);
    const stone = await page.$('.m-runes .rn-stone.flipped');
    const box = await stone.boundingBox();
    const info = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return { tag: el?.tagName, cls: el?.className, scrollY: window.scrollY }; }, [box.x + box.width / 2, box.y + box.height / 2]);
    console.log(`\n[${vw}x${vh} ${mode}] stone center`, Math.round(box.x + box.width / 2), Math.round(box.y + box.height / 2), 'elementFromPoint:', info);
    if (mode === 'click') await stone.click({ force: true });
    else await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    for (const t of [30, 150, 400, 900]) {
      await sleep(t === 30 ? 30 : t - (t === 150 ? 30 : t === 400 ? 150 : 400));
      const st = await page.evaluate(() => ({ sheets: document.querySelectorAll('.sheet').length, open: document.querySelectorAll('.sheet.open').length, backdrop: document.querySelectorAll('.sheet-backdrop').length }));
      console.log(`  t=${t}ms`, JSON.stringify(st));
    }
    await context.close();
  }
}
await browser.close(); server.close(); await rm(tmpOut, { recursive: true, force: true });
