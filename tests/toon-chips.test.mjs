// 第 49 轮：模式选项行选中项、黄历宜忌词条卡通化。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const css = read('src/styles/toon-buttons.css');
const blockOf = (sel) => {
  const i = css.indexOf(sel + ' {');
  assert.ok(i >= 0, `找不到 ${sel}`);
  return css.slice(i, css.indexOf('}', i));
};

test('选项行选中项是白底描边厚边，不再是平涂浅粉块', () => {
  const b = blockOf('.chips:not(:is(.bf-row2, .bz-row2) .chips) .chip.active');
  assert.match(b, /background: var\(--surface\)/);
  assert.match(b, /border-color: var\(--line-strong\)/);
  assert.match(b, /box-shadow: 0 3px 0 var\(--edge-color\)/);
  assert.match(b, /color: var\(--accent-text\)/);
  // 横向滚动行给厚边留位置
  assert.match(css, /\.chips\.scroll:not\(:is\(\.bf-row2, \.bz-row2\) \.chips\) \{ padding-bottom: 5px; \}/);
});

test('黄历宜忌词条是圆角描边厚边胶囊，宜绿忌红', () => {
  const yi = blockOf('.m-almanac .al-chip');
  assert.match(yi, /border: 2px solid/);
  assert.match(yi, /border-radius: 10px/);
  assert.match(yi, /box-shadow: 0 2px 0/);
  assert.match(yi, /color: var\(--al-green\)/);
  const ji = blockOf('.m-almanac .al-chip.ji');
  assert.match(ji, /color: var\(--al-red\)/);
  // touch.css 的 36px 点按高度仍在后面生效
  const index = read('src/styles/index.css');
  assert.ok(index.indexOf("toon-buttons.css") < index.indexOf("touch.css"));
});
