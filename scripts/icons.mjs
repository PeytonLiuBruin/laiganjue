// 从 assets/icon.svg 渲染出 PNG 图标（apple-touch-icon / manifest）。只需在改动图标时运行。
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(path.join(root, 'assets/icon.svg'), 'utf8');

async function launch() {
  try {
    return await chromium.launch();
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
      for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome']) {
        const p = path.join(base, d, sub);
        if (fs.existsSync(p)) return chromium.launch({ executablePath: p });
      }
    }
    throw e;
  }
}
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 });
await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
await page.waitForTimeout(200);
const png = await page.locator('svg').screenshot({ omitBackground: true });
await browser.close();
// 用 Chromium 再缩放到各尺寸（保持简单：重新加载 img 并截图）
const b2 = await launch();
for (const size of [180, 192, 512]) {
  const p = await b2.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await p.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/png;base64,${png.toString('base64')}" style="width:${size}px;height:${size}px;display:block"></body></html>`);
  await p.waitForTimeout(100);
  const out = await p.locator('img').screenshot({ omitBackground: true });
  await writeFile(path.join(root, `assets/icon-${size}.png`), out);
  console.log(`assets/icon-${size}.png ${out.length} bytes`);
}
await b2.close();
