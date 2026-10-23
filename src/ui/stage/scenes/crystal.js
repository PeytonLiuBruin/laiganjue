// 水晶球：青铜爪座托着一颗透光的玻璃球，球里一团缓慢翻涌的星雾（指定发光）。
// 摩擦充能时星雾变亮、转快，揭晓时雾气散开、球体变清；倒影里能看到球与座。
import { THREE, MAT, plinth, damp, clamp } from './common.js';
import { taperedTube } from '../organic.js';

const NebulaShader = {
  uniforms: { time: { value: 0 }, intensity: { value: .2 }, clear: { value: 0 }, colorA: { value: new THREE.Color('#b9a2ff') }, colorB: { value: new THREE.Color('#7fd3ff') } },
  vertexShader: `varying vec3 vPos; varying vec3 vN; varying vec3 vView;
    void main(){ vPos = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `uniform float time; uniform float intensity; uniform float clear; uniform vec3 colorA; uniform vec3 colorB;
    varying vec3 vPos; varying vec3 vN; varying vec3 vView;
    vec3 hash3(vec3 p){ p = fract(p * vec3(.1031,.1030,.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx) * p.zyx); }
    float noise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      float n = mix(mix(mix(hash3(i).x, hash3(i+vec3(1,0,0)).x, f.x), mix(hash3(i+vec3(0,1,0)).x, hash3(i+vec3(1,1,0)).x, f.x), f.y),
                    mix(mix(hash3(i+vec3(0,0,1)).x, hash3(i+vec3(1,0,1)).x, f.x), mix(hash3(i+vec3(0,1,1)).x, hash3(i+vec3(1,1,1)).x, f.x), f.y), f.z); return n; }
    float fbm(vec3 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++) { s += a * noise(p); p *= 2.07; a *= .5; } return s; }
    void main(){
      float core = pow(max(dot(vN, vView), 0.), 1.6);
      vec3 p = vPos * 2.4; float t = time * .35;
      float n = fbm(p + vec3(t, -t * .7, t * .4) + fbm(p * 1.7 - t) * 1.3);
      float wisps = smoothstep(.38, .78, n);
      vec3 col = mix(colorB, colorA, n) * (.3 + wisps * .85);
      float a = core * (.25 + wisps * .75) * intensity * (1. - clear * .9);
      gl_FragColor = vec4(col * a, a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export default {
  camera: { position: [0, .45, 7.0], target: [0, -.1, 0], fov: 30 },
  fog: [9, 26],
  pivot: -.98, // 动作弹性的不动点：石台顶面
  waterY: -1.18,
  build(api) {
    const { world, glow } = api;
    world.add(plinth(api, { radius: .95, height: .48, seed: 81, top: -.98 }));
    const bronze = MAT.bronze(), gold = MAT.gold();
    const base = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [.42, 0], [.46, .04], [.4, .1], [.26, .14], [.2, .24], [.22, .3], [.3, .34], [.32, .38], [0, .38]].map(([x, y]) => new THREE.Vector2(x, y)), 64), bronze);
    base.position.y = -.98; world.add(api.shadows(base));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.31, .02, 10, 64), gold); ring.rotation.x = Math.PI / 2; ring.position.y = -.6; world.add(ring);
    const center = new THREE.Vector3(0, .02, 0), R = .66;
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
      const claw = new THREE.Mesh(taperedTube([[c * .28, -.6, s * .28], [c * .48, -.53, s * .48], [c * .62, -.4, s * .62], [c * .68, -.22, s * .68], [c * .64, -.12, s * .64]], (t) => .05 - t * .03, { radial: 10, segments: 24, bark: .05, seed: 90 + i }), bronze);
      world.add(api.shadows(claw));
    }
    // 卡通玻璃：半透明浅蓝 + 硬高光 + 边缘光（由 toon.js 统一着色），不用透射（透射在卡通光照下会发黑）
    const glass = new THREE.MeshPhysicalMaterial({ color: '#e2d8ff', roughness: .1, metalness: 0, clearcoat: 1, transparent: true, opacity: .5 });
    glass.depthWrite = false;
    const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 64, 40), glass); ball.position.copy(center); ball.castShadow = true; world.add(ball);
    const nebulaMat = new THREE.ShaderMaterial({ ...NebulaShader, uniforms: THREE.UniformsUtils.clone(NebulaShader.uniforms), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    nebulaMat.userData.glow = true;
    const nebula = new THREE.Mesh(new THREE.SphereGeometry(R * .9, 48, 32), nebulaMat); nebula.position.copy(center); nebula.renderOrder = 2; world.add(nebula);
    const inner = new THREE.PointLight('#b9a2ff', 0, 2.6, 2); inner.position.copy(center); world.add(inner);
    glow.add('ball', { haloAt: center.toArray(), color: '#c7b4ff', size: 2.0 });

    api.lilies({ pads: [[1.4, 1.1, .3], [-1.6, 1.3, .26], [1.9, .2, .2]] });
    api.reeds({ spots: [[-2.6, api.water.y, -1.4], [2.7, api.water.y, -1.8]], perSpot: 12, height: 1.1 });
    api.mountains();
    const motes = api.particles('motes', { count: 26, box: [4, 2.8, 2.4], center: [0, .1, .2], glow: true, colors: ['#cdbfff'] });
    api.particles('dust', { count: 16, box: [6, 3, 3], center: [0, .3, .4] });

    let energy = .2, clearMix = 0, spin = 0;
    const hero = api.gather();
    return {
      hero,
      onState(prev, next) { if (next.revealed && !prev.revealed) motes.burst([0, 0, .3], .9); },
      update(dt, t, s) {
        const p = clamp(s.progress || 0);
        energy = damp(energy, s.revealed ? .25 : .18 + p * .82 + (s.glow ? .2 : 0), 3, dt);
        clearMix = damp(clearMix, s.revealed ? 1 : 0, 1.6, dt);
        spin += dt * (.15 + energy * 1.2);
        const u = nebulaMat.uniforms; u.time.value = spin; u.intensity.value = energy; u.clear.value = clearMix;
        nebula.rotation.y = spin * .3;
        inner.intensity = energy * 2.4 * (1 - clearMix * .6);
        glow.set('ball', Math.max(0, energy - .2) * .6);
      },
    };
  },
};
