import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const css = await read('../src/styles/toon-reading.css');
const index = await read('../src/styles/index.css');

test('结果抽屉卡通化样式在 toon-history 之后、touch 与 contrast 之前引入', () => {
  const a = index.indexOf("'./toon-history.css'"), b = index.indexOf("'./toon-reading.css'"), c = index.indexOf("'./touch.css'"), d = index.indexOf("'./contrast.css'");
  assert.ok(a > 0 && b > a && c > b && d > c);
});

test('等级胶囊、诗签框、分段标签改为描边厚边圆体', () => {
  assert.match(css, /\.result \.result-badge \{[^}]*border: 2px solid[^}]*box-shadow: 0 3px 0[^}]*font: 800 14px/);
  assert.match(css, /\.result \.result-verse \{[^}]*border: 2px solid var\(--line-strong\)[^}]*box-shadow: 0 4px 0 var\(--edge-color\)/);
  assert.match(css, /\.result \.result-section-label \{[^}]*background: color-mix[^}]*font: 800 13px/);
  assert.match(css, /\.result \.result-kicker \{[^}]*font: 800 13px/);
});

test('标签列放宽到 5em，窄屏改上下排，底部次按钮带厚边并能按下', () => {
  assert.match(css, /\.result \.result-section:not\(\.stack\) \{ grid-template-columns: 5em minmax\(0, 1fr\); \}/);
  assert.match(css, /@media \(max-width: 360px\) \{\s*\.result \.result-section:not\(\.stack\) \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.sheet-actions \.btn\.ghost,\s*\.sheet-actions \.btn\.soft \{[^}]*border: 2px solid[^}]*box-shadow: 0 4px 0 var\(--edge-color\)/);
  assert.match(css, /:active:not\(:disabled\) \{ transform: translateY\(3px\)/);
});
