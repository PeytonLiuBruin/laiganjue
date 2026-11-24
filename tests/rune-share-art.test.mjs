// 卢恩分享卡配图（第 76 轮）：没有 WebGL 时不再退回「卢」字黄圆盘，改画当次抽到的符石。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runeLayout, runeArt, ART_W, ART_H } from '../src/ui/share-art.js';

test('符石位置：1 到 6 块都在画面内、互不重叠，≤3 块带名字条', () => {
  for (let n = 1; n <= 6; n++) {
    const { rects, showLabel, depth } = runeLayout(n);
    assert.equal(rects.length, n);
    assert.equal(showLabel, n <= 3);
    for (const r of rects) {
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= ART_W, `${n} 块时横向越界 ${JSON.stringify(r)}`);
      assert.ok(r.y + r.h + depth + (showLabel ? 110 : 0) <= ART_H, `${n} 块时纵向越界 ${JSON.stringify(r)}`);
      assert.ok(Math.abs(r.w / r.h - 0.8) < .01, '保持石头比例');
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = rects[i], b = rects[j];
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${n} 块时第 ${i} 和 ${j} 重叠`);
    }
  }
  assert.ok(runeLayout(1).rects[0].h > runeLayout(3).rects[0].h, '块数少时石头更大');
  assert.ok(runeLayout(1).rects[0].h >= 400, '单块符石够大，不是小图标');
});

test('没有符文时返回 null，交给分享卡自己的占位', () => {
  assert.equal(runeArt([], {}), null);
  assert.equal(runeArt([{ rune: {} }], {}), null);
});

test('卢恩页分享先拍 3D 舞台，拍不到再画符石配图', () => {
  const src = readFileSync(new URL('../src/modules/runes/view.js', import.meta.url), 'utf8');
  assert.match(src, /ctx\.share\(shareText\(model\),\s*\{\s*image:\s*\(\)\s*=>\s*captureStage\(\)\s*\|\|\s*runeArt\(model\.items\)/);
});

test('分享卡折行：空格隔开的宜忌短词不拆成两半，普通句子仍逐字折', async () => {
  const { wrapText } = await import('../src/ui/share-card.js');
  const m = (s) => [...s].length * 38;
  const yi = '宜：出行 纳财 开市 交易 立券 动土 移徙 入宅 裁衣 会亲友 拆卸 进人口 安香 经络 出货财 修饰垣墙 平治道涂';
  const rows = wrapText(yi, 888, m);
  const words = yi.replace('宜：', '').split(' ');
  for (const r of rows) for (const piece of r.replace('宜：', '').split(' ')) assert.ok(words.includes(piece), `「${piece}」被拆开了：${JSON.stringify(rows)}`);
  for (const r of rows) assert.ok(m(r) <= 888);
  // 没有空格的长句照旧逐字折满一行
  const prose = '贝卡诺是桦树，是雪化以后第一批抽芽的树，也是母亲的符文。它说有一样东西正在你生活里悄悄生长';
  assert.equal(wrapText(prose, 888, m)[0].length, 23);
});
