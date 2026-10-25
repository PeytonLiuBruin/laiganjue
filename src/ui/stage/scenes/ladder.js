// 青云梯：木梯从水中石上斜伸进一团蓬松的云，横档用麻绳扎结。
// 排盘时横档自下而上逐级变成金色并微微发光（指定发光），每级弹一下；顶端亮起金星与「青云」金字。
import { THREE, MAT, plinth, textTexture, damp, backOut, clamp, ease } from './common.js';
import { taperedTube, cloudGeometry, woodTexture } from '../organic.js';

function starGeometry(r = .16) {
  const s = new THREE.Shape();
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? r * .32 : r; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? s.lineTo(x, y) : s.moveTo(x, y); }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: r * .18, bevelEnabled: true, bevelThickness: r * .12, bevelSize: r * .08, bevelSegments: 3 }); g.center(); return g;
}

export const LADDER_STAR = { radius: .24, sway: .45, glowPeak: .5 };

export default {
  // 第 24 轮：揭晓时顶端金星随放大 1.08 顶到 ndc.y 0.99，相机后退并抬高看点，给过冲留余量（scripts/stage-frame.mjs 检查）
  camera: { position: [0, .6, 8.1], target: [0, .5, 0], fov: 31 },
  fog: [9, 27],
  pivot: -.96, // 动作弹性的不动点：石台顶面
  waterY: -1.18,
  build(api) {
    const { world, glow } = api;
    world.add(plinth(api, { x: -.3, z: .15, radius: .9, height: .5, seed: 33, top: -.96 }));
    const grain = woodTexture('#b06d3a', 34); grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.repeat.set(1, 4);
    const railMat = MAT.wood(grain, '#f0cfae');
    const base = new THREE.Vector3(-.45, -.95, .2), top = new THREE.Vector3(.5, 1.32, -.5);
    const dir = top.clone().sub(base), side = new THREE.Vector3(.95, 0, .3).normalize().multiplyScalar(.3);
    const along = (u) => base.clone().addScaledVector(dir, u);
    for (const sgn of [-1, 1]) {
      const pts = [0, .33, .66, 1.04].map((u, i) => along(u).addScaledVector(side, sgn).add(new THREE.Vector3(0, 0, (i % 2 ? .015 : -.01) * sgn)));
      const rail = new THREE.Mesh(taperedTube(pts.map((p) => p.toArray()), (t) => .048 - t * .01, { radial: 10, segments: 40, bark: .07, seed: 40 + sgn }), railMat);
      world.add(api.shadows(rail));
    }
    const rungs = [], RUNGS = 7, ropeMat = MAT.matte('#e3c38a');
    const binding = new THREE.TorusGeometry(.05, .012, 6, 16);
    for (let i = 0; i < RUNGS; i++) {
      const u = (i + .6) / (RUNGS + .4);
      const a = along(u).addScaledVector(side, -1.08), b = along(u).addScaledVector(side, 1.08);
      const mat = new THREE.MeshStandardMaterial({ color: '#a8703f', roughness: .7, metalness: 0, emissive: '#ffc85a', emissiveIntensity: 0 });
      const rung = new THREE.Mesh(taperedTube([a.toArray(), a.clone().lerp(b, .5).add(new THREE.Vector3(0, -.012, 0)).toArray(), b.toArray()], .034, { radial: 8, segments: 10, bark: .05, seed: i }), mat);
      const holder = new THREE.Group(); holder.add(rung);
      for (const e of [a, b]) { const tie = new THREE.Mesh(binding, ropeMat); tie.position.copy(e).addScaledVector(side.clone().normalize(), e === a ? .06 : -.06); tie.lookAt(e.clone().add(dir)); holder.add(tie); }
      world.add(api.shadows(holder));
      glow.add('rung' + i, { materials: [mat], color: '#ffc85a', base: 0, peak: .7 });
      rungs.push({ holder, mat, center: a.clone().lerp(b, .5) });
    }
    // 云：顶端一团大云包住梯头，远处两团淡云
    const cloudMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
    const cloud = new THREE.Mesh(cloudGeometry({ seed: 5, puffs: [[0, 0, 0, .42], [-.42, -.08, .05, .3], [.42, -.06, -.02, .33], [-.15, .22, -.05, .3], [.22, .2, .08, .28], [.7, -.12, .1, .22], [-.72, -.14, -.05, .2], [.05, -.1, .3, .3]], flatBottom: -.2 }), cloudMat);
    cloud.position.copy(top).add(new THREE.Vector3(.02, .12, .06)); world.add(cloud);
    cloud.castShadow = true;
    const far1 = new THREE.Mesh(cloudGeometry({ seed: 8, puffs: [[0, 0, 0, .5], [-.6, -.1, 0, .35], [.6, -.08, 0, .38]], detail: 2 }), cloudMat); far1.position.set(-2.6, 1.2, -4); far1.scale.setScalar(1.3); world.add(far1);
    const far2 = new THREE.Mesh(cloudGeometry({ seed: 9, puffs: [[0, 0, 0, .45], [-.5, -.1, 0, .3], [.55, -.06, 0, .32]], detail: 2 }), cloudMat); far2.position.set(2.8, .7, -5.5); far2.scale.setScalar(1.5); world.add(far2);
    // 揭晓：金星（指定发光）与「青云」金字
    // 第 24 轮：金星原来是金属 0.8、发光峰值 1.4、整圈自转，揭晓时多半侧对镜头，只剩一道发白的细条。
    // 改为不透明饱和金 #ffc93c 哑光（卡通着色负责分段明暗）、放大到 0.24、只左右摆 ±0.45 弧度，发光峰值压到 0.5
    const starMat = new THREE.MeshStandardMaterial({ color: '#ffc93c', metalness: 0, roughness: 1, emissive: '#ffb020', emissiveIntensity: 0 });
    const star = new THREE.Mesh(starGeometry(LADDER_STAR.radius), starMat); star.position.copy(top).add(new THREE.Vector3(.05, .74, .2)); star.visible = false; world.add(star);
    glow.add('star', { object: star, materials: [starMat], color: '#ffd27a', size: 1.0, base: .1, peak: LADDER_STAR.glowPeak });
    const textMat = new THREE.MeshStandardMaterial({ map: textTexture('青云', { w: 512, h: 256, size: 170, color: '#ffc93c', stroke: '#8a3a10' }), transparent: true, metalness: .3, roughness: .4, emissive: '#ffcf70', emissiveIntensity: 0 });
    textMat.emissiveMap = textMat.map;
    const words = new THREE.Mesh(new THREE.PlaneGeometry(.9, .45), textMat); words.position.copy(top).add(new THREE.Vector3(.02, .1, .78)); words.visible = false; world.add(words);
    glow.add('words', { materials: [textMat], color: '#ffcf70', base: 0, peak: .35 });

    api.lilies({ pads: [[1.3, 1.1, .3], [1.9, .3, .22]] });
    api.reeds({ spots: [[-2.4, api.water.y, -.9], [2.6, api.water.y, -1.5]], perSpot: 12, height: 1.15 });
    api.mountains();
    api.particles('dust', { count: 34, box: [6, 3.6, 3], center: [0, .8, .2] });
    const motes = api.particles('motes', { count: 18, box: [3, 3, 2], center: [.1, .4, 0], glow: true });

    let mix = 0, lit = 0;
    const hero = api.gather({ except: [far1, far2] });
    return {
      hero,
      onState(prev, next) { if (next.revealed && !prev.revealed) motes.burst([top.x, top.y, top.z], .8); },
      update(dt, t, s) {
        const since = s.active ? t - (s.since || 0) : 0;
        lit = s.active ? ease(since / 1.8) : damp(lit, s.revealed ? 1 : 0, 3, dt);
        rungs.forEach((r, i) => {
          const k = clamp(lit * RUNGS - i), hop = k > 0 && k < 1 ? Math.sin(k * Math.PI) * .05 : 0;
          r.holder.position.y = hop;
          r.mat.color.set('#a8703f').lerp(new THREE.Color('#f1b94a'), k);
          r.mat.metalness = k * .75; r.mat.roughness = .7 - k * .4;
          glow.set('rung' + i, (k > 0 && k < 1 ? .9 : k * .25));
        });
        cloud.position.y = top.y + .12 + Math.sin(t * .6) * .025;
        cloud.rotation.y = Math.sin(t * .2) * .06;
        far1.position.x = -2.6 + Math.sin(t * .05) * .3; far2.position.x = 2.8 + Math.sin(t * .04 + 1) * .3;
        mix = damp(mix, s.revealed ? 1 : 0, 2.5, dt);
        const pop = Math.max(.001, backOut(mix));
        star.visible = words.visible = mix > .01;
        star.scale.setScalar(pop); star.rotation.y = Math.sin(t * 1.2) * LADDER_STAR.sway; star.rotation.z = Math.sin(t) * .1;
        words.scale.setScalar(pop);
        glow.set('star', mix * (.75 + .25 * Math.sin(t * 2.6)));
        glow.set('words', mix);
      },
    };
  },
};
