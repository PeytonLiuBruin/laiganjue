// 罗盘：水中平石上放一方漆木托盘，金边圆盘刻二十四山、八卦、八方，天池里一根磁针。
// 盘面随手机朝向转动（state.angle），针尖的红色是唯一的发光处。
import { THREE, MAT, RoundedBoxGeometry, plinth, damp } from './common.js';
import { canvasTexture, FONT, woodTexture } from '../organic.js';
import { DIRECTIONS, MOUNTAINS } from '../../../modules/fengshui/data.js';

// 第 26 轮：盘面卡通化。原来是米色渐变底 + 120 道细刻度 + 40 到 50px 细字，俯视角下在手机上糊成一片。
// 改为四圈纯色色带（朱红刻度圈、奶油二十四山、青绿八卦、亮金八方）配深棕粗分隔线，字放大加粗，八卦符号白字深描边
export const COMPASS_FACE = {
  ink: '#3a2410', red: '#d8402e', cream: '#fff4d8', jade: '#22a88f', gold: '#ffc93c', navy: '#2a3a6e',
  // 各圈外半径（占盘面半径的比例），由外到内
  bands: [1, .86, .64, .47, .27],
  line: 8, // 色带分隔线宽（贴图 1024 下的像素）
  font: { mountain: 66, trigram: 66, direction: 54 },
};

export function drawFace(c, w) {
  const F = COMPASS_FACE, cx = w / 2, R = w / 2 - 4, [b0, b1, b2, b3, b4] = F.bands.map((k) => k * R);
  const disc = (r, color) => { c.fillStyle = color; c.beginPath(); c.arc(cx, cx, r, 0, Math.PI * 2); c.fill(); };
  disc(b0, F.red); disc(b1, F.cream); disc(b2, F.jade); disc(b3, F.gold); disc(b4, F.navy);
  c.strokeStyle = F.ink; c.lineWidth = F.line;
  for (const r of [b0 - F.line / 2, b1, b2, b3, b4]) { c.beginPath(); c.arc(cx, cx, r, 0, Math.PI * 2); c.stroke(); }
  const spoke = (n, r0, r1, off = .5) => { for (let i = 0; i < n; i++) { const a = (i + off) / n * Math.PI * 2 - Math.PI / 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * r1, cx + Math.sin(a) * r1); c.stroke(); } };
  c.lineWidth = F.line / 2; spoke(24, b2, b1); spoke(8, b4, b2);
  // 外圈：每山一枚奶油色粗刻度，四正方位换成金色圆点
  c.lineCap = 'round';
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2 - Math.PI / 2, mid = (b0 + b1) / 2, x = cx + Math.cos(a) * mid, y = cx + Math.sin(a) * mid;
    if (i % 6 === 0) { c.fillStyle = F.gold; c.beginPath(); c.arc(x, y, 15, 0, Math.PI * 2); c.fill(); c.lineWidth = 4; c.strokeStyle = F.ink; c.stroke(); continue; }
    c.strokeStyle = F.cream; c.lineWidth = 9; c.beginPath();
    c.moveTo(cx + Math.cos(a) * (mid - 16), cx + Math.sin(a) * (mid - 16)); c.lineTo(cx + Math.cos(a) * (mid + 16), cx + Math.sin(a) * (mid + 16)); c.stroke();
  }
  c.lineCap = 'butt';
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  const ring = (labels, r, size, color, outline) => labels.forEach((t, i) => {
    const a = i / labels.length * Math.PI * 2;
    c.save(); c.translate(cx + Math.sin(a) * r, cx - Math.cos(a) * r); c.rotate(a);
    c.font = `900 ${size}px ${FONT}`;
    if (outline) { c.strokeStyle = outline; c.lineWidth = 10; c.strokeText(t, 0, 0); }
    c.fillStyle = typeof color === 'function' ? color(i) : color; c.fillText(t, 0, 0); c.restore();
  });
  ring(MOUNTAINS, (b1 + b2) / 2, F.font.mountain, (i) => (i % 6 === 0 ? F.red : F.ink));
  ring(DIRECTIONS.map((d) => d.symbol), (b2 + b3) / 2, F.font.trigram, '#ffffff', F.ink);
  ring(DIRECTIONS.map((d) => d.name), (b3 + b4) / 2, F.font.direction, (i) => (i === 0 ? F.red : F.ink));
  c.strokeStyle = F.gold; c.lineWidth = 6; c.beginPath(); c.arc(cx, cx, b4 - 14, 0, Math.PI * 2); c.stroke();
}

