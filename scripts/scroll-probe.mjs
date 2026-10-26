// 顶栏滚动探针：在玩法页点主按钮，按 rAF 记录平滑滚动途中顶栏的位置，确认 sticky 顶栏有没有被挤下去。
// 用法：node scripts/scroll-probe.mjs [--route m/caiyun] [--size 393x852] [--webgl] [--shot out.png（滚动途中连拍 10 张）]
// 输出每帧 scrollY、顶栏 top、visualViewport.offsetTop，最后给出最大偏移。截图在滚动途中拍，用来和逐帧数据对照。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build.mjs';
import { createStaticServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const route = opt('--route', 'm/caiyun');
const [w, h] = opt('--size', '393x852').split('x').map(Number);
const shot = opt('--shot', '');

const dist = path.join(root, 'dist');
await buildAll({ out: dist, min: false });
const server = createStaticServer(dist);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await launchBrowser({ webgl: args.includes('--webgl') });
const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await context.addInitScript(() => { try { localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:zen.auto', 'false'); } catch {} });
const page = await context.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/index.html#/${route}`);
await page.waitForTimeout(2500);
await page.waitForSelector('.model-slot[data-ready="1"]', { timeout: 120_000 }).catch(() => {});
for (let i = 0; i < 2; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(400); }
// 先滚到底部，让点主按钮时舞台在视口外，触发 focus() 的平滑滚动
await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await page.waitForTimeout(600);
await page.evaluate(() => {
  window.__probe = [];
  const t0 = performance.now();
  const tick = () => {
    const hd = document.querySelector('.app-header')?.getBoundingClientRect();
    window.__probe.push({ t: Math.round(performance.now() - t0), y: Math.round(scrollY), top: hd ? Math.round(hd.top) : null, vv: Math.round(visualViewport?.offsetTop ?? 0) });
    if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});
await page.locator('.view-module [data-action="primary"]').first().click().catch(() => {});
// 滚动途中连拍，文件名带上拍摄时的 scrollY，用来和逐帧数据对照
const shots = [];
if (shot) for (let i = 0; i < 10; i++) {
  const y = await page.evaluate(() => Math.round(scrollY));
  const file = path.resolve(root, shot.replace(/\.png$/, `-${i}-y${y}.png`));
  await page.screenshot({ path: file }); shots.push(file);
}
await page.waitForTimeout(3200);
const frames = await page.evaluate(() => window.__probe);
await browser.close();
server.close();
const moved = frames.filter((f) => f.top !== 0 || f.vv !== 0);
const ys = new Set(frames.map((f) => f.y));
console.log(`${route} ${w}x${h}：采到 ${frames.length} 帧，滚动位置 ${ys.size} 种（${frames[0]?.y} → ${frames.at(-1)?.y}）`);
for (const f of frames.filter((_, i) => i % Math.max(1, Math.floor(frames.length / 12)) === 0)) console.log(`  ${String(f.t).padStart(5)}ms  scrollY ${f.y}  顶栏 top ${f.top}  vv ${f.vv}`);
console.log(moved.length ? `顶栏偏移 ${moved.length} 帧，最大 ${Math.max(...moved.map((f) => Math.abs(f.top)))}px` : '顶栏全程 top=0、visualViewport.offsetTop=0');
process.exit(moved.length && ys.size > 1 ? 1 : 0);
