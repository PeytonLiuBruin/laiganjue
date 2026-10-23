// 皮肤商店截图：皮肤抽屉、试穿条、单套皮肤购买卡、Pro 用户的皮肤抽屉，393×852 与 430×932 两种尺寸。
// 用法：node scripts/skin-shots.mjs [--out docs/claude-plan/screenshots]
// 输出 skins-<步骤>-<尺寸>.png，并检查横向溢出与文字截断，结果追加到 <out>/skins-report.json。
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build.mjs';
import { createStaticServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const out = path.resolve(root, opt('--out', 'docs/claude-plan/screenshots'));
const VIEWPORTS = [{ name: '393x852', width: 393, height: 852 }, { name: '430x932', width: 430, height: 932 }];

await mkdir(out, { recursive: true });
const dist = path.join(root, 'dist');
await buildAll({ out: dist, min: false });
const server = createStaticServer(dist);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await launchBrowser();
const report = [];

const check = (page) => page.evaluate(() => {
  const overflow = document.documentElement.scrollWidth > window.innerWidth + 1;
  const clipped = [...document.querySelectorAll('.sheet.open *, .skin-try *')]
    .filter((el) => el.children.length === 0 && el.textContent.trim() && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible')
    .map((el) => el.textContent.trim().slice(0, 20));
  const bar = document.querySelector('.skin-try');
  const barOut = bar ? (() => {
    const r = bar.getBoundingClientRect();
    const spill = [...bar.children].some((c) => { const k = c.getBoundingClientRect(); return k.right > r.right + 1 || k.left < r.left - 1; });
    return r.left < 0 || r.right > window.innerWidth || spill;
  })() : false;
  return { overflow, clipped, barOut };
});

for (const vp of VIEWPORTS) {
  for (const pro of [false, true]) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN', reducedMotion: 'reduce' });
    await context.addInitScript((pro) => {
      try {
        localStorage.setItem('lgj:onboarded', 'true');
        localStorage.setItem('lgj:theme', '"paper"');
        localStorage.setItem('lgj:stage.fps', 'false');
        if (pro) localStorage.setItem('lgj:dev.pro', 'true');
      } catch {}
    }, pro);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '#/m/caiyun', { waitUntil: 'load' });
    await page.waitForSelector('.view-module[data-ready="1"]', { timeout: 30_000 }).catch(() => {});
    await page.evaluate(() => document.querySelector('.sheet.open .icon-btn')?.click());
    await page.waitForTimeout(500);
    await page.locator('.app-header button[aria-label="换皮肤"]').click();
    await page.waitForSelector('.sheet.open .theme-grid');
    await page.waitForTimeout(500);
    const shot = async (step) => {
      const file = `skins-${step}-${vp.name}.png`;
      await page.screenshot({ path: path.join(out, file) });
      report.push({ file, ...(await check(page)), errors: [...errors] });
      console.log('shot', file);
    };
    if (pro) { await shot('sheet-pro'); await context.close(); continue; }
    await shot('sheet');
    await page.locator('.sheet.open .theme-swatch[data-skin="nebula"]').click();
    await page.waitForSelector('.skin-try.in');
    await page.waitForTimeout(1600);
    await shot('tryon');
    await page.locator('.skin-try-unlock').click();
    await page.waitForSelector('.sheet.open.skin-sheet');
    await page.waitForTimeout(500);
    await shot('offer');
    await page.locator('.sheet.open.skin-sheet .skin-pro').click();
    await page.waitForSelector('.sheet.open.paywall:not(.skin-sheet)');
    await page.waitForTimeout(500);
    await shot('paywall');
    await context.close();
  }
}
await browser.close();
server.close();
await writeFile(path.join(out, 'skins-report.json'), JSON.stringify(report, null, 2));
const bad = report.filter((r) => r.overflow || r.clipped.length || r.barOut || r.errors.length);
console.log(bad.length ? `问题：${JSON.stringify(bad, null, 1)}` : '全部通过：无横向溢出、无截断、无报错');
