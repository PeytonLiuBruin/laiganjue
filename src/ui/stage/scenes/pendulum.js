// 灵摆：水中石上一面圆木盘，刻「是 / 否」；青铜曲臂垂下细链，链端一枚多面紫晶。
// 拖动或倾斜时灵摆跟着走（state.x / state.y），得出结果时对应的字亮起（指定发光），紫晶也泛光。
import { THREE, MAT, plinth, damp, clamp } from './common.js';
import { taperedTube, canvasTexture, woodTexture, FONT } from '../organic.js';

function drawBoard(c, w, highlight = null, glowOnly = false) {
  const cx = w / 2;
  c.clearRect(0, 0, w, w);
  if (!glowOnly) {
    c.fillStyle = 'rgba(0,0,0,0)';
    c.strokeStyle = 'rgba(60,32,12,.75)';
    for (const [r, lw] of [[.47, 5], [.43, 2], [.28, 2], [.12, 3]]) { c.lineWidth = lw; c.beginPath(); c.arc(cx, cx, w * r, 0, Math.PI * 2); c.stroke(); }
    c.lineWidth = 2; c.beginPath(); c.moveTo(cx, w * .07); c.lineTo(cx, w * .93); c.moveTo(w * .07, cx); c.lineTo(w * .93, cx); c.stroke();
    for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2; c.lineWidth = i % 6 ? 1.2 : 2.4; c.beginPath(); c.moveTo(cx + Math.cos(a) * w * .43, cx + Math.sin(a) * w * .43); c.lineTo(cx + Math.cos(a) * w * (i % 6 ? .45 : .465), cx + Math.sin(a) * w * (i % 6 ? .45 : .465)); c.stroke(); }
  }
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `900 ${w * .15}px ${FONT}`;
  const label = (t, x, y, kind) => {
    const on = highlight === kind;
    if (glowOnly && !on) return;
    c.fillStyle = glowOnly ? '#ffffff' : on ? '#c8281f' : '#2e1a0b'; c.fillText(t, x, y);
  };
  label('是', cx, w * .2, 'yes'); label('是', cx, w * .8, 'yes'); label('否', w * .2, cx, 'no'); label('否', w * .8, cx, 'no');
}

export default {
  camera: { position: [0, 2.3, 6.1], target: [0, -.35, 0], fov: 32 },
  fog: [9, 26],
  waterY: -1.16,
  build(api) {
    const { world, glow } = api;
    world.add(plinth(api, { radius: 1.45, height: .5, seed: 91, top: -.94, scaleZ: .8 }));
    const board = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.18, .09, 96), MAT.wood(woodTexture('#a0683a', 92), '#d8b08a'));
    board.position.y = -.885; world.add(api.shadows(board));
    const faceTex = canvasTexture(1024, 1024, (c, w) => drawBoard(c, w));
    const glowTex = canvasTexture(1024, 1024, (c, w) => drawBoard(c, w, null, true));
    const faceMat = new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: .7, emissive: '#ffb347', emissiveMap: glowTex, emissiveIntensity: 0, polygonOffset: true, polygonOffsetFactor: -1 });
    const face = new THREE.Mesh(new THREE.CircleGeometry(1.12, 96), faceMat); face.rotation.x = -Math.PI / 2; face.position.y = -.838; world.add(face);
    glow.add('label', { materials: [faceMat], color: '#ffb347', base: 0, peak: 1.1 });
    const bronze = MAT.bronze(), gold = MAT.gold();
    const anchor = new THREE.Vector3(0, 1.2, 0);
    const arm = new THREE.Mesh(taperedTube([[1.02, -.84, -.62], [1.06, .2, -.62], [1.0, 1.0, -.5], [.6, 1.3, -.22], [0, 1.28, 0]], (t) => .055 - t * .025, { radial: 12, segments: 60, bark: .04, seed: 93 }), bronze);
    world.add(api.shadows(arm));
    const finial = new THREE.Mesh(new THREE.SphereGeometry(.05, 16, 12), gold); finial.position.set(0, 1.28, 0); world.add(finial);
    const LINKS = 30, linkGeo = new THREE.TorusGeometry(.022, .006, 6, 14);
    const chain = new THREE.InstancedMesh(linkGeo, gold, LINKS); chain.castShadow = true; world.add(chain);
    const bob = new THREE.Group(); world.add(bob);
    const crystalMat = new THREE.MeshPhysicalMaterial({ color: '#b98cf2', roughness: .05, metalness: 0, transmission: .55, thickness: .35, ior: 1.55, flatShading: true, clearcoat: 1, emissive: '#c9a6ff', emissiveIntensity: 0 });
    const gem = new THREE.Mesh(new THREE.LatheGeometry([[0, -.24], [.1, .0], [.115, .04], [.07, .1], [0, .12]].map(([x, y]) => new THREE.Vector2(x, y)), 8), crystalMat);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, .04, 16), gold); cap.position.y = .13;
    bob.add(gem, cap); api.shadows(bob, true, false);
    glow.add('gem', { object: bob, materials: [crystalMat], color: '#c9a6ff', size: .7, base: .05, peak: .9 });

    api.reeds({ spots: [[-2.6, api.water.y, -1.4], [2.7, api.water.y, -2.0]], perSpot: 12, height: 1.05 });
    api.lilies({ pads: [[-1.9, 1.1, .26], [2.0, .9, .22]] });
    api.mountains();
    api.particles('dust', { count: 22, box: [6, 3, 3], center: [0, .2, .3] });
    api.particles('motes', { count: 14, box: [3, 2.2, 2], center: [0, -.2, 0], glow: true, colors: ['#d9c6ff'] });

    const L = 1.66, pos = new THREE.Vector3(), cur = { x: 0, y: 0 };
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
    let lastResult, mix = 0;
    return {
      onState(prev, next) {
        if (next.result !== lastResult) {
          lastResult = next.result;
          const hl = next.result === 'yes' || next.result === 'no' ? next.result : null;
          faceTex.userData.redraw((c, w) => drawBoard(c, w, hl));
          glowTex.userData.redraw((c, w) => drawBoard(c, w, hl, true));
        }
      },
      update(dt, t, s) {
        const idle = !s.active && !s.glow ? Math.sin(t * .9) * .05 * api.wind.strength : 0;
        cur.x = damp(cur.x, clamp(s.x || 0, -1, 1) + idle, 10, dt); cur.y = damp(cur.y, clamp(s.y || 0, -1, 1), 10, dt);
        const dx = cur.x * .62, dz = cur.y * .55;
        pos.set(dx, anchor.y - Math.sqrt(Math.max(.01, L * L - dx * dx - dz * dz)), dz);
        bob.position.copy(pos);
        dir.copy(anchor).sub(pos).normalize();
        bob.quaternion.setFromUnitVectors(up, dir);
        bob.rotateY(t * .4);
        const top = pos.clone().addScaledVector(dir, .15);
        for (let i = 0; i < LINKS; i++) {
          const u = (i + .5) / LINKS; const p = top.clone().lerp(anchor, u);
          q.setFromUnitVectors(up, dir); q.multiply(new THREE.Quaternion().setFromAxisAngle(up, i % 2 ? Math.PI / 2 : 0));
          m.compose(p, q, sc); chain.setMatrixAt(i, m);
        }
        chain.instanceMatrix.needsUpdate = true;
        mix = damp(mix, s.glow ? 1 : 0, 3, dt);
        glow.set('label', mix * (.75 + .25 * Math.sin(t * 2.5)));
        glow.set('gem', Math.max(mix, s.active ? .35 + .2 * Math.sin(t * 5) : 0));
      },
    };
  },
};
