// 3D 器物舞台端到端测试：自己构建、自己起本地服务器、自己开无头 Chromium（软件 WebGL），不依赖任何外部环境。
// 运行：npm run e2e      截图输出：dist/e2e-shots/
import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll } from '../../scripts/build.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';
import { launchBrowser } from '../../scripts/browser.mjs';
import { STAGE_TIMEOUT, scaled } from '../../scripts/stage-timeout.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const shots = path.join(root, 'dist/e2e-shots');
const out = path.join(os.tmpdir(), `lgj-e2e-${process.pid}`);
const BENIGN = [/AudioContext was not allowed/, /ERR_TUNNEL_CONNECTION_FAILED|fonts\.g(oogleapis|static)\.com|Failed to load resource/, /GPU stall due to ReadPixels/, /GL Driver Message/, /WebGL: INVALID_OPERATION: drawArrays|Automatic fallback to software WebGL/];

// 每个 3D 器物：所在模块、切换到它要点的标签、它的槽位选择器
const OBJECTS = [
  { id: 'yinyuan.knot', module: 'yinyuan', tab: '正缘', slot: '.yy-slot[data-model-slot="yinyuan.knot"]' },
  { id: 'yinyuan.thread', module: 'yinyuan', tab: '合婚', slot: '.yy-slot[data-model-slot="yinyuan.thread"]' },
  { id: 'shiye.seal', module: 'shiye', tab: 0, slot: '[data-model-slot="shiye.seal"]' },
  { id: 'shiye.ladder', module: 'shiye', tab: 1, slot: '[data-model-slot="shiye.ladder"]' },
  { id: 'caiyun.tree', module: 'caiyun', tab: 0, slot: '[data-model-slot="caiyun.tree"]' },
  { id: 'caiyun.vault', module: 'caiyun', tab: 1, slot: '[data-model-slot="caiyun.vault"]' },
  { id: 'fengshui.compass', module: 'fengshui', tab: null, slot: '[data-model-slot="fengshui.compass"]' },
  { id: 'crystal.ball', module: 'crystal', tab: '水晶球', slot: '[data-model-slot="crystal.ball"]' },
  { id: 'crystal.pendulum', module: 'crystal', tab: '灵摆', slot: '[data-model-slot="crystal.pendulum"]' },
  { id: 'zodiac.sky', module: 'zodiac', tab: null, slot: '[data-model-slot="zodiac.sky"]' },
  { id: 'bazi.pillars', module: 'bazi', tab: null, slot: '[data-model-slot="bazi.pillars"]' },
];

let server, base, browser;
before(async () => {
  await rm(out, { recursive: true, force: true });
  await buildAll({ out, min: true });
  await mkdir(shots, { recursive: true });
  server = createStaticServer(out);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await launchBrowser({ webgl: true });
});
// 失败的用例也要关掉上下文：留着正在渲染的 WebGL 舞台会占满软件渲染的 CPU，拖垮后面所有用例。
const openContexts = new Set();
afterEach(async () => { for (const c of openContexts) await c.close().catch(() => {}); openContexts.clear(); });
after(async () => {
  await browser?.close();
  server?.close();
  await rm(out, { recursive: true, force: true });
});

async function openPage({ theme = 'paper', webglBrowser = browser, extra = {} } = {}) {
  const context = await webglBrowser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'zh-CN', reducedMotion: 'no-preference' });
  await context.addInitScript(({ theme, extra }) => {
    try {
      localStorage.setItem('lgj:theme', JSON.stringify(theme)); localStorage.setItem('lgj:dev.skins', 'true');
      localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:zen.auto', 'false');
      for (const [k, v] of Object.entries(extra)) localStorage.setItem('lgj:' + k, JSON.stringify(v));
    } catch {}
  }, { theme, extra });
  openContexts.add(context);
  context.setDefaultTimeout(STAGE_TIMEOUT); context.setDefaultNavigationTimeout(STAGE_TIMEOUT);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !BENIGN.some((r) => r.test(m.text()))) errors.push('console: ' + m.text()); });
  return { page, context, errors };
}
/**
 * 按固定间隔轮询等元素出现（不按 requestAnimationFrame 轮询，软件 WebGL 一帧可能要几百毫秒）。
 * 第 11 轮查明：Mac 上用 SwiftShader 软件渲染时，舞台首次编译着色器会把页面主线程占住 20 到 40 秒，
 * 期间任何 evaluate 都没有回应，所以玩法页与舞台的等待都用 STAGE_TIMEOUT。真机有 GPU，不受影响。
 */
