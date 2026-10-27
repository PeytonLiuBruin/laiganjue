// 结果条卡通化（第 42 轮）：眉标圆体粗字，四个玩法的速览放进描边厚边白卡
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/styles/toon-receipt.css', import.meta.url), 'utf8');
const index = await readFile(new URL('../src/styles/index.css', import.meta.url), 'utf8');

test('样式入口引入 toon-receipt.css，并排在模块样式之后的卡通层里', () => {
  const at = index.indexOf("'./toon-receipt.css'");
  assert.ok(at > 0);
  assert.ok(at > index.indexOf("'./toon-sections.css'") && at < index.indexOf("'./contrast.css'"));
});

test('眉标改圆体 800，字距不再拉开', () => {
  const rule = css.match(/\.ritual-kicker\s*\{([^}]*)\}/)[1];
  assert.match(rule, /font:\s*800/);
  const ls = Number(rule.match(/letter-spacing:\s*([\d.]+)em/)[1]);
  assert.ok(ls <= 0.06, `字距 ${ls}em`);
});

test('姻缘、财运、事业、星座的速览都是 2px 描边加厚边的卡片，标签圆体 800', () => {
  for (const cls of ['yy-quick', 'cy-quick', 'sy-quick', 'zd-quick']) assert.ok(css.includes(`.${cls}`), cls);
  const card = css.match(/\.m-zodiac \.zd-quick\)\s*\{([^}]*)\}/)[1];
  assert.match(card, /border:\s*2px solid/);
  assert.match(card, /box-shadow:\s*0 4px 0/);
  assert.match(css, /qlabel\)\s*\{[^}]*font:\s*800/);
  assert.match(css, /border-top:\s*2px dashed/);
});
