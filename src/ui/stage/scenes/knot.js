// 同心结：挂在梅枝上的两只丝编红环，镶金线，下坠方胜、玉珠与流苏。
// 风吹时轻摆，摇动时甩起，结成后亮出「缘」字金章（唯一发光处），花瓣飘落，水里有倒影与荷花。
import { THREE, MAT, RoundedBoxGeometry, tassel, textTexture, spring, damp, backOut, clamp } from './common.js';
import { braidedRing, taperedTube, petalGeometry, woodTexture } from '../organic.js';

function blossom(scale = 1, color = '#ffd3dc') {
  const g = new THREE.Group(), petal = petalGeometry({ length: .06, width: .05, cup: .7 });
  const mat = new THREE.MeshStandardMaterial({ color, roughness: .5, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(petal, mat); m.rotateZ(i / 5 * Math.PI * 2); m.rotateX(.5); g.add(m); }
  const c = new THREE.Mesh(new THREE.SphereGeometry(.014, 10, 8), new THREE.MeshStandardMaterial({ color: '#f2c14e', roughness: .6 }));
  c.position.z = .01; g.add(c); g.scale.setScalar(scale);
  return g;
}

export default {
  camera: { position: [0, .05, 7.3], target: [0, -.12, 0], fov: 31 },
  fog: [9, 26],
  waterY: -1.05,
  build(api) {
    const { world, glow } = api;
    const bark = woodTexture('#94603a', 12); bark.wrapS = bark.wrapT = THREE.RepeatWrapping; bark.repeat.set(1, 3);
    const barkMat = MAT.wood(bark, '#e2bfa0');
    const branchPts = [[-3.1, 2.05, -.5], [-2.1, 1.72, -.25], [-1.05, 1.5, -.06], [-.05, 1.46, 0], [.6, 1.56, .04], [1.15, 1.8, 0]];
    const branch = new THREE.Mesh(taperedTube(branchPts, (t) => .12 * (1 - t) + .022, { radial: 12, segments: 64, bark: .16, seed: 4 }), barkMat);
    const twigA = new THREE.Mesh(taperedTube([[-1.4, 1.55, -.1], [-1.25, 1.85, -.05], [-1.0, 2.05, 0]], (t) => .035 * (1 - t) + .008, { radial: 8, segments: 16 }), barkMat);
    const twigB = new THREE.Mesh(taperedTube([[.35, 1.5, .02], [.55, 1.32, .12], [.75, 1.26, .2]], (t) => .03 * (1 - t) + .008, { radial: 8, segments: 16 }), barkMat);
    world.add(api.shadows(branch), api.shadows(twigA), api.shadows(twigB));
    [[-1.0, 2.05, 0, 1.1], [-1.28, 1.8, .04, .9], [-2.3, 1.82, -.18, 1], [.75, 1.27, .22, 1], [.95, 1.66, .04, .95], [1.12, 1.8, .02, .8], [-.55, 1.5, .06, .85], [-1.75, 1.66, -.12, .75]].forEach(([x, y, z, s], i) => {
      const b = blossom(s, i % 3 ? '#ffd3dc' : '#fff1f3'); b.position.set(x, y, z + .02); b.rotation.set(.3 - i * .2, i * .9, i); world.add(b);
    });

    // 挂点在枝上，整只结绕挂点摆动
    const pivot = new THREE.Group(); pivot.position.set(-.05, 1.44, 0); world.add(pivot);
    const cordMesh = new THREE.Mesh(new THREE.CylinderGeometry(.011, .011, .64, 8), MAT.silk('#c8342c')); cordMesh.position.y = -.32; pivot.add(cordMesh);
    const loop = new THREE.Mesh(new THREE.TorusGeometry(.045, .011, 8, 20), MAT.silk('#c8342c')); loop.position.y = .01; pivot.add(loop);
    const body = new THREE.Group(); body.position.y = -.98; pivot.add(body);
    const ringGeo = braidedRing({ R: .28, r: .068, strands: 3, twists: 18, depth: .26 });
    const inlay = new THREE.TorusGeometry(.28, .0105, 8, 120);
    const gold = MAT.gold();
    [[-.165, .38, '#d8382f'], [.165, -.38, '#b92d2a']].forEach(([x, rot, color]) => {
      const holder = new THREE.Group(); holder.position.x = x; holder.rotation.y = rot;
      const ring = new THREE.Mesh(ringGeo, MAT.silk(color));
      const line = new THREE.Mesh(inlay, gold); line.position.z = .066;
      holder.add(ring, line); body.add(holder);
    });
    const diamond = new THREE.Group(); diamond.position.y = -.42; diamond.rotation.z = Math.PI / 4; body.add(diamond);
    diamond.add(new THREE.Mesh(new RoundedBoxGeometry(.25, .25, .05, 3, .02), gold));
    const dFront = new THREE.Mesh(new RoundedBoxGeometry(.2, .2, .085, 3, .025), MAT.silk('#d63a30')); diamond.add(dFront);
    const stud = new THREE.Mesh(new THREE.SphereGeometry(.028, 16, 12), gold); stud.position.z = .05; diamond.add(stud);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(.07, 24, 16), MAT.jade()); bead.position.y = -.68; body.add(bead);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.03, .04, .06, 16), gold); cap.position.y = -.77; body.add(cap);
    const tas = tassel({ length: .46, spread: .08, strands: 40, color: '#d23a31' }); tas.position.y = -.79; body.add(tas);
    api.shadows(pivot, true, false);

    // 「缘」字金章：金边、红地、金字，只有字面发光
    const medal = new THREE.Group(); medal.position.set(0, 0, .16); medal.visible = false; body.add(medal);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(.165, .165, .035, 48), gold); disc.rotation.x = Math.PI / 2; medal.add(disc);
    const enamel = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .04, 48), MAT.lacquer('#b32a26')); enamel.rotation.x = Math.PI / 2; medal.add(enamel);
    const tex = textTexture('缘', { size: 170, color: '#ffd67a' });
    const textMat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, metalness: .6, roughness: .3, emissive: '#ffcf70', emissiveMap: tex, emissiveIntensity: 0 });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(.23, .23), textMat); label.position.z = .022; medal.add(label);
    glow.add('medal', { object: medal, materials: [textMat], color: '#ffc46b', size: .55, base: 0, peak: 1.1 });
    const warm = new THREE.PointLight('#ff8f9a', 0, 2.2, 2); warm.position.set(0, -.1, .6); body.add(warm);

    api.lilies({ pads: [[1.45, 1.0, .34], [1.95, .35, .24], [-1.7, 1.25, .28], [-2.3, .2, .2]] });
    api.reeds({ spots: [[-2.6, api.water.y, -1.3], [2.7, api.water.y, -1.8]], perSpot: 14, height: 1.2 });
    api.mountains();
    const petals = api.particles('petals', { count: 34, box: [7, 3.6, 4], center: [0, .6, .4] });
    api.particles('dust', { count: 22, box: [6, 3, 3], center: [0, .3, .5] });

    const swing = spring(0), lag = spring(0);
    let mix = 0;
    const hero = pivot;
    return {
      hero,
      onState(prev, next) {
        if (next.active && !prev.active) { swing.v += 2.4; api.wind.blow(.9); }
        if (next.revealed && !prev.revealed) { petals.burst([0, .6, .2], .7); swing.v -= 1.2; }
      },
      update(dt, t, s) {
        const w = api.wind;
        let force = w.sway(0, 1.1) * .07;
        if (s.active) force += Math.sin((t - (s.since || 0)) * 10) * .16 * Math.exp(-(t - (s.since || 0)) * .6);
        pivot.rotation.z = swing.step(force, 18, 2.4, dt);
        pivot.rotation.x = Math.sin(t * .8) * .02 * w.strength;
        tas.rotation.z = lag.step(-swing.v * .08 + w.sway(1.2, 1.7) * .12, 14, 2, dt);
        tas.rotation.x = Math.sin(t * 1.3 + 1) * .05 * w.strength;
        mix = damp(mix, s.revealed ? 1 : 0, s.revealed ? 3 : 6, dt);
        const since = s.revealed ? t - (s.revealedAt || 0) : 9;
        const pop = s.revealed ? 1 + .08 * Math.sin(clamp(since / .55) * Math.PI) : 1;
        body.scale.setScalar(pop);
        medal.visible = mix > .01;
        medal.scale.setScalar(Math.max(.001, backOut(clamp(since / .6)) * mix));
        medal.rotation.y = Math.sin(t * .9) * .18;
        glow.set('medal', mix * (.8 + .2 * Math.sin(t * 2.2)));
        warm.intensity = mix * 1.6;
      },
    };
  },
};
