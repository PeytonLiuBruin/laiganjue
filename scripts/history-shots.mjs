// 各玩法「最近记录」区域的 iPhone 截图（2D 画布回退，不需要 WebGL），检查卡通化后的历史标签有无溢出与截断。
// 用法：node scripts/history-shots.mjs [--out docs/claude-plan/screenshots] [--themes paper,ink] [--mods qian,jiaobei]（需先 npm run build）
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createStaticServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const out = path.resolve(root, arg('--out', 'docs/claude-plan/screenshots'));
const themes = arg('--themes', 'paper,ink').split(',');
const VIEWPORTS = [{ width: 393, height: 852 }, { width: 430, height: 932 }];
const t = Date.now();
const d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// 每个玩法：存档里的历史与要截的历史区域选择器
const MODS = {
  qian: { sel: '.qn-history', seed: { 'lgj:qian:history': [{ no: 17, date: today }, { no: 3, date: today }, { no: 1, date: today }, { no: 52, date: today }, { no: 41, date: today }] } },
  jiaobei: { sel: '.jb-history', seed: { 'lgj:jiaobei:history': ['sheng', 'xiao', 'yin', 'sheng', 'sheng', 'li'] } },
  runes: { sel: '.rn-history', seed: { 'lgj:runes:history': [{ s: 'single', r: [['fehu', 0]], t }, { s: 'three', r: [['uruz', 1], ['ansuz', 0], ['raidho', 0]], t }] } },
  omikuji: { sel: '.ok-history', seed: { 'lgj:omikuji:history': [{ no: 3, level: 'daikichi', date: today }, { no: 18, level: 'chukichi', date: today }, { no: 44, level: 'kyo', date: today }, { no: 7, level: 'suekichi', date: today }] } },
  liuyao: { sel: '.ly-hist', seed: { 'lgj:liuyao:history': [{ v: [7, 8, 9, 7, 6, 8], q: '这次面试', t }, { v: [8, 8, 7, 7, 7, 9], q: '', t }] } },
  tarot: { sel: '.tr-history', seed: { 'lgj:tarot:history': [{ t, spread: 'single', cards: [{ id: 'M1', r: 0 }] }, { t, spread: 'single', cards: [{ id: 'M2', r: 1 }] }] } },
};
const mods = arg('--mods', Object.keys(MODS).join(',')).split(',');
await mkdir(out, { recursive: true });
const server = createStaticServer(path.join(root, 'dist'));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await launchBrowser({ webgl: false });
let bad = 0;
for (const theme of themes) {
  for (const vp of VIEWPORTS) {
    for (const id of mods) {
      const m = MODS[id];
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN', reducedMotion: 'reduce' });
      const seed = { 'lgj:onboarded': true, 'lgj:zen.auto': false, 'lgj:dev.skins': true, 'lgj:theme': theme, ...m.seed };
      await ctx.addInitScript((s) => { try { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); } catch {} }, seed);
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', (e) => errs.push(e.message));
      await page.goto(`${base}#/m/${id}`, { timeout: 180_000, waitUntil: 'domcontentloaded' });
      const el = page.locator(m.sel).first();
      try { await el.waitFor({ state: 'attached', timeout: 60_000 }); } catch { console.log(id, theme, vp.width, 'MISSING', m.sel); bad++; await ctx.close(); continue; }
      await page.waitForTimeout(900);
      // 体感邀请抽屉会盖住页面，点「使用屏幕操作」关掉
      const skip = page.getByRole('button', { name: '使用屏幕操作' });
      if (await skip.isVisible().catch(() => false)) { await skip.click(); await page.waitForTimeout(500); }
      await el.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const check = await el.evaluate((root) => {
        const b = root.getBoundingClientRect();
        const kids = [...root.querySelectorAll('*')];
        const cut = kids.filter((e) => e.scrollWidth > e.clientWidth + 1 && !['visible', ''].includes(getComputedStyle(e).overflowX) && getComputedStyle(e).overflowX !== 'auto').map((e) => e.className || e.tagName);
        const out = kids.filter((e) => { const r = e.getBoundingClientRect(); return r.width && (r.left < -1 || r.right > innerWidth + 1) && !e.closest('[class*="row"], .history'); }).map((e) => e.className || e.tagName);
        return { h: Math.round(b.height), cut, out, hscroll: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      // 灵签横滑行：超出时右侧有渐隐，滑到底后渐隐去掉
      if (id === 'qian') {
        check.fadeStart = await page.evaluate(() => document.querySelector('.qn-history-row')?.classList.contains('more'));
        check.fadeEnd = await page.evaluate(async () => { const r = document.querySelector('.qn-history-row'); r.scrollLeft = r.scrollWidth; await new Promise((f) => setTimeout(f, 200)); const v = r.classList.contains('more'); r.scrollLeft = 0; await new Promise((f) => setTimeout(f, 200)); return v; });
        if (!check.fadeStart || check.fadeEnd) errs.push('横滑渐隐不对');
      }
      const ok = !check.cut.length && !check.out.length && !check.hscroll && !errs.length;
      if (!ok) bad++;
      const box = await el.boundingBox();
      const file = `history-${id}-${theme}-${vp.width}x${vp.height}.png`;
      const y = Math.max(0, box.y - 40);
      await page.screenshot({ path: path.join(out, file), clip: { x: 0, y, width: vp.width, height: Math.min(vp.height - y, box.height + 80) } });
      console.log(file, ok ? 'ok' : 'BAD', JSON.stringify(check), errs.join(' | '));
      await ctx.close();
    }
  }
}
await browser.close();
server.close();
if (bad) process.exitCode = 1;
