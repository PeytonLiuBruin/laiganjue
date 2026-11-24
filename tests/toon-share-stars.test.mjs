// 第 77 轮：分享卡里的 ★☆ 画成金色描边胖星，星座「爱情 ★★★☆☆  事业 ★★★★☆」算星级行（深墨粗字），今日一句不用半角引号。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isStarRow, layoutBody, drawStarText, parseShare } from '../src/ui/share-card.js';
import { QUOTES } from '../src/modules/zodiac/data.js';
import { signFortune, signById, shareText } from '../src/modules/zodiac/core.js';

const poem = (s) => [...s].length * 42;
const body = (s) => [...s].length * 38;

test('星级行识别：标签加星串才算，普通句子里带星不算', () => {
  assert.ok(isStarRow('综合 ★★★★☆'));
  assert.ok(isStarRow('爱情 ★★★☆☆  事业 ★★★★☆'));
  assert.ok(!isStarRow('今日一句：给自己打个 ★'));
  assert.ok(!isStarRow('幸运色 金 · 幸运数字 7'));
});

test('星级行排成深墨粗字整行，太窄时在两组之间断开', () => {
  assert.deepEqual(layoutBody(['爱情 ★★★☆☆  事业 ★★★★☆'], 888, body, poem), [{ t: '爱情 ★★★☆☆  事业 ★★★★☆', poem: true }]);
  const narrow = layoutBody(['爱情 ★★★☆☆  事业 ★★★★☆'], 500, body, poem);
  assert.deepEqual(narrow.map((x) => x.t), ['爱情 ★★★☆☆', '事业 ★★★★☆']);
});

test('drawStarText 不把 ★☆ 当字画，星占一个字宽、亮暗颜色不同', () => {
  const calls = [];
  let fill = '#000';
  const g = {
    get fillStyle() { return fill; }, set fillStyle(v) { fill = v; },
    strokeStyle: '', lineWidth: 1, lineJoin: '',
    measureText: (s) => ({ width: [...s].length * 40 }),
    fillText: (s) => calls.push(['text', s]),
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, ellipse() {}, stroke() { calls.push(['stroke']); },
    fill() { calls.push(['fill', fill]); },
  };
  const end = drawStarText(g, '综合 ★★☆', 0, 0, 40);
  assert.ok(calls.filter((c) => c[0] === 'text').every((c) => !/[★☆]/.test(c[1])));
  assert.equal(end, g.measureText('综合 ').width + 3 * 40);
  const fills = calls.filter((c) => c[0] === 'fill').map((c) => c[1]);
  assert.ok(fills.includes('#ffc93c') && fills.includes('#fff4d6'));
  assert.equal(calls.filter((c) => c[0] === 'stroke').length, 3);
});

test('星座分享文案：三行星级都识别为星级行，今日一句没有半角引号', () => {
  const f = signFortune(signById('taurus'), new Date('2026-11-24T12:00:00'));
  const { lines } = parseShare(shareText(f));
  assert.equal(lines.filter(isStarRow).length, 3);
  assert.ok(QUOTES.every((q) => !q.includes('"')));
  const data = readFileSync(new URL('../src/modules/zodiac/data.js', import.meta.url), 'utf8');
  const strings = data.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/"[^"\n]*[一-鿿][^"\n]*"/.test(strings), '星座文案里的引号用「」');
});
