// 财库：水边石滩上一只红漆拱盖宝箱，金包边、铆钉、刻「财」锁片。
// 开库时箱身一抖、拱盖弹开，金光从箱口射出（指定发光），元宝蹦起再落回箱中，金尘四散。
import { THREE, MAT, RoundedBoxGeometry, plinth, textTexture, spring, damp, backOut, clamp, ease } from './common.js';
import { yuanbaoGeometry, coinGeometry, canvasTexture, rng } from '../organic.js';

function lacquerPlanks() {
  const r = rng(61);
  return canvasTexture(512, 256, (c, w, h) => {
    c.fillStyle = '#b8302a'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { c.strokeStyle = `rgba(${r() > .5 ? '90,15,10' : '255,140,120'},${.03 + r() * .05})`; c.lineWidth = 1 + r() * 2; const y = r() * h; c.beginPath(); c.moveTo(0, y); c.bezierCurveTo(w * .3, y + 3, w * .6, y - 3, w, y + r() * 4); c.stroke(); }
    c.strokeStyle = 'rgba(60,8,6,.55)'; c.lineWidth = 3;
    for (const y of [h * .33, h * .66]) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
  });
}
function halfDome(radius, length, segments = 40) {
  const g = new THREE.CylinderGeometry(radius, radius, length, segments, 1, false, -Math.PI / 2, Math.PI);
  g.rotateZ(Math.PI / 2); g.rotateX(-Math.PI / 2); return g;
}

