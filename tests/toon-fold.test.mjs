// 第 48 轮：八字生辰折叠到舞台下方，风水「填上生年」改描边胶囊。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('八字表单放进生辰折叠卡，排在舞台之后', () => {
  const src = read('src/modules/bazi/view.js');
  assert.match(src, /createBirthFold\(/);
  assert.match(src, /open: !hasBirth/);
  const append = src.match(/container\.append\(([^)]*)\)/)[1];
  assert.ok(append.indexOf('st.el') < append.indexOf('fold.el'), '舞台在折叠卡前面');
  assert.ok(!/\bform,/.test(append), '表单不再直接挂在舞台上方');
});

test('风水「填上生年」是描边胶囊，没有下划线', () => {
  const css = read('src/styles/toon-buttons.css');
  const block = css.slice(css.indexOf('.m-fengshui .btn.fs-fill {'));
  assert.match(block, /border: 2px solid var\(--line-strong\)/);
  assert.match(block, /border-radius: 999px/);
  assert.match(block, /text-decoration: none/);
  assert.match(block, /min-height: 44px/);
});
