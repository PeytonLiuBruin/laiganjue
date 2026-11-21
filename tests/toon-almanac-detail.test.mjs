import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/styles/toon-reading.css', import.meta.url), 'utf8');
const tail = css.slice(css.indexOf('第 60 轮'));

test('黄历细目名目改主色描边小胶囊，行间 2px 虚线', () => {
  assert.ok(tail.length > 100, '第 60 轮一节存在');
  assert.match(tail, /\.m-almanac \.al-dl-row \{[^}]*grid-template-columns: 82px[^}]*border-top: 2px dashed/);
  assert.match(tail, /\.m-almanac \.al-dl-label \{[^}]*border: 2px solid[^}]*border-radius: 999px[^}]*font: 800 12px[^}]*white-space: nowrap/);
});

test('宜忌、吉神、凶煞词条是 2px 描边加 3px 厚边的圆体胶囊，按下下沉', () => {
  assert.match(tail, /\.m-almanac \.al-term \{[^}]*min-height: 32px[^}]*border: 2px solid var\(--line-strong\)[^}]*box-shadow: 0 3px 0 var\(--edge-color\)[^}]*font: 800 13px/);
  assert.match(tail, /\.m-almanac \.al-term:active \{[^}]*translateY\(2px\)/);
  assert.match(tail, /\.m-almanac \.al-term\.ji \{[^}]*var\(--danger\)/);
});

test('「此刻」时辰提示从左竖线引文条改为描边厚边小卡', () => {
  assert.match(tail, /\.m-almanac \.al-now \{[^}]*border: 2px solid var\(--line-strong\)[^}]*border-radius: 14px[^}]*box-shadow: 0 3px 0 var\(--edge-color\)/);
  assert.match(tail, /\.m-almanac \.al-now b \{[^}]*font: 800 13px/);
});

test('「择日」事项行改描边厚边胶囊，横向滚动行留出厚边', () => {
  assert.match(tail, /\.m-almanac \.al-picks \{ padding-bottom: 5px; \}/);
  assert.match(tail, /\.m-almanac \.al-pick \{[^}]*border: 2px solid var\(--line-strong\)[^}]*border-radius: 999px[^}]*box-shadow: 0 3px 0 var\(--edge-color\)[^}]*font: 800 14px/);
});
