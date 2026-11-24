import test from 'node:test';
import assert from 'node:assert/strict';
import { coinLayout, COIN_VIEW } from '../src/modules/liuyao/coins.js';
import { rotate, supportHeight, projectSolidPoint } from '../src/core/solids.js';

// 第 74 轮：钱盘落定后三枚铜钱原来挤在盘子下三分之一（ground .78），上面一大片空绿。
// 落定的铜钱整体应落在盘子中部，上下留白大致相当。
function restingBox(width, height) {
  let top = Infinity, bottom = -Infinity;
  for (const coin of coinLayout()) {
    const z = supportHeight(coin.mesh, coin.q, coin.size);
    for (const face of coin.mesh) for (const vertex of face.points) {
      const p = rotate(vertex, coin.q).map(n => n * coin.size);
      p[0] += coin.x; p[1] += coin.y; p[2] += z;
      const [, y] = projectSolidPoint(p, width, height, COIN_VIEW.ground, COIN_VIEW.worldWidth);
      top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
  }
  return { top, bottom };
}

test('resting coins sit around the middle of phone-sized money trays', () => {
  for (const [width, height] of [[215, 302], [252, 344], [224, 310]]) {
    const { top, bottom } = restingBox(width, height);
    const center = (top + bottom) / 2 / height;
    assert(center > .42 && center < .62, `coin cluster centre ${center.toFixed(2)} at ${width}×${height}`);
    assert(height - bottom > 40, `coins hug the tray bottom at ${width}×${height}: ${(height - bottom).toFixed(0)}px left`);
  }
});

test('money tray ground stays high enough for the strongest throw', () => {
  assert(COIN_VIEW.ground >= .62 && COIN_VIEW.ground <= .66);
});

test('dark skins give the hexagram board an opaque surface so stars behind it do not show through', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../src/styles/toon-props.css', import.meta.url), 'utf8');
  const rule = css.match(/:is\(\[data-theme='ink'\], \[data-theme='cinnabar'\], \[data-theme='nebula'\]\) \.m-liuyao \.ly-board \{([^}]*)\}/);
  assert(rule, 'dark-skin board rule missing');
  assert.match(rule[1], /background:\s*var\(--surface-strong\)/);
});
