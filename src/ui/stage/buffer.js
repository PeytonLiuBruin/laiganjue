// 舞台画布尺寸变化时的重绘规则。
// WebGL 画布每次改 width/height 都会清空绘图缓冲（没有开 preserveDrawingBuffer）。
// 改尺寸的时机有两个：ResizeObserver 回调（在 rAF 之后、合成之前）和降画质（在 tick 里 render 之后）。
// 原来这两处改完都不会再画，浏览器就把一帧空白画布合成上屏，滚动或掉帧时舞台闪一下白。
// 规则：尺寸和像素比都没变就不碰画布，变了就在同一个任务里立刻补画一帧（engine.js 的 resize）。

/** three.js setSize 写入画布的像素尺寸。 */
export function bufferSize(width, height, ratio) {
  return { width: Math.floor(width * ratio), height: Math.floor(height * ratio) };
}

/** 是否需要 setSize：画布像素尺寸或渲染器像素比和目标不一致。 */
export function bufferChanged(canvas, currentRatio, width, height, ratio) {
  const next = bufferSize(width, height, ratio);
  return canvas.width !== next.width || canvas.height !== next.height || currentRatio !== ratio;
}
