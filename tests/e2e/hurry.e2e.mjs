// 仪式快进端到端测试：仪式进行中轻点舞台，剩余等待按 3 倍速走完，舞台右上角出现「快进 ×3」，结果出来后恢复。
// 平时（没有仪式在进行）点舞台不触发快进。运行：npm run e2e（用 2D 画布回退，跑得快）
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildAll } from '../../scripts/build.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';
import { launchBrowser } from '../../scripts/browser.mjs';

const out = path.join(os.tmpdir(), `lgj-hurry-${process.pid}`);
const BENIGN = [/AudioContext was not allowed/, /ERR_TUNNEL_CONNECTION_FAILED|fonts\.g(oogleapis|static)\.com|Failed to load resource/, /WebGL|GL Driver/];

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

async function openCaiyun() {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'zh-CN', reducedMotion: 'no-preference' });
  await context.addInitScript(() => { try { localStorage.setItem('lgj:onboarded', 'true'); } catch {} });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !BENIGN.some((r) => r.test(m.text()))) errors.push('console: ' + m.text()); });
  await page.goto(base + '#/m/caiyun', { waitUntil: 'load' });
  await page.waitForSelector('.view-module[data-module="caiyun"][data-ready="1"]', { timeout: 30_000 });
  await page.evaluate(() => document.querySelector('.sheet.open .icon-btn')?.click());
  await page.waitForTimeout(500);
  return { page, context, errors };
}

/** 点主按钮开始求财，可选在 delay 毫秒后轻点舞台，返回到结果条出现用了多少毫秒（页面内计时）。 */
function timeRitual(page, tapAfter = null) {
  return page.evaluate((tapAfter) => new Promise((resolve) => {
    const receipt = document.querySelector('.view-module .ritual-receipt');
    const stage = document.querySelector('.view-module .stage');
    const t0 = performance.now();
    let sawBadge = false;
    const done = () => { obs.disconnect(); resolve({ ms: performance.now() - t0, sawBadge, hurryLeft: stage.hasAttribute('data-hurry') }); };
    const obs = new MutationObserver(() => {
      if (stage.hasAttribute('data-hurry')) sawBadge = true;
      if (!receipt.hidden) done();
    });
    obs.observe(document.querySelector('.view-module'), { attributes: true, subtree: true, childList: true });
    document.querySelector('.view-module [data-action="primary"]').click();
    if (tapAfter !== null) setTimeout(() => stage.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), tapAfter);
  }), tapAfter);
}

test('仪式进行中轻点舞台快进，结果更早出来，出结果后角标消失', { timeout: 120_000 }, async () => {
  const { page, context, errors } = await openCaiyun();
  const normal = await timeRitual(page);
  assert.equal(normal.sawBadge, false, '不点舞台时不应快进');
  // 收起结果再来一次，这次 150 毫秒后轻点舞台
  await page.evaluate(() => document.querySelector('.sheet.open .icon-btn')?.click());
  await page.waitForTimeout(600);
  const fast = await timeRitual(page, 150);
  assert.equal(fast.sawBadge, true, '快进时舞台应出现「快进 ×3」角标');
  assert.equal(fast.hurryLeft, false, '结果出来后应退出快进');
  assert.ok(fast.ms < normal.ms * 0.7, `快进后应明显更快：正常 ${normal.ms.toFixed(0)}ms，快进 ${fast.ms.toFixed(0)}ms`);
  assert.deepEqual(errors, []);
  await context.close();
});

test('没有仪式在进行时点舞台不触发快进', { timeout: 60_000 }, async () => {
  const { page, context, errors } = await openCaiyun();
  await page.evaluate(() => document.querySelector('.view-module .stage').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  await page.waitForTimeout(200);
  assert.equal(await page.locator('.view-module .stage[data-hurry]').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});
