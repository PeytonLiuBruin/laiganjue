// 构建脚本：把 src/ 下的 ES 模块 + CSS 打包并内联成单文件 HTML。
// 产物：
//   dist/index.html    —— 可直接双击打开 / 部署到任意静态服务器的完整页面
//   dist/artifact.html —— 无 <html><head><body> 外壳的片段（供 Artifact 平台发布）
// 用法：node scripts/build.mjs [--out <dir>] [--no-minify] [--sourcemap]
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
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

export async function buildAll({ out = outDir, min = minify } = {}) {
  await mkdir(out, { recursive: true });
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
    }),
    build({
      entryPoints: [path.join(root, 'src/styles/index.css')],
      bundle: true,
      minify: min,
      write: false,
      charset: 'utf8',
      logLevel: 'error',
      loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl' },
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
    `<title>来感觉 · 玄学占卜</title>\n` +
      `<meta name="theme-color" content="#0b0b10">\n` +
      `<link rel="preconnect" href="https://fonts.googleapis.com">\n` +
      `<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700;900&family=Cinzel:wght@500;700&display=swap" rel="stylesheet">\n` +
      `<!--CSS-->\n` +
      body +
      `\n<!--JS-->\n`,
  );

  await Promise.all([
    writeFile(path.join(out, 'index.html'), full),
    writeFile(path.join(out, 'artifact.html'), artifact),
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
  const r = await buildAll();
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  console.log(
    `built → ${path.relative(root, r.out)}/index.html  js ${kb(r.jsBytes)}  css ${kb(r.cssBytes)}  html ${kb(r.htmlBytes)}  (${Date.now() - t0}ms)`,
  );
}
