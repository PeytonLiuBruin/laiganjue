// 官印：水中平顶青石上铺一卷宣纸，玉印金钮挂红穗。
// 落印时抬起、蓄力、重重压下（压扁再弹回），纸上留下朱红印文，石边水面荡开涟漪，金尘（指定发光）四散。
import { THREE, MAT, RoundedBoxGeometry, plinth, tassel, spring, damp, clamp, ease, backOut, drawText } from './common.js';
import { canvasTexture, paperTexture, FONT, rng, taperedTube } from '../organic.js';

function stampTexture() {
  return canvasTexture(256, 256, (c) => drawStamp(c, '官印'));
}
function drawStamp(c, text) {
  const w = 256, r = rng(text.length * 7 + text.charCodeAt(0));
  const rr = (x, y, ww, hh, rad) => (c.roundRect ? c.roundRect(x, y, ww, hh, rad) : c.rect(x, y, ww, hh));
  c.clearRect(0, 0, w, w);
  c.fillStyle = '#c8281f';
  c.beginPath(); rr(14, 14, w - 28, w - 28, 18); c.fill();
  c.globalCompositeOperation = 'destination-out';
  c.lineWidth = 7; c.strokeStyle = '#000'; c.beginPath(); rr(34, 34, w - 68, w - 68, 10); c.stroke();
  c.font = `900 ${text.length > 1 ? 82 : 150}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  [...text].forEach((ch, i) => c.fillText(ch, w / 2, text.length > 1 ? 88 + i * 84 : w / 2));
  for (let i = 0; i < 260; i++) { c.globalAlpha = r() * .5; c.beginPath(); c.arc(r() * w, r() * w, r() * 2.2, 0, Math.PI * 2); c.fill(); }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
}

export default {
  camera: { position: [0, 1.25, 6.9], target: [0, -.5, 0], fov: 30 },
  fog: [9, 26],
  waterY: -1.18,
  build(api) {
    const { world, glow } = api;
    const base = plinth(api, { radius: 1.5, height: .55, seed: 21, top: -.93, scaleZ: .72, moss: .5 });
    world.add(base);
    // 宣纸：两端微翘，木轴金头
    const paperGeo = new THREE.PlaneGeometry(2.1, 1.22, 40, 4); paperGeo.rotateX(-Math.PI / 2);
    const pp = paperGeo.attributes.position;
    for (let i = 0; i < pp.count; i++) { const x = pp.getX(i); pp.setY(i, Math.max(0, Math.abs(x) - .85) ** 2 * .5); }
    paperGeo.computeVertexNormals();
    const paper = new THREE.Mesh(paperGeo, new THREE.MeshStandardMaterial({ map: paperTexture(), roughness: .95, side: THREE.DoubleSide }));
    paper.position.y = -.885; paper.receiveShadow = true; world.add(paper);
    const rodGeo = new THREE.CylinderGeometry(.045, .045, 1.34, 20); rodGeo.rotateX(Math.PI / 2);
    const gold = MAT.gold();
    for (const x of [-1.09, 1.09]) {
      const rod = new THREE.Mesh(rodGeo, MAT.wood(null, '#7b4a2b')); rod.position.set(x, -.85, 0); world.add(api.shadows(rod));
      for (const z of [-.69, .69]) { const capm = new THREE.Mesh(new THREE.SphereGeometry(.055, 16, 12), gold); capm.position.set(x, -.85, z); world.add(capm); }
    }
    // 朱红印文：落印后渐显，不发光
    const stampTex = stampTexture();
    const stamp = new THREE.Mesh(new THREE.PlaneGeometry(.62, .62), new THREE.MeshStandardMaterial({ map: stampTex, transparent: true, opacity: 0, roughness: .9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    stamp.rotation.x = -Math.PI / 2; stamp.position.y = -.882; world.add(stamp);

    // 玉印：圆角印身、金色底边与顶边、莲座圆钮、金环红穗
    const seal = new THREE.Group(); world.add(seal);
    const jade = MAT.jade('#3fae80');
    const bodyM = new THREE.Mesh(new RoundedBoxGeometry(.6, .42, .6, 5, .05), jade); bodyM.position.y = .29;
    const baseBand = new THREE.Mesh(new RoundedBoxGeometry(.66, .08, .66, 3, .03), gold); baseBand.position.y = .05;
    const topBand = new THREE.Mesh(new RoundedBoxGeometry(.56, .05, .56, 3, .02), gold); topBand.position.y = .52;
    // 鼻钮：金色阶台上立一道拱形钮，红绳穿过拱洞
    const dais = new THREE.Mesh(new RoundedBoxGeometry(.34, .07, .34, 3, .025), gold); dais.position.y = .575;
    const dais2 = new THREE.Mesh(new RoundedBoxGeometry(.24, .05, .24, 3, .02), gold); dais2.position.y = .63;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.085, .038, 16, 40, Math.PI), MAT.gold()); ring.position.y = .655;
    const ringMat = ring.material;
    const knob = new THREE.Group(); knob.add(dais, dais2);
    seal.add(bodyM, baseBand, topBand, knob, ring);
    const plateTex = canvasTexture(256, 256, (c) => { c.strokeStyle = 'rgba(20,70,45,.55)'; c.lineWidth = 6; c.strokeRect(22, 22, 212, 212); c.lineWidth = 2; c.strokeRect(38, 38, 180, 180); drawText(c, 256, 256, '印', { size: 120, color: 'rgba(20,70,45,.45)', weight: 700 }); });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(.5, .34), new THREE.MeshStandardMaterial({ map: plateTex, transparent: true, roughness: .4 }));
    plate.position.set(0, .29, .302); seal.add(plate);
    const cordM = new THREE.Mesh(taperedTube([[0, .72, 0], [.12, .7, .1], [.3, .6, .2], [.36, .5, .24]], .013, { radial: 6, segments: 20 }), MAT.silk('#cf3a30'));
    seal.add(cordM);
    const tas = tassel({ length: .3, spread: .05, strands: 28, color: '#d23a31' }); tas.position.set(.36, .48, .24); seal.add(tas);
    api.shadows(seal, true, true);
    glow.add('ring', { object: ring, materials: [ringMat], color: '#ffd27a', size: .45, base: 0, peak: .9 });

    api.reeds({ spots: [[-2.5, api.water.y, -1.1], [2.6, api.water.y, -1.6], [-1.9, api.water.y, .9]], perSpot: 12, height: 1.1 });
    api.lilies({ pads: [[1.9, 1.2, .26], [-2.1, 1.6, .22]], flower: false });
    api.mountains();
    const motes = api.particles('motes', { count: 30, box: [5, 2.6, 3], center: [0, 0, .3], glow: true });
    api.particles('dust', { count: 16, box: [6, 3, 3], center: [0, .2, .4] });

    let lift = .05, squash = spring(1), mix = 0, stampMix = 0, impacted = false, aside = 0;
    return {
      onState(prev, next) {
        if (next.active && !prev.active) { impacted = false; stampMix = 0; }
        if (next.level && next.level !== prev.level) stampTex.userData.redraw((c) => drawStamp(c, next.level === '上' ? '大吉' : '官印'));
        if (!next.active && !next.revealed) { stampMix = 0; impacted = false; }
      },
      update(dt, t, s) {
        const since = s.active ? t - (s.since || 0) : 9;
        if (s.active) {
          lift = since < .7 ? ease(since / .55) * .72 + .05 : Math.max(0, (1 - clamp((since - .7) / .25) ** 2) * .77);
          if (since > .95 && !impacted) {
            impacted = true; squash.v -= 3.2; stampMix = .01;
            api.shake(.035); api.water.ripple(-1.2, .9, 1); api.water.ripple(1.3, .7, .8);
            motes.burst([0, -.8, 0], 1); api.wind.blow(.4);
          }
        } else lift = damp(lift, .02 + Math.sin(t * 1.8) * .012, 4, dt);
        const k = squash.step(1, 140, 9, dt);
        // 揭晓后把印挪到一旁，露出整枚印文
        aside = damp(aside, s.revealed && !s.active ? 1 : 0, 3, dt);
        seal.position.set(.72 * aside, -.89 + lift * (1 - aside) + Math.sin(aside * Math.PI) * .35, -.18 * aside);
        seal.scale.set(2 - k, k, 2 - k);
        seal.rotation.y = Math.sin(t * .5) * .05 + (s.active && since < .7 ? Math.sin(since * 9) * .06 : 0);
        tas.rotation.z = Math.sin(t * 1.7) * .1 * api.wind.strength + (1 - k) * 2;
        if (impacted || s.revealed) stampMix = damp(stampMix, 1, 5, dt);
        stamp.material.opacity = stampMix;
        stamp.scale.setScalar(Math.max(.001, backOut(stampMix)));
        mix = damp(mix, s.revealed ? 1 : 0, 2.5, dt);
        glow.set('ring', mix * (.7 + .3 * Math.sin(t * 2.4)));
      },
    };
  },
};
