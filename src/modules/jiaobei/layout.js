// 筊杯 · 舞台几何（纯数据 + 纯函数，无 DOM，可被 node --test 直接验证）。
//
// solid-scene 会把「世界单位」按 scale = min(1, 画布宽 / WORLD, 画布高 / 320) 等比缩放后再画到画布上，
// 所以这里的数值都按「WORLD 宽的舞台」来定：窄屏整体缩小、430 宽的大屏也能撑满，不写死像素。
// 物理约束来自 core/throw-physics.js（横向最多漂 DRIFT_X、前后最多漂 DRIFT_Y）与 core/solids.js（起跳高度、透视）。
export const LAYOUT = {
  WORLD: 430,      // 世界宽度：比任何手机舞台都宽，杯子像素尺寸 = SIZE * 画布宽 / WORLD
  GROUND: 0.72,    // 地面线在画布高度的位置；其下留给杯子近端、投影与面向标签那一行
  SIZE: 52,        // 杯子尺寸（半宽 1.2 * SIZE，翻滚半径约 1.26 * SIZE）
  HOME_X: 95,      // 两杯起始横坐标 ±HOME_X
  HOME_Y: 6,       // 前后错开一点，落定时不在同一条线上
  DRIFT_X: 26,     // 物理允许的最大横向漂移
  DRIFT_Y: 18,     // 物理允许的最大前后漂移
  PEAK_DRIFT_X: 12, // 到最高点前（约 0.6s）横向最多漂多少
  POWER_CAP: 1.15, // flightHeight 的功率上限
  LABEL_BAND: 32,  // 面向标签占用的底部高度（bottom 14px + 行高 18px）
  BADGE_BOTTOM: 41, // 徽记下沿（top 17px + 约 24px 高）
};

export const halfWidth = (l = LAYOUT) => 1.2 * l.SIZE;
export const sceneScale = (width, height, l = LAYOUT) => Math.min(1, width / l.WORLD, height / 320);
const flightHeight = (height, l = LAYOUT) => Math.min(125, height * 0.32) * l.POWER_CAP;
const perspective = (depth) => 850 / (850 - depth);

/** 落定后两杯之间的最小间隔（世界单位）：两杯都向内漂到极限时仍 > 0，才不会叠成一团。 */
export function restGap(l = LAYOUT) {
  return 2 * l.HOME_X - 2 * l.DRIFT_X - 2 * halfWidth(l);
}

/** 落定后杯子外沿到舞台左右边框的距离（像素）。 */
export function restSideMargin(width, height, l = LAYOUT) {
  const s = sceneScale(width, height, l);
  const radius = 1.26 * l.SIZE;
  const xLimit = Math.max(l.HOME_X, l.WORLD * 0.43 - radius - 7);
  return width / 2 - (xLimit + halfWidth(l)) * s;
}

/** 飞到最高点时（透视放大最厉害）杯子外沿到舞台左右边框的距离（像素）。 */
export function peakSideMargin(width, height, l = LAYOUT) {
  const s = sceneScale(width, height, l);
  const p = perspective(0.8 * flightHeight(height, l) * s);
  return width / 2 - (l.HOME_X + l.PEAK_DRIFT_X + halfWidth(l)) * s * p;
}

/** 最高点时杯子上沿到徽记下沿的距离（像素）。 */
export function peakTopClearance(width, height, l = LAYOUT) {
  const s = sceneScale(width, height, l);
  const lift = flightHeight(height, l) * s;
  const p = perspective(0.8 * lift);
  const top = height * l.GROUND - lift * 0.6 * p - halfWidth(l) * 0.8 * s * p - (l.HOME_Y + l.DRIFT_Y) * 0.8 * s;
  return top - l.BADGE_BOTTOM;
}

/** 落定后杯子下沿到面向标签上沿的距离（像素）：杯子最靠近观者时算。 */
export function restLabelClearance(width, height, l = LAYOUT) {
  const s = sceneScale(width, height, l);
  const bottom = height * l.GROUND + (0.8 * 0.52 * l.SIZE + 0.8 * (l.HOME_Y + l.DRIFT_Y)) * s;
  return height - l.LABEL_BAND - bottom;
}
