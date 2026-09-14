// 构建脚本：把 src/ 下的 ES 模块 + CSS 打包并内联成单文件 HTML。
// 产物：
//   dist/index.html    —— 可直接双击打开 / 部署到任意静态服务器的完整页面
//   dist/artifact.html —— 无 <html><head><body> 外壳的片段（供 Artifact 平台发布）
// 用法：node scripts/build.mjs [--out <dir>] [--no-minify] [--only tarot,runes]
import { build } from 'esbuild';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const outDir = path.resolve(root, opt('--out', 'dist'));
const minify = !flag('--no-minify');

// --only a,b ：只真正打包这些模块，其余模块替换为占位（多人并行开发时互不影响）
const onlyModulesPlugin = (allowed) => ({
  name: 'only-modules',
  setup(b) {
    b.onLoad({ filter: /[\\/]src[\\/]modules[\\/][a-z0-9_-]+[\\/]index\.js$/ }, (args) => {
      const id = path.basename(path.dirname(args.path));
      if (allowed.has(id)) return null;
      const list = JSON.stringify([...allowed].join(', '));
      return {
        loader: 'js',
        resolveDir: path.dirname(args.path),
        contents:
          `import { getModuleMeta } from '../list.js';\n` +
          `export default { id: ${JSON.stringify(id)}, mount(c, ctx) { const m = getModuleMeta(${JSON.stringify(id)}); ` +
          `c.append(ctx.kit.placeholder(m.glyph, m.title + ' · 未纳入本次构建', '本次仅构建：' + ${list})); return () => {}; } };\n`,
      };
    });
    b.onLoad({ filter: /[\\/]src[\\/]modules[\\/]index\.css$/ }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      const kept = src.split('\n').filter((line) => {
        const m = line.match(/@import\s+['"]\.\/([a-z0-9_-]+)\/style\.css['"]/);
        return !m || allowed.has(m[1]);
      });
      return { loader: 'css', resolveDir: path.dirname(args.path), contents: kept.join('\n') };
    });
  },
});

export async function buildAll({ out = outDir, min = minify, only = null } = {}) {
  await mkdir(out, { recursive: true });
  await mkdir(path.join(out, 'tarot'), { recursive: true });
  const plugins = only && only.length ? [onlyModulesPlugin(new Set(only))] : [];
  const [js, css] = await Promise.all([
    build({
      entryPoints: [path.join(root, 'src/main.js')],
      bundle: true,
      format: 'iife',
      target: ['es2020'],
      minify: min,
      write: false,
      legalComments: 'none',
      charset: 'utf8',
      logLevel: 'error',
      define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
      plugins,
    }),
    build({
      entryPoints: [path.join(root, 'src/styles/index.css')],
      bundle: true,
      minify: min,
      write: false,
      charset: 'utf8',
      logLevel: 'error',
      loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl' },
      plugins,
    }),
  ]);
  const jsText = js.outputFiles[0].text;
  const cssText = css.outputFiles[0].text;
  const template = await readFile(path.join(root, 'src/template.html'), 'utf8');

  // 片段：template.html 里 <!--BODY-START--> ... <!--BODY-END--> 之间的内容
  const bodyStart = template.indexOf('<!--BODY-START-->');
  const bodyEnd = template.indexOf('<!--BODY-END-->');
  const body = template.slice(bodyStart + '<!--BODY-START-->'.length, bodyEnd);

  const fill = (html) =>
    html
      .replace('<!--CSS-->', () => `<style>\n${cssText}\n</style>`)
      .replace('<!--JS-->', () => `<script>\n${jsText}\n</script>`);

  const full = fill(template.replace('<!--BODY-START-->', '').replace('<!--BODY-END-->', ''));
  const artifact = fill(
    `<title>来感觉</title>\n` +
      `<meta name="theme-color" content="#0b0b10">\n` +
      `<meta name="apple-mobile-web-app-capable" content="yes">\n` +
      `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n` +
      `<meta name="apple-mobile-web-app-title" content="来感觉">\n` +
      `<link rel="apple-touch-icon" href="icon-180.png">\n` +
      `<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">\n` +
      `<link rel="manifest" href="manifest.webmanifest">\n` +
      `<link rel="preconnect" href="https://fonts.googleapis.com">\n` +
      `<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700;900&family=Cinzel:wght@500;700&display=swap" rel="stylesheet">\n` +
      `<!--CSS-->\n` +
      body +
      `\n<!--JS-->\n`,
  );

  const manifest = {
    name: '来感觉 · 玄学占卜',
    short_name: '来感觉',
    description: '筊杯、灵签、六爻、黄历、八字、风水、转盘、塔罗、卢恩、星座、水晶球、御神签、硬币骰子、落球盘。摇一摇、甩一甩。',
    start_url: './',
    scope: './',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0b10',
    theme_color: '#0b0b10',
    lang: 'zh-CN',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
  await Promise.all([
    writeFile(path.join(out, 'index.html'), full),
    copyFile(path.join(root, 'assets/tarot/rws-atlas.webp'), path.join(out, 'tarot/rws-atlas.webp')),
    copyFile(path.join(root, 'assets/tarot/ATTRIBUTION.md'), path.join(out, 'tarot/ATTRIBUTION.md')),
    writeFile(path.join(out, 'artifact.html'), artifact),
    writeFile(path.join(out, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2)),
    ...[180, 192, 512].map((s) => copyFile(path.join(root, `assets/icon-${s}.png`), path.join(out, `icon-${s}.png`)).catch(() => {})),
  ]);
  return {
    out,
    jsBytes: Buffer.byteLength(jsText),
    cssBytes: Buffer.byteLength(cssText),
    htmlBytes: Buffer.byteLength(full),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const t0 = Date.now();
  const only = opt('--only', '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const r = await buildAll({ only: only.length ? only : null });
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  console.log(
    `built → ${path.relative(root, r.out)}/index.html  js ${kb(r.jsBytes)}  css ${kb(r.cssBytes)}  html ${kb(r.htmlBytes)}  (${Date.now() - t0}ms)`,
  );
}
