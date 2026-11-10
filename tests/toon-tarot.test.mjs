// 第 50 轮：塔罗翻开后的牌面描边厚边，逆位牌厚边反向，牌位标签胶囊。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const css = read('src/styles/toon-props.css');
const blockOf = (sel) => {
  const i = css.indexOf(sel + ' {');
  assert.ok(i >= 0, `找不到 ${sel}`);
  return css.slice(i, css.indexOf('}', i));
};

test('翻开的牌面是深墨描边加向下硬厚边，不再是 1px 米色细框', () => {
  const b = blockOf('.m-tarot .tr-card .tr-front-art');
  assert.match(b, /border: 2\.5px solid #2b2240/);
  assert.match(b, /box-shadow: 0 5px 0 #2b2240/);
  assert.match(blockOf('.m-tarot .tr-card .tr-illustration'), /border: 2px solid #2b2240/);
  // toon-props.css 排在 atelier.css、refinement.css 后面才能盖住旧的细框与柔和投影
  const index = read('src/styles/index.css');
  assert.ok(index.indexOf('refinement.css') < index.indexOf('toon-props.css'));
  assert.ok(index.indexOf('atelier.css') < index.indexOf('toon-props.css'));
});

test('逆位牌转了 180°，厚边反向画，抽牌时就加上 reversed 类', () => {
  assert.match(css, /\.m-tarot \.tr-card\.reversed \.tr-front-art,[\s\S]*?box-shadow: 0 -5px 0 #2b2240/);
  const view = read('src/modules/tarot/view.js');
  assert.match(view, /if \(draw\.reversed\) \{ c\.spin\.style\.transform = 'rotate\(180deg\)'; c\.el\.classList\.add\('reversed'\); \}/);
});

test('牌位标签翻开后是描边胶囊，历史缩略图不受影响', () => {
  const b = blockOf('.m-tarot .tr-slot-wrap.filled .tr-slot-label');
  assert.match(b, /border: 2px solid var\(--line-strong\)/);
  assert.match(b, /box-shadow: 0 3px 0 var\(--edge-color\)/);
  // 缩略图不在 .tr-card 里，选择器都带 .tr-card，这一层也没有单独给 .tr-thumb 写规则
  assert.doesNotMatch(css, /^\.m-tarot[^\n{]*\.tr-thumb[^\n{]*\{/m);
});
