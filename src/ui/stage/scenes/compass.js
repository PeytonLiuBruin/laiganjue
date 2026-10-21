// 罗盘：水中平石上放一方漆木托盘，金边圆盘刻二十四山、八卦、八方，天池里一根磁针。
// 盘面随手机朝向转动（state.angle），针尖的红色是唯一的发光处。
import { THREE, MAT, RoundedBoxGeometry, plinth, damp } from './common.js';
import { canvasTexture, FONT, woodTexture } from '../organic.js';
import { DIRECTIONS, MOUNTAINS } from '../../../modules/fengshui/data.js';

function faceTexture() {
  return canvasTexture(1024, 1024, (c, w) => {
    const cx = w / 2, R = w / 2 - 4;
    const g = c.createRadialGradient(cx, cx, 40, cx, cx, R); g.addColorStop(0, '#f8e6b4'); g.addColorStop(1, '#e8c47a');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cx, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#5b3a1a';
    for (const [r, lw] of [[R - 6, 6], [R * .86, 3], [R * .68, 3], [R * .5, 3], [R * .3, 4], [R * .2, 3]]) { c.lineWidth = lw; c.beginPath(); c.arc(cx, cx, r, 0, Math.PI * 2); c.stroke(); }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < 120; i++) {
      const a = i / 120 * Math.PI * 2 - Math.PI / 2, long = i % 5 === 0;
      c.strokeStyle = i % 15 === 0 ? '#b3261e' : '#5b3a1a'; c.lineWidth = long ? 3 : 1.6;
      const r0 = R - 8, r1 = long ? R * .9 : R * .93;
      c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cx + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * r1, cx + Math.sin(a) * r1); c.stroke();
    }
    const ring = (labels, r, size, color) => labels.forEach((t, i) => {
      const a = i / labels.length * Math.PI * 2;
      c.save(); c.translate(cx + Math.sin(a) * r, cx - Math.cos(a) * r); c.rotate(a);
      c.fillStyle = typeof color === 'function' ? color(i) : color; c.font = `700 ${size}px ${FONT}`; c.fillText(t, 0, 0); c.restore();
    });
    ring(MOUNTAINS, R * .77, 50, (i) => (i % 6 === 0 ? '#b3261e' : '#3a2410'));
    for (let i = 0; i < 24; i++) { const a = (i + .5) / 24 * Math.PI * 2 - Math.PI / 2; c.strokeStyle = '#5b3a1a'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * R * .68, cx + Math.sin(a) * R * .68); c.lineTo(cx + Math.cos(a) * R * .86, cx + Math.sin(a) * R * .86); c.stroke(); }
    ring(DIRECTIONS.map((d) => d.symbol), R * .59, 48, '#3a2410');
    ring(DIRECTIONS.map((d) => d.name), R * .4, 40, (i) => (i === 0 ? '#b3261e' : '#3a2410'));
    c.fillStyle = '#2b2118'; c.beginPath(); c.arc(cx, cx, R * .2, 0, Math.PI * 2); c.fill();
  });
}

export default {
  camera: { position: [0, 4.0, 4.7], target: [0, -.62, -.1], fov: 33 },
  fog: [9, 26],
  waterY: -1.12,
  build(api) {
    const { world, glow } = api;
    world.add(plinth(api, { radius: 1.75, height: .5, seed: 71, top: -.86, scaleZ: .85 }));
    const tray = new THREE.Mesh(new RoundedBoxGeometry(2.4, .16, 2.4, 4, .05), MAT.wood(woodTexture('#5a2a1a', 72), '#c08a6a'));
    tray.position.y = -.78; world.add(api.shadows(tray));
    const plate = new THREE.Group(); plate.position.y = -.68; world.add(plate);
    const rimMat = MAT.bronze();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.08, .1, 120), rimMat); plate.add(body);
    const face = new THREE.Mesh(new THREE.CircleGeometry(1.0, 120), new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: .55, metalness: .05 }));
    face.rotation.x = -Math.PI / 2; face.position.y = .051; plate.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.03, .03, 12, 120), MAT.gold()); rim.rotation.x = Math.PI / 2; rim.position.y = .05; plate.add(rim);
    api.shadows(plate, true, true);
    // 天心十字线
    const threadMat = MAT.silk('#c22d25');
    for (const rot of [0, Math.PI / 2]) {
      const holder = new THREE.Group(); holder.rotation.y = rot; holder.position.y = -.6;
      const th = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, 2.36, 6), threadMat); th.rotation.x = Math.PI / 2;
      holder.add(th); world.add(holder);
    }
    // 天池磁针：北端红色带淡光，南端银白
    const needle = new THREE.Group(); needle.position.y = -.6; world.add(needle);
    const tipMat = new THREE.MeshStandardMaterial({ color: '#d22a22', roughness: .3, metalness: .4, emissive: '#ff4a3a', emissiveIntensity: .25 });
    const half = (len, mat, sign) => { const g = new THREE.ConeGeometry(.028, len, 4); g.rotateX(sign * Math.PI / 2); g.translate(0, 0, sign * len / 2); const m = new THREE.Mesh(g, mat); m.scale.y = .35; return m; };
    needle.add(half(.17, tipMat, -1), half(.17, MAT.gold(), 1));
    const pin = new THREE.Mesh(new THREE.SphereGeometry(.02, 12, 8), MAT.gold()); needle.add(pin);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(.2, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: .18, roughness: .05, clearcoat: 1, depthWrite: false }));
    dome.scale.y = .35; dome.position.y = -.625; world.add(dome);
    glow.add('tip', { materials: [tipMat], color: '#ff5a44', base: .25, peak: .8 });

    api.reeds({ spots: [[-2.6, api.water.y, -1.6], [2.5, api.water.y, -2.2], [-2.2, api.water.y, .6]], perSpot: 12, height: 1.0 });
    api.lilies({ pads: [[1.9, 1.0, .26], [-2.0, 1.4, .24], [2.3, -.3, .2]], flower: false });
    api.mountains();
    api.particles('dust', { count: 26, box: [6, 2.6, 4], center: [0, 0, 0] });
    api.particles('leaves', { count: 10, box: [7, 2.6, 4], center: [0, .2, 0] });

    let angle = 0;
    return {
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
