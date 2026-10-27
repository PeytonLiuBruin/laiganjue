// 文字对比度审计：WCAG 2.1 AA 要求正文对比度 ≥ 4.5，大字（≥ 24px，或 ≥ 18.66px 且粗体）≥ 3。
// 关掉 WebGL（玩法页退回 2D 器物），在 393×852 视口逐页逐皮肤列出不达标的可见文字。
// 用法：node scripts/contrast-audit.mjs [--routes home,m/qian] [--themes paper,ink] [--json out.json]
// 背景按祖先的 background-color 逐层合成，遇到渐变时取每个色标里最差的一个。
// 祖先的 opacity 会乘到文字颜色上。不可用的按钮按 WCAG 豁免。四周一圈实心 text-shadow 描边时，文字对描边的对比度也算数。
// 浮在 3D 舞台上的字（背景一路透明到画布）单独标出，不计入合计。
// --stage：打开 WebGL，把浮在舞台上的字隐去后截下它所在的方块，逐像素算对比度，取最差的 10% 分位（字的大部分笔画都要看得清），计入合计。
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build.mjs';
import { createStaticServer } from './serve.mjs';
import { launchBrowser } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const DEFAULT_ROUTES = 'home,home@settings,home@paywall,home@skins,m/qian,m/tarot,m/almanac,m/zodiac,m/liuyao,m/bazi,m/yinyuan,m/caiyun,m/coin,m/jiaobei,m/runes,m/omikuji,m/wheel,m/crystal,m/plinko,m/fengshui,m/shiye';
const routes = opt('--routes', DEFAULT_ROUTES).split(',');
const themes = opt('--themes', 'paper,celadon,ink,cinnabar,nebula').split(',');
const STAGE = args.includes('--stage');

const dist = path.join(root, 'dist');
await buildAll({ out: dist, min: false });
const server = createStaticServer(dist);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/index.html`;
const browser = await launchBrowser({ webgl: STAGE });
const all = [];
for (const theme of themes) {
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  await context.addInitScript((theme) => {
    try {
      localStorage.setItem('lgj:onboarded', 'true'); localStorage.setItem('lgj:zen.auto', 'false');
      localStorage.setItem('lgj:dev.skins', 'true'); localStorage.setItem('lgj:theme', JSON.stringify(theme));
    } catch {}
  }, theme);
  const page = await context.newPage();
  for (const r of routes) {
    const [route, action] = r.split('@');
    await page.goto(base + (route === 'home' ? '#/' : '#/' + route));
    await page.waitForTimeout(1500);
    if (STAGE && route !== 'home') await page.waitForSelector('.model-slot[data-ready="1"]', { timeout: 60_000 }).then(() => page.waitForTimeout(2500)).catch(() => {});
    for (let i = 0; i < 2; i++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(300); }
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    if (action === 'settings') { await page.click('.app-header [aria-label="设置"]').catch(() => {}); await page.waitForTimeout(700); }
    if (action === 'paywall') { await page.evaluate(() => { window.__lgj?.openPaywall?.({ reason: '审计' }); }); await page.waitForTimeout(700); }
    if (action === 'skins') { await page.click('.app-header button[aria-label="换皮肤"]').catch(() => {}); await page.waitForTimeout(700); }
    if (action === 'sheet') {
      // m/qian@sheet：一直点主按钮或「展开解读」，直到结果抽屉（深度解读）打开
      const primary = page.locator('.view-module [data-action="primary"]').first();
      const read = page.locator('.view-module .ritual-receipt [data-read="1"]');
      for (let i = 0; i < 30 && !(await page.locator('.sheet.open .result').count()); i++) {
        if (await read.count()) await read.first().click({ force: true }).catch(() => {});
        else await primary.click({ force: true }).catch(() => {});
        await page.waitForTimeout(900);
      }
      await page.waitForTimeout(700);
    }
    if (action === 'read') {
      // m/bazi@read：点主按钮直到结果条出来，审计排在结果条下面的小节（八字五行分布、星座档案等）
      const primary = page.locator('.view-module [data-action="primary"]').first();
      for (let i = 0; i < 8 && !(await page.locator('.view-module .ritual-receipt').count()); i++) {
        await primary.click({ force: true }).catch(() => {});
        await page.waitForTimeout(1200);
      }
      await page.waitForTimeout(1000);
    }
    await page.waitForTimeout(500); // 等转场动画的 opacity 走完
    const found = await page.evaluate(auditInPage);
    if (STAGE) for (const it of found.stageItems) {
      const r = it.rect;
      if (r.width < 2 || r.height < 2) continue;
      await page.evaluate((id) => {
        const st = document.createElement('style'); st.id = 'cs-probe-style';
        st.textContent = `[data-cs-probe="${id}"]{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;-webkit-text-stroke:0!important}`;
        document.head.append(st);
      }, it.id);
      const png = await page.screenshot({ clip: r, animations: 'disabled' });
      const res = await page.evaluate(sampleInPage, { b64: png.toString('base64'), fg: it.fg });
      await page.evaluate(() => document.getElementById('cs-probe-style')?.remove());
      const line = `${res.p10.toFixed(2)} (中位 ${res.p50.toFixed(2)}) 需 ${it.need}  ${it.size}px  ${it.tag}  「${it.text}」 舞台底 ${res.bg}`;
      if (res.p10 < it.need - 0.005) { found.low.push({ ratio: res.p10, need: it.need, fg: res.fg, bg: res.bg, size: it.size, tag: it.tag + ' [舞台]', text: it.text }); console.log(`  [舞台 不达标] ${theme} ${route} ${line}`); }
      else console.log(`  [舞台 达标] ${theme} ${route} ${line}`);
    }
    all.push({ theme, route: r, low: found.low, stage: found.stage });
    if (found.low.length) {
      console.log(`\n# ${theme} ${r}  (${found.low.length})`);
      for (const f of found.low) console.log(`  ${f.ratio.toFixed(2)} < ${f.need}  ${f.fg} on ${f.bg}  ${f.size}px  ${f.tag}  「${f.text}」`);
    }
  }
  await context.close();
}
await browser.close();
server.close();
const total = all.reduce((n, x) => n + x.low.length, 0);
const stage = all.reduce((n, x) => n + x.stage, 0);
console.log(STAGE ? `\n合计 ${total} 处文字对比度不达标（含浮在舞台上按截图取样的字，共查 ${stage} 处舞台字）` : `\n合计 ${total} 处文字对比度不达标（浮在舞台上未计入 ${stage} 处，用 --stage 取样）`);
if (opt('--json', '')) await writeFile(path.resolve(root, opt('--json', '')), JSON.stringify(all, null, 2));

