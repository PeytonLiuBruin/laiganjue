// 红线：两块水中青石上各立一枚刻谷纹的玉璧，一根红线穿过两璧。
// 牵线时由松到紧、绷直回弹，线心浮出一颗红心（指定发光），小心形缓缓上飘，上方悬一枚剪纸「囍」。
import { THREE, MAT, plinth, textTexture, damp, backOut, clamp, ease } from './common.js';
import { taperedTube } from '../organic.js';

function biGeometry() {
  const profile = [[.13, 0], [.14, -.032], [.4, -.045], [.43, -.02], [.43, .02], [.4, .045], [.14, .032], [.13, 0]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.LatheGeometry(profile, 72); g.rotateX(Math.PI / 2); return g;
}
function heartGeometry(size = .1) {
  const s = new THREE.Shape(), k = size;
  s.moveTo(0, -k * .9);
  s.bezierCurveTo(-k * 1.35, -k * .05, -k * 1.05, k * 1.1, 0, k * .42);
  s.bezierCurveTo(k * 1.05, k * 1.1, k * 1.35, -k * .05, 0, -k * .9);
  const g = new THREE.ExtrudeGeometry(s, { depth: k * .35, bevelEnabled: true, bevelThickness: k * .25, bevelSize: k * .18, bevelSegments: 4, curveSegments: 24 });
  g.center(); return g;
}

export default {
  camera: { position: [0, .25, 7.1], target: [0, -.3, 0], fov: 30 },
  fog: [9, 26],
  waterY: -1.08,
  build(api) {
    const { world, glow } = api;
    const jade = MAT.jade('#2f9a72'), jadeLight = MAT.jade('#4fb88d'), gold = MAT.gold();
    const bi = biGeometry(), grain = new THREE.SphereGeometry(.014, 10, 8), rim = new THREE.TorusGeometry(.43, .012, 8, 96);
    const holes = [];
    [-1.18, 1.18].forEach((x, i) => {
      const base = plinth(api, { x, z: .05, radius: .58, height: .42, seed: 12 + i, top: -.86, scaleZ: .85 });
      world.add(base);
      const stand = new THREE.Mesh(new THREE.BoxGeometry(.42, .1, .2), MAT.wood(null, '#7a4a2a')); stand.position.set(x, -.81, .05);
      const g = new THREE.Group(); g.position.set(x, -.33, .05); g.rotation.y = x < 0 ? .38 : -.38;
      g.add(new THREE.Mesh(bi, jade), new THREE.Mesh(rim, gold));
      const dots = new THREE.InstancedMesh(grain, jadeLight, 72), m = new THREE.Matrix4();
      let k = 0;
      for (const side of [1, -1]) for (const [r, n] of [[.2, 12], [.27, 12], [.34, 12]]) for (let j = 0; j < n; j++) {
        const a = j / n * Math.PI * 2 + r * 7;
        m.makeTranslation(Math.cos(a) * r, Math.sin(a) * r, side * (.036 - (r - .14) * .03)); dots.setMatrixAt(k++, m);
      }
      g.add(dots);
      world.add(api.shadows(stand), api.shadows(g));
      holes.push(g);
    });

    const red = MAT.silk('#d3352d');
    const line = new THREE.Mesh(new THREE.BufferGeometry(), red); line.castShadow = true; world.add(line);
    world.updateMatrixWorld(true);
    const ends = holes.map((g) => g.localToWorld(new THREE.Vector3(0, .14, 0)));
    let lastSag = -1;
    const mid = new THREE.Vector3();
    function rebuild(sag, sway) {
      if (Math.abs(sag - lastSag) < .002 && !sway) return;
      lastSag = sag;
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const u = i / 16, p = ends[0].clone().lerp(ends[1], u);
        p.y -= Math.sin(u * Math.PI) * sag; p.z += Math.sin(u * Math.PI) * (.1 + sway);
        pts.push(p);
      }
      mid.copy(pts[8]);
      line.geometry.dispose();
      line.geometry = taperedTube(new THREE.CatmullRomCurve3(pts), .016, { radial: 8, segments: 64 });
    }

    const heart = new THREE.Mesh(heartGeometry(.11), new THREE.MeshPhysicalMaterial({ color: '#e33b43', roughness: .25, clearcoat: 1, clearcoatRoughness: .1, emissive: '#ff5a6a', emissiveIntensity: 0 }));
    heart.visible = false; world.add(heart);
    glow.add('heart', { object: heart, materials: [heart.material], color: '#ff6b7c', size: .9, base: .05, peak: .9 });
    const smallHearts = Array.from({ length: 4 }, (_, i) => {
      const m = new THREE.Mesh(heartGeometry(.045), new THREE.MeshStandardMaterial({ color: '#ff8fa0', roughness: .4, transparent: true, opacity: 0 }));
      m.userData.phase = i / 4; world.add(m); return m;
    });
    const xi = new THREE.Mesh(new THREE.PlaneGeometry(.62, .62), new THREE.MeshStandardMaterial({ map: textTexture('囍', { size: 210, color: '#d22b2b' }), transparent: true, alphaTest: .4, side: THREE.DoubleSide, roughness: .7 }));
    xi.position.set(0, .95, -.2); xi.visible = false; xi.castShadow = true; world.add(xi);

    api.lilies({ pads: [[.15, 1.3, .3], [-.6, 2.0, .22], [2.0, 1.1, .26]] });
    api.reeds({ spots: [[-2.7, api.water.y, -1.4], [2.8, api.water.y, -1.7]], perSpot: 14, height: 1.15 });
    api.mountains();
    const petals = api.particles('petals', { count: 30, box: [7, 3.4, 4], center: [0, .4, .4] });
    api.particles('dust', { count: 20, box: [6, 3, 3], center: [0, .3, .5] });

    let mix = 0, tight = 0, snapT = -1;
    const hero = holes.map((object) => ({ object, pivot: -.45 }));
    return {
      hero,
      onState(prev, next) {
        if (next.revealed && !prev.revealed) { petals.burst([0, 0, .2], .6); api.water.ripple(0, .6, .6); }
      },
      update(dt, t, s) {
        const since = s.active ? t - (s.since || 0) : 0;
        const target = s.active ? ease(since / 1.5) : s.revealed ? 1 : 0;
        tight = s.active ? target : damp(tight, target, 3, dt);
        if (s.active && since > 1.2 && snapT < 0) snapT = t;
        if (!s.active && !s.revealed) snapT = -1;
        const late = snapT > 0 ? t - snapT : 9;
        const snap = Math.sin(late * 18) * Math.exp(-late * 5) * .08;
        const sway = Math.sin(t * 1.4) * .02 * api.wind.strength + (s.active && since < 1.2 ? Math.sin(since * 16) * .03 * (1 - since / 1.2) : 0);
        rebuild(.62 * (1 - tight) + .04 + snap, sway);
        mix = damp(mix, s.revealed ? 1 : 0, s.revealed ? 2.5 : 6, dt);
        const hk = clamp((tight - .7) / .3);
        heart.visible = hk > .01;
        heart.position.copy(mid).add(new THREE.Vector3(0, .05, .1));
        heart.scale.setScalar(Math.max(.001, backOut(hk)) * (1 + .05 * Math.sin(t * 3.2) * mix));
        heart.rotation.y = Math.sin(t * .9) * .35;
        glow.set('heart', mix * (.75 + .25 * Math.sin(t * 3.2)));
        smallHearts.forEach((m, i) => {
          const k = (t * .32 + m.userData.phase) % 1;
          m.visible = mix > .02;
          m.position.set(mid.x + (i - 1.5) * .32 + Math.sin(k * 6 + i) * .05, mid.y + .15 + k * 1.1, mid.z + .15);
          m.rotation.y = t * 1.2 + i; m.material.opacity = mix * Math.sin(k * Math.PI) * .9;
        });
        xi.visible = mix > .02;
        xi.scale.setScalar(Math.max(.001, backOut(mix)));
        xi.rotation.y = Math.sin(t * .7) * .25;
        xi.position.y = .95 + Math.sin(t * 1.1) * .03;
      },
    };
  },
};
