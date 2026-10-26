// 文字对比度令牌检查（完整的逐页审计见 scripts/contrast-audit.mjs，要起浏览器，不放进 npm test）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/contrast.css', import.meta.url), 'utf8');
const playful = readFileSync(new URL('../src/styles/playful.css', import.meta.url), 'utf8');
const paywall = readFileSync(new URL('../src/styles/paywall.css', import.meta.url), 'utf8');
const index = readFileSync(new URL('../src/styles/index.css', import.meta.url), 'utf8');

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(rgb(a)), y = lum(rgb(b)); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const block = (src, sel) => { const i = src.indexOf(sel + ' {'); assert.ok(i >= 0, `找不到 ${sel}`); return src.slice(i, src.indexOf('}', i)); };
const token = (src, sel, name) => { const m = block(src, sel).match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i')); assert.ok(m, `${sel} 缺 ${name}`); return m[1]; };

// 明快皮肤里文字最常落在的几种底色：纯白卡片、天蓝页底、选中胶囊的浅红底
const LIGHT_BGS = { paper: ['#ffffff', '#eaf6ff', '#eadfe6', '#fffdf8'], celadon: ['#e6efe8', '#d8e6db', '#c6d3cb', '#b7d8cb'] };

test('对比度样式排在样式链最后', () => {
  const imports = [...index.matchAll(/@import '\.\/([a-z-]+)\.css'/g)].map((m) => m[1]);
  assert.equal(imports.at(-1), 'contrast');
});

test('浅色皮肤的主色字与第三级文字在常见底色上 ≥ 4.5', () => {
  for (const [theme, bgs] of Object.entries(LIGHT_BGS)) {
    const sel = `[data-theme='${theme}']`;
    for (const name of ['--accent-text', '--text-3']) {
      const fg = token(css, sel, name);
      for (const bg of bgs) assert.ok(ratio(fg, bg) >= 4.5, `${theme} ${name} ${fg} 在 ${bg} 上只有 ${ratio(fg, bg).toFixed(2)}`);
    }
  }
});

test('宣纸主按钮白字对描边色 ≥ 4.5，且主按钮与选中页签都套了描边', () => {
  const edge = token(playful, "[data-theme='paper']", '--btn-edge');
  assert.ok(ratio('#ffffff', edge) >= 4.5, `白字对 ${edge} 只有 ${ratio('#ffffff', edge).toFixed(2)}`);
  assert.match(css, /\[data-theme='paper'\] :is\(\.btn\.primary, \.tab\.active/);
  assert.match(block(css, "[data-theme='paper']"), /--btn-outline:(.|\n)*var\(--btn-edge\)/);
});

test('皮肤抽屉 Pro 卡的说明字样式不会染到按钮里的字', () => {
  assert.doesNotMatch(paywall, /\.skin-pro-card span \{/);
  assert.match(paywall, /\.skin-pro-card > div > span \{/);
});
