// 内置字体：离线也用同一套字，不向第三方请求；文案新增的字必须在字体子集里
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { missingHan } from '../scripts/font-charset.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const size = (p) => statSync(new URL('../' + p, import.meta.url)).size;

test('页面不再从 Google Fonts 加载字体，改用 assets/fonts 的子集', () => {
  const tpl = read('src/template.html');
  assert.doesNotMatch(tpl, /fonts\.googleapis|fonts\.gstatic/);
  assert.match(tpl, /url\(fonts\/NotoSerifSC-subset\.woff2\)/);
  assert.match(tpl, /url\(fonts\/Cinzel-subset\.woff2\)/);
  assert.match(read('scripts/build.mjs'), /NotoSerifSC-subset\.woff2/);
});

test('字体子集体积受控（App 安装包里只多一两 MB）', () => {
  assert.ok(size('assets/fonts/NotoSerifSC-subset.woff2') < 1.6 * 1024 * 1024);
  assert.ok(size('assets/fonts/Cinzel-subset.woff2') < 80 * 1024);
});

test('src/ 里用到的每个汉字都在字体子集里（缺字时按 assets/fonts/README.md 重新生成）', () => {
  const miss = missingHan();
  assert.equal(miss.length, 0, `内置字体缺字：${miss.join('')}`);
});

test('字体许可证随字体一起发布（SIL OFL 1.1）', () => {
  for (const f of ['assets/fonts/OFL-NotoSerifSC.txt', 'assets/fonts/OFL-Cinzel.txt']) assert.match(read(f), /SIL Open Font License/);
});
