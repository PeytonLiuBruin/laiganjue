// 设置页「连续天数提醒」端到端测试：网页版不显示，App 里（这里注入假的通知器模拟）默认关闭，
// 打开时申请权限，被拒自动弹回关闭，同意后排好通知。运行：npm run e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildAll } from '../../scripts/build.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';
import { launchBrowser } from '../../scripts/browser.mjs';

const out = path.join(os.tmpdir(), `lgj-reminder-${process.pid}`);
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

async function open({ fake = null } = {}) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  await context.addInitScript((grant) => {
    try { localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:zen.auto', 'false'); } catch {}
    if (grant === null) return;
    const log = (window.__lgjNotifierLog = { asked: 0, scheduled: [], cancelled: 0 });
    window.__lgjFakeNotifier = {
      requestPermission: async () => { log.asked++; return grant; },
      schedule: async (list) => { log.scheduled = list.map((n) => ({ id: n.id, title: n.title, hour: new Date(n.at).getHours() })); },
      cancel: async () => { log.cancelled++; log.scheduled = []; },
    };
  }, fake);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '#/', { waitUntil: 'load' });
  await page.locator('.app-header [aria-label="设置"]').click();
  await page.waitForSelector('.sheet.open .setting-row');
  return { context, page, errors };
}
const row = (page) => page.locator('.sheet.open .setting-row').filter({ hasText: '连续天数提醒' });

test('网页版不显示提醒开关', async () => {
  const { context, page, errors } = await open();
  assert.equal(await row(page).count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('App 里默认关闭，打开后排好每晚 9 点的通知，关闭后取消', async () => {
  const { context, page, errors } = await open({ fake: true });
  const sw = row(page).locator('[data-setting="reminder"]');
  assert.equal(await sw.getAttribute('aria-checked'), 'false');
  assert.equal(await page.evaluate(() => window.__lgjNotifierLog.asked), 0, '没打开前不申请权限');
  await sw.click();
  await page.waitForFunction(() => window.__lgjNotifierLog.scheduled.length > 0);
  const log = await page.evaluate(() => window.__lgjNotifierLog);
  assert.equal(log.asked, 1);
  assert.ok(log.scheduled.length >= 6 && log.scheduled.every((n) => n.hour === 21));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lgj:reminder.on'))), true);
  await sw.click();
  await page.waitForFunction(() => window.__lgjNotifierLog.scheduled.length === 0);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('lgj:reminder.on'))), false);
  assert.deepEqual(errors, []);
  await context.close();
});

test('通知权限被拒时开关弹回关闭并说明去哪里打开', async () => {
  const { context, page, errors } = await open({ fake: false });
  const sw = row(page).locator('[data-setting="reminder"]');
  await sw.click();
  await page.waitForFunction(() => document.querySelector('[data-setting="reminder"]')?.getAttribute('aria-checked') === 'false');
  assert.match(await row(page).textContent(), /通知权限未开启/);
  assert.equal(await page.evaluate(() => window.__lgjNotifierLog.scheduled.length), 0);
  assert.deepEqual(errors, []);
  await context.close();
});
