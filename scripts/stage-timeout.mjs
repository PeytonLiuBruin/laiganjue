// 3D 舞台相关等待的统一超时。无头 Chromium 用 SwiftShader 软件渲染，首帧要同步编译着色器，
// Mac 被其他程序占满 CPU（负载 15 以上）时姻缘页首帧可达 140 到 150 秒，超过默认的 120 秒。
// 用环境变量 LGJ_STAGE_TIMEOUT（毫秒）放宽，测试级超时与动作等待按同一比例放大：
//   LGJ_STAGE_TIMEOUT=240000 npm run e2e
export const DEFAULT_STAGE_TIMEOUT = 120_000;
const MIN_STAGE_TIMEOUT = 30_000;

/** 解析超时设置：空值、非数字、小于 30 秒都退回默认值。 */
export function parseStageTimeout(value) {
  if (value === undefined || value === null || String(value).trim() === '') return DEFAULT_STAGE_TIMEOUT;
  const ms = Number(String(value).replace(/_/g, ''));
  if (!Number.isFinite(ms) || ms < MIN_STAGE_TIMEOUT) return DEFAULT_STAGE_TIMEOUT;
  return Math.round(ms);
}

export const STAGE_TIMEOUT = parseStageTimeout(process.env.LGJ_STAGE_TIMEOUT);
/** 放宽倍数，只放大不缩小。 */
export const STAGE_SCALE = Math.max(1, STAGE_TIMEOUT / DEFAULT_STAGE_TIMEOUT);

/** 把按默认负载写的毫秒数按放宽倍数放大。 */
export function scaled(ms, scale = STAGE_SCALE) {
  return Math.round(ms * Math.max(1, scale));
}
