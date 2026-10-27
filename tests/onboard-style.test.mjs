import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/styles/playful.css', import.meta.url), 'utf8');
const rule = (sel) => { const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}')); return m ? m[1] : ''; };

test('首次引导卡：金币图标带深棕描边与厚边，圆体粗标题', () => {
  const mark = rule('.onboard-mark');
  assert.match(mark, /border: 3px solid #8a3a10/);
  assert.match(mark, /box-shadow: 0 4px 0 #8a3a10/);
  assert.match(mark, /text-shadow:/, '感字要有描边');
  assert.match(rule('.onboard-title'), /font-weight: 900/);
});

test('首次引导三行图标是三色描边方块，白字四向描边', () => {
  const g = rule('.onboard-glyph');
  assert.match(g, /color: #fff/);
  assert.match(g, /text-shadow: 1\.5px 0 0 var\(--g-ink\), -1\.5px 0 0 var\(--g-ink\), 0 1\.5px 0 var\(--g-ink\), 0 -1\.5px 0 var\(--g-ink\)/);
  assert.match(css, /\.onboard-row:nth-child\(2\) \.onboard-glyph \{ --g: #3d8bff/);
  assert.match(css, /\.onboard-row:nth-child\(3\) \.onboard-glyph \{ --g: #9b6bff/);
});
