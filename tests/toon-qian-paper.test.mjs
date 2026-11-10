// 第 53 轮：灵签签纸改成和御神签同一套描边厚边画法（商店图第 2 张的主角）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/styles/toon-props.css', import.meta.url), 'utf8');
const sec = css.slice(css.indexOf('灵签签纸卡通化（第 53 轮）'));
const rule = (sel) => { const i = sec.indexOf(sel + ' {'); assert.ok(i >= 0, sel); return sec.slice(i, sec.indexOf('}', i)); };

test('签纸奶油底、深描边、硬厚边，内框淡线去掉', () => {
  const p = rule('.m-qian .qn-paper');
  assert.match(p, /background: #fffaf0/);
  assert.match(p, /border: 2\.5px solid/);
  assert.match(p, /box-shadow: 0 5px 0 var\(--qn-ink\)/);
  assert.match(rule('.m-qian .qn-paper::after'), /display: none/);
});

test('签号是朱红标签白字，横向铺满签纸（窄屏内边距同步）', () => {
  const no = rule('.m-qian .qn-paper-no');
  assert.match(no, /background: #e8463c/);
  assert.match(no, /color: #fff/);
  assert.match(no, /margin: 0 calc\(-1 \* var\(--qn-pad\)\)/);
  assert.match(sec, /max-width: 650px\) \{ \.m-qian \.qn-paper \{ --qn-pad: 16px; \}/);
});

test('标题圆体 900，印章朱红实心白字描边厚边', () => {
  assert.match(rule('.m-qian .qn-paper h2'), /font: 900/);
  const seal = rule('.m-qian .qn-seal');
  assert.match(seal, /background: #e8463c/);
  assert.match(seal, /border: 2\.5px solid/);
  assert.match(seal, /box-shadow: 0 3px 0/);
});
