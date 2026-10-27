import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const css = await read('../src/styles/toon-history.css');
const index = await read('../src/styles/index.css');

test('最近记录卡通化样式在 toon-props 之后、touch 之前引入', () => {
  const a = index.indexOf("'./toon-props.css'"), b = index.indexOf("'./toon-history.css'"), c = index.indexOf("'./touch.css'");
  assert.ok(a > 0 && b > a && c > b);
});

test('历史标签：2px 描边、3px 厚边、圆体粗字，不再用细线灰字', () => {
  assert.match(css, /border: 2px solid var\(--chip-line\)/);
  assert.match(css, /box-shadow: 0 3px 0 var\(--chip-edge\)/);
  assert.match(css, /font: 800 13px\/1\.3 var\(--font-round/);
  assert.match(css, /\[data-theme='nebula'\] :is\(\.history-item/, '深色皮肤要有单独的底色');
  assert.match(css, /\.history-item\[class\*='tone-'\]/, '带等级的记录按等级上色');
});

test('灵签、御神签、筊杯的历史带等级色，标题统一圆体', async () => {
  const qian = await read('../src/modules/qian/view.js');
  const omikuji = await read('../src/modules/omikuji/view.js');
  const jiaobei = await read('../src/modules/jiaobei/view.js');
  const kit = await read('../src/ui/kit.js');
  assert.match(qian, /class: tone \? `history-item tone-\$\{tone\}`/);
  assert.match(omikuji, /HISTORY_TONE = \{ gold: 'great', red: 'good', ink: 'neutral', indigo: 'low' \}/);
  assert.match(jiaobei, /HISTORY_TONE = \{ li: 'great', sheng: 'good', xiao: 'neutral', yin: 'bad' \}/);
  assert.match(kit, /export function historyBar\(items, format = \(x\) => String\(x\), toneOf = null\)/);
  for (const sel of ['.m-omikuji .ok-history-kicker', '.m-liuyao .ly-hist-title', '.m-tarot .tr-hist-head']) assert.ok(css.includes(sel), sel);
});

test('灵签最近的签超出一行时右侧渐隐，滑到底去掉', async () => {
  const qian = await read('../src/modules/qian/view.js');
  assert.match(qian, /row\.classList\.toggle\('more', row\.scrollLeft \+ row\.clientWidth < row\.scrollWidth - 2\)/);
  assert.match(qian, /new ResizeObserver\(fade\)\.observe\(row\)/);
  assert.match(css, /\.m-qian \.qn-history-row\.more \{[^}]*mask-image: linear-gradient\(90deg, #000 calc\(100% - 28px\), transparent\)/);
});
