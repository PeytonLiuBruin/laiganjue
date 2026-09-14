// 验收看板：把每个玩法在手机视口下的「初始」与「动作后」画面拍成小图，拼成一页 HTML（图片内嵌，可直接发布/分享）。
// 用法：node scripts/gallery.mjs [--theme paper] [--out dist/gallery.html] [--scale 1.25] [--quality 72]
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build.mjs';
import { createStaticServer } from './serve.mjs';
import { MODULE_LIST, REGIONS } from '../src/modules/list.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const theme = opt('--theme', 'paper');
const out = path.resolve(root, opt('--out', 'dist/gallery.html'));
const scale = Number(opt('--scale', '1.25'));
const quality = Number(opt('--quality', '72'));
const tmpOut = path.join(os.tmpdir(), `lgj-gallery-${process.pid}`);

async function launch() {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch();
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
      for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const p = path.join(base, d, sub);
        if (fs.existsSync(p)) return chromium.launch({ executablePath: p });
      }
    }
    throw e;
  }
}

await rm(tmpOut, { recursive: true, force: true });
await buildAll({ out: tmpOut, min: true });
const server = createStaticServer(tmpOut);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: scale, isMobile: true, hasTouch: true, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
await context.addInitScript((t) => {
  try {
    localStorage.setItem('lgj:theme', JSON.stringify(t));
    localStorage.setItem('lgj:onboarded', 'true');
  } catch {}
}, theme);
const page = await context.newPage();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async () => (await page.screenshot({ type: 'jpeg', quality })).toString('base64');

const cards = [];
await page.goto(base + '#/');
await page.waitForSelector('[data-view="home"]');
await sleep(500);
cards.push({ id: 'home', title: '首页', region: '', shots: [['首页', await shot()]] });
await page.evaluate(() => window.__lgj?.zen?.enter?.({ fullscreen: false }));
await sleep(1200);
cards.push({ id: 'zen', title: '静观屏保', region: '', shots: [['屏保', await shot()]] });
await page.evaluate(() => window.__lgj?.zen?.exit?.());
await sleep(600);

for (const m of MODULE_LIST) {
  await page.goto(base + `#/m/${m.id}`);
  await page.waitForSelector(`.view-module[data-module="${m.id}"][data-ready="1"]`, { timeout: 8000 }).catch(() => {});
  await sleep(600);
  const s1 = await shot();
  await page.evaluate(() => window.__lgj?.simulate?.('toss', { intensity: 26 }));
  await sleep(1600);
  if (!(await page.$('.sheet.open'))) {
    const primary = await page.$(`.view-module[data-module="${m.id}"] [data-action="primary"]`);
    if (primary) await primary.click({ timeout: 3000, force: true }).catch(() => {});
    await sleep(3200);
  }
  const s2 = await shot();
  for (let i = 0; i < 8 && !(await page.$('.sheet.open')); i++) {
    const read = await page.$('.ritual-receipt:not([hidden]) .btn.primary');
    const primary = read || (await page.$(`.view-module[data-module="${m.id}"] [data-action="primary"]:not([disabled])`));
    if (!primary) break;
    await primary.click({ timeout: 3000, force: true }).catch(() => {});
    await sleep(2600);
  }
  const s3 = (await page.$('.sheet.open')) ? await shot() : null;
  const shots = [['进入', s1], ['动作后', s2]];
  if (s3) shots.push(['解读', s3]);
  cards.push({ id: m.id, title: m.title, region: REGIONS.find((r) => r.id === m.region)?.title || '', sub: m.subtitle, shots });
}
await browser.close();
server.close();
await rm(tmpOut, { recursive: true, force: true });

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const now = new Date();
const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
const html = `<title>来感觉 验收看板</title>
<style>
:root{--bg:#f6f4ef;--ink:#2a2723;--muted:#7a746b;--line:#e2ddd3;--accent:#8d4841;--card:#fff}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#15181a;--ink:#ece8e0;--muted:#9a958c;--line:#2b3033;--accent:#c9a27a;--card:#1d2124}}
:root[data-theme="dark"]{--bg:#15181a;--ink:#ece8e0;--muted:#9a958c;--line:#2b3033;--accent:#c9a27a;--card:#1d2124}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 -apple-system,"PingFang SC","Noto Sans SC",sans-serif;padding-block:32px 60px;padding-inline:20px}
.wrap{max-width:1180px;margin:0 auto}
h1{font:500 30px/1.3 "Noto Serif SC","Songti SC",serif;letter-spacing:.06em;margin:0}
.meta{color:var(--muted);font-size:13px;margin-top:6px}
h2{font:500 18px/1.4 "Noto Serif SC",serif;letter-spacing:.1em;margin:40px 0 14px;padding-bottom:8px;border-bottom:1px solid var(--line)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px}
.card h3{margin:0;font:500 17px/1.4 "Noto Serif SC",serif;letter-spacing:.08em}
.card p{margin:2px 0 10px;color:var(--muted);font-size:13px}
.shots{display:grid;grid-template-columns:repeat(${3},1fr);gap:8px}
.shot{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--muted);text-align:center;letter-spacing:.08em}
.shot img{width:100%;border-radius:8px;border:1px solid var(--line);aspect-ratio:390/844;object-fit:cover;background:#000}
.note{margin-top:36px;padding:16px 18px;border:1px dashed var(--line);border-radius:12px;color:var(--muted);font-size:13px;line-height:1.8}
</style>
<div class="wrap">
<h1>来感觉 · 验收看板</h1>
<div class="meta">皮肤：${esc(theme)} · 手机视口 390×844 · 生成于 ${stamp} · 每张卡：进入 / 动作后 / 解读抽屉</div>
${['', ...REGIONS.map((r) => r.title)]
  .map((region) => {
    const items = cards.filter((c) => (c.region || '') === region);
    if (!items.length) return '';
    return `<h2>${esc(region || '外壳')}</h2><div class="grid">${items
      .map(
        (c) => `<div class="card"><h3>${esc(c.title)}</h3><p>${esc(c.sub || '')}</p><div class="shots">${c.shots
          .map(([label, b64]) => `<figure class="shot" style="margin:0"><img src="data:image/jpeg;base64,${b64}" alt="${esc(c.title)} ${esc(label)}" loading="lazy"><figcaption>${esc(label)}</figcaption></figure>`)
          .join('')}</div></div>`,
      )
      .join('')}</div>`;
  })
  .join('')}
<div class="note">怎么看：每个玩法三张图——刚进入、做完一次动作、打开解读抽屉。看的重点：一眼能不能懂该做什么；主按钮位置是否一致；结果读起来是否舒服；深浅皮肤下有没有看不清的字。有意见直接标注卡片名 + 第几张图。</div>
</div>`;
await mkdir(path.dirname(out), { recursive: true });
await writeFile(out, html);
console.log(`gallery → ${path.relative(root, out)}  cards ${cards.length}  ${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB`);
