// 第 75 轮：分享卡结论行（八字四柱、塔罗与卢恩牌名、六爻变卦）深墨粗字，关键词灰字跟在同一行。
import test from 'node:test';
import assert from 'node:assert/strict';
import { keyRows, layoutBody, gapBefore, KEY_GAP, parseShare } from '../src/ui/share-card.js';
import { shareText, initSession, shuffleSession, drawNext, flipCard } from '../src/modules/tarot/core.js';

const poem = (s) => [...s].length * 42; // 粗字每字 42 像素
const body = (s) => [...s].length * 38; // 灰字每字 38 像素
const W = 888;

test('八字四柱整行深墨粗字', () => {
  assert.deepEqual(keyRows('四柱：乙亥 壬午 庚辰 丙子', W, body, poem), [{ t: '四柱　乙亥 壬午 庚辰 丙子', poem: true }]);
});

test('塔罗牌名粗字，关键词放得下时跟在同一行', () => {
  const r = keyRows('指引 · 圣杯三— 庆祝 / 友谊 / 共享', W, body, poem);
  assert.deepEqual(r, [{ t: '指引 · 圣杯三', poem: true, tail: '庆祝 / 友谊 / 共享' }]);
  assert.ok(poem(r[0].t) + KEY_GAP + body(r[0].tail) <= W);
});

test('关键词放不下时折到下一行，且不多空 16', () => {
  const r = keyRows('现状 · 宝剑骑士（逆位）— 冲动 / 莽撞 / 言语伤人 / 缺乏计划', 600, body, poem);
  assert.equal(r[0].poem, true); assert.equal(r[0].tail, undefined);
  assert.ok(r.slice(1).every((x) => !x.poem && x.cont));
  assert.equal(gapBefore(r, 1), false);
  const withPlain = [...r, { t: '综合：……', poem: false }];
  assert.equal(gapBefore(withPlain, withPlain.length - 1), true, '折下来的关键词之后转到解读，仍空一下');
});

test('普通解读、签语不算结论行', () => {
  assert.equal(keyRows('综合：这是一张小牌，说的是眼下具体的处境。', W, body, poem), null);
  assert.equal(keyRows('日主 庚金（阳）· 五行 木1 火1 土1 金1 水2', W, body, poem), null);
  assert.equal(keyRows('签语：静守多年，一朝得遇，所求皆遂。', W, body, poem), null);
});

test('真实塔罗分享文字：牌名行粗字，综合解读转灰字前空一下', () => {
  let s = shuffleSession(initSession('time'));
  for (let i = 0; i < 3; i++) s = drawNext(s);
  for (let i = 0; i < 3; i++) s = flipCard(s, i);
  const { lines } = parseShare(shareText('time', s.draws));
  const items = layoutBody(lines, W, body, poem, 9);
  assert.ok(items.filter((x) => x.poem).length >= 3, '三张牌名都是粗字');
  const firstSoft = items.findIndex((x) => !x.poem && !x.cont);
  assert.ok(firstSoft > 0 && gapBefore(items, firstSoft));
  assert.ok(items.length <= 9);
});

test('截断到最后一行时去掉跟在后面的关键词，不会画出界', () => {
  const lines = Array.from({ length: 12 }, (_, i) => `位置${i} · 星币${i}— 稳定 / 积累`);
  const items = layoutBody(lines, W, body, poem, 9);
  assert.equal(items.length, 9);
  assert.equal(items[8].tail, undefined);
});
