// 静观屏保卡通化（第 71 轮）：表盘几何不互相压住，样式不再用宋体细字、大字距与渐变时间字。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ZEN_TOON as T } from '../src/ui/zen.js';

const css = await readFile(new URL('../src/styles/zen.css', import.meta.url), 'utf8');
const rule = (sel) => {
  const m = new RegExp(`(^|\\n)${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(css);
  assert.ok(m, `缺少规则 ${sel}`);
  return m[2];
};

test('表盘几何：内盘、八卦、色带、时辰章、外沿由内到外不重叠', () => {
  const trigramHalf = 2.4;
  assert.ok(T.core < T.bagua - trigramHalf, '八卦压到内盘');
  assert.ok(T.bagua + trigramHalf < T.band, '八卦压到色带虚线');
  assert.ok(T.band < T.branch - T.chip, '时辰圆章压到色带虚线');
  assert.ok(T.branch + T.chip < T.plate, '时辰圆章伸出表盘');
  assert.ok(T.plate + T.coin <= 50, '金币超出 viewBox');
  assert.equal(T.coinFill, '#ffc93c');
});

test('时间字：圆体 900、纯色，不用渐变裁字，字号跟表盘走', () => {
  const time = rule('.zen-time');
  assert.match(time, /var\(--font-round/);
  assert.match(time, /font-weight: 900/);
  assert.doesNotMatch(time, /background-clip|linear-gradient|transparent/);
  assert.match(time, /var\(--zr\)/);
});

test('屏保里的字不再用宋体、字距不超过 .1em', () => {
  assert.doesNotMatch(css, /--font-serif|--font-display|--font-latin-display/);
  for (const m of css.matchAll(/letter-spacing: ([\d.]+)em/g)) assert.ok(Number(m[1]) <= 0.1, `字距 ${m[1]}em 过大`);
});

test('表盘与胶囊描边加厚边，发丝细环去掉', () => {
  assert.match(rule('.zen-plate'), /stroke-width: 0\.8/);
  assert.match(rule('.zen-plate-edge'), /var\(--edge-color\)/);
  for (const sel of ['.zen-lunar,\n.zen-yiji', '.zen-hint']) {
    const body = rule(sel);
    assert.match(body, /border: 2px solid/);
    assert.match(body, /box-shadow: 0 3px 0/);
  }
  assert.doesNotMatch(css, /\.zen-circle|\.zen-tick/);
});

test('表盘直径按可用高度收小，给刘海和底部横条留位置', () => {
  assert.match(css, /--zr: min\(92vw, 620px, calc\(100vh - 380px - var\(--safe-top, 0px\) - var\(--safe-bottom, 0px\)\)\)/);
  assert.match(rule('.zen-info'), /top: calc\(50% \+ var\(--zr\) \/ 2 \+ 12px\)/);
});
