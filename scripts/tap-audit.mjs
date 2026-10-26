// 触控目标尺寸审计：Apple 人机界面指南要求可点元素至少 44×44 pt。
// 关掉 WebGL（玩法页退回 2D 器物），在 393×852 视口逐页列出小于 44px 的可见可点元素。
// 用法：node scripts/tap-audit.mjs [--routes home,home@settings,m/qian] [--min 44] [--json out.json]
// 段落里的行内文字链接（正文里的一个词）按指南属于例外，不计入。
// 元素用 ::before / ::after 扩大了点按区域时按扩大后的范围计算。
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build.mjs';
import { createStaticServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const MIN = Number(opt('--min', '44'));
export const DEFAULT_ROUTES = 'home,home@settings,home@paywall,home@skins,m/qian,m/tarot,m/almanac,m/zodiac,m/liuyao,m/bazi,m/yinyuan,m/caiyun,m/coin,m/jiaobei,m/runes,m/omikuji,m/wheel,m/crystal,m/plinko,m/fengshui,m/shiye';
const routes = opt('--routes', DEFAULT_ROUTES).split(',');

const dist = path.join(root, 'dist');
await buildAll({ out: dist, min: false });
const server = createStaticServer(dist);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await launchBrowser({ webgl: false });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await context.addInitScript(() => {
  try { localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:zen.auto', 'false'); localStorage.setItem('lgj:dev.skins', 'true'); } catch {}
});
const page = await context.newPage();
const all = [];
for (const r of routes) {
  const [route, action] = r.split('@');
  await page.goto(base + (route === 'home' ? '#/' : '#/' + route));
  await page.waitForTimeout(1800);
  for (let i = 0; i < 2; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(400); }
  if (action === 'settings') { await page.click('.app-header [aria-label="设置"]').catch(() => {}); await page.waitForTimeout(800); }
  if (action === 'paywall') { await page.evaluate(() => { window.__lgj?.openPaywall?.({ reason: '审计' }); }); await page.waitForTimeout(800); } // openPaywall 的 Promise 要等付费卡关掉才结束，这里不等它
  if (action === 'skins') { await page.click('.app-header button[aria-label="换皮肤"]').catch(() => {}); await page.waitForTimeout(800); }
  const found = await page.evaluate((MIN) => {
    const sel = 'a[href],button,[role="button"],[role="tab"],[role="switch"],input:not([type="hidden"]),select,summary,.chip,.tab,[data-action]';
    const sheet = document.querySelector('.sheet.open');
    const scope = sheet || document.querySelector('.view-module, .view-home, main') || document.body;
    const header = sheet ? null : document.querySelector('.app-header');
    const els = [...scope.querySelectorAll(sel), ...(header ? header.querySelectorAll(sel) : [])];
    const out = [];
    const seen = new Set();
    for (const el of els) {
      if (seen.has(el)) continue; seen.add(el);
      if (el.closest('[hidden],[aria-hidden="true"],[inert]')) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0 || cs.pointerEvents === 'none') continue;
      // 原生控件被包在 label 里时以 label 为准
      const target = (el.matches('input') && el.closest('label')) || el;
      const b = target.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      // 正文里的行内链接属于例外
      if (el.matches('a') && cs.display === 'inline' && el.parentElement && /^(P|LI|SPAN|SMALL)$/.test(el.parentElement.tagName) && (el.parentElement.textContent || '').trim().length > (el.textContent || '').trim().length + 6) continue;
      let w = b.width, h = b.height;
      for (const pseudo of ['::before', '::after']) {
        const p = getComputedStyle(target, pseudo);
        if (p.content === 'none' || p.position !== 'absolute') continue;
        const px = (v) => (v.endsWith('px') ? parseFloat(v) : 0);
        const l = px(p.left), r = px(p.right), t = px(p.top), btm = px(p.bottom);
        if (p.left !== 'auto' && p.right !== 'auto') w = Math.max(w, b.width - l - r);
        if (p.top !== 'auto' && p.bottom !== 'auto') h = Math.max(h, b.height - t - btm);
      }
      if (w >= MIN - 0.5 && h >= MIN - 0.5) continue;
      const cls = (target.className && typeof target.className === 'string') ? '.' + target.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
      const label = (target.getAttribute('aria-label') || target.textContent || target.value || '').trim().replace(/\s+/g, ' ').slice(0, 18);
      out.push({ tag: target.tagName.toLowerCase() + cls, label, w: Math.round(w), h: Math.round(h) });
    }
    return out;
  }, MIN);
  all.push({ route: r, small: found });
  console.log(`\n# ${r}  (${found.length})`);
  for (const f of found) console.log(`  ${f.w}×${f.h}  ${f.tag}  「${f.label}」`);
}
await browser.close();
server.close();
const total = all.reduce((n, x) => n + x.small.length, 0);
console.log(`\n合计 ${total} 个小于 ${MIN}px 的可点元素`);
if (opt('--json', '')) await writeFile(path.resolve(root, opt('--json', '')), JSON.stringify(all, null, 2));
