// Model coordinates: Y is up; Z points towards the viewer.
import { add, mul, cross, unit, dot, rotate, axisAngle } from '../../core/solids.js';
export { add, mul, dot, rotate, axisAngle };
export const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
export const ease = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
export function polygon(points, color) {
  const normal = unit(cross(add(points[1], mul(points[0], -1)), add(points[2], mul(points[0], -1))));
  return { points, normal, color };
}
export function lathe(profile, color, segments = 64) {
  const faces = [];
  for (let j = 0; j < profile.length - 1; j++) for (let i = 0; i < segments; i++) {
    const a = i / segments * TAU, b = (i + 1) / segments * TAU;
    const [r, y] = profile[j], [r2, y2] = profile[j + 1];
    const points = [[r * Math.cos(a), y, r * Math.sin(a)], [r2 * Math.cos(a), y2, r2 * Math.sin(a)], [r2 * Math.cos(b), y2, r2 * Math.sin(b)], [r * Math.cos(b), y, r * Math.sin(b)]];
    // Remove repeated pole vertices so the tip always has a valid normal.
    const unique = points.filter((p, k) => !points.slice(0, k).some(q => Math.hypot(...add(p, mul(q, -1))) < 1e-6));
    if (unique.length > 2) faces.push(polygon(unique, color));
  }
  return faces;
}
export function torus(radius, tube, color, rotation = [0, 0, 0, 1], segments = 72) {
  const faces = [], sides = 6;
  const point = (a, b) => rotate([(radius + tube * Math.cos(b)) * Math.cos(a), (radius + tube * Math.cos(b)) * Math.sin(a), tube * Math.sin(b)], rotation);
  for (let i = 0; i < segments; i++) for (let j = 0; j < sides; j++) {
    const a = i / segments * TAU, b = j / sides * TAU, da = TAU / segments, db = TAU / sides;
    faces.push(polygon([point(a, b), point(a + da, b), point(a + da, b + db), point(a, b + db)], color));
  }
  return faces;
}
export function box(width, height, depth, color) {
  const x = width / 2, y = height / 2, z = depth / 2;
  return [
    [[-x,-y,z],[x,-y,z],[x,y,z],[-x,y,z]], [[x,-y,-z],[-x,-y,-z],[-x,y,-z],[x,y,-z]],
    [[x,-y,z],[x,-y,-z],[x,y,-z],[x,y,z]], [[-x,-y,-z],[-x,-y,z],[-x,y,z],[-x,y,-z]],
    [[-x,y,z],[x,y,z],[x,y,-z],[-x,y,-z]], [[-x,-y,-z],[x,-y,-z],[x,-y,z],[-x,-y,z]],
  ].map(p => polygon(p, color));
}
export function transformed(mesh, rotation = [0,0,0,1], position = [0,0,0]) {
  return mesh.map(f => ({ ...f, points: f.points.map(p => add(rotate(p, rotation), position)), normal: rotate(f.normal, rotation) }));
}
export function pendulumPosition(x = 0, y = 0) {
  const dx = clamp(x, -1, 1) * 64, dz = clamp(y, -1, 1) * 56, length = 142;
  return [dx, 126 - Math.sqrt(length * length - dx * dx - dz * dz), dz];
}
export function pillarPose(index, progress) {
  const t = ease((progress * 2.4 - index * .28) / 1.3);
  return { rotation: axisAngle([0,1,0], (1-t) * Math.PI + .12), position: [(index - 1.5) * 69, -4 + Math.sin(t * Math.PI) * 9, 0], visible: t > .55 };
}
export function projectModel(point, width, height, pitch = .12, yaw = 0) {
  const p = rotate(rotate(point, axisAngle([0,1,0], yaw)), axisAngle([1,0,0], pitch));
  const scale = Math.min(width / 350, height / 340, 1.22) * 820 / (820 - p[2]);
  return [width / 2 + p[0] * scale, height / 2 - p[1] * scale, p[2], scale];
}
