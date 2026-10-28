import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const css = await read('../src/styles/toon-paywall.css');
const base = await read('../src/styles/paywall.css');
const contrast = await read('../src/styles/contrast.css');
const index = await read('../src/styles/index.css');

test('付费卡卡通样式在 toon-receipt 之后、touch 之前引入', () => {
  const a = index.indexOf("'./toon-receipt.css'"), b = index.indexOf("'./toon-paywall.css'"), c = index.indexOf("'./touch.css'");
  assert.ok(a > 0 && b > a && c > b);
});

test('标题圆体 900，金币「感」与引导卡同一套，不被 contrast.css 的按钮描边盖掉', () => {
  assert.match(css, /\.pw-title \{[^}]*font: 900/);
  assert.match(css, /\.pw-mark \{[^}]*border: 3px solid #8a3a10/);
  assert.doesNotMatch(contrast, /\.pw-mark/);
});

test('权益方块是红蓝紫三色描边实色白字，说明文字的样式不会染到方块上', () => {
  assert.match(css, /\.pw-benefits \.pw-glyph \{[^}]*color: #fff;[^}]*border: 2px solid var\(--g-ink\)/);
  assert.match(css, /li:nth-child\(2\) \.pw-glyph \{ --g: #3d8bff/);
  assert.match(css, /li:nth-child\(3\) \.pw-glyph \{ --g: #9b6bff/);
  // 原来的 `.pw-benefits span` 比 `.pw-glyph` 更具体，方块字被染成二级文字灰色
  assert.doesNotMatch(base + css, /\.pw-benefits span\b/);
});

test('方案卡 2px 描边加厚边，恢复购买与条款链接是描边小按钮', () => {
  assert.match(css, /\.pw-plan \{[^}]*border: 2px solid[^}]*box-shadow: 0 4px 0/);
  assert.match(css, /\.pw-link, \.pw-legal a \{[^}]*border: 2px solid[^}]*box-shadow: 0 3px 0/);
});
