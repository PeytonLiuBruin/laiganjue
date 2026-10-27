// 首次引导卡截图：393×852 与 430×932，宣纸与指定皮肤，关掉 WebGL（引导盖在首页上，首页没有 3D 舞台）。
// 用法：node scripts/onboard-shots.mjs [--themes paper,nebula] [--out docs/claude-plan/screenshots]
// 文件名 onboard-<皮肤>-<尺寸>.png，同时检查引导卡是否超出屏幕、文字是否被截断，结果打印到终端。
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build.mjs';
import { createStaticServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const out = path.resolve(root, opt('--out', 'docs/claude-plan/screenshots'));
const themes = opt('--themes', 'paper,nebula').split(',');
const VIEWPORTS = [{ name: '393x852', width: 393, height: 852 }, { name: '430x932', width: 430, height: 932 }];

await mkdir(out, { recursive: true });
const dist = path.join(root, 'dist');
await buildAll({ out: dist, min: false });
const server = createStaticServer(dist);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html#/`;
const browser = await launchBrowser({ webgl: false });
let bad = 0;
for (const theme of themes) {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await context.addInitScript((t) => { try { localStorage.setItem('lgj:theme', JSON.stringify(t)); localStorage.setItem('lgj:dev.skins', 'true'); localStorage.setItem('lgj:zen.auto', 'false'); } catch {} }, theme);
    const page = await context.newPage();
    await page.goto(base);
    await page.waitForFunction(() => window.__lgj?.openOnboarding, null, { timeout: 60_000 });
    await page.evaluate(() => window.__lgj.openOnboarding(true));
    await page.waitForTimeout(1200);
    const check = await page.evaluate(() => {
      const card = document.querySelector('.onboard-card');
      const b = card.getBoundingClientRect();
      const cut = [...card.querySelectorAll('b, p, div, button')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map((e) => e.className || e.tagName);
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), w: innerWidth, h: innerHeight, cut };
    });
    const ok = check.top >= 0 && check.bottom <= check.h + 1 && check.left >= 0 && check.right <= check.w + 1 && !check.cut.length;
    if (!ok) bad++;
    const file = `onboard-${theme}-${vp.name}.png`;
    await page.screenshot({ path: path.join(out, file) });
    console.log(file, ok ? 'ok' : 'BAD', JSON.stringify(check));
    await context.close();
  }
}
await browser.close();
server.close();
if (bad) process.exitCode = 1;
