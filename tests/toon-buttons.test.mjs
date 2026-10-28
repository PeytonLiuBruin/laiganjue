// 玩法页次按钮卡通化、长页面背景接缝、御神签签纸卡通化（第 44 轮）
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const css = await read('../src/styles/toon-buttons.css');
const index = await read('../src/styles/index.css');
const playful = await read('../src/styles/playful.css');
const props = await read('../src/styles/toon-props.css');

test('样式入口引入 toon-buttons.css，排在卡通层之后、触控与对比度之前', () => {
  const at = index.indexOf("'./toon-buttons.css'");
  assert.ok(at > index.indexOf("'./toon-paywall.css'"));
  assert.ok(at < index.indexOf("'./touch.css'") && at < index.indexOf("'./contrast.css'"));
});

test('操作条与结果条里的次按钮是白底 2px 描边加厚边，圆体 800，按下下沉', () => {
  const rule = css.match(/\.btn:is\(\.ghost, \.soft\):not\(\.primary\)\s*\{([^}]*)\}/)[1];
  for (const sel of ['.action-bar', '.ritual-receipt-actions', '.tr-actions', '.rn-more']) assert.ok(css.includes(sel), sel);
  assert.match(rule, /background:\s*var\(--surface\)/);
  assert.match(rule, /border:\s*2px solid/);
  assert.match(rule, /box-shadow:\s*0 4px 0/);
  assert.match(rule, /font-weight:\s*800/);
  assert.match(css, /:active:not\(:disabled\)\s*\{[^}]*translateY\(3px\)/);
});

test('宣纸皮肤背景渐变不重复，底色接渐变末端色（iOS 不支持 fixed 时没有接缝）', () => {
  const rule = playful.match(/\[data-theme='paper'\] body \{([^}]*)\}/)[1];
  assert.match(rule, /no-repeat/);
  const end = rule.match(/#[0-9a-f]{6} 100%/i)[0].slice(0, 7);
  assert.ok(rule.trim().startsWith('background: ' + end), `底色应为 ${end}`);
});

test('御神签签纸：深描边加硬厚边、朱红标签、等级字圆体 900 带描边、出签后签筒完全淡出', () => {
  const slip = props.match(/\.m-omikuji \.ok-slip\.paper-slip\s*\{([^}]*)\}/)[1];
  assert.match(slip, /border:\s*2\.5px solid/);
  assert.match(slip, /box-shadow:\s*0 5px 0/);
  assert.match(props, /\.ok-slip-no\s*\{[^}]*background:\s*#e8463c[^}]*font:\s*800/);
  const level = props.match(/\.m-omikuji \.ok-slip-level\s*\{([^}]*)\}/)[1];
  assert.match(level, /font-weight:\s*900/);
  assert.match(level, /text-shadow/);
  assert.match(props, /\.ok-tone-gold \.ok-slip-level\s*\{[^}]*background:\s*none/);
  assert.match(props, /\.ok-tube-wrap\.stick-scene\.ok-dim[^{]*\{[^}]*opacity:\s*0;/);
  assert.match(props, /\.ok-rack-post\s*\{[^}]*width:\s*8px[^}]*border:\s*2px solid/);
});

test('六爻铜钱盘是描边绒布垫，卦象台描边厚边、标题圆体 900 不拉字距', () => {
  const mat = props.match(/\.m-liuyao \.ly-mat\s*\{([^}]*)\}/)[1];
  assert.match(mat, /border:\s*2\.5px solid/);
  assert.doesNotMatch(mat, /var\(--surface-2\)/);
  assert.match(props, /\.m-liuyao \.ly-board\s*\{[^}]*border:\s*2px solid[^}]*box-shadow:\s*0 4px 0/);
  const title = props.match(/\.m-liuyao \.ly-board-title\s*\{([^}]*)\}/)[1];
  assert.match(title, /font-weight:\s*900/);
  assert.ok(Number(title.match(/letter-spacing:\s*([\d.]+)em/)[1]) <= 0.06);
  assert.match(props, /\.m-liuyao \.ly-board-foot\s*\{[^}]*font:\s*800/);
});
