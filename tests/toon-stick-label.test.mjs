// 第 72 轮：灵签 2D 舞台里掉出来的签加粗、签号改描边胶囊，抽屉标题改圆体 900 收字距。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STICK_IN, STICK_FREE, LABEL_CHIP } from '../src/ui/stick-scene.js';

test('掉出来的签比筒里的签至少粗一倍，签头更长', () => {
  assert.ok(STICK_FREE.w >= STICK_IN.w * 2);
  assert.ok(STICK_FREE.d >= STICK_IN.d * 2);
  assert.ok(STICK_FREE.tip > STICK_IN.tip);
});

test('签号胶囊是描边厚边、圆体粗字、至少 14px 字号', () => {
  assert.ok(LABEL_CHIP.size >= 14);
  assert.ok(LABEL_CHIP.line >= 2 && LABEL_CHIP.edge >= 3);
  assert.ok(LABEL_CHIP.h >= LABEL_CHIP.size + 8);
  const src = await_read('src/ui/stick-scene.js');
  return src.then((s) => {
    assert.match(s, /labelChip\(c, p\.project/);
    assert.doesNotMatch(s, /size:14,color:'#2b2240',weight:800,stroke:'#ffffff'/);
  });
});

test('抽屉标题圆体 900、字距不超过 .02em', async () => {
  const css = await readFile(new URL('../src/styles/playful.css', import.meta.url), 'utf8');
  const rule = css.match(/\.sheet-head \.sheet-title \{([^}]*)\}/);
  assert.ok(rule, '缺少 .sheet-head .sheet-title 规则');
  assert.match(rule[1], /font-weight: 900/);
  assert.match(rule[1], /letter-spacing: \.02em/);
});

function await_read(rel) { return readFile(new URL('../' + rel, import.meta.url), 'utf8'); }
