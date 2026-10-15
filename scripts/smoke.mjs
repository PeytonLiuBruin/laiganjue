// 冒烟测试：构建 → 起本地服务器 → 无头 Chromium（手机视口）逐个打开模块 → 收集报错 → 截图。
// 用法：
//   node scripts/smoke.mjs                      全部模块
//   node scripts/smoke.mjs --module tarot        单个模块（可逗号分隔多个）
//   node scripts/smoke.mjs --act                 额外模拟一次"摇/甩/点主按钮"并截结果图
//   node scripts/smoke.mjs --theme paper         指定皮肤
//   node scripts/smoke.mjs --shots dist/shots    截图目录（默认 dist/shots）
//   node scripts/smoke.mjs --module tarot --full 指定模块但仍全量打包（默认只打包指定模块，其余占位）
//   node scripts/smoke.mjs --module liuyao --act --until-sheet 8   多步模块：持续点主按钮直到结果抽屉出现，截 <id>-3.png
//   node scripts/smoke.mjs --viewport se                小屏手机 375x667（也可 360x640 / 430x932 / large / small）
// 每个画面（玩法页、结果抽屉）都会检查文字互相压住（[overlap]）与横向溢出。
// 退出码：有 console.error / pageerror / 模块未就绪 / 文字重叠 → 1，否则 0。
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build.mjs';
import { createStaticServer } from './serve.mjs';
import { MODULE_LIST } from '../src/modules/list.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => {
  const i = args.indexOf(n);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

const only = opt('--module', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const act = flag('--act');
const theme = opt('--theme', '');
const untilSheet = Number(opt('--until-sheet', '0')) || 0;
// --viewport 375x667 | 360x640 | 430x932 | 390x844(默认)；也可用别名 se / small / large / default
const VIEWPORTS = { se: '375x667', small: '360x640', default: '390x844', large: '430x932', tablet: '768x1024' };
const vpRaw = opt('--viewport', 'default');
const [vpW, vpH] = (VIEWPORTS[vpRaw] || vpRaw).split('x').map(Number);
const viewport = { width: vpW || 390, height: vpH || 844 };
const shotsDir = path.resolve(root, opt('--shots', 'dist/shots'));
const tmpOut = path.join(os.tmpdir(), `lgj-smoke-${process.pid}`);

const ids = only.length ? only : MODULE_LIST.map((m) => m.id);
for (const id of ids) {
  if (!MODULE_LIST.some((m) => m.id === id)) {
    console.error(`unknown module id: ${id}`);
    process.exit(2);
  }
}

async function launchBrowser() {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch();
  } catch (e) {
    // 回退：使用预装的 Chromium 可执行文件
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    const candidates = [];
    if (fs.existsSync(base)) {
      for (const d of fs.readdirSync(base)) {
        for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome']) {
          const p = path.join(base, d, sub);
          if (fs.existsSync(p)) candidates.push(p);
        }
      }
    }
    if (!candidates.length) throw e;
    return chromium.launch({ executablePath: candidates[0] });
  }
}

await rm(tmpOut, { recursive: true, force: true });
// 指定 --module 时默认只打包这些模块（其余为占位），避免别人正在改的模块拖垮构建；--full 强制全量
await buildAll({ out: tmpOut, min: false, only: only.length && !flag('--full') ? only : null });
await mkdir(shotsDir, { recursive: true });

const server = createStaticServer(tmpOut);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const base = `http://127.0.0.1:${port}/`;

const browser = await launchBrowser();
const context = await browser.newContext({
  viewport,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  reducedMotion: 'no-preference',
});
if (theme) {
  await context.addInitScript((t) => {
    try {
      localStorage.setItem('lgj:theme', JSON.stringify(t));
    } catch {}
  }, theme);
}
const page = await context.newPage();
const report = { ok: true, base, modules: {} };
let current = 'home';
const errors = {};
const pushErr = (kind, text) => {
  (errors[current] ||= []).push(`[${kind}] ${text}`);
};
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  // 资源加载失败（字体 / favicon）不算模块错误
  if (/Failed to load resource/.test(text)) return;
  pushErr('console.error', text);
});
page.on('pageerror', (err) => pushErr('pageerror', err.message));
page.on('requestfailed', (req) => {
  if (!/fonts\.(googleapis|gstatic)\.com/.test(req.url())) pushErr('requestfailed', req.url());
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 文字重叠检测：逐行取每段文字的实际矩形，同一层（玩法页 / 抽屉正文 / 抽屉按钮栏）里不同元素的文字矩形明显相交即报告。
// 印章、装饰性（aria-hidden）与不可见文字不参与；被滚动容器裁掉的部分不算；贴底 / 悬浮栏（sticky / fixed）
// 盖在滚动内容上是设计如此（栏本身要有实底，见 almanac .al-actions），不与栏外文字比较。
async function checkOverlaps(where) {
  const found = await page.evaluate(() => {
    const layers = [...document.querySelectorAll('.sheet.open .sheet-body, .sheet.open .sheet-actions, .sheet.open .sheet-head, .view-module')]
      .filter((el) => !(el.matches('.view-module') && document.querySelector('.sheet.open')));
    const out = [];
    for (const layer of layers) {
      const boxes = [];
      const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        if (!el || el.closest('[aria-hidden="true"], .seal, svg, canvas, [hidden], .sr-only')) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.15) continue;
        // 被 overflow 不为 visible 的祖先裁掉的部分看不见；顺便记下所在的悬浮栏
        const clips = [];
        let float = null;
        for (let a = el; a && a !== layer.parentElement; a = a.parentElement) {
          const as = getComputedStyle(a);
          if (!float && (as.position === 'sticky' || as.position === 'fixed')) float = a;
          if (a !== el && (as.overflowX !== 'visible' || as.overflowY !== 'visible')) clips.push(a.getBoundingClientRect());
        }
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const raw of range.getClientRects()) {
          let left = raw.left, top = raw.top, right = raw.right, bottom = raw.bottom;
          for (const c of clips) { left = Math.max(left, c.left); top = Math.max(top, c.top); right = Math.min(right, c.right); bottom = Math.min(bottom, c.bottom); }
          const r = { left, top, right, bottom, width: right - left, height: bottom - top };
          if (r.width > 2 && r.height > 2) boxes.push({ r, el, float, text: n.textContent.trim() });
        }
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el) || a.float !== b.float) continue;
          const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
          const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          if (w <= 3 || h <= 3) continue;
          const small = Math.min(a.r.width * a.r.height, b.r.width * b.r.height);
          if (w * h < 0.2 * small) continue;
          out.push(`「${a.text.slice(0, 14)}」压到「${b.text.slice(0, 14)}」(${Math.round(w)}×${Math.round(h)}px)`);
        }
      }
    }
    return [...new Set(out)].slice(0, 6);
  });
  for (const f of found) pushErr('overlap', `${where}：${f}`);
}

