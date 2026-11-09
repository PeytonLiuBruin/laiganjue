// 运势星级卡通化、筊杯舞台卡通化（第 46 轮）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const kit = await read('../src/ui/kit.js');
const sections = await read('../src/styles/toon-sections.css');
const props = await read('../src/styles/toon-props.css');
const jiaobei = await read('../src/modules/jiaobei/view.js');

test('kit.stars 输出描边胖星 SVG，不再是 ★ 字符，整组带 role=img 与读屏文字', () => {
  const fn = kit.slice(kit.indexOf('export function stars'), kit.indexOf('/* ------------------------------ Toast'));
  assert.ok(!fn.includes("'★'"));
  assert.match(fn, /role: 'img', 'aria-label': `\$\{n\}\/\$\{max\}`/);
  for (const part of ['star-edge', 'star-body', 'star-shine', 'aria-hidden="true"']) assert.ok(fn.includes(part), part);
});

test('亮星金色、暗星奶油色，都描 2px 深墨，深色皮肤暗星改半透明白', () => {
  assert.match(sections, /\.stars \.on \.star-body \{ fill: #ffc93c; \}/);
  assert.match(sections, /\.stars \.off \.star-body \{ fill: #fff4d6; \}/);
  assert.match(sections, /\.stars \.star-body \{[^}]*stroke: #2b2240; stroke-width: 2;/);
  assert.match(sections, /\[data-theme='ink'\][^{]*\.stars \.off \.star-body \{ fill: rgba\(255, 255, 255, 0\.14\)/);
  assert.match(sections, /\.stars > span \{[^}]*width: 1\.15em/);
});

test('筊杯面向标签是描边胶囊、圆体 800，平面「阳」加 yang 类用主色字', () => {
  const rule = props.match(/\.m-jiaobei \.jb-face-labels span \{([^}]*)\}/)[1];
  assert.match(rule, /font: 800 12px/);
  assert.match(rule, /border: 2px solid/);
  assert.match(rule, /box-shadow: 0 3px 0/);
  assert.match(props, /\.jb-face-labels span\.yang \{ color: var\(--accent-text\); \}/);
  assert.match(jiaobei, /classList\.toggle\('yang', face === 'flat'\)/);
});

test('筊盘 2px 虚线，连掷小印 2px 描边、圆体 900，得到的圣杯主色实心', () => {
  assert.match(props, /\.m-jiaobei \.jb-mat \{ border: 2px dashed/);
  const pip = props.match(/\.m-jiaobei \.jb-streak > span \{([^}]*)\}/)[1];
  assert.match(pip, /border: 2px solid/);
  assert.match(pip, /font: 900 12px/);
  assert.match(props, /\.jb-streak \.earned \{ background: var\(--accent\)/);
});
