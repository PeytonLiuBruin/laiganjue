// 星仪：青铜浑仪立在水中石座上，三道环缓缓转动，环内一层薄玻璃天球。
// 星座模式：所选星座的星点与连线浮在天球上（指定发光）；生肖模式：中央一枚玉章刻地支，十二地支环绕，当前一枚亮起。
import { THREE, MAT, plinth, textTexture, damp } from './common.js';
import { canvasTexture, FONT } from '../organic.js';

const GlassShader = {
  uniforms: { tint: { value: new THREE.Color('#bcd4ff') }, strength: { value: .5 } },
  vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform vec3 tint; uniform float strength; varying vec3 vN; varying vec3 vV;
    void main(){ float f = pow(1. - max(dot(vN, vV), 0.), 2.6); gl_FragColor = vec4(tint, f * strength);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};
const BRANCHES = [...'子丑寅卯辰巳午未申酉戌亥'];
// 第 27 轮：十二支原来是浅灰细字，手机上看不见。改成奶油圆章配深棕粗字，当前生肖的那枚染金放大
export const SKY_BRANCH = { badge: '#fff4d8', ring: '#3a2410', text: '#3a2410', on: '#ffc93c', size: .2, onSize: .26, px: 128, font: 78 };
function branchTexture(ch) {
  const { px, badge, ring, text, font } = SKY_BRANCH;
  return canvasTexture(px, px, (c) => {
    c.clearRect(0, 0, px, px);
    c.beginPath(); c.arc(px / 2, px / 2, px / 2 - 6, 0, Math.PI * 2); c.fillStyle = badge; c.fill();
    c.lineWidth = 8; c.strokeStyle = ring; c.stroke();
    c.font = `900 ${font}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = text; c.fillText(ch, px / 2, px / 2 + font * .04);
  });
}

export default {
  camera: { position: [0, .35, 7.0], target: [0, .02, 0], fov: 30 },
  fog: [9, 26],
  pivot: -1.0, // 动作弹性的不动点：石台顶面
  waterY: -1.2,
  build(api) {
    const { world, glow } = api;
    world.add(plinth(api, { radius: .9, height: .48, seed: 101, top: -1.0 }));
    const bronze = MAT.bronze(), gold = MAT.gold();
    const stand = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [.44, 0], [.47, .05], [.36, .1], [.22, .16], [.12, .3], [.1, .5], [.14, .56], [.08, .6], [0, .6]].map(([x, y]) => new THREE.Vector2(x, y)), 64), bronze);
    stand.position.y = -1.0; world.add(api.shadows(stand));
    const center = new THREE.Vector3(0, .12, 0);
    const rig = new THREE.Group(); rig.position.copy(center); world.add(rig);
    const ringGeo = new THREE.TorusGeometry(1.0, .032, 12, 160), trimGeo = new THREE.TorusGeometry(1.0, .01, 6, 160);
    const tickGeo = new THREE.BoxGeometry(.012, .07, .02);
    const rings = [[.42, 0, 0], [0, 1.02, 0], [1.1, .3, 0]].map(([x, y, z], i) => {
      const g = new THREE.Group(); g.rotation.set(x, y, z);
      const r = new THREE.Mesh(ringGeo, bronze); g.add(r);
      const trim = new THREE.Mesh(trimGeo, gold); trim.position.z = .03; g.add(trim);
      const ticks = new THREE.InstancedMesh(tickGeo, gold, 36), m = new THREE.Matrix4();
      for (let k = 0; k < 36; k++) { const a = k / 36 * Math.PI * 2; m.makeRotationZ(a - Math.PI / 2); m.setPosition(Math.cos(a) * .96, Math.sin(a) * .96, 0); ticks.setMatrixAt(k, m); }
      g.add(ticks); rig.add(g); return g;
    });
    api.shadows(rig, true, false);
    const meridian = new THREE.Mesh(new THREE.TorusGeometry(1.08, .04, 12, 160, Math.PI * 1.25), bronze); meridian.rotation.set(0, 0, -Math.PI * .125); meridian.position.copy(center); world.add(api.shadows(meridian));
    const globe = new THREE.Mesh(new THREE.SphereGeometry(.84, 48, 32), new THREE.ShaderMaterial({ ...GlassShader, uniforms: THREE.UniformsUtils.clone(GlassShader.uniforms), transparent: true, depthWrite: false }));
    globe.position.copy(center); world.add(globe);

    // 星点与连线（指定发光）
    const MAX = 24;
    const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3)); starGeo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX), 1));
    const starMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { map: { value: glow.texture }, color: { value: new THREE.Color('#ffe6a8') }, pulse: { value: 1 } },
      vertexShader: `attribute float size; uniform float pulse; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * mv; gl_PointSize = size * pulse * 70. / -mv.z; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 color; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color * 1.8, t.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }` });
    starMat.userData.glow = true;
    const stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false; rig.parent.add(stars); stars.position.copy(center);
    const lineMat = new THREE.LineBasicMaterial({ color: '#ffd27a', transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false });
    lineMat.userData.glow = true;
    const lines = new THREE.LineSegments(new THREE.BufferGeometry(), lineMat); lines.position.copy(center); world.add(lines);

    // 生肖：中央玉章 + 十二地支
    const medal = new THREE.Group(); medal.position.copy(center); world.add(medal);
    const jadeDisc = new THREE.Mesh(new THREE.CylinderGeometry(.36, .36, .07, 64), MAT.jade('#3fae80')); jadeDisc.rotation.x = Math.PI / 2; medal.add(jadeDisc);
    const medalRim = new THREE.Mesh(new THREE.TorusGeometry(.36, .02, 10, 64), gold); medal.add(medalRim);
    const glyphTex = textTexture('子', { size: 170, color: '#ffe3a0', stroke: '#6b4512' });
    const glyphMat = new THREE.MeshStandardMaterial({ map: glyphTex, transparent: true, metalness: .4, roughness: .35, emissive: '#ffcf70', emissiveMap: glyphTex, emissiveIntensity: 0 });
    const glyphPlane = new THREE.Mesh(new THREE.PlaneGeometry(.5, .5), glyphMat); glyphPlane.position.z = .04; medal.add(glyphPlane);
    glow.add('glyph', { materials: [glyphMat], color: '#ffcf70', base: .1, peak: .7 });
    const branchSprites = BRANCHES.map((b, i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: branchTexture(b), transparent: true, depthWrite: false }));
      const a = Math.PI / 2 - i / 12 * Math.PI * 2; sp.position.set(Math.cos(a) * .64, Math.sin(a) * .64, .05); sp.scale.setScalar(SKY_BRANCH.size); medal.add(sp); return sp;
    });

    api.lilies({ pads: [[1.5, 1.0, .3], [-1.7, 1.3, .26]] });
    api.reeds({ spots: [[-2.6, api.water.y, -1.4], [2.7, api.water.y, -1.8]], perSpot: 12, height: 1.1 });
    api.mountains();
    api.particles('dust', { count: 26, box: [6, 3.2, 3], center: [0, .4, .3] });
    api.particles('motes', { count: 16, box: [2.6, 2.4, 2], center: [0, .1, 0], glow: true, colors: ['#fff0c0'] });

    let mode = 'sign', spin = 0, energy = 0, starCount = 0;
    function setStars(list = [], links = []) {
      const pos = starGeo.attributes.position.array, size = starGeo.attributes.size.array;
      starCount = Math.min(MAX, list.length);
      const pts = [];
      for (let i = 0; i < MAX; i++) {
        if (i >= starCount) { size[i] = 0; continue; }
        const s = list[i], x = (s.x - 50) / 50 * .66, y = (50 - s.y) / 50 * .66, z = Math.sqrt(Math.max(.02, .8 * .8 - x * x - y * y)) * .9;
        pos.set([x, y, z], i * 3); size[i] = .7 + (s.r || 1.2) * .4; pts.push([x, y, z]);
      }
      starGeo.attributes.position.needsUpdate = true; starGeo.attributes.size.needsUpdate = true;
      const seg = [];
      for (const [a, b] of links) if (pts[a] && pts[b]) seg.push(...pts[a], ...pts[b]);
      lines.geometry.dispose(); lines.geometry = new THREE.BufferGeometry(); lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    }
    const hero = api.gather();
    return {
      hero,
      onState(prev, next) {
        if (next.kind && next.kind !== mode) mode = next.kind === 'animal' ? 'animal' : 'sign';
        if (next.stars !== prev.stars || next.lines !== prev.lines) setStars(next.stars || [], next.lines || []);
        if (next.glyph && next.glyph !== prev.glyph && mode === 'animal') glyphTex.userData.redraw((c, w, h) => {
          c.clearRect(0, 0, w, h); c.font = `800 170px "PingFang SC","Noto Serif SC",serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.lineWidth = 20; c.strokeStyle = '#6b4512'; c.strokeText(next.glyph, w / 2, h / 2 + 6); c.fillStyle = '#ffe3a0'; c.fillText(next.glyph, w / 2, h / 2 + 6);
        });
      },
      update(dt, t, s) {
        energy = damp(energy, s.active ? 1 : 0, 3, dt);
        spin += dt * (.12 + energy * 1.1);
        rings[0].rotation.y = spin * .6; rings[1].rotation.x = spin * .45; rings[2].rotation.z = spin * .3;
        const animal = mode === 'animal';
        stars.visible = lines.visible = !animal;
        medal.visible = animal;
        starMat.uniforms.pulse.value = 1 + Math.sin(t * (2 + energy * 6)) * (.12 + energy * .2);
        lineMat.opacity = .4 + energy * .4;
        stars.rotation.y = lines.rotation.y = Math.sin(t * .25) * .15;
        medal.rotation.y = Math.sin(t * .5) * .2;
        branchSprites.forEach((sp, i) => { const on = BRANCHES[i] === s.glyph; sp.material.color.set(on ? SKY_BRANCH.on : '#ffffff'); sp.scale.setScalar(on ? SKY_BRANCH.onSize : SKY_BRANCH.size); sp.material.opacity = 1; });
        glow.set('glyph', animal ? .45 + energy * .5 + .1 * Math.sin(t * 2) : 0);
      },
    };
  },
};