function faceTexture() {
  return canvasTexture(1024, 1024, drawFace);
}

export default {
  camera: { position: [0, 4.0, 4.7], target: [0, -.62, -.1], fov: 33 },
  fog: [9, 26],
  pivot: -.86, // 动作弹性的不动点：石台顶面
  waterY: -1.12,
  build(api) {
    const { world, glow } = api;
    world.add(plinth(api, { radius: 1.75, height: .5, seed: 71, top: -.86, scaleZ: .85 }));
    const tray = new THREE.Mesh(new RoundedBoxGeometry(2.4, .16, 2.4, 4, .05), MAT.wood(woodTexture('#c0643a', 72), '#ffe0c8'));
    tray.position.y = -.78; world.add(api.shadows(tray));
    const plate = new THREE.Group(); plate.position.y = -.68; world.add(plate);
    const rimMat = MAT.gold();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.08, .1, 120), rimMat); plate.add(body);
    const face = new THREE.Mesh(new THREE.CircleGeometry(1.0, 120), new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: .55, metalness: .05 }));
    face.rotation.x = -Math.PI / 2; face.position.y = .051; plate.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.03, .03, 12, 120), MAT.gold()); rim.rotation.x = Math.PI / 2; rim.position.y = .05; plate.add(rim);
    api.shadows(plate, true, true);
    // 天心十字线
    const threadMat = MAT.silk('#c22d25');
    for (const rot of [0, Math.PI / 2]) {
      const holder = new THREE.Group(); holder.rotation.y = rot; holder.position.y = -.6;
      const th = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, 2.36, 6), threadMat); th.rotation.x = Math.PI / 2;
      holder.add(th); world.add(holder);
    }
    // 天池磁针：北端红色带淡光，南端银白
    const needle = new THREE.Group(); needle.position.y = -.6; world.add(needle);
    const tipMat = new THREE.MeshStandardMaterial({ color: '#e8382c', roughness: .6, metalness: 0, emissive: '#ff4a3a', emissiveIntensity: .25 });
    const half = (len, mat, sign) => { const g = new THREE.ConeGeometry(.045, len, 4); g.rotateX(sign * Math.PI / 2); g.translate(0, 0, sign * len / 2); const m = new THREE.Mesh(g, mat); m.scale.y = .35; return m; };
    needle.add(half(.2, tipMat, -1), half(.2, MAT.gold(), 1));
    const pin = new THREE.Mesh(new THREE.SphereGeometry(.03, 12, 8), MAT.gold()); needle.add(pin);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(.2, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: .18, roughness: .05, clearcoat: 1, depthWrite: false }));
    dome.scale.y = .35; dome.position.y = -.625; world.add(dome);
    glow.add('tip', { materials: [tipMat], color: '#ff5a44', base: .25, peak: .8 });

    api.reeds({ spots: [[-2.6, api.water.y, -1.6], [2.5, api.water.y, -2.2], [-2.2, api.water.y, .6]], perSpot: 12, height: 1.0 });
    api.lilies({ pads: [[1.9, 1.0, .26], [-2.0, 1.4, .24], [2.3, -.3, .2]], flower: false });
    api.mountains();
    api.particles('dust', { count: 26, box: [6, 2.6, 4], center: [0, 0, 0] });
    api.particles('leaves', { count: 10, box: [7, 2.6, 4], center: [0, .2, 0] });

    let angle = 0;
    const hero = api.gather();
    return {
      hero,
      update(dt, t, s) {
        const target = -(s.angle || 0) * Math.PI / 180;
        let d = target - angle; d = Math.atan2(Math.sin(d), Math.cos(d));
        angle = damp(angle, angle + d, 9, dt);
        plate.rotation.y = angle;
        needle.rotation.y = Math.sin(t * 2.1) * .02 * (1 + api.wind.gust);
        glow.set('tip', .45 + .25 * Math.sin(t * 1.8));
      },
    };
  },
};
