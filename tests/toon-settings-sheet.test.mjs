// 第 55 轮：设置抽屉的次按钮、体感手势卡与抽屉关闭按钮卡通化。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const css = read('src/styles/toon-settings.css');
const app = read('src/ui/app.js');
const blockOf = (sel) => {
  const i = css.indexOf(sel + ' {');
  assert.ok(i >= 0, `找不到 ${sel}`);
  return css.slice(i, css.indexOf('}', i));
};

test('设置抽屉内容和体感手势带上作用域类名', () => {
  assert.match(app, /\{ class: 'settings-body' \},\n\s+h\('div', \{ class: 'setting-row setting-row-pro' \}/);
  assert.match(app, /h\('div', \{ class: 'setting-gestures mt-4' \}, gestureHint\('shake'/);
});

test('设置里的次按钮是白底描边厚边，不再是纯文字', () => {
  const b = blockOf('.settings-body .btn:is(.ghost, .soft):not(.primary)');
  assert.match(b, /background: var\(--surface\)/);
  assert.match(b, /border: 2px solid var\(--line-strong\)/);
  assert.match(b, /box-shadow: 0 3px 0 var\(--edge-color\)/);
  assert.match(b, /font-weight: 800/);
  const pill = blockOf('.settings-body :is(.setting-pro, .setting-haptic-controls) .btn:is(.ghost, .soft)');
  assert.match(pill, /min-height: 44px/);
});

test('体感手势是描边厚边小卡，左对齐，图标在描边小方块里', () => {
  assert.match(blockOf('.settings-body .setting-gestures'), /box-shadow: 0 4px 0 var\(--edge-color\)/);
  const row = blockOf('.settings-body .setting-gestures .hint');
  assert.match(row, /justify-content: flex-start/);
  assert.match(row, /border-bottom: 2px dashed/);
  assert.match(blockOf('.settings-body .setting-gestures .hint-glyph'), /border: 2px solid var\(--line-strong\)/);
});

test('抽屉关闭按钮描边厚边', () => {
  const b = blockOf('.sheet-head .icon-btn');
  assert.match(b, /border: 2px solid var\(--line-strong\)/);
  assert.match(b, /box-shadow: 0 3px 0 var\(--edge-color\)/);
});