/* 在页面里运行：解码截图，逐像素算文字色对底色的对比度，返回 10% 分位与中位 */
async function sampleInPage({ b64, fg }) {
  const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const bmp = await createImageBitmap(new Blob([bin], { type: 'image/png' }));
  const cv = new OffscreenCanvas(bmp.width, bmp.height); const cx = cv.getContext('2d');
  cx.drawImage(bmp, 0, 0);
  const d = cx.getImageData(0, 0, bmp.width, bmp.height).data;
  const lum = (r, g, b) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const rs = []; let worstPx = [0, 0, 0], wr = Infinity;
  for (let i = 0; i < d.length; i += 4) {
    const a = fg[3]; const f = [0, 1, 2].map((k) => fg[k] * a + d[i + k] * (1 - a));
    const x = lum(...f), y = lum(d[i], d[i + 1], d[i + 2]);
    const r = (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    rs.push(r); if (r < wr) { wr = r; worstPx = [d[i], d[i + 1], d[i + 2]]; }
  }
  rs.sort((a, b) => a - b);
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  return { p10: rs[Math.floor(rs.length * 0.1)] ?? 0, p50: rs[Math.floor(rs.length / 2)] ?? 0, bg: hex(worstPx), fg: hex(fg.slice(0, 3)) };
}

/* 在页面里运行，不能引用外部变量 */
function auditInPage() {
  const parse = (s) => {
    const m = s && s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const stops = (img) => (img.match(/rgba?\([^)]+\)/g) || []).map(parse);
  const over = (top, bot) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + bot[i] * (1 - a)).concat(1); };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  // 返回所有可能的背景（渐变有多个），null 表示背景一路透明到 3D 舞台
  const backgrounds = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      // background-clip: text 的渐变只填在字形里（如金色大标题），不是后代文字的背景
      const img = cs.backgroundImage !== 'none' && !/text/.test(cs.backgroundClip || cs.webkitBackgroundClip || '') ? stops(cs.backgroundImage) : [];
      const col = parse(cs.backgroundColor);
      if (img.length) layers.push({ multi: img });
      if (col && col[3] > 0) layers.push({ multi: [col] });
      if (n.matches('canvas, .stage, .stage-wrap, [data-stage]') || n.querySelector(':scope > canvas')) {
        if (!layers.some((l) => l.multi.some((c) => c[3] >= 0.95))) return null;
      }
      const last = layers[layers.length - 1];
      if (last && last.multi.every((c) => c[3] >= 0.95)) break;
    }
    let acc = [[255, 255, 255, 1]];
    for (let i = layers.length - 1; i >= 0; i--) {
      const next = [];
      for (const top of layers[i].multi) for (const b of acc) next.push(over(top, b));
      acc = next.slice(0, 24);
    }
    return acc;
  };
  const low = []; let stage = 0; const stageItems = [];
  const seen = new Set();
  const scope = document.querySelector('.sheet.open') || document.body;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const text = t.textContent.trim();
    if (!text) continue;
    const el = t.parentElement;
    if (!el || seen.has(el)) continue; seen.add(el);
    if (el.closest('[hidden],[aria-hidden="true"],[inert],script,style,noscript,.sr-only,.visually-hidden')) continue;
    if (el.closest('button:disabled,[aria-disabled="true"],input:disabled,select:disabled')) continue; // 不可用的控件按 WCAG 豁免
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const b = el.getBoundingClientRect();
    if (b.width < 2 || b.height < 2 || b.bottom < 0 || b.top > innerHeight * 3 || b.right < 0 || b.left > innerWidth) continue;
    if (cs.webkitTextFillColor && parse(cs.webkitTextFillColor)?.[3] === 0) continue; // 渐变字，另行目测
    let alpha = 1;
    for (let n = el; n; n = n.parentElement) alpha *= Number(getComputedStyle(n).opacity);
    if (alpha < 0.05) continue;
    const fg0 = parse(cs.color); if (!fg0) continue;
    const bgs = backgrounds(el);
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    // 四周一圈实心描边（≥ 4 个无模糊、偏移 ≥ 1px 的 text-shadow 同色）时，文字对描边的对比度也算数
    let outline = 0;
    if (cs.textShadow !== 'none') {
      const parts = cs.textShadow.split(/,(?![^(]*\))/).map((x) => x.trim());
      const hard = parts.map((x) => ({ c: parse(x), n: (x.replace(/rgba?\([^)]+\)/, '').match(/-?[\d.]+px/g) || []).map(parseFloat) }))
        .filter((x) => x.c && x.c[3] >= 0.95 && x.n.length >= 2 && (x.n[2] || 0) === 0 && Math.hypot(x.n[0], x.n[1]) >= 1);
      if (hard.length >= 4) outline = Math.min(...hard.map((x) => ratio(over([fg0[0], fg0[1], fg0[2], fg0[3] * alpha], x.c), x.c)));
    }
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const pcls = el.parentElement && typeof el.parentElement.className === 'string' && el.parentElement.className.trim() ? el.parentElement.className.trim().split(/\s+/)[0] + ' > ' : '';
    const label = pcls + el.tagName.toLowerCase() + cls;
    const short = text.replace(/\s+/g, ' ').slice(0, 16);
    if (!bgs) {
      // 背景一路透明到 3D 舞台：记下位置，--stage 模式按截图取样
      stage++;
      if (outline < need - 0.005) {
        const id = 'p' + stageItems.length;
        el.setAttribute('data-cs-probe', id);
        stageItems.push({ id, fg: [fg0[0], fg0[1], fg0[2], fg0[3] * alpha], need, size: Math.round(size), tag: label, text: short,
          rect: { x: Math.max(0, b.left), y: Math.max(0, b.top), width: Math.min(innerWidth, b.right) - Math.max(0, b.left), height: Math.min(innerHeight, b.bottom) - Math.max(0, b.top) } });
      }
      continue;
    }
    let worst = Infinity, wb = bgs[0], wf = fg0;
    for (const bg of bgs) {
      const fg = over([fg0[0], fg0[1], fg0[2], fg0[3] * alpha], bg);
      const r = ratio(fg, bg);
      if (r < worst) { worst = r; wb = bg; wf = fg; }
    }
    if (Math.max(worst, outline) >= need - 0.005) continue;
    const stroke = parseFloat(cs.webkitTextStrokeWidth) > 0 || cs.textShadow !== 'none';
    low.push({ ratio: worst, need, fg: hex(wf), bg: hex(wb), size: Math.round(size), tag: label + (stroke ? ' [描边]' : ''), text: short });
  }
  return { low, stage, stageItems };
}
