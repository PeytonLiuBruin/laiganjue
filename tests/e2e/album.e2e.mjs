// 签纸收集册与首页连续天数端到端测试（2D 画布回退，跑得快）。
// 运行：npm run e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildAll } from '../../scripts/build.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';
import { launchBrowser } from '../../scripts/browser.mjs';

const out = path.join(os.tmpdir(), `lgj-album-${process.pid}`);
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

async function open(hash, seed = {}) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  await context.addInitScript((s) => { try { localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:zen.auto', 'false'); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, JSON.stringify(v)); } catch {} }, seed);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + hash, { waitUntil: 'load' });
  return { context, page, errors };
}

test('旧历史补录进收集册，入口显示进度，抽屉里点亮对应签格', async () => {
  const { context, page, errors } = await open('#/m/qian', { 'lgj:qian:history': [{ no: 3, date: '2026-10-20' }, { no: 17, date: '2026-10-21' }] });
  await page.waitForSelector('.view-module[data-module="qian"][data-ready="1"]', { timeout: 30_000 });
  assert.equal(await page.textContent('.qn-album-count'), '2/64');
  // 网页版第一次进玩法页会弹体感邀请，先关掉
  if (await page.waitForSelector('.motion-invite-sheet.open', { timeout: 3000 }).catch(() => null)) {
    await page.keyboard.press('Escape');
    await page.waitForSelector('.motion-invite-sheet.open', { state: 'detached', timeout: 5000 }).catch(() => {});
    await page.waitForFunction(() => !document.querySelector('.sheet.open'), null, { timeout: 5000 });
  }
  await page.click('.qn-album-btn');
  await page.waitForSelector('.sheet.open .qn-album-grid');
  assert.equal(await page.$$eval('.sheet.open .qn-cell', (els) => els.length), 64);
  assert.deepEqual(await page.$$eval('.sheet.open button.qn-cell', (els) => els.map((e) => e.dataset.no)), ['3', '17']);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lgj:qian:album')));
  assert.deepEqual(Object.keys(stored).sort(), ['17', '3']);
  // 点亮的签格可以回看签诗
  await page.click('.sheet.open button.qn-cell[data-no="3"]');
  await page.waitForFunction(() => document.querySelector('.sheet.open .m-qian, .sheet.open .result-card'), null, { timeout: 5000 });
  assert.deepEqual(errors, []);
  await context.close();
});

test('首页连续天数行：显示天数与签册进度，点开直接打开收集册', async () => {
  const d = new Date(), key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const { context, page, errors } = await open('#/', { 'lgj:streak': { last: key, count: 4, nudged: null }, 'lgj:qian:album': { 1: { first: key, times: 1 } } });
  await page.waitForSelector('.home-streak');
  const text = await page.textContent('.home-streak');
  assert.match(text, /连续 4 天/);
  assert.match(text, /签册 1\/64/);
  assert.equal(await page.$$eval('.home-streak-dots i.on', (els) => els.length), 4);
  const overflow = await page.evaluate(() => { const r = document.querySelector('.home-streak').getBoundingClientRect(); return r.right > innerWidth + 1 || document.documentElement.scrollWidth > innerWidth; });
  assert.equal(overflow, false);
  await page.click('.home-streak');
  await page.waitForSelector('.sheet.open .qn-album-grid', { timeout: 30_000 });
  assert.equal(await page.evaluate(() => location.hash), '#/m/qian');
  await page.waitForTimeout(600);
  assert.equal(await page.$$eval('.sheet.open', (els) => els.length), 1, '收集册打开时不再叠一层体感邀请');
  assert.deepEqual(errors, []);
  await context.close();
});

test('摇一支新签后收进册子，入口进度加一，首页连续天数变成 1', async () => {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.addInitScript(() => { try { localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:zen.auto', 'false'); } catch {} });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '#/m/qian', { waitUntil: 'load' });
  await page.waitForSelector('.view-module[data-module="qian"][data-ready="1"]', { timeout: 30_000 });
  assert.equal(await page.textContent('.qn-album-count'), '0/64');
  for (let i = 0; i < 40 && !(await page.$('.ritual-receipt:not([hidden])')); i++) {
    await page.evaluate(() => { document.querySelectorAll('.sheet.open').forEach((s) => s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); const b = document.querySelector('.view-module [data-action="primary"]'); if (b && !b.disabled) b.click(); });
    await page.waitForTimeout(500);
  }
  await page.waitForSelector('.ritual-receipt:not([hidden])', { timeout: 30_000 });
  assert.equal(await page.textContent('.qn-album-count'), '1/64');
  await page.evaluate(() => { location.hash = '#/'; });
  await page.waitForSelector('.home-streak');
  assert.match(await page.textContent('.home-streak'), /连续 1 天/);
  assert.deepEqual(errors, []);
  await context.close();
});

test('集到第 8 支：解锁「初窥」徽章，收集册里徽章点亮并跳一下，第二次打开不再跳', async () => {
  const seed = {};
  for (const no of [2, 9, 21, 30, 38, 45, 57]) seed[no] = { first: '2026-10-20', times: 1 };
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'zh-CN', reducedMotion: 'reduce' });
  await context.addInitScript((a) => { try { localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:zen.auto', 'false'); if (!localStorage.getItem('lgj:qian:album')) localStorage.setItem('lgj:qian:album', JSON.stringify(a)); } catch {} }, seed);
  const page = await context.newPage();
  const errors = [], toasts = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.exposeFunction('__toast', (t) => toasts.push(t));
  await page.addInitScript(() => { new MutationObserver(() => { const t = document.querySelector('.toast'); if (t && t.textContent && t.dataset.seen !== t.textContent) { t.dataset.seen = t.textContent; window.__toast(t.textContent); } }).observe(document, { subtree: true, childList: true, characterData: true }); });
  await page.goto(base + '#/m/qian', { waitUntil: 'load' });
  await page.waitForSelector('.view-module[data-module="qian"][data-ready="1"]', { timeout: 30_000 });
  assert.equal(await page.textContent('.qn-album-count'), '7/64');
  // 抽到已有的签不算，循环到第 8 支入册
  for (let i = 0; i < 160 && (await page.textContent('.qn-album-count')) !== '8/64'; i++) {
    await page.evaluate(() => { document.querySelectorAll('.sheet.open').forEach((s) => s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); const b = document.querySelector('.view-module [data-action="primary"]'); if (b && !b.disabled) b.click(); });
    await page.waitForTimeout(400);
  }
  assert.equal(await page.textContent('.qn-album-count'), '8/64');
  await page.waitForFunction(() => document.querySelector('.ritual-receipt:not([hidden])'), null, { timeout: 30_000 });
  assert.ok(toasts.some((t) => /初窥/.test(t)), `提示里有徽章名：${toasts.join(' | ')}`);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lgj:qian:badgeNew'))), 'chu');
  await page.evaluate(() => document.querySelectorAll('.sheet.open').forEach((s) => s.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))));
  await page.waitForFunction(() => !document.querySelector('.sheet.open'), null, { timeout: 5000 });
  await page.click('.qn-album-btn');
  await page.waitForSelector('.sheet.open .qn-badges');
  assert.deepEqual(await page.$$eval('.sheet.open .qn-badge.on', (els) => els.map((e) => e.dataset.badge)), ['chu']);
  assert.equal(await page.$$eval('.sheet.open .qn-badge.pop', (els) => els.length), 1);
  assert.match(await page.textContent('.sheet.open .qn-badge-note'), /再集 8 支点亮「入门」/);
  const overflow = await page.evaluate(() => { const r = document.querySelector('.sheet.open .qn-badges').getBoundingClientRect(); return r.right > innerWidth + 1 || r.left < -1; });
  assert.equal(overflow, false);
  // 第二次打开不再跳
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.sheet.open'), null, { timeout: 5000 });
  await page.click('.qn-album-btn');
  await page.waitForSelector('.sheet.open .qn-badges');
  assert.equal(await page.$$eval('.sheet.open .qn-badge.pop', (els) => els.length), 0);
  assert.deepEqual(errors, []);
  await context.close();
});
