// 阅读字号：设置里三档（标准 / 大 / 特大），只放大解读抽屉与结果条，抽屉滚动容器本身不缩放
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const css = read('src/styles/text-size.css');
const app = read('src/ui/app.js');

test('样式入口引入 text-size.css', () => {
  assert.match(read('src/styles/index.css'), /@import '\.\/text-size\.css';/);
});

test('大 1.12 倍、特大 1.25 倍，作用在抽屉子元素、结果卡、页面结果条（不含按钮）', () => {
  for (const [size, zoom] of [['lg', '1.12'], ['xl', '1.25']]) {
    const block = css.split('}').find((b) => b.includes(`[data-text-size="${size}"] .sheet-body > *`));
    assert.ok(block, `${size} 规则存在`);
    assert.match(block, new RegExp(`zoom: ${zoom.replace('.', '\\.')}`));
    assert.match(block, new RegExp(`\\[data-text-size="${size}"\\] \\.ritual-receipt > :not\\(\\.ritual-receipt-actions\\)`));
    assert.match(block, new RegExp(`\\[data-text-size="${size}"\\] \\.result,`));
  }
  // 滚动容器本身缩放会让抽屉高度跟着变大、超出屏幕
  assert.doesNotMatch(css, /\.sheet-body\s*[,{]/);
});

test('不叠乘：抽屉里的结果卡与设置抽屉不再额外缩放', () => {
  assert.match(css, /\.sheet-body > \* \.result,\s*\n:root\[data-text-size\] \.sheet-body > \.settings-body \{ zoom: 1; \}/);
});

test('启动时按存储设置 data-text-size，非法值回到标准', () => {
  assert.match(app, /const TEXT_SIZES = \['normal', 'lg', 'xl'\];/);
  assert.match(app, /document\.documentElement\.dataset\.textSize = TEXT_SIZES\.includes\(textSize\) \? textSize : 'normal';/);
});

test('设置页有「阅读字号」三档与示例句，设置抽屉内容带 settings-body', () => {
  assert.match(app, /row\('阅读字号', '[^']+', kit\.chips\(\[\{ value: 'normal', label: '标准' \}, \{ value: 'lg', label: '大' \}, \{ value: 'xl', label: '特大' \}\]/);
  assert.match(app, /storage\.set\('text\.size', v\)/);
  assert.match(app, /class: 'text-size-sample'/);
  assert.match(app, /\{ class: 'settings-body' \}/);
});
