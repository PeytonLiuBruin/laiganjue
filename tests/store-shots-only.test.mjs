// 第 53 轮：商店截图可以分批重拍（--only），灵签场景直接抽上上签，不再靠反复重抽碰运气。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseOnly, SCENES } from '../scripts/store-shots.mjs';
import { LOTS } from '../src/modules/qian/data.js';

test('--only 解析：1 起的序号，越界和乱写的忽略，空表示全部', () => {
  assert.deepEqual([...parseOnly('1,3', 6)], [0, 2]);
  assert.deepEqual([...parseOnly(' 2 , 9, x', 6)], [1]);
  assert.equal(parseOnly('', 6).size, 6);
  assert.equal(parseOnly('0,7', 6).size, 6);
});

test('灵签商店图指定一支上上签，签号存在', () => {
  const qian = SCENES.find((s) => s.route === 'm/qian');
  const no = qian.init['lgj:qian:dev.lot'];
  const lot = LOTS.find((l) => l.no === no);
  assert.ok(lot, '签号要存在');
  assert.match(lot.level + '签', qian.lucky);
});

test('商店图里不出现「新签入册」这类轻提示（会压在按钮上）', () => {
  const src = readFileSync(new URL('../scripts/store-shots.mjs', import.meta.url), 'utf8');
  assert.match(src, /\.toast\{display:none!important\}/);
});

test('灵签 dev.lot 只在网页预览生效，App 原生环境忽略', () => {
  const src = readFileSync(new URL('../src/modules/qian/view.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('function devLot'), src.indexOf('async function shake'));
  assert.match(fn, /isNativePlatform/);
  assert.match(fn, /return null/);
  assert.match(src, /lot = devLot\(\) \|\| drawLot\(/);
});
