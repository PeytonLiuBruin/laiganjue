// 倒影水面：反射整个场景，表面有随风的细浪与可触发的同心涟漪，近处透出深色水体，远处融进雾里。
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

const MAX_RIPPLES = 4;
const WaterShader = {
  name: 'StageWater',
  uniforms: {
    color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null },
    time: { value: 0 }, wind: { value: new THREE.Vector3(1, 0, .4) },
    shallow: { value: new THREE.Color() }, deep: { value: new THREE.Color() },
    fogColor: { value: new THREE.Color() }, fogNear: { value: 8 }, fogFar: { value: 26 },
    sunDir: { value: new THREE.Vector3(-.5, .6, -.6).normalize() }, sunColor: { value: new THREE.Color('#fff2d6') },
    ripples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0)) },
    reflectivity: { value: .85 },
  },
  vertexShader: `
    uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
    void main(){ vUv = textureMatrix * vec4(position, 1.); vec4 w = modelMatrix * vec4(position, 1.); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `
    uniform vec3 color; uniform sampler2D tDiffuse; uniform float time; uniform vec3 wind;
    uniform vec3 shallow; uniform vec3 deep; uniform vec3 fogColor; uniform float fogNear; uniform float fogFar;
    uniform vec3 sunDir; uniform vec3 sunColor; uniform vec4 ripples[${MAX_RIPPLES}]; uniform float reflectivity;
    varying vec4 vUv; varying vec3 vWorld;
    vec2 wave(vec2 p, vec2 d, float k, float s, float a){ float ph = dot(p, d) * k + time * s; return d * cos(ph) * a * k; }
    void main(){
      vec2 p = vWorld.xz;
      float w = wind.z;
      vec2 g = vec2(0.);
      g += wave(p, normalize(vec2(wind.x, wind.y)), 3.1, 1.6, .0032 + w * .0045);
      g += wave(p, normalize(vec2(.7, -.6)), 5.3, 2.1, .0018 + w * .002);
      g += wave(p, normalize(vec2(-.3, .9)), 8.7, 2.9, .0011 + w * .0012);
      g += wave(p, normalize(vec2(.95, .2)), 13.1, 3.7, .0007);
      for (int i = 0; i < ${MAX_RIPPLES}; i++) {
        vec4 r = ripples[i]; float age = time - r.z;
        if (age > 0. && age < 4.) {
          vec2 dv = p - r.xy; float d = length(dv) + 1e-4; float front = age * .9;
          float env = exp(-abs(d - front) * 5.) * exp(-age * 1.1) * r.w;
          g += dv / d * cos((d - front) * 22.) * env * .05;
        }
      }
      vec3 N = normalize(vec3(-g.x, 1., -g.y));
      vec3 V = normalize(cameraPosition - vWorld);
      float dist = length(cameraPosition - vWorld);
      vec4 uv = vUv; uv.xy += g * uv.w * .55;
      vec3 refl = texture2DProj(tDiffuse, uv).rgb;
      float ndv = max(dot(N, V), 0.);
      float fres = .02 + .98 * pow(1. - ndv, 5.);
      vec3 body = mix(shallow, deep, smoothstep(.15, .7, ndv));
      vec3 col = mix(body, refl * color, clamp(.22 + fres * 1.5, 0., .96) * reflectivity);
      // 细浪明暗：法线朝向天光的一侧亮、背向的一侧暗，水面纹理由此显出来
      vec3 L = normalize(vec3(-.35, 1., .55));
      col *= 1. + (dot(N, L) - L.y) * 4.;
      vec3 H = normalize(sunDir + V);
      col += sunColor * pow(max(dot(N, H), 0.), 220.) * .9;
      col = mix(col, fogColor, smoothstep(fogNear, fogFar, dist));
      gl_FragColor = vec4(col, 1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
};

export function createWater(atm, { size = 80, y = -1.25, resolution = 512, renderer = null } = {}) {
  const geo = new THREE.PlaneGeometry(size, size);
  const water = new Reflector(geo, { textureWidth: resolution, textureHeight: resolution, clipBias: .003, shader: WaterShader, multisample: 0, color: '#ffffff' });
  // 半精度浮点渲染目标不可用的设备（部分旧 iPhone）改用 8 位，避免倒影一片黑
  const ext = renderer?.extensions;
  if (ext && !ext.has('EXT_color_buffer_half_float') && !ext.has('EXT_color_buffer_float')) water.getRenderTarget().texture.type = THREE.UnsignedByteType;
  water.rotation.x = -Math.PI / 2; water.position.y = y;
  const u = water.material.uniforms;
  u.shallow.value.set(atm.water); u.deep.value.set(atm.deep); u.fogColor.value.set(atm.horizon); u.sunColor.value.set(atm.sun);
  u.reflectivity.value = atm.dark ? .75 : .85;
  let next = 0;
  return {
    object: water, y,
    setFog(near, far) { u.fogNear.value = near; u.fogFar.value = far; },
    setSize(w, h) { water.getRenderTarget().setSize(Math.max(64, Math.round(w)), Math.max(64, Math.round(h))); },
    update(t, wind) { u.time.value = t; u.wind.value.set(wind.dir.x, wind.dir.y, wind.strength); },
    /** 在 (x, z) 处激起一圈涟漪。 */
    ripple(x, z, strength = 1) { u.ripples.value[next].set(x, z, u.time.value, strength); next = (next + 1) % MAX_RIPPLES; },
    dispose() { water.getRenderTarget().dispose(); water.material.dispose(); geo.dispose(); },
  };
}
