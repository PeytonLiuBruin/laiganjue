// 四柱命牌：水中长石上一方木台，四块命牌依次翻转亮出年月日时柱；台前一只铜香炉，三炷香的烟随风飘散。
// 香头的微红是唯一常亮的发光处；排盘时命牌翻转，落定后天干地支按五行着色。
import { THREE, MAT, RoundedBoxGeometry, plinth, clamp, damp } from './common.js';
import { canvasTexture, woodTexture, softDot, FONT, rng } from '../organic.js';
import { pillarPose } from '../../models/geometry.js';

const WX = { 木: '#3f7a54', 火: '#b6463c', 土: '#8f6a2c', 金: '#5f7680', 水: '#3a6694' };
function drawTablet(c, w, h, entry, i, unknownHour) {
  c.clearRect(0, 0, w, h);
  c.fillStyle = '#f3e7cc'; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(120,80,40,.35)'; c.lineWidth = 6; c.strokeRect(14, 14, w - 28, h - 28);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#6b4a2a'; c.font = `700 34px ${FONT}`;
  c.fillText(entry?.label || ['年柱', '月柱', '日柱', '时柱'][i], w / 2, 70);
  const big = (txt, y, el) => { c.font = `900 ${unknownHour ? 80 : 118}px ${FONT}`; c.fillStyle = WX[el] || '#b08a52'; c.fillText(txt, w / 2, y); };
  big(entry?.gan || (unknownHour ? '未' : '·'), 205, entry?.ganElement);
  big(entry?.zhi || (unknownHour ? '知' : '·'), 345, entry?.zhiElement);
  c.fillStyle = '#6b4a2a'; c.font = `600 30px ${FONT}`;
  c.fillText(entry?.shiShen || (unknownHour ? '未计入' : ''), w / 2, 455);
}

export default {
  camera: { position: [0, .55, 7.5], target: [0, -.2, 0], fov: 30 },
  fog: [9, 26],
  waterY: -1.22,
  build(api) {
    const { world, glow } = api;
    world.add(plinth(api, { radius: 1.95, height: .5, seed: 111, top: -1.0, scaleZ: .5 }));
    const wood = MAT.wood(woodTexture('#6b3e22', 112), '#c79a76'), gold = MAT.gold();
    const deck = new THREE.Mesh(new RoundedBoxGeometry(3.0, .12, .72, 4, .04), wood); deck.position.y = -.94; world.add(api.shadows(deck));
    const trim = new THREE.Mesh(new RoundedBoxGeometry(3.04, .03, .76, 3, .012), gold); trim.position.y = -.875; world.add(trim);
    const tabletGeo = new RoundedBoxGeometry(.52, 1.5, .2, 4, .04);
    const capGeo = new RoundedBoxGeometry(.58, .07, .24, 3, .025);
    const tabMat = MAT.wood(null, '#efe1c2');
    const tablets = [0, 1, 2, 3].map((i) => {
      const g = new THREE.Group(); world.add(g);
      g.add(new THREE.Mesh(tabletGeo, tabMat));
      const top = new THREE.Mesh(capGeo, gold); top.position.y = .76; const bot = new THREE.Mesh(capGeo, gold); bot.position.y = -.76; g.add(top, bot);
      const tex = canvasTexture(320, 520, (c, w, h) => drawTablet(c, w, h, null, i, false));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(.46, .75 * 1.82), new THREE.MeshStandardMaterial({ map: tex, roughness: .8 })); face.position.z = .102; g.add(face);
      api.shadows(g, true, true);
      return { g, tex };
    });

    // 香炉与三炷香，香头微红发光
    const censer = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [.1, 0], [.12, .02], [.17, .07], [.19, .14], [.17, .18], [.19, .2], [.0, .2]].map(([x, y]) => new THREE.Vector2(x, y)), 48), MAT.bronze());
    censer.position.set(0, -.88, .25); world.add(api.shadows(censer));
    const emberMat = new THREE.MeshStandardMaterial({ color: '#4a1a10', emissive: '#ff5a2a', emissiveIntensity: .9, roughness: .8 });
    const tips = [];
    [-.05, 0, .05].forEach((x, i) => {
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .34, 6), MAT.matte('#8a3b2a')); stick.position.set(x, -.68 + i * .015, .25); stick.rotation.z = x * 1.4; world.add(stick);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(.01, 8, 6), emberMat); tip.position.set(x - Math.sin(x * 1.4) * .17, -.51 + i * .015, .25); world.add(tip); tips.push(tip.position);
    });
    glow.add('ember', { materials: [emberMat], color: '#ff6a33', base: .7, peak: 1.4 });
    // 香烟：柔和的烟团从香头升起、被风吹偏、慢慢变大变淡
    const SMOKE = 26, r = rng(113);
    const smokeTex = softDot(64, 0);
    const puffs = Array.from({ length: SMOKE }, (_, i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: '#e9e4dc', transparent: true, depthWrite: false, opacity: 0, fog: true }));
      world.add(sp); return { sp, age: r() * 4, life: 3.5 + r() * 1.5, src: i % 3, drift: r() * 6 };
    });

    api.reeds({ spots: [[-2.7, api.water.y, -1.2], [2.8, api.water.y, -1.6]], perSpot: 12, height: 1.1 });
    api.lilies({ pads: [[1.9, 1.15, .26], [-2.0, 1.3, .24]], flower: false });
    api.mountains();
    api.particles('dust', { count: 20, box: [6, 3, 3], center: [0, .2, .4] });

    let pillars = [], since = 0, duration = 2.4, active = false;
    function redraw(list) {
      const unknownHour = list.length === 3;
      tablets.forEach((tb, i) => tb.tex.userData.redraw((c, w, h) => drawTablet(c, w, h, list[i], i, unknownHour && i === 3)));
    }
    return {
      onState(prev, next) {
        if (next.pillars && next.pillars !== prev.pillars) { pillars = next.pillars; redraw(pillars); }
        if (next.duration) duration = next.duration;
        if (next.active && !prev.active) since = next.since;
        active = !!next.active;
      },
      update(dt, t, s) {
        const progress = active ? clamp((t - since) / duration) : 1;
        tablets.forEach((tb, i) => {
          const pose = pillarPose(i, progress);
          tb.g.quaternion.set(...pose.rotation);
          tb.g.position.set(pose.position[0] * .0105, -.12 + (pose.position[1] + 4) * .01, 0);
        });
        const w = api.wind;
        puffs.forEach((p) => {
          p.age += dt;
          if (p.age > p.life) { p.age = 0; p.drift = Math.random() * 6; }
          const k = p.age / p.life, src = tips[p.src];
          p.sp.position.set(src.x + w.dir.x * k * k * .9 + Math.sin(p.age * 1.3 + p.drift) * .06 * k, src.y + k * 1.1, src.z + w.dir.y * k * .4);
          p.sp.scale.setScalar(.05 + k * .38);
          p.sp.material.opacity = Math.sin(Math.min(1, k * 1.4) * Math.PI) * .32 * (1 - k * .5);
        });
        glow.set('ember', .55 + .35 * Math.sin(t * 3.1) * Math.sin(t * 1.7));
      },
    };
  },
};
