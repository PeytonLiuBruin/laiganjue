import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { widgetDay, dayKey, buildTable } from '../scripts/widget-data.mjs';
import { almanacSummary } from '../src/core/lunar.js';
import { routeFromUrl } from '../src/ui/deeplink.js';
import { MODULES } from '../src/modules/registry.js';

const file = new URL('../ios/App/LaiganjueWidget/almanac.json', import.meta.url);

test('小组件黄历：条目与 App 内黄历一致', () => {
  const d = new Date(2026, 9, 24, 12);
  const a = almanacSummary(d);
  const w = widgetDay(d);
  assert.equal(dayKey(d), '2026-10-24');
  assert.equal(w.l, a.lunarText);
  assert.equal(w.w, a.week);
  assert.deepEqual(w.y, a.yi.slice(0, 4));
  assert.deepEqual(w.j, a.ji.slice(0, 4));
  assert.ok(w.g.startsWith(a.yearGanZhi));
});

test('小组件黄历：打包的数据覆盖今天起至少 2 年，且逐日连续', async () => {
  const { v, days } = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(v, 1);
  const d = new Date(); d.setHours(12, 0, 0, 0);
  for (let i = 0; i < 730; i++, d.setDate(d.getDate() + 1)) assert.ok(days[dayKey(d)], `缺少 ${dayKey(d)}，运行 node scripts/widget-data.mjs 重新生成`);
  const sample = buildTable(new Date(2027, 1, 6), 0.01);
  for (const [k, v2] of Object.entries(sample)) assert.deepEqual(days[k], v2, `${k} 与当前农历库算出的不一致，需要重新生成`);
});

test('小组件的两个链接都能打开对应玩法', async () => {
  const mods = Array.isArray(MODULES) ? Object.fromEntries(MODULES.map((m) => [m.id, m])) : MODULES;
  assert.deepEqual(routeFromUrl('laiganjue://m/almanac', mods), { hash: '#/m/almanac' });
  assert.deepEqual(routeFromUrl('laiganjue://m/qian', mods), { hash: '#/m/qian' });
});

test('锁屏小组件：iOS 16 起加三种锁屏尺寸，每种尺寸都设了 containerBackground（iOS 17 必需）', async () => {
  const src = await readFile(new URL('../ios/App/LaiganjueWidget/LaiganjueWidget.swift', import.meta.url), 'utf8');
  for (const f of ['accessoryInline', 'accessoryCircular', 'accessoryRectangular']) assert.match(src, new RegExp(`\\.${f}`), f);
  assert.match(src, /supportedFamilies\(almanacFamilies\)/);
  assert.equal((src.match(/containerBackground\(for: \.widget\)/g) || []).length, 2, '主屏与锁屏各一处');
  const view = await readFile(new URL('../ios/App/LaiganjueWidget/AlmanacWidgetView.swift', import.meta.url), 'utf8');
  assert.match(view, /struct AlmanacLockView/);
});
