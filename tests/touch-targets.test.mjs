// 触控目标 44pt：touch.css 必须是样式入口的最后一层，并为常用小控件补齐 44px。
// 逐页的实际尺寸用 `node scripts/tap-audit.mjs` 在浏览器里检查（第 30 轮全部 21 个页面为 0 个）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('touch.css 在样式入口最后引入，后面没有别的层覆盖它', () => {
  const imports = read('src/styles/index.css').split('\n').filter((l) => /^@import/.test(l.trim()));
  assert.match(imports.at(-1), /touch\.css/);
});

test('图标按钮、小号按钮、芯片与收窄过的按钮都不小于 44px', () => {
  const css = read('src/styles/touch.css');
  const rule = (sel) => {
    const i = css.indexOf(sel + ' {');
    assert.ok(i >= 0, `缺少 ${sel}`);
    return css.slice(i, css.indexOf('}', i));
  };
  assert.match(rule('.icon-btn'), /width: 44px; height: 44px/);
  assert.match(rule('.btn.small'), /min-height: 44px/);
  assert.match(rule('.chip'), /min-height: 44px; min-width: 44px/);
  assert.match(rule('.view-module .motion-entry > .btn, .motion-banner .btn'), /min-height: 44px/);
  assert.match(rule('.pw-legal a'), /min-height: 44px/);
});

test('伪元素扩出的点按区域加上外观尺寸达到 44，且相邻元素不重叠', () => {
  const css = read('src/styles/touch.css');
  const inset = (sel) => {
    const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '::before \\{[^}]*inset: (-?[\\d.]+)(?:px)? (-?[\\d.]+)(?:px)?').exec(css);
    assert.ok(m, `缺少 ${sel}::before`);
    return [-Number(m[1]), -Number(m[2])];
  };
  // 开关 48×28
  const [sv, sh] = inset('.switch');
  assert.ok(28 + 2 * sv >= 44 && 48 + 2 * sh >= 44);
  // 黄历宜忌标签 36 高、两字 43 宽，行距 8、列距 4
  const [cv, ch] = inset('.m-almanac .al-chip');
  assert.ok(36 + 2 * cv >= 44 && 43 + 2 * ch >= 44);
  assert.ok(2 * cv <= 8 && 2 * ch <= 4, '黄历标签的点按区域不能和相邻标签重叠');
  // 六爻每爻 40 高、行距 4
  const [lv] = inset('.m-liuyao .ly-line');
  assert.ok(40 + 2 * lv >= 44 && 2 * lv <= 4);
});