export default {
  camera: { position: [0, 1.0, 7.2], target: [0, -.32, 0], fov: 30 },
  fog: [9, 27],
  waterY: -1.2,
  build(api) {
    const { world, glow } = api;
    world.add(plinth(api, { radius: 1.45, height: .5, seed: 64, top: -.95, scaleZ: .75 }));
    const chest = new THREE.Group(); chest.position.y = -.95; world.add(chest);
    const planks = lacquerPlanks();
    const lacquer = new THREE.MeshPhysicalMaterial({ map: planks, roughness: .3, clearcoat: .9, clearcoatRoughness: .2 });
    const gold = MAT.gold(), velvet = MAT.matte('#4a1612');
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.6, .68, .96, 4, .04), lacquer); body.position.y = .36; chest.add(body);
    const inside = new THREE.Mesh(new THREE.PlaneGeometry(1.48, .84), velvet); inside.rotation.x = -Math.PI / 2; inside.position.y = .705; chest.add(inside);
    const bandGeo = new RoundedBoxGeometry(.15, .7, 1.0, 3, .03);
    for (const x of [-.62, .62]) { const b = new THREE.Mesh(bandGeo, gold); b.position.set(x, .36, 0); chest.add(b); }
    const foot = new THREE.Mesh(new RoundedBoxGeometry(1.68, .1, 1.04, 3, .035), gold); foot.position.y = .05; chest.add(foot);
    const lip = new THREE.Mesh(new RoundedBoxGeometry(1.68, .07, 1.04, 3, .025), gold); lip.position.y = .7; chest.add(lip);
    const rivetGeo = new THREE.SphereGeometry(.022, 12, 8), rivets = new THREE.InstancedMesh(rivetGeo, gold, 12), rm = new THREE.Matrix4();
    let ri = 0; for (const x of [-.62, .62]) for (const y of [.2, .36, .52]) for (const z of [.505, -.505]) { rm.makeTranslation(x, y, z); rivets.setMatrixAt(ri++, rm); }
    chest.add(rivets);
    const lock = new THREE.Group(); lock.position.set(0, .55, .49); chest.add(lock);
    lock.add(new THREE.Mesh(new RoundedBoxGeometry(.32, .28, .06, 3, .03), gold));
    const cai = new THREE.Mesh(new THREE.PlaneGeometry(.2, .2), new THREE.MeshStandardMaterial({ map: textTexture('财', { size: 180, color: '#8a4d12' }), transparent: true, metalness: .6, roughness: .35 }));
    cai.position.z = .032; lock.add(cai);
    // 拱盖：铰链在后沿，内衬深红丝绒
    const hinge = new THREE.Group(); hinge.position.set(0, .7, -.48); chest.add(hinge);
    const lid = new THREE.Group(); lid.position.z = .48; hinge.add(lid);
    lid.add(new THREE.Mesh(halfDome(.48, 1.6), new THREE.MeshPhysicalMaterial({ color: '#b8302a', roughness: .34, clearcoat: .6, clearcoatRoughness: .3 })));
    const lining = new THREE.Mesh(halfDome(.455, 1.56), velvet); lining.material = velvet.clone(); lining.material.side = THREE.BackSide; lid.add(lining);
    for (const x of [-.62, .62]) { const b = new THREE.Mesh(halfDome(.5, .15, 32), gold); b.position.x = x; lid.add(b); }
    const latch = new THREE.Mesh(new RoundedBoxGeometry(.2, .16, .05, 3, .02), gold); latch.position.set(0, -.04, .49); lid.add(latch);
    api.shadows(chest, true, true);

    // 元宝与金光（指定发光）
    const ingotMat = new THREE.MeshStandardMaterial({ color: '#d98c12', metalness: 1, roughness: .2, emissive: '#ff9a1f', emissiveIntensity: 0 });
    const ingotGeo = yuanbaoGeometry(1);
    const ingots = [[-.42, -.12, .3, 0], [.4, -.14, -.4, .2], [0, .02, .1, .1], [-.18, .22, -.2, .15], [.22, .22, .25, .05]].map(([x, z, a, d]) => {
      const mesh = new THREE.Mesh(ingotGeo, ingotMat); mesh.rotation.y = a; mesh.castShadow = true; chest.add(mesh);
      return { mesh, home: new THREE.Vector3(x, .74, z), delay: d };
    });
    // 卡通着色后元宝本体已经很亮，金光用更深的橙金、峰值压低，免得发白
    glow.add('ingots', { materials: [ingotMat], color: '#ff8a10', base: 0, peak: .22 });
    const rayTex = canvasTexture(64, 256, (c, w, h) => { const g = c.createLinearGradient(0, h, 0, 0); g.addColorStop(0, 'rgba(255,214,120,.9)'); g.addColorStop(1, 'rgba(255,214,120,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); const x = c.createLinearGradient(0, 0, w, 0); x.addColorStop(0, 'rgba(0,0,0,1)'); x.addColorStop(.5, 'rgba(0,0,0,0)'); x.addColorStop(1, 'rgba(0,0,0,1)'); c.globalCompositeOperation = 'destination-out'; c.fillStyle = x; c.fillRect(0, 0, w, h); });
    const rayMat = new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, side: THREE.DoubleSide, fog: true });
    rayMat.userData.glow = true;
    const rays = new THREE.Group(); rays.position.y = .72; chest.add(rays);
    for (let i = 0; i < 9; i++) {
      const ray = new THREE.Mesh(new THREE.PlaneGeometry(.22, 1.6), rayMat); ray.geometry.translate(0, .8, 0);
      ray.rotation.y = i / 9 * Math.PI; ray.rotation.z = (i % 2 ? 1 : -1) * (.12 + (i % 3) * .1); rays.add(ray);
    }
    const shine = new THREE.PointLight('#ffb030', 0, 3, 2); shine.position.set(0, 1.1, .2); chest.add(shine);
    // 石滩上散落的铜钱
    const coinGeo = coinGeometry({ r: .08, hole: .022, depth: .016 });
    [[-1.05, .35, .3], [1.0, .3, -.6], [.85, .45, 1.2]].forEach(([x, z, a]) => { const c = new THREE.Mesh(coinGeo, gold); c.position.set(x, -.94, z); c.rotation.set(-Math.PI / 2 + .1, 0, a); world.add(c); });

    api.lilies({ pads: [[-1.9, 1.3, .28], [2.0, 1.0, .24]] });
    api.reeds({ spots: [[-2.6, api.water.y, -1.2], [2.7, api.water.y, -1.6]], perSpot: 12, height: 1.15 });
    api.mountains();
    const motes = api.particles('motes', { count: 32, box: [3.6, 2.6, 2.4], center: [0, 0, .2], glow: true });
    api.particles('dust', { count: 14, box: [6, 3, 3], center: [0, .3, .4] });

    let open = 0, mix = 0, burst = false;
    const jolt = spring(0);
    const hero = chest;
    return {
      hero,
      onState(prev, next) {
        if (next.active && !prev.active) { jolt.v += 2; burst = false; }
        if (!next.active && !next.revealed) burst = false;
      },
      update(dt, t, s) {
        const since = s.active ? t - (s.since || 0) : 9;
        if (s.active) open = backOut(clamp((since - .5) / .9));
        else open = damp(open, s.revealed ? 1 : 0, s.revealed ? 3 : 5, dt);
        const shake = s.active && since < .6 ? Math.sin(since * 40) * .018 * (1 - since / .6) : 0;
        chest.position.x = shake;
        chest.rotation.z = jolt.step(0, 60, 6, dt) * .02;
        hinge.rotation.x = -Math.min(1.22, open) * 1.72;
        if (s.active && since > .7 && !burst) { burst = true; motes.burst([0, -.2, 0], 1.2); api.water.ripple(.9, .9, .7); api.shake(.02); }
        const jump = s.active ? clamp((since - .7) / .7) : open;
        ingots.forEach((g) => {
          const k = clamp(jump * 1.4 - g.delay), hop = Math.sin(k * Math.PI) * .42;
          g.mesh.visible = open > .08;
          g.mesh.position.copy(g.home); g.mesh.position.y += hop - (1 - k) * .08;
        });
        mix = damp(mix, s.revealed ? 1 : 0, 2.5, dt);
        const beam = Math.max(clamp(open), mix) * (s.active || s.revealed ? 1 : 0);
        rayMat.opacity = beam * (.32 + .08 * Math.sin(t * 2));
        rays.visible = rayMat.opacity > .01;
        rays.rotation.y = t * .25;
        rays.scale.set(1, .4 + beam * .8, 1);
        shine.intensity = beam * .55; // 卡通着色下点光太强会把元宝冲成粉白，压低到只染一层暖光
        glow.set('ingots', Math.max(mix, beam * .6) * (.75 + .25 * Math.sin(t * 2.3)));
      },
    };
  },
};