function waitFor(page, selector, { timeout = STAGE_TIMEOUT, visible = true } = {}) {
  return page.waitForFunction(({ selector, visible }) => {
    const el = document.querySelector(selector);
    return !!el && (!visible || el.getClientRects().length > 0);
  }, { selector, visible }, { timeout, polling: 200 });
}
async function openModule(page, module) {
  await page.goto(base + `#/m/${module}`, { waitUntil: 'domcontentloaded' });
  await waitFor(page, `.view-module[data-module="${module}"][data-ready="1"]`);
  await page.evaluate(() => document.querySelector('.sheet.open .icon-btn')?.click());
}
async function selectTab(page, tab) {
  if (tab === null || tab === undefined) return;
  const tabs = page.locator('.view-module .tabs .tab');
  const target = typeof tab === 'number' ? tabs.nth(tab) : tabs.filter({ hasText: tab }).first();
  await target.click();
}
async function waitStage(page, slot) {
  await waitFor(page, `${slot}.has-stage[data-compiled="1"]`, { timeout: STAGE_TIMEOUT, visible: false });
}
/** 在页面里推进一帧并读回像素，统计亮度均值、方差与颜色数。 */
function frameStats(page, slot) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    el.__stage.advance(1 / 30);
    const src = el.querySelector('canvas.stage-canvas'), w = 96, h = 96;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(src, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data;
    let sum = 0, sum2 = 0; const colors = new Set();
    for (let i = 0; i < w * h; i++) {
      const r = d[i * 4], gg = d[i * 4 + 1], b = d[i * 4 + 2], l = .2126 * r + .7152 * gg + .0722 * b;
      sum += l; sum2 += l * l; colors.add((r >> 4) << 8 | (gg >> 4) << 4 | (b >> 4));
    }
    const n = w * h, mean = sum / n;
    return { mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)), colors: colors.size };
  }, slot);
}
const shot = (page, slot, name) => page.locator(slot).screenshot({ path: path.join(shots, name + '.png') }).catch(() => {});

