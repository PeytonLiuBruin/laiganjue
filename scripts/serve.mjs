// 本地预览：构建一次并启动静态服务器，监听 src/ 变化自动重建。
// 用法：node scripts/serve.mjs [--port 4173] [--no-watch]
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll } from './build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const port = portIdx >= 0 ? Number(args[portIdx + 1]) : Number(process.env.PORT || 4173);
const noWatch = args.includes('--no-watch');
const dist = path.join(root, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

export function createStaticServer(dir) {
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let p = decodeURIComponent(url.pathname);
      if (p === '/' || p === '') p = '/index.html';
      const file = path.join(dir, p);
      if (!file.startsWith(dir)) throw new Error('forbidden');
      const s = await stat(file);
      if (s.isDirectory()) throw new Error('dir');
      const data = await readFile(file);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404');
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let building = false;
  let queued = false;
  const rebuild = async () => {
    if (building) {
      queued = true;
      return;
    }
    building = true;
    try {
      const t0 = Date.now();
      await buildAll();
      console.log(`[build] ok ${Date.now() - t0}ms`);
    } catch (e) {
      console.error('[build] failed:', e.message);
    }
    building = false;
    if (queued) {
      queued = false;
      rebuild();
    }
  };
  await rebuild();
  if (!noWatch) {
    let timer = null;
    watch(path.join(root, 'src'), { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(rebuild, 80);
    });
  }
  createStaticServer(dist).listen(port, () => {
    console.log(`[serve] http://localhost:${port}/  (dist/)`);
  });
}
