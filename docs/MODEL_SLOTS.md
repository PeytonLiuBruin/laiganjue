# 交互模型

`src/ui/models/` 内置罗盘、水晶球、灵摆、星仪和四柱命牌。模型使用有厚度的旋转体、环体和棱柱，经过三维投影、光照与表面绘制输出到 Canvas；水晶球另有球面高光和按深度排序的内部雾层。全部由代码生成，构建后无需外部模型或纹理请求。

`createModelSlot` 管理状态传递、无障碍名称与卸载。注册同名工厂可覆盖内置模型，工厂仍返回 `{ set(state), dispose() }`，通过 `window.__lgj.registerModel(id, factory)` 注册。模块仅通过状态驱动模型，不读取模型内部 DOM。

内置渲染器在挂载后的首帧重新测量尺寸，并读取最新的可见性记录。模块直接挂载即可，不应通过暂时隐藏、移出屏幕或覆盖全局注册来唤醒模型。低动态模式关闭常驻环境动画，状态驱动的翻面与显字仍会完成。

| 模型 | 状态 | 表现 |
| --- | --- | --- |
| `fengshui.compass` | `angle`（负朝向角）、`text` | 带二十四山刻度的盘面和针转到对应方向 |
| `zodiac.sky` | `kind`、`stars`、`lines`、`glyph`、`active`、`text` | 星仪显示当前星座连线或生肖地支，问询时星光增强 |
| `crystal.ball` | `progress`、`active`、`revealed`、`text` | 摩擦聚雾，充满后停顿，再消散球心雾层并显字 |
| `crystal.pendulum` | `x`、`y`、`progress`、`active`、`result`、`glow`、`text` | 恒定链长的晶体随摆动坐标移动，盘面高亮最终方向 |
| `bazi.pillars` | `pillars`、`active`、`duration`（秒）、`text` | 四块命牌依次翻面，正面文字来自实际排盘结果 |

`geometry.js` 提供网格和投影，`painter.js` 负责统一光照，`objects.js` 组合物体，`index.js` 负责画布尺寸、皮肤、动画和传感器视差。隐藏、离屏及卸载后停止绘制；像素比例上限为 2。舞台随手机宽度缩放。简化动效设置缩短揭晓时间，保留必要的过程。

运行 `npm test` 验证模型法线、链长、窄屏边界和现有玩法；运行 `npm run build` 生成站点。浏览器检查应覆盖当前星座切换、罗盘方向、水晶球充能与重问、灵摆拖动，以及未知时辰和完整四柱两种排盘。
