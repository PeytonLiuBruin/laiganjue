// 无头 Chromium 启动器：带软件 WebGL（SwiftShader），找不到 Playwright 自带浏览器时改用预装的 Chromium。
import fs from 'node:fs';
import path from 'node:path';

export const WEBGL_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'];

export async function launchBrowser({ webgl = true } = {}) {
  const { chromium } = await import('playwright');
  const args = webgl ? WEBGL_ARGS : ['--disable-webgl', '--disable-3d-apis'];
  try {
    return await chromium.launch({ args });
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    const candidates = [];
    if (fs.existsSync(base)) {
      for (const d of fs.readdirSync(base).sort().reverse()) {
        for (const sub of ['chrome-linux/chrome', 'chrome-linux64/chrome', 'chrome']) {
          const p = path.join(base, d, sub);
          if (fs.existsSync(p)) candidates.push(p);
        }
      }
    }
    if (!candidates.length) throw e;
    return chromium.launch({ executablePath: candidates[0], args });
  }
}