// 首页
await page.goto(base + '#/', { waitUntil: 'load' });
await page.waitForSelector('[data-view="home"]', { timeout: 8000 }).catch(() => pushErr('timeout', 'home view not rendered'));
await sleep(400);
await page.screenshot({ path: path.join(shotsDir, 'home.png'), fullPage: false });
report.modules.home = { errors: errors.home || [] };

for (const id of ids) {
  current = id;
  await page.goto(base + `#/m/${id}`, { waitUntil: 'load' });
  const ready = await page
    .waitForSelector(`.view-module[data-module="${id}"][data-ready="1"]`, { timeout: 6000 })
    .then(() => true)
    .catch(() => false);
  if (!ready) pushErr('timeout', `module "${id}" did not mark itself ready (data-ready="1")`);
  await sleep(500);
  const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth));
  if (overflow > 2) pushErr('overflow-x', `页面横向溢出 ${overflow}px（手机适配）`);
  await checkOverlaps('玩法页');
  await page.screenshot({ path: path.join(shotsDir, `${id}.png`) });
  let acted = false;
  if (act) {
    // 模拟一次体感（摇 → 甩），若没有弹出结果抽屉则点主按钮；观察是否报错、是否出结果
    const closeSheet = async () => {
      const btn = await page.$('.sheet.open .sheet-head .icon-btn');
      if (btn) {
        await btn.click({ timeout: 2000 }).catch(() => {});
        await sleep(500);
      }
    };
    await page.evaluate(() => {
      try {
        window.__lgj?.simulate?.('shake', { intensity: 25 });
      } catch (e) {
        console.error('simulate shake failed: ' + e.message);
      }
    });
    await sleep(1400);
    if (await page.$('.sheet.open')) await checkOverlaps('摇一摇后的抽屉');
    await page.screenshot({ path: path.join(shotsDir, `${id}-shake.png`) });
    await closeSheet();
    await page.evaluate(() => {
      try {
        window.__lgj?.simulate?.('toss', { intensity: 26 });
      } catch (e) {
        console.error('simulate toss failed: ' + e.message);
      }
    });
    await sleep(2200);
    if (!(await page.$('.sheet.open'))) {
      const primary = await page.$(`.view-module[data-module="${id}"] [data-action="primary"]`);
      if (primary) {
        await primary.click({ timeout: 4000, force: true }).catch((e) => pushErr('click', e.message.split('\n')[0]));
        acted = true;
        await sleep(2800);
      }
    }
    await checkOverlaps(await page.$('.sheet.open') ? '结果抽屉' : '动作后');
    await page.screenshot({ path: path.join(shotsDir, `${id}-2.png`) });
    // --until-sheet N：多步模块（如六爻六掷）——继续点主按钮 / 「展开解读」直到结果抽屉出现，再截一张
    if (untilSheet > 0) {
      for (let i = 0; i < untilSheet && !(await page.$('.sheet.open')); i++) {
        const read = await page.$('.ritual-receipt:not([hidden]) .btn.primary');
        const primary = read || (await page.$(`.view-module[data-module="${id}"] [data-action="primary"]:not([disabled])`));
        if (!primary) break;
        await primary.click({ timeout: 4000, force: true }).catch(() => {});
        await sleep(2600);
      }
      if (await page.$('.sheet.open')) await checkOverlaps('结果抽屉');
      await page.screenshot({ path: path.join(shotsDir, `${id}-3.png`) });
    }
  }
  report.modules[id] = { ready, acted, errors: errors[id] || [] };
}

await browser.close();
server.close();
await rm(tmpOut, { recursive: true, force: true });

let bad = 0;
for (const [id, r] of Object.entries(report.modules)) {
  const status = r.errors.length || r.ready === false ? 'FAIL' : 'ok';
  if (status === 'FAIL') bad++;
  console.log(`${status.padEnd(4)} ${id}${r.errors.length ? '\n     ' + r.errors.join('\n     ') : ''}`);
}
report.ok = bad === 0;
await writeFile(path.join(shotsDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\nshots → ${path.relative(root, shotsDir)}/   ${bad ? bad + ' failing' : 'all clean'}`);
process.exit(bad ? 1 : 0);
