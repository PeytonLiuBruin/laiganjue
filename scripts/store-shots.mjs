// App Store 商店截图：先用 iPhone 视口截下 App 画面，再套上明快渐变底、中文大标题与圆角机身，
// 输出 6.9 寸（1290×2796）与 6.5 寸（1242×2688）各 6 张到 docs/claude-plan/store/。
// 用法：node scripts/store-shots.mjs [--out docs/claude-plan/store] [--theme paper]
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build.mjs';
import { createStaticServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const out = path.resolve(root, opt('--out', 'docs/claude-plan/store'));
const theme = opt('--theme', 'paper');

// 每张：路由、动作、标题、副标题、底色（取 visual-direction.md 色板）
export const SCENES = [
  { route: 'home', title: '摇一摇，来点感觉', sub: '灵签 · 塔罗 · 六爻 · 姻缘，十几种玩法一手掌握', bg: ['#5ab8ff', '#b4e3ff'] },
  { route: 'm/qian', action: 'read', lucky: /上/, title: '摇签筒，求一支灵签', sub: '签诗逐句解，像在庙里抽签', bg: ['#ff8a5c', '#ffd27a'] },
  { route: 'm/tarot', action: 'read', upright: true, title: '塔罗牌阵，一张张翻开', sub: '经典 RWS 牌面，牌阵完整解读', bg: ['#9b6bff', '#d7c4ff'] },
  { route: 'm/caiyun', stage: true, title: '摇钱树，摇出今日财运', sub: '3D 卡通器物，手感十足', bg: ['#ffc93c', '#fff1b8'] },
  { route: 'm/yinyuan', stage: true, title: '姻缘线，看看缘分', sub: '正缘画像与合婚六项分析', bg: ['#ff6a8a', '#ffd0dc'] },
  { route: 'm/crystal', stage: true, title: '水晶球，问一个问题', sub: '不用注册，打开就能玩', bg: ['#3fcf8e', '#c6f5df'] },
];
// 商店图里可以出现的塔罗牌（正位、寓意积极、画面明亮）。太阳、恋人、星星、世界牌面有裸体人物，不放进商店图（审核与年龄分级）
const GOOD_CARDS = ['命运之轮', '力量', '魔术师', '皇后', '圣杯三', '圣杯十', '星币十', '权杖六', '圣杯王牌', '星币王牌'];
// 外框尺寸（逻辑像素 × 3 = 输出像素）与 App 画面尺寸
const SIZES = [
  { name: '6.9in-1290x2796', frame: { width: 430, height: 932 }, app: { width: 393, height: 852 }, titleH: 196, shotW: 326 },
  { name: '6.5in-1242x2688', frame: { width: 414, height: 896 }, app: { width: 393, height: 852 }, titleH: 182, shotW: 316 },
];

/** 合成页 HTML（导出供测试检查）。 */
export function frameHtml(scene, size, dataUrl) {
  const [a, b] = scene.bg;
  const shotH = Math.round(size.shotW * size.app.height / size.app.width);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${size.frame.width}px;height:${size.frame.height}px;overflow:hidden}
  body{background:linear-gradient(170deg,${a},${b});font-family:"SF Pro Rounded","PingFang SC",system-ui,sans-serif;color:#2b2240;position:relative}
  .t{position:absolute;left:20px;right:20px;top:${Math.round(size.titleH * 0.26)}px;text-align:center}
  h1{margin:0;font-size:31px;font-weight:800;letter-spacing:.02em;color:#fff;text-shadow:0 3px 0 rgba(43,34,64,.28)}
  p{margin:10px 0 0;font-size:15px;font-weight:600;color:rgba(43,34,64,.78)}
  .phone{position:absolute;left:50%;top:${size.titleH}px;transform:translateX(-50%);width:${size.shotW}px;height:${shotH}px;border-radius:38px;padding:7px;background:#2b2240;box-shadow:0 6px 0 rgba(43,34,64,.35),0 24px 48px rgba(43,34,64,.25)}
  .phone img{display:block;width:100%;height:100%;border-radius:31px;object-fit:cover}
  </style></head><body><div class="t"><h1>${scene.title}</h1><p>${scene.sub}</p></div><div class="phone"><img src="${dataUrl}"></div></body></html>`;
}

const STAGE_TIMEOUT = 120_000;
const PRIMARY = '.view-module [data-action="primary"]';
const RESULT = '.ritual-receipt:not([hidden]) [data-read]';

/** 按 200 毫秒间隔轮询（不按 requestAnimationFrame，软件 WebGL 一帧可能要几百毫秒）。 */
function waitFor(page, fn, arg, timeout = STAGE_TIMEOUT) {
  return page.waitForFunction(fn, arg, { timeout, polling: 200 });
}
/** 当前状态：主按钮文字、是否已出结果、是否有打开的抽屉。 */
function state(page) {
  return page.evaluate(({ PRIMARY, RESULT }) => {
    const b = [...document.querySelectorAll(PRIMARY)].find((el) => el.getClientRects().length);
    const r = document.querySelector(RESULT);
    return { label: b ? b.textContent.trim() : '', disabled: !b || b.disabled, result: !!(r && r.getClientRects().length), sheet: !!document.querySelector('.sheet.open') };
  }, { PRIMARY, RESULT });
}
/** 点一次主按钮，等到按钮文字变了或出了结果（最多 25 秒）。 */
async function step(page) {
  const before = await state(page);
  if (before.sheet) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(500); }
  await page.locator(PRIMARY).filter({ visible: true }).first().click({ timeout: 10_000 }).catch(() => {});
  await waitFor(page, ({ PRIMARY, RESULT, label, result }) => {
    const b = [...document.querySelectorAll(PRIMARY)].find((el) => el.getClientRects().length);
    const r = document.querySelector(RESULT);
    const nowResult = !!(r && r.getClientRects().length);
    return b && !b.disabled && (b.textContent.trim() !== label || nowResult !== result);
  }, { PRIMARY, RESULT, label: before.label, result: before.result }, 25_000).catch(() => {});
  await page.waitForTimeout(300);
}
/** 一直点主按钮直到出结果条（灵签：摇签 → 出签）。 */
async function playUntilResult(page) {
  for (let i = 0; i < 6; i++) {
    if ((await state(page)).result) return true;
    await step(page);
  }
  return (await state(page)).result;
}
/**
 * 一直点主按钮，直到结果满足 accept（灵签要上签）。塔罗是「抽一张 → 翻开 → 再来一次」三步。要一张寓意积极的正位牌：逆位时画面倒置像出错，
 * 「圣杯五 · 失落」这类牌放在商店图里太丧。不满足就「再来一次」，总共最多 6 分钟（每次约 9% 的机会，平均 11 次）。
 */
async function drawGood(page, accept) {
  const end = Date.now() + 360_000;
  let tries = 0;
  while (Date.now() < end) {
    const st = await state(page);
    if (st.result) {
      const verdict = await page.evaluate(() => {
        // 只看舞台上可见的牌，历史缩略图（.tr-thumb）不算
        const rev = [...document.querySelectorAll('.view-module .reversed:not(.tr-thumb)')].some((el) => el.getClientRects().length && !el.closest('.tr-thumb, [hidden]'));
        const name = (document.querySelector('.ritual-receipt:not([hidden]) h2')?.textContent || '').trim();
        return { rev, name };
      });
      tries++;
      if (accept(verdict)) { console.log(`  第 ${tries} 次：${verdict.name}${verdict.rev ? ' · 逆位' : ''}`); return true; }
    }
    await step(page);
  }
  return false;
}
/**
 * 出结果后整理画面：结果条按钮被屏幕底边切掉时，把舞台顶到顶栏下方（舞台上面的输入框整个收进顶栏后，不留半截）；
 * 玩法页签被顶栏盖住一半时，把页签对齐到顶栏下方。
 */
async function alignTabs(page) {
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const hb = document.querySelector('.app-header')?.getBoundingClientRect().bottom || 64;
    const rc = document.querySelector('.view-module .ritual-receipt:not([hidden])')?.getBoundingClientRect();
    const sg = [...document.querySelectorAll('.view-module .stage')].find((el) => el.getClientRects().length)?.getBoundingClientRect();
    if (rc && sg && rc.bottom > window.innerHeight - 36 && sg.top > hb + 10) window.scrollTo({ top: window.scrollY + sg.top - hb - 10, behavior: 'instant' });
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const hb = document.querySelector('.app-header')?.getBoundingClientRect().bottom || 64;
    const t = [...document.querySelectorAll('.view-module .tabs, .view-module .chips')].find((el) => el.getClientRects().length);
    if (!t) return;
    const r = t.getBoundingClientRect();
    if (r.top < hb + 4 && r.bottom > hb - 2) window.scrollTo({ top: window.scrollY + r.top - hb - 10, behavior: 'instant' });
  });
}

async function main() {
  await mkdir(out, { recursive: true });
  const dist = path.join(root, 'dist');
  await buildAll({ out: dist, min: false });
  const server = createStaticServer(dist);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await launchBrowser();
  const t0 = Date.now();
  // 1) App 画面（393×852 @3x），每个场景截一次，两种外框共用。
  // 每个场景开新的上下文：只改 hash 不会重载页面，上一个玩法的结果条和历史缩略图会留在 DOM 里，干扰下面的判断。
  const shots = [];
  for (const s of SCENES) {
    const ts = Date.now();
    const ctx = await browser.newContext({ viewport: SIZES[0].app, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'zh-CN' });
    await ctx.addInitScript((t) => { try { localStorage.setItem('lgj:theme', JSON.stringify(t)); localStorage.setItem('lgj:dev.skins', 'true'); localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:stage.fps', 'false'); localStorage.setItem('lgj:tarot:spread', JSON.stringify('single')); localStorage.setItem('lgj:hint.hurry', 'true'); } catch {} }, theme);
    ctx.setDefaultTimeout(STAGE_TIMEOUT);
    const page = await ctx.newPage();
    await page.goto(base + (s.route === 'home' ? '#/' : '#/' + s.route), { waitUntil: 'domcontentloaded', timeout: STAGE_TIMEOUT });
    await waitFor(page, (home) => !!document.querySelector(home ? '.app-header' : '.view-module[data-ready="1"]'), s.route === 'home');
    // 3D 舞台：软件渲染首次编译着色器会占住主线程几十秒，按固定间隔轮询等它编译完
    await page.waitForTimeout(800);
    // stage: true 的场景至少要有一个可见舞台编译完（舞台是懒创建的，太早检查会是空集合而直接放行）
    await waitFor(page, (need) => { const v = [...document.querySelectorAll('.has-stage')].filter((el) => el.getClientRects().length); return (!need || v.length > 0) && v.every((el) => el.dataset.compiled === '1'); }, !!s.stage);
    await page.waitForTimeout(1200);
    for (let i = 0; i < 2; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(400); }
    // 商店图里不展示「开启手机体感」授权卡（真机上授权一次后即收起），把舞台让到首屏；关掉焦点环
    await page.addStyleTag({ content: '.motion-entry{display:none!important} *:focus-visible{outline:none!important}' });
    await page.evaluate(() => document.activeElement?.blur?.());
    if (s.action === 'read') {
      // 灵签要上签（「中下签」放在商店图里太丧），塔罗要积极的正位牌
      const ok = s.upright ? await drawGood(page, (v) => !v.rev && GOOD_CARDS.includes(v.name))
        : s.lucky ? await drawGood(page, (v) => s.lucky.test(v.name)) : await playUntilResult(page);
      if (!ok) console.warn(`警告：${s.route} 没拿到合适的结果，商店图需要人工重拍`);
      await alignTabs(page);
    }
    // 收起授权卡会改变舞台尺寸，画布重设大小后要等下一帧才有画面。软件渲染一帧很慢，这里主动推进并画一帧再截图
    await page.waitForTimeout(1000);
    await page.evaluate(() => document.querySelectorAll('[data-model-slot]').forEach((el) => { if (el.getClientRects().length) el.__stage?.advance?.(1 / 30); }));
    await page.waitForTimeout(600);
    shots.push('data:image/png;base64,' + (await page.screenshot()).toString('base64'));
    await ctx.close();
    console.log(`  ${s.route} 用时 ${((Date.now() - ts) / 1000).toFixed(1)} 秒`);
  }
  // 2) 套外框
  const files = [];
  for (const size of SIZES) {
    const fctx = await browser.newContext({ viewport: size.frame, deviceScaleFactor: 3 });
    const fp = await fctx.newPage();
    for (const [i, s] of SCENES.entries()) {
      await fp.setContent(frameHtml(s, size, shots[i]));
      await fp.waitForTimeout(150);
      const file = `${size.name}-${i + 1}.png`;
      await fp.screenshot({ path: path.join(out, file) });
      files.push(file);
      console.log(file);
    }
    await fctx.close();
  }
  await browser.close();
  server.close();
  console.log(`共用时 ${((Date.now() - t0) / 1000).toFixed(0)} 秒`);
  await writeFile(path.join(out, 'index.json'), JSON.stringify({ generated: new Date().toISOString(), files, scenes: SCENES.map(({ route, title, sub }) => ({ route, title, sub })) }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
