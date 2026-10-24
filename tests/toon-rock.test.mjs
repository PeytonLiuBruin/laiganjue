import test from 'node:test';
import assert from 'node:assert/strict';
import { toonRock, TOON_ROCK } from '../src/ui/stage/organic.js';

const faceColors = (g) => {
  const c = g.attributes.color.array, out = [];
  for (let i = 0; i < c.length; i += 9) out.push([c[i], c[i + 1], c[i + 2], c[i + 3], c[i + 4], c[i + 5], c[i + 6], c[i + 7], c[i + 8]]);
  return out;
};
const isGreen = ([r, g, b]) => g > r * 1.2 && g > b * 1.2;

test('卡通石台：非索引平面着色，每个面三点同色（切面硬分界）', () => {
  const g = toonRock({ seed: 71, wetBelow: .16 });
  assert.equal(g.index, null);
  assert.equal(g.attributes.position.count % 3, 0);
  for (const f of faceColors(g)) {
    for (let j = 3; j < 9; j++) assert.equal(f[j], f[j % 3]);
  }
});

test('卡通石台：顶面是草地，侧面是暖沙岩，水线以下变深变冷', () => {
  const g = toonRock({ seed: 21, wetBelow: .16 });
  const pos = g.attributes.position, nrm = g.attributes.normal, faces = faceColors(g);
  let topGreen = 0, top = 0, side = 0, sideWarm = 0, wet = 0, wetBlue = 0;
  faces.forEach((c, i) => {
    const f = i * 3, cy = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3, ny = nrm.getY(f);
    if (ny > .8 && cy > .6) { top++; if (isGreen(c)) topGreen++; }
    else if (Math.abs(ny) < .5 && cy > .3 && cy < .5) { side++; if (c[0] > c[2] * 1.15 && !isGreen(c)) sideWarm++; }
    else if (cy < .05) { wet++; if (c[0] + c[1] + c[2] < 1.2 && c[2] / c[0] > .5) wetBlue++; }
  });
  assert.ok(top > 20 && topGreen / top > .95, `顶面草地 ${topGreen}/${top}`);
  assert.ok(side > 10 && sideWarm / side > .95, `侧面沙岩 ${sideWarm}/${side}`);
  assert.ok(wet > 10 && wetBlue / wet > .8, `水下变深变冷 ${wetBlue}/${wet}`);
});

test('卡通石台：同一种子结果一致，关掉草地时顶面不是绿色', () => {
  const a = toonRock({ seed: 5 }), b = toonRock({ seed: 5 });
  assert.deepEqual([...a.attributes.position.array.slice(0, 30)], [...b.attributes.position.array.slice(0, 30)]);
  const bare = faceColors(toonRock({ seed: 5, grass: 0 }));
  assert.equal(bare.filter(isGreen).length, 0);
  assert.ok(TOON_ROCK.detail <= 3, '低细分，切面要大');
});
