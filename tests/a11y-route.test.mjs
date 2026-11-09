// 读屏：切换页面只播报一次新页面名，焦点移到标题；整个 App 不再是一大块 aria-live
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('#app 本身不是 aria-live（否则每次重画都整块朗读）', () => {
  const tpl = read('src/template.html');
  const app = tpl.match(/<div id="app"[^>]*>/);
  assert.ok(app, '模板里有 #app');
  assert.doesNotMatch(app[0], /aria-live/);
});

test('切换路由时用隐藏的 role=status 播报页面名，并把焦点移到顶栏标题', () => {
  const js = read('src/ui/app.js');
  assert.match(js, /routeAnnouncer = h\('div', \{ class: 'sr-only', attrs: \{ role: 'status'/);
  assert.match(js, /titleEl\.setAttribute\('tabindex', '-1'\)/);
  assert.match(js, /function setHeader\(meta\) \{\s*announceRoute\(/);
  assert.match(js, /document\.title = name \?/);
  // 首次进入不播报，免得和读屏自己念的网页标题重复
  assert.match(js, /if \(firstRoute\) \{ firstRoute = false; return; \}/);
});

test('标题获得焦点时不画浏览器默认焦点框', () => {
  assert.match(read('src/styles/base.css'), /\.app-header \.hd-title:focus \{ outline: none; \}/);
});
