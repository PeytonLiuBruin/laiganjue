// 第 56 轮：皮肤抽屉卡通化（色球赛璐珞画法、色卡描边厚边、选中勾、免费描边胶囊、单套购买卡次按钮）与首次引导说明行描边。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const css = read('src/styles/toon-settings.css');
const blockOf = (sel) => {
  const i = css.indexOf(sel + ' {');
  assert.ok(i >= 0, `找不到 ${sel}`);
  return css.slice(i, css.indexOf('}', i));
};
const { THEMES, toonSwatch } = await import('../src/ui/app.js').catch(() => ({}));
const app = read('src/ui/app.js');

test('五套皮肤色球都用 toonSwatch 赛璐珞两段色，不再是柔光渐变球', () => {
  const lines = app.split('\n').filter((l) => /^\s+\{ id: '(ink|cinnabar|nebula|paper|celadon)'/.test(l));
  assert.equal(lines.length, 5);
  for (const l of lines) assert.match(l, /swatch: toonSwatch\('#[0-9a-f]{6}', '#[0-9a-f]{6}'/);
  assert.match(app, /export const toonSwatch = /);
  // 底色与阴影之间是硬边（相差 2 个百分点以内），高光也是硬边
  assert.match(app, /\$\{base\} 0 57%, \$\{shade\} 59%/);
  if (toonSwatch) assert.match(toonSwatch('#111111', '#222222'), /#ffffff 0 86%/);
  if (THEMES) assert.equal(THEMES.length, 5);
});

test('色球深墨描边加硬下沉影', () => {
  const b = blockOf('.swatch-ball');
  assert.match(b, /border: 2\.5px solid var\(--c-ink/);
  assert.match(b, /box-shadow: 0 3px 0 /);
});

test('色卡白底描边厚边，选中卡主色描边、主色厚边、右上角勾', () => {
  const card = blockOf('.theme-swatch');
  assert.match(card, /border: 2px solid var\(--line-strong\)/);
  assert.match(card, /box-shadow: 0 4px 0 var\(--edge-color\)/);
  assert.match(card, /font: 800 /);
  const on = blockOf('.theme-swatch.active');
  assert.match(on, /border-color: var\(--accent\)/);
  assert.match(on, /box-shadow: 0 4px 0 color-mix/);
  assert.match(blockOf('.theme-swatch.active::after'), /width: 26px/);
});

test('「免费」「已解锁」是描边胶囊，「Pro · 试穿」金色加深金描边', () => {
  assert.match(css, /\.theme-swatch \.swatch-tag\.is-free,\n\.theme-swatch \.swatch-tag\.is-owned \{[^}]*border: 2px solid var\(--line-strong\)/);
  assert.match(blockOf('.theme-swatch .swatch-tag.is-locked'), /border: 2px solid var\(--c-gold-deep/);
});

test('单套皮肤购买卡的开通 Pro 次按钮描边厚边', () => {
  const b = blockOf('.skin-offer .btn.skin-pro');
  assert.match(b, /border: 2px solid var\(--line-strong\)/);
  assert.match(b, /box-shadow: 0 3px 0 var\(--edge-color\)/);
});

test('首次引导卡说明行描边厚边', () => {
  const b = blockOf('.onboard-row');
  assert.match(b, /border: 2px solid var\(--line-strong\)/);
  assert.match(b, /box-shadow: 0 3px 0 var\(--edge-color\)/);
});
