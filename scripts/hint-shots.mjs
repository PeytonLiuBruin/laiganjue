// 「轻点舞台可快进」首次提示的 iPhone 截图：财运页点主按钮后 0.4 秒截一张。
// 用法：node scripts/hint-shots.mjs [--out docs/claude-plan/screenshots]（需先 npm run build 生成 dist）
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const i = args.indexOf('--out');
const out = path.resolve(root, i >= 0 ? args[i + 1] : 'docs/claude-plan/screenshots');
await mkdir(out, { recursive: true });
const server = createStaticServer(path.join(root, 'dist'));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await launchBrowser();
for (const vp of [{ width: 393, height: 852 }, { width: 430, height: 932 }]) {
 // 软件渲染下截图本身要一两秒，提示 2.6 秒后收起，可能拍到时已经不在：截完检查一下，最多重拍 3 次
 for (let attempt = 1; attempt <= 3; attempt++) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  await ctx.addInitScript(() => { try { localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:zen.auto', 'false'); localStorage.setItem('lgj:stage.fps', 'false'); } catch {} });
  ctx.setDefaultTimeout(120_000);
  const page = await ctx.newPage();
  await page.goto(base + '#/m/caiyun', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.view-module[data-ready="1"]'), null, { polling: 200 });
  await page.waitForTimeout(800);
  await page.waitForFunction(() => [...document.querySelectorAll('.has-stage')].filter((el) => el.getClientRects().length).every((el) => el.dataset.compiled === '1'), null, { polling: 200 });
  await page.evaluate(() => document.querySelector('.sheet.open .icon-btn')?.click());
  await page.waitForTimeout(600);
  // 软件渲染下截一张图要好几秒，比提示停留的 2.6 秒还长：只在截图脚本里把这一个定时器拉长到 60 秒
  await page.evaluate(() => { const st = window.setTimeout; window.setTimeout = (fn, ms, ...a) => st(fn, ms === 2600 ? 60_000 : ms, ...a); });
  await page.evaluate(() => document.querySelector('.view-module [data-action="primary"]').click());
  await page.waitForFunction(() => document.querySelector('.stage-hurry-hint'), null, { polling: 100 });
  // 让页面以为切到了后台：仪式的等待与界面动画会暂停（App 本来就这样处理），结果不会在截图途中出来
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const file = path.join(out, `hurry-hint-${vp.width}x${vp.height}.png`);
  await page.screenshot({ path: file });
  const still = await page.evaluate(() => document.querySelector('.view-module .ritual-receipt').hidden && !!document.querySelector('.stage-hurry-hint:not(.out)'));
  await ctx.close();
  console.log(file, still ? '' : `（第 ${attempt} 次拍完时提示已收起，重拍）`);
  if (still) break;
 }
}
await browser.close();
server.close();
