// 2D 画布器物（筊杯、硬币、骰子、六爻铜钱、灵签筒、御神签筒、落球盘）卡通化检查截图。
// 用法：node scripts/toon2d-shots.mjs [--out docs/claude-plan/screenshots] [--theme paper]
// 每个页面截静止态，骰子页另截掷出落定后的样子。文件名 toon2d-<玩法>-<尺寸>.png。
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
const theme = opt('--theme', 'paper');
const VIEWPORTS = [{ name: '393x852', width: 393, height: 852 }, { name: '430x932', width: 430, height: 932 }];
const SHOTS = [
  { name: 'jiaobei', hash: '#/m/jiaobei' },
  { name: 'coin', hash: '#/m/coin' },
  { name: 'dice', hash: '#/m/coin', tab: '骰子', primary: true },
  { name: 'liuyao', hash: '#/m/liuyao' },
  { name: 'qian', hash: '#/m/qian' },
  { name: 'omikuji', hash: '#/m/omikuji' },
  { name: 'plinko', hash: '#/m/plinko' },
];

await mkdir(out, { recursive: true });
const dist = path.join(root, 'dist');
await buildAll({ out: dist, min: false });
const server = createStaticServer(dist);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await launchBrowser();
const prefix = theme === 'paper' ? 'toon2d' : `toon2d-${theme}`;
let failed = 0;
for (const vp of VIEWPORTS) {
  for (const shot of SHOTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await context.addInitScript((t) => {
      try { localStorage.setItem('lgj:theme', JSON.stringify(t)); localStorage.setItem('lgj:dev.skins', 'true'); localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:zen.auto', 'false'); localStorage.setItem('lgj:hint.hurry', 'true'); } catch {}
    }, theme);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + shot.hash);
    await page.waitForTimeout(1500);
    for (let i = 0; i < 2; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(400); }
    if (shot.tab) { await page.getByRole('tab', { name: shot.tab }).first().click().catch(async () => { await page.getByText(shot.tab, { exact: true }).first().click(); }); await page.waitForTimeout(800); }
    if (shot.primary) {
      await page.locator('.view-module [data-action="primary"]').first().click();
      await page.waitForFunction(() => document.querySelector('.view-module canvas[data-values]'), null, { timeout: 20_000 }).catch(() => {});
      await page.waitForTimeout(600);
      await page.evaluate(() => document.querySelector('.view-module canvas[data-values]')?.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(300);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const file = `${prefix}-${shot.name}-${vp.name}.png`;
    await page.screenshot({ path: path.join(out, file) });
    const ok = overflow <= 0 && !errors.length;
    if (!ok) failed++;
    console.log(file, ok ? 'ok' : `overflow=${overflow} errors=${errors.join(' | ')}`);
    await context.close();
  }
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
