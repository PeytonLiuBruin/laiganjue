import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShare, wrapText, clampLines } from '../src/ui/share-card.js';
import { createNative } from '../src/platform/native.js';

const len = (s) => [...s].length * 10; // 每字 10 像素

test('分享文字拆成标题、副标题、正文，去掉末行签名', () => {
  const p = parseShare('【今日财运】10月23日 · ★★★☆☆ 小吉\n财神正东 · 求财吉时 子时\n—— 来感觉 · 玄学占卜');
  assert.equal(p.heading, '今日财运');
  assert.equal(p.sub, '10月23日 · ★★★☆☆ 小吉');
  assert.deepEqual(p.lines, ['财神正东 · 求财吉时 子时']);
  const plain = parseShare('圣杯\n神明应允\n');
  assert.equal(plain.heading, '圣杯');
  assert.deepEqual(plain.lines, ['神明应允']);
  assert.equal(parseShare('').heading, '来感觉');
});

test('折行：中文逐字、英文单词不拆、行首不放标点', () => {
  assert.deepEqual(wrapText('一二三四五六七', 30, len), ['一二三', '四五六', '七']);
  assert.deepEqual(wrapText('The Sun upright', 60, len), ['The', 'Sun', 'upright']);
  const lines = wrapText('一二三，四五', 30, len);
  assert.equal(lines[0], '一二三，');
  for (const l of wrapText('甲乙丙丁戊己庚辛壬癸。子丑寅卯！', 40, len)) assert.ok(!/^[，。！]/.test(l), l);
});

test('超出行数时最后一行以省略号收尾且不超宽', () => {
  const out = clampLines(['一二三', '四五六', '七八九'], 2, len, 30);
  assert.equal(out.length, 2);
  assert.ok(out[1].endsWith('…'));
  assert.ok(len(out[1]) <= 30);
  assert.deepEqual(clampLines(['a'], 3, len, 30), ['a']);
});

test('原生分享图片：先写进缓存目录再交给系统分享面板', async () => {
  const calls = [];
  const plugin = (name) => new Proxy({}, { get: (_, m) => (opts) => { calls.push([name, m, opts]); return Promise.resolve(m === 'writeFile' ? { uri: 'file:///cache/x.png' } : undefined); } });
  const native = createNative({ isNativePlatform: () => true, getPlatform: () => 'ios' }, plugin, plugin('SystemBars'));
  assert.equal(await native.shareImage({ title: '灵签', dataUrl: 'data:image/png;base64,AAAA' }), 'shared');
  const write = calls.find((c) => c[1] === 'writeFile');
  assert.equal(write[0], 'Filesystem');
  assert.equal(write[2].data, 'AAAA');
  assert.equal(write[2].directory, 'CACHE');
  const share = calls.find((c) => c[0] === 'Share');
  assert.deepEqual(share[2].files, ['file:///cache/x.png']);
});

test('网页版原生分享图片为空实现，交回网页处理', async () => {
  const native = createNative({ isNativePlatform: () => false, getPlatform: () => 'web' }, () => ({}), {});
  assert.equal(await native.shareImage({ dataUrl: 'x' }), null);
});
