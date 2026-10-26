// 深度解读免费额度端到端测试：六爻、八字、御神签、卢恩接入每天 1 次免费，用完弹付费卡，Pro 不受限。
// 运行：npm run e2e（不需要 WebGL，用 2D 画布回退跑得更快）
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildAll } from '../../scripts/build.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';
import { launchBrowser } from '../../scripts/browser.mjs';

const out = path.join(os.tmpdir(), `lgj-quota-${process.pid}`);
const BENIGN = [/AudioContext was not allowed/, /ERR_TUNNEL_CONNECTION_FAILED|fonts\.g(oogleapis|static)\.com|Failed to load resource/, /WebGL|GL Driver/];
const MODULES = ['liuyao', 'bazi', 'omikuji', 'runes'];

let server, base, browser;
before(async () => {
  await rm(out, { recursive: true, force: true });
  await buildAll({ out, min: true });
  server = createStaticServer(out);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await launchBrowser({ webgl: false });
});
after(async () => {
  await browser?.close();
  server?.close();
  await rm(out, { recursive: true, force: true });
});

const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

async function open(module, extra = {}) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.addInitScript((extra) => {
    try {
      localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:zen.auto', 'false');
      for (const [k, v] of Object.entries(extra)) localStorage.setItem('lgj:' + k, JSON.stringify(v));
    } catch {}
  }, extra);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !BENIGN.some((r) => r.test(m.text()))) errors.push('console: ' + m.text()); });
  await page.goto(base + `#/m/${module}`, { waitUntil: 'load' });
  await page.waitForSelector(`.view-module[data-module="${module}"][data-ready="1"]`, { timeout: 30_000 });
  await page.evaluate(() => document.querySelector('.sheet.open .icon-btn')?.click());
  return { page, context, errors };
}

/** 反复点主按钮直到出现「解读」入口：结果条上的按钮，或六爻卦成后主按钮本身。返回该按钮的定位。 */
async function driveToRead(page) {
  const readBtn = page.locator('.view-module .ritual-receipt [data-read="1"]');
  const primary = page.locator('.view-module [data-action="primary"]').first();
  for (let i = 0; i < 40; i++) {
    if (await readBtn.count()) return readBtn.first();
    if (/解读/.test(await primary.textContent()) && await primary.isEnabled()) { await page.waitForTimeout(300); return primary; }
    if (await primary.isEnabled()) await primary.click({ force: true }).catch(() => {});
    await page.waitForTimeout(700);
  }
  throw new Error('没有走到解读入口');
}

for (const module of MODULES) {
  test(`${module}：今日免费 1 次，再开同一结果不计次，用完后弹付费卡`, { timeout: 180_000 }, async () => {
    const { page, context, errors } = await open(module);
    const btn = await driveToRead(page);
    assert.match(await btn.textContent(), /今日免费|免费展开/, '第一次显示今日免费');
    await btn.click({ force: true });
    await page.waitForSelector('.sheet.open', { timeout: 10_000 });
    assert.equal(await page.locator('.sheet.open .pw-plans').count(), 0, '免费次数内不弹付费卡');
    const used = await page.evaluate(() => JSON.parse(localStorage.getItem('lgj:quota.day') || 'null'));
    assert.equal(used?.day, today());
    assert.equal(Object.values(used.used).reduce((a, b) => a + b, 0), 1, '只计 1 次');
    await page.evaluate(() => document.querySelector('.sheet.open .icon-btn')?.click());
    await page.waitForFunction(() => !document.querySelector('.sheet.open'), null, { timeout: 10_000 });
    await page.waitForTimeout(500);
    assert.doesNotMatch(await btn.textContent(), /免费|解锁/, '解锁后按钮回到「展开解读」');
    await btn.click({ force: true });
    await page.waitForSelector('.sheet.open', { timeout: 10_000 });
    assert.equal(await page.locator('.sheet.open .pw-plans').count(), 0, '同一结果再开不弹付费卡');
    const again = await page.evaluate(() => JSON.parse(localStorage.getItem('lgj:quota.day')));
    assert.equal(Object.values(again.used).reduce((a, b) => a + b, 0), 1, '同一结果再开不计次');
    assert.deepEqual(errors, []);
    await context.close();
  });
}

test('免费次数用完：四个玩法都显示「解锁深度解读」并弹出付费卡', { timeout: 300_000 }, async () => {
  const used = Object.fromEntries(MODULES.map((m) => [m, 1]));
  for (const module of MODULES) {
    const { page, context, errors } = await open(module, { 'quota.day': { day: today(), used } });
    const btn = await driveToRead(page);
    assert.match(await btn.textContent(), /解锁深度解读/, module);
    await btn.click({ force: true });
    await page.waitForSelector('.sheet.open .pw-plans', { timeout: 10_000 }).catch((e) => { throw new Error(module + ' 没有弹出付费卡：' + e.message); });
    assert.deepEqual(errors, [], module);
    await context.close();
  }
});
