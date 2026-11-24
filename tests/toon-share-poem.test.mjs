// 第 73 轮：分享卡签诗单独排（深墨粗字、不和解读一起逐字折行），六爻阴爻改两块独立圆角块。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { poemRows, layoutBody } from '../src/ui/share-card.js';

const len = (s) => [...s].length * 42; // 每字 42 像素，和分享卡诗句字号一致
const W = 888; // 分享卡正文宽

test('御神签四句两句一行，不会出现单字落行', () => {
  const rows = poemRows('逆水行小舟 / 一篙难进尺 / 不如靠岸歇 / 待水势缓时', W, len);
  assert.deepEqual(rows, ['逆水行小舟　一篙难进尺', '不如靠岸歇　待水势缓时']);
  for (const r of rows) assert.ok(len(r) <= W);
});

test('灵签七言整句一行，放不下时按逗号拆两行', () => {
  assert.deepEqual(poemRows('渭水滩头日正长，垂纶不为钓鱼忙。', W, len), ['渭水滩头日正长，垂纶不为钓鱼忙。']);
  assert.deepEqual(poemRows('渭水滩头日正长，垂纶不为钓鱼忙。', 400, len), ['渭水滩头日正长，', '垂纶不为钓鱼忙。']);
});

test('风水方位、塔罗关键词、普通解读不当成诗', () => {
  assert.equal(poemRows('坎·文曲 / 离·贪狼 / 震·禄存', W, len), null);
  assert.equal(poemRows('愚者 — 开始 / 冒险', W, len), null);
  assert.equal(poemRows('签语：静守多年，一朝得遇，所求皆遂。', W, len), null);
});

test('正文排版：诗句标 poem，超出行数时最后一行带省略号且不超宽', () => {
  const body = layoutBody(['春山雪初融 / 溪水响山谷 / 千枝未发时 / 花已在心头', '冰雪化开'.repeat(40)], W, len, len, 6);
  assert.equal(body.length, 6);
  assert.deepEqual(body.slice(0, 2).map((b) => b.poem), [true, true]);
  assert.ok(body.slice(2).every((b) => !b.poem));
  assert.ok(body[5].t.endsWith('…') && len(body[5].t) <= W);
});

test('六爻阴爻是左右两块独立圆角块，中间空档不小于 25%', async () => {
  const css = await readFile(new URL('../src/styles/toon-props.css', import.meta.url), 'utf8');
  assert.match(css, /\.ly-line\.lit\.yin \.ly-bar::before[\s\S]*?width: 36%/);
  assert.match(css, /\.ly-line\.lit\.yin \.ly-bar::after \{ right: 0; \}/);
  assert.match(css, /\.ly-line\.lit\.moving\.yin \.ly-bar::before[\s\S]*?var\(--accent\)/);
});