test('每个 3D 器物都用 WebGL 渲染：有雾、倒影水面、随风粒子，只有指定材质发光', { timeout: scaled(900_000) }, async () => {
  const { page, context, errors } = await openPage();
  let lastModule = null;
  for (const o of OBJECTS) {
    if (o.module !== lastModule) { await openModule(page, o.module); lastModule = o.module; }
    await selectTab(page, o.tab);
    await waitStage(page, o.slot);
    const renderer = await page.locator(o.slot).getAttribute('data-renderer');
    assert.equal(renderer, 'webgl', `${o.id} 应使用 WebGL 舞台`);
    const stats = await frameStats(page, o.slot);
    assert.ok(stats.std > 6 && stats.colors > 40, `${o.id} 画面不应是空白：${JSON.stringify(stats)}`);
    const info = await page.evaluate((sel) => document.querySelector(sel).__stage.inspect(), o.slot);
    assert.ok(info.fog && info.fog[1] > info.fog[0], `${o.id} 应有远景雾`);
    assert.ok(info.water && info.reflection[0] >= 64, `${o.id} 应有倒影水面`);
    assert.ok(info.particles.length > 0, `${o.id} 应有飘浮粒子`);
    assert.ok(info.glow.length > 0, `${o.id} 应登记至少一处发光`);
    assert.deepEqual(info.undesignated, [], `${o.id} 只有登记过的材质可以发光`);
    assert.ok(info.shadows, `${o.id} 应开启柔和阴影`);
    await shot(page, o.slot, `${o.id}-idle`);
    await page.waitForFunction((sel) => /^\d+ FPS$/.test(document.querySelector(sel + ' .stage-fps')?.textContent || ''), o.slot, { timeout: 8000, polling: 200 }).catch(() => {});
    const fps = await page.locator(`${o.slot} .stage-fps`).textContent().catch(() => '');
    console.log(`  ${o.id.padEnd(18)} ${fps}  quality ${info.quality}  draw calls ${info.calls}  triangles ${info.triangles}`);
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test('动作与揭晓：姻缘、事业、财运六件器物摇动后进入动作并揭晓', { timeout: scaled(900_000) }, async () => {
  const { page, context, errors } = await openPage();
  for (const o of OBJECTS.filter((x) => /^(yinyuan|shiye|caiyun)\./.test(x.id))) {
    await openModule(page, o.module);
    await selectTab(page, o.tab);
    await waitStage(page, o.slot);
    const canvas = `${o.slot} canvas.stage-canvas`;
    await page.locator(`.view-module [data-action="primary"]`).first().click({ force: true });
    await waitFor(page, `${canvas}[data-phase="active"]`, { timeout: scaled(15_000), visible: false });
    await shot(page, o.slot, `${o.id}-active`);
    await waitFor(page, `${canvas}[data-phase="revealed"]`, { timeout: scaled(30_000), visible: false });
    await page.evaluate((sel) => document.querySelector(sel).__stage.advance(1.2), o.slot);
    await shot(page, o.slot, `${o.id}-revealed`);
    await page.evaluate(() => document.querySelector('.sheet.open .icon-btn')?.click());
  }
  assert.deepEqual(errors, []);
  await context.close();
});

test('八字排盘：命牌翻转后显示四柱', { timeout: scaled(300_000) }, async () => {
  const { page, context, errors } = await openPage();
  await openModule(page, 'bazi');
  const slot = '[data-model-slot="bazi.pillars"]';
  await waitStage(page, slot);
  await page.locator('.view-module [data-action="primary"]').first().click({ force: true });
  await page.waitForFunction((sel) => (document.querySelector(sel + ' canvas.stage-canvas')?.dataset.pillars || '').trim().length > 0, slot, { timeout: scaled(20_000), polling: 200 });
  await page.evaluate((sel) => document.querySelector(sel).__stage.advance(3), slot);
  const stats = await frameStats(page, slot);
  assert.ok(stats.std > 6);
  await shot(page, slot, 'bazi.pillars-revealed');
  assert.deepEqual(errors, []);
  await context.close();
});

test('帧率计数默认隐藏，在设置里打开后显示在舞台右上角，再关闭后隐藏', { timeout: scaled(300_000) }, async () => {
  const { page, context, errors } = await openPage();
  await openModule(page, 'fengshui');
  const slot = '[data-model-slot="fengshui.compass"]';
  await waitStage(page, slot);
  const fps = page.locator(`${slot} .stage-fps`);
  assert.equal(await page.evaluate(() => document.documentElement.dataset.fps), 'off', '默认关闭');
  assert.equal(await fps.isVisible(), false, '默认不显示');
  const row = () => page.locator('.setting-row').filter({ hasText: '帧率显示' });
  await page.locator('.app-header [aria-label="设置"]').click();
  await row().locator('input, button, [role="switch"]').first().click();
  await page.waitForFunction(() => document.documentElement.dataset.fps === 'on', undefined, { polling: 200 });
  await page.keyboard.press('Escape');
  await assert.doesNotReject(fps.waitFor({ state: 'visible' }));
  await page.waitForFunction((sel) => /^[1-9]\d* FPS$/.test(document.querySelector(sel + ' .stage-fps')?.textContent || ''), slot, { timeout: scaled(60_000), polling: 200 });
  const box = await fps.boundingBox(), slotBox = await page.locator(slot).boundingBox();
  assert.ok(box.x > slotBox.x + slotBox.width / 2 && box.y < slotBox.y + 40, '帧率在右上角');
  await page.locator('.app-header [aria-label="设置"]').click();
  await row().locator('input, button, [role="switch"]').first().click();
  await page.waitForFunction(() => document.documentElement.dataset.fps === 'off', undefined, { polling: 200 });
  assert.equal(await fps.isVisible(), false, '关闭后不再显示');
  assert.deepEqual(errors, []);
  await context.close();
});

test('隐藏的器物不预先创建：切到合婚时红线舞台才初始化', { timeout: scaled(300_000) }, async () => {
  const { page, context, errors } = await openPage({ extra: { 'yinyuan.tab': 'self' } });
  await openModule(page, 'yinyuan');
  await selectTab(page, '正缘');
  await waitStage(page, '[data-model-slot="yinyuan.knot"]');
  assert.equal(await page.locator('[data-model-slot="yinyuan.thread"] canvas.stage-canvas').getAttribute('data-quality'), null, '红线舞台此时还没有建');
  await selectTab(page, '合婚');
  await waitStage(page, '[data-model-slot="yinyuan.thread"]');
  assert.deepEqual(errors, []);
  await context.close();
});

test('离开玩法页后释放 WebGL 舞台', { timeout: scaled(300_000) }, async () => {
  const { page, context, errors } = await openPage();
  await openModule(page, 'zodiac');
  await waitStage(page, '[data-model-slot="zodiac.sky"]');
  await page.goto(base + '#/', { waitUntil: 'domcontentloaded' });
  await waitFor(page, '[data-view="home"]');
  assert.equal(await page.locator('canvas.stage-canvas').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test('深色皮肤下场景随之变暗（天空、雾、水色跟着皮肤走）', { timeout: scaled(300_000) }, async () => {
  const slot = '[data-model-slot="crystal.ball"]';
  const measure = async (theme) => {
    const { page, context, errors } = await openPage({ theme });
    await openModule(page, 'crystal');
    await selectTab(page, '水晶球');
    await waitStage(page, slot);
    const s = await frameStats(page, slot);
    await shot(page, slot, `crystal.ball-${theme}`);
    assert.deepEqual(errors, []);
    await context.close();
    return s.mean;
  };
  const light = await measure('paper'), dark = await measure('nebula');
  assert.ok(dark < light - 40, `星穹皮肤应明显更暗（paper ${light.toFixed(0)} / nebula ${dark.toFixed(0)}）`);
});

test('不支持 WebGL 时退回 2D 画布，玩法照常可用', { timeout: scaled(300_000) }, async () => {
  // Chromium 直接关掉 WebGL；其他内核用 lgj.render=canvas 强制走同一条回退路径
  const webkit = (process.env.E2E_BROWSER || 'chromium') !== 'chromium';
  const noGL = webkit ? browser : await launchBrowser({ webgl: false });
  try {
    const { page, context, errors } = await openPage({ webglBrowser: noGL });
    if (webkit) await context.addInitScript(() => localStorage.setItem('lgj.render', 'canvas'));
    await openModule(page, 'caiyun');
    const slot = page.locator('[data-model-slot="caiyun.tree"]');
    await slot.locator('canvas.model-canvas').waitFor({ state: 'attached' });
    assert.equal(await slot.evaluate((el) => el.classList.contains('has-stage')), false);
    await page.locator('.view-module [data-action="primary"]').first().click({ force: true });
    await waitFor(page, '[data-model-slot="caiyun.tree"] canvas[data-phase="revealed"]', { visible: false });
    assert.deepEqual(errors, []);
    await context.close();
  } finally { if (!webkit) await noGL.close(); }
});
