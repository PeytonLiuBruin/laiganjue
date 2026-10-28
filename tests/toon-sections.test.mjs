import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (p) => readFile(new URL(p, import.meta.url), 'utf8');
const css = await read('../src/styles/toon-sections.css');
const index = await read('../src/styles/index.css');
const baziView = await read('../src/modules/bazi/view.js');

test('玩法页小节卡通样式在模块样式之后、touch 之前引入', () => {
  const m = index.indexOf("'../modules/index.css'"), a = index.indexOf("'./toon-sections.css'"), t = index.indexOf("'./touch.css'");
  assert.ok(m > 0 && a > m && t > a);
});

test('八字五行条：饱和五行色，14px 描边厚边进度条，旺缺小标是胶囊', () => {
  assert.match(css, /\.m-bazi \{ --wx-木: #22c46c; --wx-火: #e8463c; --wx-土: #e0942a; --wx-金: #f2b318; --wx-水: #3a9cf0; \}/);
  assert.match(css, /\.bz-bar-track \{[^}]*height: 14px;[^}]*border: 2px solid[^}]*box-shadow: 0 3px 0/);
  assert.match(css, /\.bz-bar-tag \{[^}]*border: 2px solid[^}]*font: 800 12px/);
  assert.doesNotMatch(css, /letter-spacing: \.1[0-9]em/);
});

test('十神分布每行有「正财 ×2」小块，姻缘流年行是描边圆角条', () => {
  assert.match(baziView, /h\('b', \{ class: 'bz-ss-k' \}, `\$\{k\} ×\$\{n\}`\)/);
  assert.match(css, /\.yy-years li \{[^}]*border: 2px solid[^}]*border-radius: 12px/);
  assert.match(css, /\.yy-years li\.hot,[^{]*\{[^}]*box-shadow: 0 3px 0/);
});

test('首页 17 个玩法都有卡通图标：实色填充、2.4 深色描边，卡上图标底座带描边厚边', async () => {
  const art = await read('../src/ui/ritual-art.js');
  const list = await read('../src/modules/list.js');
  const ids = [...list.matchAll(/id: '([a-z]+)'/g)].map((m) => m[1]).filter((id) => !['life', 'east', 'west', 'japan', 'play'].includes(id));
  assert.equal(ids.length, 17);
  for (const id of ids) assert.match(art, new RegExp(`\\n  ${id}: `), `缺少 ${id} 图标`);
  assert.match(art, /stroke: '#2b2240', strokeWidth: 2\.4/);
  assert.doesNotMatch(art, /fill-opacity="\.(0\d|1\d)"/, '不再用 8% 到 19% 的淡填充');
  assert.match(css, /\.tile \.ritual-art \{[^}]*border: 2px solid[^}]*box-shadow: 0 3px 0/);
});

test('风水罗盘页读数圆体 900，方位字距不超过 .06em，转向按钮与九宫格描边厚边', async () => {
  const css = await readFile(new URL('../src/styles/toon-sections.css', import.meta.url), 'utf8');
  assert.match(css, /\.m-fengshui \.fs-deg \{[^}]*font: 900/);
  const dir = css.match(/\.m-fengshui \.fs-dir \{([^}]*)\}/)[1];
  assert.match(dir, /font: 800/);
  assert.ok(parseFloat(dir.match(/letter-spacing: ([.\d]+)em/)[1]) <= .06);
  assert.match(css, /\.m-fengshui \.fs-turn \.btn \{[^}]*border: 2px solid[^}]*box-shadow: 0 3px 0/);
  assert.match(css, /\.m-fengshui \.fs-cell \{[^}]*border: 2px solid[^}]*box-shadow: 0 3px 0/);
});
