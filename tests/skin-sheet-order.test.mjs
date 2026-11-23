// 皮肤抽屉（第 70 轮）：默认宣纸排第一，免费皮肤在前、Pro 皮肤在后，Pro 卡标题用圆体不用宋体。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FREE_THEMES, isFreeTheme } from '../src/ui/skins.js';

const app = await readFile(new URL('../src/ui/app.js', import.meta.url), 'utf8');
const ids = [...app.slice(app.indexOf('export const THEMES = ['), app.indexOf('];', app.indexOf('export const THEMES = ['))).matchAll(/id: '(\w+)'/g)].map((m) => m[1]);

test('皮肤抽屉顺序：宣纸第一，免费在前、Pro 在后', () => {
  assert.equal(ids.length, 5);
  assert.equal(ids[0], 'paper');
  const firstPaid = ids.findIndex((id) => !isFreeTheme(id));
  assert.deepEqual(ids.slice(0, firstPaid).sort(), [...FREE_THEMES].sort());
  assert.ok(ids.slice(firstPaid).every((id) => !isFreeTheme(id)));
});

test('皮肤抽屉 Pro 卡：圆体标题与厚边', async () => {
  const css = await readFile(new URL('../src/styles/paywall.css', import.meta.url), 'utf8');
  const title = /\.skin-pro-card b \{([^}]*)\}/.exec(css)[1];
  assert.match(title, /var\(--font-round/);
  assert.doesNotMatch(title, /--font-display/);
  assert.match(/\.skin-pro-card \{([^}]*)\}/.exec(css)[1], /box-shadow: 0 3px 0/);
});
