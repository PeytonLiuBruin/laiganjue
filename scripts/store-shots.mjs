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
  { route: 'm/qian', action: 'read', title: '摇签筒，求一支灵签', sub: '签诗逐句解，像在庙里抽签', bg: ['#ff8a5c', '#ffd27a'] },
  { route: 'm/tarot', action: 'read', upright: true, title: '塔罗牌阵，一张张翻开', sub: '经典 RWS 牌面，牌阵完整解读', bg: ['#9b6bff', '#d7c4ff'] },
  { route: 'm/caiyun', title: '摇钱树，摇出今日财运', sub: '3D 卡通器物，手感十足', bg: ['#ffc93c', '#fff1b8'] },
  { route: 'm/yinyuan', title: '姻缘线，看看缘分', sub: '正缘画像与合婚六项分析', bg: ['#ff6a8a', '#ffd0dc'] },
  { route: 'm/crystal', title: '水晶球，问一个问题', sub: '不用注册，打开就能玩', bg: ['#3fcf8e', '#c6f5df'] },
];
// 商店图里可以出现的塔罗牌（正位、寓意积极、画面明亮）
const GOOD_CARDS = ['太阳', '星星', '世界', '恋人', '命运之轮', '力量', '魔术师', '皇后', '圣杯三', '圣杯十', '星币十', '权杖六', '圣杯王牌', '星币王牌'];
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

async function main() {
  await mkdir(out, { recursive: true });
  const dist = path.join(root, 'dist');
  await buildAll({ out: dist, min: false });
  const server = createStaticServer(dist);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/index.html`;
  const browser = await launchBrowser();
  // 1) App 画面（393×852 @3x），每个场景截一次，两种外框共用
  const ctx = await browser.newContext({ viewport: SIZES[0].app, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript((t) => { try { localStorage.setItem('lgj:theme', JSON.stringify(t)); localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:stage.fps', 'false'); } catch {} }, theme);
  const page = await ctx.newPage();
  const shots = [];
  for (const s of SCENES) {
    await page.goto(base + (s.route === 'home' ? '#/' : '#/' + s.route));
    await page.waitForTimeout(2500);
    for (let i = 0; i < 2; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(600); }
    // 商店图里不展示「开启手机体感」授权卡（真机上授权一次后即收起），把舞台让到首屏
    await page.addStyleTag({ content: '.motion-entry{display:none!important}' });
    await page.waitForTimeout(400);
    if (s.action === 'read') {
      for (let i = 0; i < 4 && !(await page.locator('.ritual-receipt [data-read]').count()); i++) {
        await page.locator('.view-module [data-action="primary"]').first().click().catch(() => {});
        await page.waitForSelector('.ritual-receipt [data-read]', { timeout: 8_000 }).catch(() => {});
      }
      await page.waitForTimeout(1500);
      // 塔罗要一张寓意积极的正位牌：逆位时画面倒置像出错，「圣杯五 · 失落」这类牌放在商店图里太丧。不满足就再来一次（最多 25 次）
      const unlucky = async () => {
        if (await page.locator('.view-module .reversed').count()) return true;
        const name = ((await page.locator('.ritual-receipt h2').first().textContent({ timeout: 1500 }).catch(() => '')) || '').trim();
        return !GOOD_CARDS.includes(name);
      };
      for (let i = 0; s.upright && i < 25 && (await unlucky()); i++) {
        await page.locator('.view-module [data-action="primary"]').first().click().catch(() => {});
        await page.waitForTimeout(3500);
        if (!(await page.locator('.ritual-receipt [data-read]').count())) {
          await page.locator('.view-module [data-action="primary"]').first().click().catch(() => {});
          await page.waitForSelector('.ritual-receipt [data-read]', { timeout: 8_000 }).catch(() => {});
          await page.waitForTimeout(1500);
        }
      }
      if (s.upright && (await unlucky())) console.warn('警告：塔罗 25 次都没抽到合适的正位牌，商店图需要人工重拍');
    }
    shots.push('data:image/png;base64,' + (await page.screenshot()).toString('base64'));
  }
  await ctx.close();
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
  await writeFile(path.join(out, 'index.json'), JSON.stringify({ generated: new Date().toISOString(), files, scenes: SCENES.map(({ route, title, sub }) => ({ route, title, sub })) }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
