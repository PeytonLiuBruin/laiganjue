// 舞台下小卡（生辰行、生辰折叠卡、体感卡）与舞台角标卡通化（第 47 轮）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/styles/toon-buttons.css', import.meta.url), 'utf8');
const tail = css.slice(css.indexOf('第 47 轮'));

test('生辰行、生辰折叠卡、体感卡是 2px 描边加 4px 厚边', () => {
  const rule = tail.match(/\.motion-entry\) \{([^}]*)\}/)[1];
  for (const sel of ['.cy-profile', '.sy-profile', '.birth-fold-toggle', '.motion-entry']) assert.ok(tail.includes(sel), sel);
  assert.match(rule, /border:\s*2px solid var\(--line-strong\)/);
  assert.match(rule, /box-shadow:\s*0 4px 0 var\(--edge-color\)/);
});

test('「去填生辰」「修改」是白底描边胶囊，有厚边、圆体 800、主色字，不再是浅粉平涂', () => {
  const rule = tail.match(/\.birth-fold-caret \{([^}]*background[^}]*)\}/)[1];
  assert.match(rule, /background:\s*var\(--surface\)/);
  assert.match(rule, /border:\s*2px solid/);
  assert.match(rule, /box-shadow:\s*0 3px 0/);
  assert.match(rule, /color:\s*var\(--accent-text\)/);
  assert.match(rule, /font-weight:\s*800/);
  assert.doesNotMatch(rule, /--glow/);
});

test('舞台角标与提示是描边胶囊，圆体 800，字距不超过 .06em', () => {
  const rule = tail.match(/\.stage-hint \{([^}]*)\}/)[1];
  assert.match(rule, /border:\s*2px solid/);
  assert.match(rule, /font-weight:\s*800/);
  const ls = Number(rule.match(/letter-spacing:\s*([\d.]+)em/)[1]);
  assert.ok(ls <= 0.06, String(ls));
});

test('输入框与下拉框是 2px 描边加厚边，聚焦时主色描边', () => {
  const rule = tail.match(/\.input,\s*\.select,\s*\.textarea \{([^}]*)\}/)[1];
  assert.match(rule, /border:\s*2px solid var\(--line-strong\)/);
  assert.match(rule, /box-shadow:\s*0 3px 0/);
  assert.match(tail, /\.textarea:focus \{[^}]*border-color:\s*var\(--accent\)/);
});

test('生辰表单与八字的性别切换：描边分段框，选中项和选中页签同一套按钮色', () => {
  for (const sel of ['.birth-form .bf-row2', '.m-bazi .bz-form .bz-row2']) assert.ok(tail.includes(sel), sel);
  const active = tail.match(/\.bz-row2\) \.chip\.active \{([^}]*)\}/)[1];
  assert.match(active, /--btn-top/);
  assert.match(active, /color:\s*var\(--accent-ink\)/);
  assert.match(tail, /\[data-theme='paper'\][^{]*\.chip\.active \{[^}]*text-shadow:\s*var\(--btn-outline\)/);
});
