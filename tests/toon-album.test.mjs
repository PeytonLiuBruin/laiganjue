import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const css = await read('../src/styles/collect.css');
const view = await read('../src/modules/qian/view.js');
// 第 57 轮追加的规则在文件末尾，覆盖前面的旧写法
const toon = css.slice(css.indexOf('收集册进度条与等级计数卡通化'));

test('收集册进度条：描边、厚边、硬边高光，大号 20px', () => {
  assert.ok(toon.length > 100, '卡通化规则要在 collect.css 末尾');
  assert.match(toon, /\.qn-album-bar \{[^}]*border: 2px solid/);
  assert.match(toon, /\.qn-album-bar \{[^}]*box-shadow: 0 2px 0/);
  assert.match(toon, /\.qn-album-bar i \{[^}]*inset 0 3px 0 rgba\(255, 255, 255/);
  assert.match(toon, /\.qn-album-bar\.big \{ height: 20px/);
});

test('等级计数改成和签格同色的描边小签，没收到的是虚线框', () => {
  assert.match(toon, /\.qn-album-level \{[^}]*border: 2px solid color-mix\(in srgb, var\(--tone\)/);
  assert.match(toon, /\.qn-album-level \{[^}]*box-shadow: 0 3px 0/);
  assert.match(toon, /\.qn-album-level \{[^}]*color: #2b2240/);
  assert.match(toon, /\.qn-album-level\.none \{[^}]*border-style: dashed/);
  assert.match(view, /\$\{x\.have \? '' : ' none'\}/, '一支都没有的等级加 none');
});
