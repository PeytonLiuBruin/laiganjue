// Custom screenshots for the runes module: spreads three/five, sheet, detail, index.
// usage: node shots.mjs --theme paper --out dir [--viewport 390x844] [--spread three,five,single,daily]
import path from 'node:path';
import os from 'node:os';
import { mkdir, rm } from 'node:fs/promises';
import { buildAll } from './build.mjs';
import { createStaticServer } from './serve.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const theme = opt('--theme', 'paper');
const out = path.resolve(opt('--out', `/home/user/laiganjue/dist/shots-rn-${theme}`));
const [vw, vh] = opt('--viewport', '390x844').split('x').map(Number);
const spreads = opt('--spread', 'three,five').split(',');
const tmpOut = path.join(os.tmpdir(), `lgj-rn-shots-${process.pid}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await rm(tmpOut, { recursive: true, force: true });
await buildAll({ out: tmpOut, min: false, only: ['runes'] });
await mkdir(out, { recursive: true });
const server = createStaticServer(tmpOut);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
const { chromium } = await import('playwright');
async function launchBrowser() {
  try { return await chromium.launch(); } catch (e) {
    const fs = await import('node:fs');
    const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    const c = [];
    if (fs.existsSync(b)) for (const d of fs.readdirSync(b)) for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome']) { const q = path.join(b, d, sub); if (fs.existsSync(q)) c.push(q); }
    if (!c.length) throw e;
    return chromium.launch({ executablePath: c[0] });
  }
}
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
await context.addInitScript((t) => { try { localStorage.setItem('lgj:theme', JSON.stringify(t)); } catch {} }, theme);
const page = await context.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
const shot = (name, opts = {}) => page.screenshot({ path: path.join(out, name + '.png'), ...opts });
const closeSheet = async () => { const b = await page.$('.sheet.open .sheet-head .icon-btn'); if (b) { await b.click().catch(() => {}); await sleep(600); } };

for (const spread of spreads) {
  await page.goto(base + '#/m/runes', { waitUntil: 'load' });
  await page.waitForSelector('.view-module[data-module="runes"][data-ready="1"]', { timeout: 8000 });
  await sleep(400);
  const label = { single: '单符', three: '诺伦三符', five: '五符十字', daily: '今日符文' }[spread];
  const chip = await page.$(`.m-runes .chip:has-text("${label}")`);
  if (chip) { await chip.click(); await sleep(700); }
  await shot(`${spread}-idle`);
  await page.evaluate(() => window.__lgj?.simulate?.('shake', { intensity: 25 }));
  await sleep(1200);
  await shot(`${spread}-shaking`);
  await sleep(spread === 'five' ? 4200 : 3400);
  await shot(`${spread}-drawn`);
  // tap the first stone to flip only one
  const stone = await page.$('.m-runes .rn-stone');
  if (stone) { await stone.tap().catch(() => stone.click()); await sleep(2200); await shot(`${spread}-one-flipped`); }
  const primary = await page.$('.view-module[data-module="runes"] [data-action="primary"]:not([disabled])');
  if (primary) { await primary.click({ force: true }); await sleep(spread === 'five' ? 5200 : 4200); }
  await shot(`${spread}-revealed`);
  await shot(`${spread}-revealed-full`, { fullPage: true });
  const read = (await page.$('.ritual-receipt:not([hidden]) .btn.primary')) || (await page.$('.view-module[data-module="runes"] [data-action="primary"]:not([disabled])'));
  if (read) { await read.click({ force: true }); await sleep(900); }
  await shot(`${spread}-sheet`);
  await page.evaluate(() => { const b = document.querySelector('.sheet.open .sheet-body'); if (b) b.scrollTop = 520; });
  await sleep(300);
  await shot(`${spread}-sheet-2`);
  await page.evaluate(() => { const b = document.querySelector('.sheet.open .sheet-body'); if (b) b.scrollTop = 99999; });
  await sleep(300);
  await shot(`${spread}-sheet-3`);
  await closeSheet();
  // detail: tap a flipped stone
  const flipped = await page.$('.m-runes .rn-stone.flipped');
  if (flipped) { await flipped.click({ force: true }); await sleep(900); console.log(spread, 'detail open:', !!(await page.$('.sheet.open'))); await shot(`${spread}-detail`); await closeSheet(); }
}
// index sheet
const idx = await page.$('.m-runes .rn-more .btn');
if (idx) { await idx.click(); await sleep(900); await shot('index'); await page.evaluate(() => { const b = document.querySelector('.sheet.open .sheet-body'); if (b) b.scrollTop = 99999; }); await sleep(300); await shot('index-2'); await closeSheet(); }
console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no errors');
await browser.close();
server.close();
await rm(tmpOut, { recursive: true, force: true });
