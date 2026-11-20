// 结果抽屉（深度解读）的 iPhone 截图：灵签收集册回看、水晶球、筊杯、六爻、御神签、姻缘六个抽屉（后三个另截一张滚到底），2D 画布回退，不需要 WebGL。
// 用法：node scripts/reading-shots.mjs [--out docs/claude-plan/screenshots] [--theme paper,ink]（需先 npm run build 生成 dist）
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
const album = {}; [1, 3, 17, 20].forEach((no) => { album[no] = { first: today, times: 1 }; });
const seed = { 'lgj:onboarded': true, 'lgj:zen.auto': false, 'lgj:qian:album': album };
const problems = [];
const check = (page, name) => page.evaluate(() => {
  const r = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) r.push('横向溢出');
  for (const el of document.querySelectorAll('.sheet.open .result *, .sheet.open .sheet-actions *')) {
    if (el.scrollWidth > el.clientWidth + 1 && !['visible', 'auto', 'scroll'].includes(getComputedStyle(el).overflow)) r.push('截断：' + el.className + ' ' + el.textContent.slice(0, 12));
    const b = el.getBoundingClientRect(); if (b.width && b.right > innerWidth + 1) r.push('出界：' + el.className);
  }
  return r;
}).then((bad) => bad.forEach((b) => problems.push(`${name}: ${b}`)));
async function openSheet(page, route) {
  await page.goto(base + '#/' + route, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  for (let i = 0; i < 2; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(300); }
  const primary = page.locator('.view-module [data-action="primary"]').first();
  const read = page.locator('.view-module .ritual-receipt [data-read="1"]');
  for (let i = 0; i < 30 && !(await page.locator('.sheet.open .result').count()); i++) {
    if (await read.count()) await read.first().click({ force: true }).catch(() => {});
    else await primary.click({ force: true }).catch(() => {});
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(900);
}
const scrollEnd = (page) => page.evaluate(() => { const s = [...document.querySelectorAll('.sheet.open')].pop(); const b = s.querySelector('.sheet-body') || s; b.scrollTop = 99999; });
for (const theme of themes) {
  for (const vp of [{ width: 393, height: 852 }, { width: 430, height: 932 }]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN', reducedMotion: 'reduce' });
    await ctx.addInitScript(({ s, theme }) => { try { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); localStorage.setItem('lgj:theme', JSON.stringify(theme)); } catch {} }, { s: seed, theme });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`${theme} ${vp.width}: ${e.message}`));
    const tag = `${theme}-${vp.width}x${vp.height}`;
    // 灵签：收集册里点开第 17 签回看，上半与滚到底各一张
    await page.goto(base + '#/m/qian', { waitUntil: 'load' });
    await page.waitForSelector('.view-module[data-module="qian"][data-ready="1"]');
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelectorAll('.sheet.open').forEach((s) => s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))));
    await page.waitForTimeout(400);
    await page.click('.qn-album-btn');
    await page.waitForSelector('.sheet.open .qn-album-grid');
    await page.waitForTimeout(500);
    await page.click('.sheet.open button.qn-cell[data-no="17"]');
    await page.waitForSelector('.sheet.open .qn-items');
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(out, `reading-qian-${tag}.png`) });
    await check(page, `灵签 ${tag}`);
    await scrollEnd(page); await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `reading-qian-end-${tag}.png`) });
    await check(page, `灵签分述 ${tag}`);
    for (const route of ['m/crystal', 'm/jiaobei', 'm/liuyao', 'm/omikuji', 'm/yinyuan']) {
      await openSheet(page, route);
      if (!(await page.locator('.sheet.open .result').count())) { problems.push(`${route} ${tag}: 没打开结果抽屉`); continue; }
      await page.screenshot({ path: path.join(out, `reading-${route.slice(2)}-${tag}.png`) });
      await check(page, `${route} ${tag}`);
      if (route !== 'm/crystal' && route !== 'm/jiaobei') {
        await scrollEnd(page); await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(out, `reading-${route.slice(2)}-end-${tag}.png`) });
        await check(page, `${route} 分项 ${tag}`);
      }
    }
    await ctx.close();
    console.log('done', tag);
  }
}
await browser.close();
server.close();
console.log(problems.length ? '问题：\n' + problems.join('\n') : '无溢出、无截断、无报错');
