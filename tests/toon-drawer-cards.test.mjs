import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/styles/toon-reading.css', import.meta.url), 'utf8');
const tail = css.slice(css.indexOf('第 59 轮'));

test('六爻动爻改为描边厚边小卡，不再是左竖线引文条', () => {
  assert.ok(tail.length > 100, '第 59 轮一节存在');
  assert.match(tail, /\.m-liuyao \.ly-mv-item \{[^}]*border: 2px solid var\(--line-strong\)[^}]*border-radius: 14px[^}]*box-shadow: 0 3px 0 var\(--edge-color\)/);
  assert.match(tail, /\.m-liuyao \.ly-mv-mark \{[^}]*border-radius: 999px[^}]*font: 900 12px/);
});

test('六爻分项与御神签十二项目和灵签分述同一套小卡与胶囊项名', () => {
  assert.match(tail, /\.m-liuyao \.ly-aspect,\s*\.m-omikuji \.ok-item \{[^}]*border: 2px solid var\(--line-strong\)[^}]*box-shadow: 0 3px 0 var\(--edge-color\)/);
  assert.match(tail, /\.m-liuyao \.ly-aspect b,\s*\.m-omikuji \.ok-item-k \{[^}]*border-radius: 999px[^}]*font: 800 12px/);
  assert.doesNotMatch(tail, /letter-spacing: \.(1[1-9]|[2-9])em/, '小标签字距不超过 .1em');
});

test('姻缘感情流年图例一条一行，项名为主色小胶囊', async () => {
  const view = await readFile(new URL('../src/modules/yinyuan/view.js', import.meta.url), 'utf8');
  assert.match(view, /class: 'yy-notes yy-notes-list'/);
  assert.doesNotMatch(view, /notes\.map\(\(n\) => `\$\{n\.short\}：\$\{n\.text\}`\)\.join/);
  assert.match(tail, /\.m-yinyuan \.yy-notes-list b \{[^}]*border-radius: 999px[^}]*font: 800 12px/);
});
