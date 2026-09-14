# 3D 模型位（Model Slots）—— 给建模 / 特效同学

应用里所有"实物"（罗盘、水晶球、灵摆、星空……）现在都用一个最普通的占位块顶着（虚线框 + 一个字 + 一行状态 + 一条进度 + 一个可移动的小点）。占位块的实现在 `src/ui/model-slot.js`，样式在 `src/styles/components.css` 的 `.model-slot`。

**替换方式**：不需要改任何模块代码。在页面脚本加载后（或打包进 `src/main.js` 之前）注册一个渲染器：

```js
window.__lgj.registerModel('fengshui.compass', (slotEl, ctx) => {
  // slotEl：占位块的 DOM 节点（position:absolute，占满舞台）。可以往里放 <canvas>，或替换其内容。
  // ctx：模块上下文（ctx.theme 当前皮肤 id、ctx.platform.prefersReducedMotion 等）。
  const canvas = document.createElement('canvas');
  slotEl.replaceChildren(canvas);
  // …初始化 three.js / Lottie / 自绘 …
  return {
    set(state) { /* 每次状态变化都会调用，见下表 */ },
    dispose() { /* 模块卸载时调用：停止 rAF、释放 GPU 资源 */ },
  };
});
```

注册后占位块会加上 `has-model` 类（隐藏虚线框、字、进度和小点），你的渲染器接管全部画面。多个槽位可以复用同一个工厂。

## 槽位与状态契约

| 槽位 id | 所在模块 | `set(state)` 会收到的字段 | 说明 |
| --- | --- | --- | --- |
| `fengshui.compass` | 风水 · 罗盘 | `angle`（度，= −朝向，盘面应按此旋转）、`glyph`（当前方位字）、`text`（读数） | 每次朝向变化都会调用，频率约 60 次/秒（平滑插值后） |
| `zodiac.sky` | 星座 · 星空 | `glyph`（星座符号 / 地支字）、`text`、`active`（true = 正在"看运势"，可做闪烁） | 切换星座 / 生肖时调用 |
| `crystal.ball` | 水晶球 | `progress`（0–1 充能）、`glow`（≥0.6 发光）、`active`（雾在加速）、`text` | 摩擦 / 摇动 / 凝视时频繁调用；`progress` 到 1 时模块会在球上方叠加文字，请让球心留空 |
| `crystal.pendulum` | 灵摆 | `x`、`y`（−1…1，锥尖相对摆盘中心的位置）、`progress`（0–1 问询进度）、`glow`（已判定）、`active`（摆动中）、`text` | 摆动期间每帧调用；摆盘上下 = 是、左右 = 否、画圈 = 不明 |

已有 Canvas 实现的实物（筊杯、硬币、骰子等）暂不走槽位；如需统一，也可以把它们迁到同一套 `registerModel` 机制。

## 尺寸与皮肤

- 占位块占满舞台内边距（`inset: 14px`），舞台高约 300–420px，宽随屏幕（手机约 340px）。
- 皮肤颜色请从 CSS 变量读：`getComputedStyle(document.documentElement).getPropertyValue('--accent')` 等，变量表见 `src/styles/themes.css` 与 `src/styles/refinement.css`；`ctx.onTheme(cb)` 可监听切换。
- `ctx.platform.prefersReducedMotion` 为 true 时请把动画降到最低。

## 本地测试

```bash
npm run dev            # http://localhost:4173
node scripts/smoke.mjs --module crystal --act --shots dist/shots-crystal   # 无头手机截图
```
