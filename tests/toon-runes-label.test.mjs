// 第 51 轮：卢恩石头下的符名改描边胶囊。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/toon-props.css', import.meta.url), 'utf8');
const blockOf = (sel) => {
  const i = css.indexOf(sel + ' {');
  assert.ok(i >= 0, `找不到 ${sel}`);
  return css.slice(i, css.indexOf('}', i));
};

test('符名是白底深墨描边厚边胶囊，圆体 800', () => {
  const b = blockOf('.m-runes .rn-stone .rn-stone-label');
  assert.match(b, /border: 2px solid #2b2240/);
  assert.match(b, /box-shadow: 0 2px 0 #2b2240/);
  assert.match(b, /font-weight: 800/);
  assert.match(b, /background: #fffaf0/);
  assert.match(b, /text-shadow: none/);
});

test('逆位小标是朱红实心胶囊，五符十字收小', () => {
  assert.match(blockOf('.m-runes .rn-stone .rn-stone-label i'), /background: #e8463c/);
  assert.match(blockOf('.m-runes .rn-n5 .rn-stone .rn-stone-label'), /font-size: 11px/);
});
