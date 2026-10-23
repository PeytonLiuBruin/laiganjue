// 分享卡配图的纯布局部分：塔罗牌位不出界不重叠，黄历宜忌标签按行排、超出丢掉。
import test from 'node:test';
import assert from 'node:assert/strict';
import { tarotLayout, tarotIndex, flowChips, ART_W, ART_H } from '../src/ui/share-art.js';

test('塔罗牌位：1 到 10 张都在画面内且互不重叠，≤3 张带名字条', () => {
  for (let n = 1; n <= 10; n++) {
    const { rects, showLabel } = tarotLayout(n);
    assert.equal(rects.length, n);
    assert.equal(showLabel, n <= 3);
    for (const r of rects) {
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= ART_W && r.y + r.h + (showLabel ? 84 : 0) <= ART_H, `第 ${n} 张越界 ${JSON.stringify(r)}`);
      assert.ok(Math.abs(r.w / r.h - 200 / 340) < .01, '保持牌面比例');
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = rects[i], b = rects[j];
      assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${n} 张时第 ${i} 和 ${j} 重叠`);
    }
  }
  assert.ok(tarotLayout(1).rects[0].h > tarotLayout(3).rects[0].h, '张数少时牌更大');
});

test('塔罗牌面在图集里的序号', () => {
  assert.equal(tarotIndex({ arcana: 'major', no: 0 }), 0);
  assert.equal(tarotIndex({ arcana: 'major', no: 21 }), 21);
  assert.equal(tarotIndex({ arcana: 'minor', suit: 'wands', rank: 1 }), 22);
  assert.equal(tarotIndex({ arcana: 'minor', suit: 'pentacles', rank: 14 }), 77);
});

test('宜忌标签：按宽度折行，最多两行，放不下的丢掉', () => {
  const m = (s) => s.length * 40;
  const chips = flowChips(['祭祀', '祈福', '求嗣', '开光', '出行', '解除', '纳采', '嫁娶'], 400, m);
  for (const c of chips) assert.ok(c.x + c.w <= 400);
  assert.ok(chips.every((c) => c.y <= 78), '不超过两行');
  assert.ok(chips.length < 8 && chips.length >= 4);
  assert.deepEqual(flowChips(['一个特别特别长的标签'], 200, m), [], '单个超宽标签不画');
});
