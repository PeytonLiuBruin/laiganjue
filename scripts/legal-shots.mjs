// 隐私政策、使用条款、支持页在 iPhone 视口下的截图与横向溢出检查（第 52 轮）
// 用法：npm run build && node scripts/legal-shots.mjs [--dark]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs/claude-plan/screenshots');
mkdirSync(out, { recursive: true });
const dark = process.argv.includes('--dark');
const pages = ['support', 'terms', 'privacy'];
const sizes = [[393, 852], [430, 932]];

const browser = await chromium.launch();
let bad = 0;
for (const [w, hgt] of sizes) {
  const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: dark ? 'dark' : 'light', locale: 'zh-CN' });
  const page = await ctx.newPage();
  for (const name of pages) {
    await page.goto(pathToFileURL(path.join(root, 'dist', `${name}.html`)).href);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) { bad++; console.log(`✗ ${name} ${w}×${hgt} 横向溢出 ${overflow}px`); }
    const file = `legal-${name}${dark ? '-dark' : ''}-${w}x${hgt}.png`;
    await page.screenshot({ path: path.join(out, file) });
    console.log(`✓ ${file}`);
  }
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
