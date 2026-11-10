// 读屏名字：开关、选项组、器物画布、玩法页标题都要有读屏能念的名字（第 45 轮 axe-core 审计发现）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSolidScene } from '../src/ui/solid-scene.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('开关组件接受 label 并写成 aria-label', () => {
  assert.match(read('src/ui/kit.js'), /export function toggle\(on, onChange, label = ''\)[\s\S]{0,400}'aria-label': label/);
});

test('设置页每个开关都有名字：行内开关取行标题，单独的开关显式给名字', () => {
  const app = read('src/ui/app.js');
  assert.match(app, /control\?\.getAttribute\('role'\) === 'switch' && !control\.hasAttribute\('aria-label'\)\) control\.setAttribute\('aria-label', label\)/);
  assert.match(app, /hp\.settle\(\); \}, '震动反馈'\)/);
  assert.match(app, /sw\.setAttribute\('aria-label', '连续天数提醒'\)/);
  assert.match(app, /storage\.set\('zen\.auto', v\), '闲置后自动进入屏保'\)/);
  // 其余两个开关放在 row() 里，由行标题命名；新增开关时这里的数目会提醒补名字
  assert.match(app, /row\('音效', '[^']+', toggle\(/);
  assert.match(app, /row\('帧率显示', '[^']+', toggle\(/);
  assert.equal((app.match(/\btoggle\(/g) || []).length, 5, '设置页开关数目变了：新开关要么放进 row()，要么传第三个参数作名字');
});

test('选项组（如 标准 / 大 / 特大）带 role=group 与组名', () => {
  assert.match(read('src/ui/kit.js'), /attrs: label \? \{ role: 'group', 'aria-label': label \} : \{\}/);
  assert.match(read('src/ui/app.js'), /label: '闲置几分钟后进入屏保'/);
});

test('玩法页顶栏标题是一级标题，首页不是（首页正文有自己的一级标题）', () => {
  const app = read('src/ui/app.js');
  assert.match(app, /if \(meta\) \{ titleEl\.setAttribute\('role', 'heading'\); titleEl\.setAttribute\('aria-level', '1'\); \}/);
  assert.match(app, /else \{ titleEl\.removeAttribute\('role'\); titleEl\.removeAttribute\('aria-level'\); \}/);
});

test('抽屉正文可被键盘聚焦以滚动，点按不画框', () => {
  assert.match(read('src/ui/kit.js'), /class: 'sheet-body', attrs: \{ tabindex: '0' \}/);
  const css = read('src/styles/refinement.css');
  assert.match(css, /\.sheet-body:focus \{ outline: none; \}/);
  assert.match(css, /\.sheet-body:focus-visible \{ outline: 2px solid/);
});

test('器物画布重摆时恢复玩法给的描述，不留下没名字的 role=img', (t) => {
  const attrs = new Map([['aria-label', '两枚朱红色月牙筊杯'], ['role', 'img']]);
  const fakes = {
    ResizeObserver: class { constructor(cb) { this.cb = cb; } observe() { this.cb(); } disconnect() {} },
    window: { devicePixelRatio: 1 },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  };
  const prev = Object.fromEntries(Object.keys(fakes).map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  for (const [k, value] of Object.entries(fakes)) Object.defineProperty(globalThis, k, { value, configurable: true });
  t.after(() => { for (const [k, d] of Object.entries(prev)) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } });
  const canvas = { dataset: {}, getContext: () => null, getBoundingClientRect: () => ({ width: 350, height: 360 }), removeAttribute: (k) => attrs.delete(k), getAttribute: (k) => attrs.get(k) ?? null, setAttribute: (k, v) => attrs.set(k, v) };
  const scene = createSolidScene(canvas, { addCleanup() {}, platform: {} });
  attrs.set('aria-label', '落定：圣杯');
  scene.set([]);
  assert.equal(attrs.get('aria-label'), '两枚朱红色月牙筊杯');
  scene.dispose?.();
});
