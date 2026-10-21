// 摇钱树：水中石上一只釉红花盆描金「福」，盘曲的树干撑起几百片叶子组成的树冠，红绳挂满方孔铜钱。
// 摇动时整棵树弹性摆动、叶子落下、铜钱一枚枚蹦进盆里；揭晓后铜钱泛出淡淡金光（指定发光），金尘升起。
import { THREE, MAT, plinth, textTexture, spring, damp, clamp, ease } from './common.js';
import { taperedTube, leafGeometry, coinGeometry, woodTexture, canvasTexture, FONT, rng } from '../organic.js';

function coinFace() {
  return canvasTexture(256, 256, (c, w) => {
    const g = c.createRadialGradient(w * .4, w * .35, 10, w / 2, w / 2, w * .55); g.addColorStop(0, '#ffe7a6'); g.addColorStop(1, '#d9a040');
    c.fillStyle = g; c.fillRect(0, 0, w, w);
    c.strokeStyle = '#a8701f'; c.lineWidth = 10; c.beginPath(); c.arc(w / 2, w / 2, w * .44, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 8; c.strokeRect(w * .35, w * .35, w * .3, w * .3);
    c.fillStyle = '#9a6418'; c.font = `900 52px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    [['招', .5, .2], ['进', .5, .8], ['财', .2, .5], ['宝', .8, .5]].forEach(([ch, x, y]) => c.fillText(ch, w * x, w * y));
  });
}

export default {
  camera: { position: [0, .4, 7.5], target: [0, .1, 0], fov: 31 },
  fog: [9, 27],
  waterY: -1.2,
  build(api) {
    const { world, glow } = api;
    world.add(plinth(api, { radius: 1.0, height: .5, seed: 44, top: -.97 }));
    // 花盆
    const potGeo = new THREE.LatheGeometry([[0, 0], [.3, 0], [.38, .05], [.45, .17], [.47, .3], [.44, .38], [.47, .4], [.5, .43], [.47, .45], [.4, .44], [0, .44]].map(([x, y]) => new THREE.Vector2(x, y)), 64);
    const pot = new THREE.Mesh(potGeo, MAT.ceramic('#c4362e')); pot.position.y = -.97; world.add(api.shadows(pot));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.49, .022, 10, 64), MAT.gold()); rim.rotation.x = Math.PI / 2; rim.position.y = -.97 + .43; world.add(rim);
    const band = new THREE.Mesh(new THREE.TorusGeometry(.375, .012, 8, 64), MAT.gold()); band.rotation.x = Math.PI / 2; band.position.y = -.97 + .05; world.add(band);
    const fu = new THREE.Mesh(new THREE.PlaneGeometry(.24, .24), new THREE.MeshStandardMaterial({ map: textTexture('福', { size: 190, color: '#f3c768' }), transparent: true, metalness: .8, roughness: .3 }));
    fu.position.set(0, -.97 + .22, .465); fu.rotation.x = -.08; world.add(fu);
    const soil = new THREE.Mesh(new THREE.CircleGeometry(.43, 40), MAT.matte('#5a3a24')); soil.rotation.x = -Math.PI / 2; soil.position.y = -.97 + .41; soil.receiveShadow = true; world.add(soil);

    // 树：盘曲树干与几根主枝，整体放在可摆动的 group 里
    const tree = new THREE.Group(); tree.position.y = -.56; world.add(tree);
    const bark = woodTexture('#6e4a2f', 45); bark.wrapS = bark.wrapT = THREE.RepeatWrapping; bark.repeat.set(2, 3);
    const barkMat = MAT.wood(bark, '#9a7356');
    tree.add(new THREE.Mesh(taperedTube([[0, 0, 0], [.07, .35, .02], [-.06, .75, -.02], [.03, 1.15, 0]], (t) => .1 - t * .05, { radial: 14, segments: 40, bark: .22, seed: 46 }), barkMat));
    [[[0, .72, 0], [-.2, .92, .03], [-.36, 1.12, -.06]], [[0, .8, 0], [.2, .98, .02], [.34, 1.14, -.04]], [[.02, 1.1, 0], [.03, 1.28, -.08], [0, 1.4, -.1]], [[0, .9, 0], [-.05, 1.0, .12], [-.14, 1.12, .2]]].forEach((pts, i) => {
      tree.add(new THREE.Mesh(taperedTube(pts, (t) => .045 - t * .025, { radial: 8, segments: 16, bark: .15, seed: 50 + i }), barkMat));
    });
    // 树冠：几团叶簇，每片叶子朝外、带随机翻转与色差
    const clusters = [[-.44, 1.08, -.12, .36], [.42, 1.1, -.1, .36], [0, 1.4, -.14, .4], [-.24, .92, .1, .3], [.26, .94, .12, .3], [0, 1.14, .16, .34]];
    const LEAVES = 560, r = rng(77);
    const leafMesh = new THREE.InstancedMesh(leafGeometry({ length: .15, width: .065, fold: .4, bend: .3 }), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: .55, metalness: 0 }), LEAVES);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const greens = ['#4f9a3c', '#5fae45', '#3f8a3a', '#78bf4f', '#6aa83f', '#97c95a'].map((c) => new THREE.Color(c));
    for (let i = 0; i < LEAVES; i++) {
      const [cx, cy, cz, cr] = clusters[i % clusters.length];
      n.set(r() * 2 - 1, r() * 1.6 - .5, r() * 2 - 1).normalize();
      p.set(cx, cy, cz).addScaledVector(n, cr * (.55 + r() * .5));
      q.setFromUnitVectors(up, n.clone().add(new THREE.Vector3((r() - .5) * .8, .3, (r() - .5) * .8)).normalize());
      q.multiply(new THREE.Quaternion().setFromAxisAngle(up, r() * Math.PI * 2));
      s.setScalar(.75 + r() * .55);
      m.compose(p, q, s); leafMesh.setMatrixAt(i, m);
      const c = greens[Math.floor(r() * greens.length)].clone(); c.offsetHSL(0, 0, (n.y + .2) * .06 + (n.z > 0 ? .03 : -.04));
      leafMesh.setColorAt(i, c);
    }
    tree.add(leafMesh);
    api.shadows(tree, true, true);

    // 铜钱：正反面有钱文，侧边是金
    const face = coinFace();
    const coinMats = [new THREE.MeshStandardMaterial({ map: face, metalness: .85, roughness: .32, emissive: '#ffcf70', emissiveMap: face, emissiveIntensity: 0 }), MAT.gold()];
    const coinGeo = coinGeometry({ r: .095, hole: .026, depth: .018 });
    const stringMat = MAT.silk('#cf3a30');
    const stringGeo = new THREE.CylinderGeometry(.005, .005, .14, 5); stringGeo.translate(0, -.07, 0);
    const coins = [];
    for (let i = 0; i < 12; i++) {
      const [cx, cy, cz, cr] = clusters[i % clusters.length];
      const a = i * 2.4 + .4, hang = new THREE.Vector3(cx + Math.cos(a) * cr * .75, cy - cr * .6, cz + .24 + Math.sin(a) * .08);
      const holder = new THREE.Group(); holder.position.copy(hang); tree.add(holder);
      const str = new THREE.Mesh(stringGeo, stringMat); holder.add(str);
      const coin = new THREE.Mesh(coinGeo, coinMats); coin.position.y = -.2; coin.castShadow = true;
      const falls = i % 3 === 0;
      if (falls) world.add(coin); else holder.add(coin);
      coins.push({ coin, holder, falls, phase: i * 1.3, ground: new THREE.Vector3((i % 5 - 2) * .14, -.97 + .43, .1 + (i % 2) * .1), str });
    }
    glow.add('coins', { materials: [coinMats[0]], color: '#ffcf70', base: 0, peak: .55 });

    api.lilies({ pads: [[1.35, 1.1, .3], [-1.6, 1.4, .26], [1.9, .25, .2]] });
    api.reeds({ spots: [[-2.6, api.water.y, -1.3], [2.7, api.water.y, -1.6]], perSpot: 12, height: 1.1 });
    api.mountains();
    const leaves = api.particles('leaves', { count: 22, box: [7, 3.4, 4], center: [0, .5, .4] });
    const motes = api.particles('motes', { count: 26, box: [3.4, 2.6, 2], center: [0, .2, .2], glow: true });

    const sway = spring(0), sway2 = spring(0);
    let mix = 0, fallT = 0;
    const tmp = new THREE.Vector3();
    return {
      onState(prev, next) {
        if (next.active && !prev.active) { sway.v += 1.6; api.wind.blow(1); leaves.burst([0, .6, 0], .8); }
        if (next.revealed && !prev.revealed) motes.burst([0, -.4, .2], 1);
      },
      update(dt, t, st) {
        const since = st.active ? t - (st.since || 0) : 0;
        let force = api.wind.sway(0, 1.2) * .03;
        if (st.active && since < 1.4) force += Math.sin(since * 13) * .09 * (1 - since / 1.4);
        tree.rotation.z = sway.step(force, 22, 3.2, dt);
        tree.rotation.x = sway2.step(Math.sin(t * .9) * .012 * api.wind.strength, 16, 3, dt);
        fallT = st.active ? clamp((since - .25) / 1.2) : st.revealed ? 1 : damp(fallT, 0, 8, dt);
        tree.updateMatrixWorld(true);
        coins.forEach((c, i) => {
          const swing = Math.sin(t * (st.active ? 9 : 1.4) + c.phase) * (st.active ? .35 : .12);
          if (!c.falls) { c.holder.rotation.z = swing - tree.rotation.z; c.coin.rotation.y = Math.sin(t * .8 + c.phase) * .6; return; }
          c.holder.rotation.z = swing;
          const local = clamp(fallT * 1.4 - (i % 4) * .12);
          c.str.visible = local <= 0;
          c.holder.localToWorld(tmp.set(0, -.2, 0));
          if (local <= 0) { c.coin.position.copy(tmp); c.coin.rotation.set(0, Math.sin(t * .8 + c.phase) * .6, swing); return; }
          c.coin.position.lerpVectors(tmp, c.ground, ease(local));
          c.coin.position.y += Math.sin(local * Math.PI) * .32;
          if (local >= 1) c.coin.rotation.set(-Math.PI / 2 + .35, 0, i);
          else c.coin.rotation.set(local * 9, local * 6, 0);
        });
        mix = damp(mix, st.revealed ? 1 : 0, 2.5, dt);
        glow.set('coins', mix * (.65 + .35 * Math.sin(t * 2.2)));
      },
    };
  },
};
