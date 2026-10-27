import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 付费卡、皮肤单买卡开着时，「没有找到可恢复的购买」「购买没有完成」这类提示要在抽屉上面才看得见
test('提示层压在抽屉和屏保上面', () => {
  const css = readFileSync(new URL('../src/styles/components.css', import.meta.url), 'utf8');
  const toast = Number(/\.toast \{[^}]*z-index:\s*(\d+)/.exec(css)?.[1]);
  const kit = readFileSync(new URL('../src/ui/kit.js', import.meta.url), 'utf8');
  const sheetBase = Number(/el\.style\.zIndex = String\((\d+) \+ i \* 2\)/.exec(kit)?.[1]);
  assert.ok(sheetBase >= 200, '读到抽屉层级');
  assert.ok(toast > sheetBase + 20, `提示 z-index ${toast} 要高于叠起来的抽屉 ${sheetBase}+`);
  const zen = readFileSync(new URL('../src/styles/zen.css', import.meta.url), 'utf8');
  assert.ok(toast > Number(/z-index:\s*(\d+)/.exec(zen)?.[1]));
});
