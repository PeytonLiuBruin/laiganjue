// iPhone 视口截图：构建 dist → 起本地服务器 → 软件 WebGL 的无头 Chromium，按 393×852 与 430×932 两种尺寸截图。
// 用法：node scripts/iphone-shots.mjs [--routes home,m/yinyuan,m/caiyun] [--out docs/claude-plan/screenshots] [--theme paper] [--clean]
// 每张图同时检查横向溢出，结果写到 <out>/report.json。
import path from 'node:path';
import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build.mjs';
import { createStaticServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const out = path.resolve(root, opt('--out', 'docs/claude-plan/screenshots'));
const routes = opt('--routes', 'home,m/yinyuan,m/caiyun,m/shiye,m/crystal,m/fengshui').split(',');
const theme = opt('--theme', 'paper');
// --seed '{"streak":{...}}'：截图前写入的本地存储（键名不带 lgj: 前缀），用于连续天数、额度等状态
const seed = JSON.parse(opt('--seed', '{}'));
const VIEWPORTS = [{ name: '393x852', width: 393, height: 852 }, { name: '430x932', width: 430, height: 932 }];

await mkdir(out, { recursive: true });
if (args.includes('--clean')) for (const f of await readdir(out)) if (f.endsWith('.png')) await rm(path.join(out, f));
const dist = path.join(root, 'dist');
await buildAll({ out: dist, min: false });
const server = createStaticServer(dist);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await launchBrowser();
const report = [];
for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await context.addInitScript(({ t, seed }) => {
    try {
      localStorage.setItem('lgj:theme', JSON.stringify(t)); localStorage.setItem('lgj:dev.skins', 'true'); localStorage.setItem('lgj:onboarded', 'true');
      if (!sessionStorage.getItem('lgj-seeded')) { for (const [k, v] of Object.entries(seed)) localStorage.setItem('lgj:' + k, JSON.stringify(v)); sessionStorage.setItem('lgj-seeded', '1'); }
    } catch {}
  }, { t: theme, seed });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  for (const r of routes) {
    // 路由后可跟 @动作：home@paywall 打开付费卡、home@settings 打开设置、m/qian@read 出签后停在结果条
    const [route, action] = r.split('@');
    const hash = route === 'home' ? '#/' : '#/' + route;
    await page.goto(base + hash);
    await page.waitForTimeout(2500);
    // 体感引导抽屉可能晚一点弹出：按两次 Esc 关掉，再等动画结束
    for (let i = 0; i < 2; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(600); }
    if (action === 'paywall') { await page.evaluate(() => { window.__lgj.openPaywall({ reason: '今天的免费深度解读已用完，开通 Pro 不限次数' }); }); await page.waitForTimeout(900); }
    if (action === 'settings' || action === 'settings-end') { await page.click('.app-header [aria-label="设置"]'); await page.waitForTimeout(900); }
    if (action === 'settings-end') { await page.locator('.setting-legal').scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(500); }
    if (action === 'stars') {
      // 点一次主按钮，舞台一进入揭晓就截图，用来检查揭晓放大与金星
      await page.locator('.view-module [data-action="primary"]').first().click().catch(() => {});
      await page.waitForFunction(() => document.querySelector('.view-module .stage-canvas[data-phase="revealed"]'), null, { timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(250);
    }
    if (action === 'read') {
      // 多步玩法（灵签要先摇再取签）：一直点主按钮，直到结果条出现「展开解读」
      // 六爻要掷六次，卦成后主按钮本身变成「展开解读」
      const primary = page.locator('.view-module [data-action="primary"]').first();
      for (let i = 0; i < 8 && !(await page.locator('.ritual-receipt [data-read]').count()) && !/解读/.test(await primary.textContent().catch(() => '')); i++) {
        await primary.click().catch(() => {});
        await page.waitForSelector('.ritual-receipt [data-read]', { timeout: route === 'm/liuyao' ? 2_500 : 8_000 }).catch(() => {});
      }
      await page.waitForTimeout(1200);
      await page.locator('.ritual-receipt').scrollIntoViewIfNeeded().catch(() => {});
      await page.waitForTimeout(500);
    }
    if (action === 'share') {
      // 一直点主按钮直到出现「分享」，点开分享卡预览，并把卡片原图另存为 <路由>-card.png
      const shareBtn = page.locator('.sheet.open .sheet-actions button, .ritual-receipt button', { hasText: /^分享$/ });
      const primary = page.locator('.view-module [data-action="primary"]').first();
      const read = page.locator('.view-module .ritual-receipt [data-read="1"]');
      for (let i = 0; i < 30 && !(await shareBtn.count()); i++) {
        if (await read.count()) await read.first().click({ force: true }).catch(() => {});
        else await primary.click({ force: true }).catch(() => {});
        await page.waitForTimeout(900);
      }
      await page.waitForTimeout(700); // 等结果抽屉滑入完成
      await shareBtn.first().evaluate((b) => b.click()).catch(() => {});
      await page.waitForSelector('.sheet.open .share-card-img', { timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(700);
      const src = await page.evaluate(() => document.querySelector('.sheet.open .share-card-img')?.src || '');
      if (vp.name === VIEWPORTS[0].name && src.startsWith('data:image/png')) await writeFile(path.join(out, `${route.replace(/\//g, '-')}-card.png`), Buffer.from(src.split(',')[1], 'base64'));
    }
    const overflow = await page.evaluate(() => {
      const w = document.documentElement.clientWidth, bad = [];
      for (const el of document.querySelectorAll('body *')) {
        const b = el.getBoundingClientRect();
        if (b.width && (b.right > w + 1 || b.left < -1) && getComputedStyle(el).position !== 'fixed' && !el.closest('[hidden],.sheet,[aria-hidden="true"]')) bad.push((el.className || el.tagName).toString().slice(0, 40));
      }
      return { scrollW: document.documentElement.scrollWidth, w, bad: [...new Set(bad)].slice(0, 8) };
    });
    const file = `${r.replace(/[/@]/g, '-')}-${vp.name}.png`;
    await page.screenshot({ path: path.join(out, file) });
    report.push({ route: r, viewport: vp.name, file, overflow, errors: [...errors] });
    console.log(file, overflow.scrollW > overflow.w ? 'H-OVERFLOW' : 'ok', overflow.bad.join(' '), errors.length ? 'errors:' + errors.length : '');
    errors.length = 0;
  }
  await context.close();
}
await browser.close();
server.close();
// 只重截部分页面时，与已有报告合并（按文件名覆盖）
let merged = report;
if (!args.includes('--clean')) {
  try { const old = JSON.parse(await readFile(path.join(out, 'report.json'), 'utf8')); merged = [...old.filter((o) => !report.some((r) => r.file === o.file)), ...report]; } catch {}
}
await writeFile(path.join(out, 'report.json'), JSON.stringify(merged, null, 2));
