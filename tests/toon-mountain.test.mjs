import test from 'node:test';
import assert from 'node:assert/strict';
import { toonMountain, TOON_MOUNTAIN } from '../src/ui/stage/organic.js';
import { createMountains, MOUNTAIN_ROWS, MOUNTAIN_NIGHT } from '../src/ui/stage/atmosphere.js';

const faces = (g) => {
  const c = g.attributes.color.array, p = g.attributes.position, out = [];
  for (let f = 0; f < p.count; f += 3) out.push({ cy: (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3, c: [...c.slice(f * 3, f * 3 + 9)] });
  return out;
};

test('卡通远山：非索引平面着色，每个面三点同色', () => {
  const g = toonMountain({ seed: 9 });
  assert.equal(g.index, null);
  for (const { c } of faces(g)) for (let j = 3; j < 9; j++) assert.equal(c[j], c[j % 3]);
});

test('卡通远山：山顶是浅色峰帽，山脚比山腰深，山尖在 0.8 以上', () => {
  const g = toonMountain({ seed: 9 });
  g.computeBoundingBox();
  assert.ok(g.boundingBox.max.y > .8);
  const lum = (c) => c[0] + c[1] + c[2];
  const fs = faces(g);
  const caps = fs.filter((f) => f.cy > TOON_MOUNTAIN.capAt), feet = fs.filter((f) => f.cy < TOON_MOUNTAIN.footAt), mid = fs.filter((f) => f.cy > .35 && f.cy < .6);
  assert.ok(caps.length > 0 && feet.length > 0 && mid.length > 0);
  const avg = (a) => a.reduce((s, f) => s + lum(f.c), 0) / a.length;
  assert.ok(avg(caps) > avg(mid) * 1.15, '峰帽明显更亮');
  assert.ok(avg(feet) < avg(mid), '山脚更深');
});

test('远山：两排 6 座，同种子结果一致，深色皮肤乘夜色', () => {
  const a = createMountains({ dark: false }), b = createMountains({ dark: false });
  assert.equal(a.object.children.length, MOUNTAIN_ROWS.length);
  assert.deepEqual([...a.object.children[0].geometry.attributes.position.array.slice(0, 30)], [...b.object.children[0].geometry.attributes.position.array.slice(0, 30)]);
  assert.equal(a.object.children[0].material.color.getHexString(), 'ffffff');
  a.object.userData.tint({ dark: true });
  assert.equal('#' + a.object.children[0].material.color.getHexString(), MOUNTAIN_NIGHT);
});
