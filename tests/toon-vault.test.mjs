// 财库卡通化（第 26 轮）：内衬与金堆不再是近黑色，元宝是哑光饱和金
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VAULT_TOON } from '../src/ui/stage/scenes/vault.js';

const hsl = (hex) => { const o = {}; new THREE.Color(hex).getHSL(o, THREE.SRGBColorSpace); return o; };

test('内衬与金堆明度 ≥ 45%（原来的丝绒明度 18%，开库后箱口是一个黑洞）', () => {
  for (const k of ['lining', 'pile']) assert.ok(hsl(VAULT_TOON[k]).l >= .45, `${k} ${hsl(VAULT_TOON[k]).l.toFixed(2)}`);
});

test('元宝是饱和金色（色相 35° 到 55°，饱和度 ≥ 85%），发光峰值 ≤ 0.2', () => {
  const c = hsl(VAULT_TOON.ingot);
  assert.ok(c.h * 360 >= 35 && c.h * 360 <= 55, `色相 ${(c.h * 360).toFixed(0)}`);
  assert.ok(c.s >= .85);
  assert.ok(VAULT_TOON.glowPeak <= .2);
});
