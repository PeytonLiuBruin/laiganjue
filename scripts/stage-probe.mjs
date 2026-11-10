// 舞台耗时探针：逐个打开带 3D 舞台的玩法页（可指定页签），记录每个可见舞台的初始化分段耗时
// （setup 渲染器与环境光、build 场景建模、toon 卡通化与描边、compile 着色器编译、firstFrame 第一帧），
// 以及着色器程序数、材质数、网格数、绘制调用与三角形数，用来找出低端机与软件渲染下最慢的舞台。
// 用法：node scripts/stage-probe.mjs [--routes m/crystal,m/caiyun] [--timeout 300000]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build.mjs';
import { createStaticServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const opt = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ROUTES = ['m/crystal', 'm/caiyun', 'm/yinyuan', 'm/shiye', 'm/zodiac', 'm/bazi', 'm/fengshui'];
const routes = opt('--routes', ROUTES.join(',')).split(',');
const timeout = Number(opt('--timeout', 300000));

const dist = path.join(root, 'dist');
await buildAll({ out: dist, min: false });
const server = createStaticServer(dist);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await launchBrowser();
for (const route of routes) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, locale: 'zh-CN' });
  await ctx.addInitScript(() => { try { localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:stage.fps', 'false'); } catch {} });
  const page = await ctx.newPage();
  const t0 = Date.now();
  const row = { route };
  try {
    await page.goto(`${base}#/${route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const v = [...document.querySelectorAll('.has-stage')].filter((el) => el.getClientRects().length); return v.length > 0 && v.every((el) => el.dataset.compiled === '1'); }, null, { timeout, polling: 500 });
    row.totalMs = Date.now() - t0;
    row.slots = await page.evaluate(() => [...document.querySelectorAll('[data-model-slot]')].map((el) => {
      const s = el.__stage, i = s?.ready ? s.inspect() : null;
      return { id: el.dataset.modelSlot, shown: !!el.getClientRects().length, built: !!s?.ready, ...(i && { timing: i.timing, programs: i.programs, materials: i.materials, meshes: i.meshes, calls: i.calls, tris: i.triangles }) };
    }));
  } catch (e) { row.error = e.message.split('\n')[0]; row.atMs = Date.now() - t0; }
  console.log(JSON.stringify(row));
  await ctx.close();
}
await browser.close();
server.close();
