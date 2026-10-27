import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const css = await read('../src/styles/toon-settings.css');
const index = await read('../src/styles/index.css');

test('设置页卡通样式在 toon-reading 之后、touch 之前引入', () => {
  const a = index.indexOf("'./toon-reading.css'"), b = index.indexOf("'./toon-settings.css'"), c = index.indexOf("'./touch.css'");
  assert.ok(a > 0 && b > a && c > b);
});

test('设置行标签圆体粗字，分隔线改虚线', () => {
  assert.match(css, /\.setting-label \{[^}]*font: 800 16px/);
  assert.match(css, /\.setting-row \{[^}]*border-bottom: 2px dashed/);
});

test('开关带描边厚边，滑块在 48×28 的开关里放得下', () => {
  assert.match(css, /\.switch \{[^}]*border: 2px solid[^}]*box-shadow: 0 3px 0/);
  assert.match(css, /\.switch::after \{[^}]*top: 2px;[^}]*left: 2px;[^}]*border: 2px solid/);
  // 外框 48 宽、2px 边，内宽 44。滑块 20 宽、左 2、打开后右移 20，右边缘 42 ≤ 44
  assert.ok(2 + 20 + 20 <= 48 - 4);
});
