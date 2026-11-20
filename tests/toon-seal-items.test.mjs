import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/styles/toon-reading.css', import.meta.url), 'utf8');
const tail = css.slice(css.indexOf('第 58 轮'));

test('结果抽屉印章改为朱红实心白字、深墨描边硬厚边，不再正片叠底或半透明', () => {
  assert.ok(tail.length > 100, '第 58 轮一节存在');
  assert.match(tail, /\.result \.seal \{[^}]*--seal-fill: #d63a30[^}]*background: var\(--seal-fill\)[^}]*color: #fff[^}]*border: 2\.5px solid[^}]*box-shadow: 0 3px 0[^}]*opacity: 1[^}]*mix-blend-mode: normal/);
  assert.match(tail, /\.result \.seal\.stamp \{ animation-name: seal-stamp-solid; \}/);
  assert.match(tail, /@keyframes seal-stamp-solid \{[\s\S]*?100% \{[^}]*opacity: 1/);
});

test('印泥色对白字达到 AA 正文对比度（水晶球 18px 小印章不算大字）', () => {
  const L = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  for (const hex of ['#d63a30', '#a8392b']) assert.ok(1.05 / (L(hex) + 0.05) >= 4.5, hex);
});

test('灵签分述六项改为描边厚边小卡，项名为圆体 800 胶囊', () => {
  assert.match(tail, /\.m-qian \.qn-item \{[^}]*border: 2px solid var\(--line-strong\)[^}]*border-radius: 14px[^}]*box-shadow: 0 3px 0 var\(--edge-color\)/);
  assert.match(tail, /\.m-qian \.qn-item b \{[^}]*border-radius: 999px[^}]*font: 800 12px/);
  assert.match(tail, /\.result \.result-section-label \{[^}]*border: 2px solid[^}]*box-shadow: 0 2px 0/);
});

test('深色皮肤的逆位小胶囊提亮', () => {
  assert.match(tail, /\[data-theme='ink'\] :is\(\.m-runes \.rn-tag\.rev, \.m-tarot \.tr-tag\.rev\)[\s\S]*?\{ --seal: #ff7a66; \}/);
});
