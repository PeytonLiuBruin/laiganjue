// 签纸收集册与首页连续天数行的 iPhone 截图（2D 画布回退，不需要 WebGL）。
// 用法：node scripts/album-shots.mjs [--out docs/claude-plan/screenshots] [--theme paper|ink]（需先 npm run build 生成 dist）
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = path.resolve(root, arg('--out', 'docs/claude-plan/screenshots'));
const themes = arg('--theme', 'paper,ink').split(',');
await mkdir(out, { recursive: true });
const server = createStaticServer(path.join(root, 'dist'));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await launchBrowser({ webgl: false });
const d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// 收了 23 支，各等级都有，几支抽到多次
const album = {};
[1, 2, 3, 5, 8, 9, 12, 14, 17, 20, 21, 25, 28, 30, 33, 38, 41, 44, 47, 52, 55, 60, 63].forEach((no, i) => { album[no] = { first: today, times: i % 5 === 0 ? 3 : 1 }; });
const seed = { 'lgj:onboarded': true, 'lgj:streak': { last: today, count: 5, nudged: null }, 'lgj:qian:album': album, 'lgj:qian:history': [{ no: 17, date: today }, { no: 3, date: today }], 'lgj:qian:badgeNew': 'ru' };
const problems = [];
for (const theme of themes) {
  for (const vp of [{ width: 393, height: 852 }, { width: 430, height: 932 }]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN', reducedMotion: 'reduce' });
    await ctx.addInitScript(({ s, theme }) => { try { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); localStorage.setItem('lgj:theme', JSON.stringify(theme)); } catch {} }, { s: seed, theme });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`${theme} ${vp.width}: ${e.message}`));
    const tag = `${theme}-${vp.width}x${vp.height}`;
    const check = async (name) => {
      const bad = await page.evaluate(() => {
        const r = [];
        if (document.documentElement.scrollWidth > innerWidth + 1) r.push('横向溢出');
        for (const el of document.querySelectorAll('.home-streak *, .qn-album-btn *, .sheet.open .qn-cell, .sheet.open .qn-album-level, .sheet.open .qn-badge *, .sheet.open .qn-badge-note')) {
          if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible') r.push('截断：' + el.className + ' ' + el.textContent.slice(0, 12));
          const b = el.getBoundingClientRect(); if (b.width && b.right > innerWidth + 1) r.push('出界：' + el.className);
        }
        return r;
      });
      bad.forEach((b) => problems.push(`${name} ${tag}: ${b}`));
    };
    await page.goto(base + '#/', { waitUntil: 'load' });
    await page.waitForSelector('.home-streak');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `album-home-${tag}.png`) });
    await check('首页');
    await page.goto(base + '#/m/qian', { waitUntil: 'load' });
    await page.waitForSelector('.view-module[data-module="qian"][data-ready="1"]');
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelectorAll('.sheet.open').forEach((s) => s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))));
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector('.qn-album-btn').scrollIntoView({ block: 'end' }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, `album-entry-${tag}.png`) });
    await check('入口');
    await page.click('.qn-album-btn');
    await page.waitForSelector('.sheet.open .qn-album-grid');
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, `album-sheet-${tag}.png`) });
    await check('抽屉');
    // 分享卡上的签册徽章：点开一支签回看，再点分享
    await page.click('.sheet.open button.qn-cell[data-no="17"]');
    await page.waitForFunction(() => [...document.querySelectorAll('.sheet.open button')].some((b) => b.textContent.includes('分享')), null, { timeout: 8000 });
    await page.waitForTimeout(400);
    await page.evaluate(() => [...document.querySelectorAll('.sheet.open button')].find((b) => b.textContent.includes('分享')).click());
    await page.waitForSelector('.sheet.open .share-card-img[src^="data:"]', { timeout: 8000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(out, `album-share-${tag}.png`) });
    if (vp.width === 393) {
      const url = await page.getAttribute('.sheet.open .share-card-img', 'src');
      const { writeFile } = await import('node:fs/promises');
      await writeFile(path.join(out, `album-sharecard-${theme}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
    await ctx.close();
    console.log('done', tag);
  }
}
await browser.close();
server.close();
console.log(problems.length ? '问题：\n' + problems.join('\n') : '无溢出、无截断、无报错');
