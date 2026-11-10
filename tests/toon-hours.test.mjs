// 第 51 轮：黄历时辰表当前时辰格卡通化。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/toon-buttons.css', import.meta.url), 'utf8');
const blockOf = (sel) => {
  const i = css.indexOf(sel + ' {');
  assert.ok(i >= 0, `找不到 ${sel}`);
  return css.slice(i, css.indexOf('}', i));
};

test('当前时辰格是朱红描边加硬厚边，不再是 1px 细框', () => {
  const b = blockOf('.m-almanac .al-hours .al-hour.now');
  assert.match(b, /inset 0 0 0 2px var\(--al-red\)/);
  assert.match(b, /0 3px 0 color-mix/);
  assert.match(blockOf('.m-almanac .al-hours .al-hour'), /border-radius: 10px/);
});

test('时辰吉凶字是圆体 800，详情格当前格描边厚边', () => {
  assert.match(css, /\.al-hcell i \{\n  font-family: var\(--font-round, var\(--font-sans\)\);\n  font-weight: 800;/);
  const c = blockOf('.m-almanac .al-hgrid .al-hcell.now');
  assert.match(c, /border: 2px solid var\(--accent\)/);
  assert.match(c, /box-shadow: 0 3px 0/);
});
