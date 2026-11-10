// 无障碍审计（axe-core）：逐页跑 axe 规则，列出读屏名字缺失、标题结构、键盘可达等问题，有问题时以 1 退出。
// 关掉 WebGL（玩法页退回 2D 器物），393×852 视口。颜色对比由 contrast-audit.mjs 负责，这里不重复。
// 用法：node scripts/a11y-audit.mjs [--routes home,home@settings,m/qian@sheet] [--json out.json]
// 动作：@settings 设置抽屉 · @paywall 付费卡 · @read 出结果 · @sheet 出结果后打开解读抽屉
import os from 'node:os';
import path from 'node:path';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build.mjs';
import { createStaticServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

// 有意不查的规则：
// color-contrast —— contrast-audit.mjs 按五套皮肤专门查，并且能处理舞台上的浮层
// meta-viewport —— 禁止双指缩放是有意的：缩放会和器物舞台的拖动、甩动手势冲突，iPhone Safari 也不理会这个设置，
//                  App 里改由「设置 › 阅读字号」放大解读文字
export const AXE_DISABLED = ['color-contrast', 'meta-viewport'];
export const DEFAULT_ROUTES = 'home,home@settings,home@paywall,m/qian@read,m/qian@sheet,m/tarot,m/almanac,m/bazi,m/yinyuan,m/coin@read,m/wheel,m/plinko,m/liuyao,m/runes,m/zodiac,m/crystal,m/fengshui,m/jiaobei,m/omikuji,m/caiyun,m/shiye';

const require = createRequire(import.meta.url);
let axeSource = null;

/** 在当前页面注入 axe 并运行，返回 [{ id, impact, help, count, nodes }]。60 秒没跑完按超时处理。 */
export async function runAxe(page) {
  axeSource ??= await readFile(require.resolve('axe-core/axe.min.js'), 'utf8');
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: axeSource });
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('axe 60 秒没跑完')), 60_000); });
  try {
    return await Promise.race([
      page.evaluate(async (disabled) => {
        const rules = Object.fromEntries(disabled.map((id) => [id, { enabled: false }]));
        const r = await window.axe.run(document, { resultTypes: ['violations'], rules });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(' ')} :: ${n.html.slice(0, 140)}`) }));
      }, AXE_DISABLED),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** 打开一个路由并做完动作（见文件头）。 */
export async function openRoute(page, base, spec) {
  const [route, action] = spec.split('@');
  await page.goto(base + (route === 'home' ? '#/' : '#/' + route), { waitUntil: 'load' });
  if (route !== 'home') await page.waitForSelector('.view-module[data-ready="1"]', { timeout: 30_000 });
  else await page.waitForSelector('.app-header');
  await page.waitForTimeout(600);
  // 进入玩法时可能弹出的「用手机动作来玩」邀请先关掉
  await page.evaluate(() => document.querySelector('.sheet.open .icon-btn')?.click());
  await page.waitForTimeout(400);
  if (action === 'settings') { await page.click('.app-header [aria-label="设置"]'); await page.waitForSelector('.sheet.open'); }
  // openPaywall 返回的 Promise 要等付费卡关掉才结束，不能 await 它
  if (action === 'paywall') { await page.evaluate(() => { window.__lgj.openPaywall({ reason: '今天的免费深度解读已用完' }); }); await page.waitForSelector('.sheet.open'); }
  if (action === 'read' || action === 'sheet') {
    const read = page.locator('.ritual-receipt [data-read]');
    const primary = page.locator('.view-module [data-action="primary"]').first();
    for (let i = 0; i < 8 && !(await read.count()); i++) {
      await primary.click().catch(() => {});
      await page.waitForSelector('.ritual-receipt [data-read]', { timeout: 8_000 }).catch(() => {});
    }
    if (action === 'sheet') { await read.first().click(); await page.waitForSelector('.sheet.open'); }
  }
  await page.waitForTimeout(500);
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
  const routes = opt('--routes', DEFAULT_ROUTES).split(',');
  const out = path.join(os.tmpdir(), `lgj-a11y-audit-${process.pid}`);
  await buildAll({ out, min: true });
  const server = createStaticServer(out);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await launchBrowser({ webgl: false });
  const report = {};
  let total = 0;
  try {
    for (const spec of routes) {
      const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'zh-CN' });
      await context.addInitScript(() => { try { localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:zen.auto', 'false'); } catch {} });
      const page = await context.newPage();
      page.setDefaultTimeout(15_000);
      try {
        await openRoute(page, base, spec);
        const found = await runAxe(page);
        report[spec] = found;
        total += found.length;
        console.log(`\n# ${spec}  (${found.length})`);
        for (const v of found) {
          console.log(`  [${v.impact}] ${v.id} × ${v.count} — ${v.help}`);
          v.nodes.forEach((n) => console.log(`      ${n}`));
        }
      } catch (e) {
        report[spec] = [{ id: 'audit-error', impact: 'serious', help: e.message, count: 1, nodes: [] }];
        total++;
        console.log(`\n# ${spec}  审计出错：${e.message}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
    await rm(out, { recursive: true, force: true });
  }
  const json = opt('--json', '');
  if (json) await writeFile(json, JSON.stringify(report, null, 2));
  console.log(`\n合计 ${total} 类无障碍问题（未查：${AXE_DISABLED.join('、')}）`);
  process.exitCode = total ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
