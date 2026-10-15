// 生成 iOS / 安卓 App 的图标与启动图（按 assets/icon.svg 的同一套图案，用 Noto Serif SC 写「感」）。
// 只有改了图标设计时才需要重跑：node scripts/app-assets.mjs ，产物直接写进 android/ 与 ios/ 并提交。
// 需要联网（从 Google Fonts 取字形）与 Playwright 的 Chromium（npx playwright install chromium）。
import { writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAPER = '#f4ecdc'; // 默认皮肤「宣纸」底色，与 capacitor.config.json 的 backgroundColor 一致
const ICON_BG = '#0f0e14';

async function launchBrowser() {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch();
  } catch (e) {
    // 回退：使用预装的 Chromium 可执行文件（同 smoke.mjs）
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
    if (!existsSync(base)) throw e;
    for (const d of await readdir(base)) {
      const p = path.join(base, d, 'chrome-linux/chrome');
      if (existsSync(p)) return chromium.launch({ executablePath: p });
    }
    throw e;
  }
}

// 在页面里用 Canvas 画，按 1024 坐标系复刻 assets/icon.svg。
// kind: full（满版方形，iOS 图标）| rounded（圆角，安卓旧版图标）| circle（安卓圆形图标）
//       foreground（安卓自适应图标前景：无底色，缩进安全区）| splash（宣纸底 + 居中圆角图标）
function paint({ kind, w, h, paper, iconBg }) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  const opaque = kind === 'full' || kind === 'splash';
  if (kind === 'splash') {
    g.fillStyle = paper;
    g.fillRect(0, 0, w, h);
  }
  const size = kind === 'splash' ? (w === h ? w * 0.16 : Math.min(w, h) * 0.3) : kind === 'foreground' ? w * (72 / 108) : w;
  g.translate((w - size) / 2, (h - size) / 2);
  g.scale(size / 1024, size / 1024);

  const shape = () => {
    g.beginPath();
    if (kind === 'circle') g.arc(512, 512, 512, 0, Math.PI * 2);
    else if (kind === 'full') g.rect(0, 0, 1024, 1024);
    else g.roundRect(0, 0, 1024, 1024, 228);
  };
  if (kind !== 'foreground') {
    const bg = g.createRadialGradient(512, 307, 0, 512, 307, 819);
    bg.addColorStop(0, '#1f1c26');
    bg.addColorStop(0.6, iconBg);
    bg.addColorStop(1, '#0b0b10');
    shape();
    g.fillStyle = bg;
    g.fill();
  }
  const ring = (r, alpha, width, color = '#d4af5a') => {
    g.beginPath();
    g.arc(512, 512, r, 0, Math.PI * 2);
    g.globalAlpha = alpha;
    g.lineWidth = width;
    g.strokeStyle = color;
    g.stroke();
    g.globalAlpha = 1;
  };
  ring(400, 0.35, 3);
  ring(372, 0.18, 2);
  const gold = g.createRadialGradient(422, 392, 0, 422, 392, 450);
  gold.addColorStop(0, '#f6df98');
  gold.addColorStop(0.55, '#d4af5a');
  gold.addColorStop(1, '#8f7030');
  g.beginPath();
  g.arc(512, 512, 300, 0, Math.PI * 2);
  g.fillStyle = gold;
  g.fill();
  ring(300, 0.35, 4, '#fff3c4');
  g.fillStyle = '#1a1408';
  g.font = '900 340px "Noto Serif SC", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('感', 512, 522);

  const data = g.getImageData(0, 0, w, h).data;
  let s = '';
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
  return { opaque, rgba: btoa(s) };
}

// 最小 PNG 编码：不透明图存成 RGB（App Store 拒收带透明通道的图标），其余存 RGBA。
function encodePng(w, h, rgba, opaque) {
  const ch = opaque ? 3 : 4;
  const raw = Buffer.alloc((w * ch + 1) * h);
  for (let y = 0, o = 0; y < h; y++) {
    raw[o++] = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      raw[o++] = rgba[i];
      raw[o++] = rgba[i + 1];
      raw[o++] = rgba[i + 2];
      if (!opaque) raw[o++] = rgba[i + 3];
    }
  }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(tb));
    return Buffer.concat([len, tb, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const res = 'android/app/src/main/res';
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const splashPort = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
const jobs = [
  { file: 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', kind: 'full', w: 1024, h: 1024 },
  ...['', '-1', '-2'].map((n) => ({ file: `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732${n}.png`, kind: 'splash', w: 2732, h: 2732 })),
  { file: `${res}/drawable/splash.png`, kind: 'splash', w: 480, h: 320 },
];
for (const [d, k] of Object.entries(densities)) {
  jobs.push(
    { file: `${res}/mipmap-${d}/ic_launcher.png`, kind: 'rounded', w: 48 * k, h: 48 * k },
    { file: `${res}/mipmap-${d}/ic_launcher_round.png`, kind: 'circle', w: 48 * k, h: 48 * k },
    { file: `${res}/mipmap-${d}/ic_launcher_foreground.png`, kind: 'foreground', w: 108 * k, h: 108 * k },
  );
  const [pw, ph] = splashPort[d];
  jobs.push({ file: `${res}/drawable-port-${d}/splash.png`, kind: 'splash', w: pw, h: ph }, { file: `${res}/drawable-land-${d}/splash.png`, kind: 'splash', w: ph, h: pw });
}

const browser = await launchBrowser();
try {
  const page = await browser.newPage();
  await page.setContent(
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@900&text=%E6%84%9F&display=block">',
    { waitUntil: 'networkidle' },
  );
  const fontOk = await page.evaluate(async () => (await document.fonts.load('900 340px "Noto Serif SC"', '感')).length > 0);
  if (!fontOk) throw new Error('Noto Serif SC 没加载成功（需要联网访问 fonts.googleapis.com），已停止以免生成错误字体的图标');
  for (const job of jobs) {
    const { opaque, rgba } = await page.evaluate(paint, { ...job, paper: PAPER, iconBg: ICON_BG });
    await writeFile(path.join(root, job.file), encodePng(job.w, job.h, Buffer.from(rgba, 'base64'), opaque));
  }
  // 自适应图标的底色，与图标中心的深色一致
  await writeFile(
    path.join(root, res, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${ICON_BG.toUpperCase()}</color>\n</resources>\n`,
  );
  console.log(`已生成 ${jobs.length} 张图标 / 启动图`);
} finally {
  await browser.close();
}
