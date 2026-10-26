// 第 33 轮：卢恩与塔罗的 CSS 器物改成卡通画法（toon-props.css）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const css = read('src/styles/toon-props.css');

test('toon-props.css 在样式入口里，排在 touch.css 之前', () => {
  const imports = read('src/styles/index.css').split('\n').filter((l) => l.startsWith('@import'));
  const at = (n) => imports.findIndex((l) => l.includes(`./${n}.css`));
  assert.ok(at('toon-props') > at('playful') && at('toon-props') < at('touch'));
});

test('卢恩与塔罗器物用硬边色块和深色描边，不再是深灰石、米色麻布与暗绿牌背', () => {
  assert.match(css, /--rn-mat: #7a52e0/);
  assert.match(css, /\.rn-cloth \{[^}]*0 0 0 3px var\(--rn-mat-ink\)/);
  assert.match(css, /\.rn-bag-body \{[^}]*0 0 0 3px var\(--rn-bag-ink\)/);
  assert.match(css, /\.tr-back-art \{[^}]*0 0 0 2\.5px var\(--tr-back-ink\)/);
  assert.match(css, /\.tr-back-engraving \{[^}]*stroke-width: 2\.2px/);
  // 浅色皮肤的符石改成亮沙岩
  assert.match(css, /data-rn-theme='paper'\][\s\S]*?--rn-stone-1: #f8e6bc/);
});

test('塔罗插画不再压低饱和度', () => {
  assert.match(css, /\.tr-illustration \{\s*filter: saturate\(1\.08\)/);
});

test('2D 舞台换成卡通晴空：天空渐变、64% 处地平线、云朵星点在伪元素上不压字', () => {
  assert.match(css, /\.stage \{\s*background:\s*linear-gradient\(180deg, var\(--toon-sky-1\) 0%, var\(--toon-sky-2\) 64%, var\(--toon-ground\) 64% 100%\)/);
  assert.match(css, /\.stage::before \{[^}]*pointer-events: none;[^}]*var\(--toon-ground-edge\) 64% 66\.5%/);
  for (const t of ['celadon', 'ink', 'cinnabar', 'nebula']) assert.match(css, new RegExp(`\\[data-theme='${t}'\\] \\{[^}]*--toon-sky-1`));
  // 灵签筒由土棕木改朱漆
  assert.match(read('src/ui/stick-scene.js'), /const wood = '#d8402e'/);
});
