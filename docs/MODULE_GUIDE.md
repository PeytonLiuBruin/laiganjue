# 模块开发约定（MODULE_GUIDE）

本项目是一个「无构建依赖的 ES 模块 Web 应用」，按小程序友好的方式分层：

```
src/
  core/        纯逻辑（无 DOM、无 window）：rng.js 随机 / lunar.js 农历八字黄历
  platform/    平台层：web.js（体感 / 手势 / 震动 / 音效 / 存储 / 分享）
  ui/          app.js 应用壳（路由/首页/皮肤/设置） kit.js 组件库
  styles/      tokens.css 尺寸字体动效  themes.css 五套皮肤色板  base.css  components.css
  modules/
    list.js      模块元数据（id/标题/字/分区/手势/一句话）—— 纯数据
    registry.js  id → 实现
    index.css    @import 每个模块的 style.css
    <id>/
      index.js   export default { id, mount(container, ctx) → cleanup? }
      core.js    纯逻辑（可被 node --test 直接测试）
      data.js    文案 / 内容数据（纯数据）
      view.js    DOM 界面（只能通过 ctx.kit / ctx.platform 触达平台）
      style.css  样式，所有选择器必须以 .m-<id> 开头
tests/<id>.test.mjs   node:test 单测，只测 core.js / data.js
```

## 1. 模块契约

```js
// src/modules/<id>/index.js
import { mount } from './view.js';
export default { id: '<id>', mount };

// view.js
export function mount(container, ctx) {
  // 把界面 append 到 container；返回可选的清理函数
  return () => {};
}
```

`ctx` 提供（**模块不得直接 import platform/web.js，也不得使用 window.addEventListener 监听传感器**）：

| 字段 | 说明 |
| --- | --- |
| `ctx.kit` | 组件库，见 §3。`const { h, button, stage, resultCard, sheet, chips, tabs, hint, toast, wait, confetti } = ctx.kit` |
| `ctx.motion.onShake(cb)` | 摇一摇。`cb({intensity, count, source})`。返回取消函数；模块卸载时自动取消 |
| `ctx.motion.onToss(cb)` | 向上甩/抛一次。`cb({intensity, vec, source})` |
| `ctx.motion.onMotion(cb)` | 原始加速度流 `{mag, smooth, ax, ay, az}`，用于实时抖动动画（节流！） |
| `ctx.motion.onTilt(cb)` | `{alpha, beta, gamma}` 倾斜；`ctx.motion.onHeading(cb)` → `{heading}` 罗盘朝向 0–360 |
| `ctx.motion.simulate(type, payload)` | 手动触发同名事件（屏幕手势回退时用它，让模块只有一条事件入口） |
| `ctx.motion.state / live / supported / needsPermission` | 权限状态 |
| `ctx.ensureMotion()` | iOS 需用户手势申请权限：在按钮点击里 `await ctx.ensureMotion()` |
| `ctx.gesture.flick(el, cb, {minSpeed, axis:'y'|'x', direction:'up'|'down'|'left'|'right'|'any'})` | 屏幕快速甩动 `cb({direction, speed, intensity})` |
| `ctx.gesture.drag(el, {onStart,onMove,onEnd})` | 拖拽（onEnd 给 vx, vy, speed） |
| `ctx.gesture.spin(el, cb, {onMove})` | 绕元素中心拨动，松手 `cb(omega rad/s)`，`onMove(deltaRad)` 实时跟手 |
| `ctx.gesture.rub(el, cb)` | 摩擦 `cb({intensity 0-1, distance})` |
| `ctx.gesture.tap(el, cb)` / `longPress(el, cb)` | |
| `ctx.haptic.tap/light/medium/heavy/success/double/rattle()` | 震动（不支持时静默） |
| `ctx.sound.play(name, {delay})` | 合成音效：`clack coin shake rattle whoosh flip chime tick gong pop thud paper shimmer low success` |
| `ctx.storage.get(k, def) / set(k, v) / remove(k)` | 已按模块 id 命名空间隔离的本地存储 |
| `ctx.share(text)` | 系统分享或复制，返回 `'shared' | 'copied' | 'failed'` |
| `ctx.rng` | `random randomInt pick pickMany shuffle weightedPick chance seeded dailyRng dateKey hashString` |
| `ctx.toast(msg)` | 轻提示 |
| `ctx.navigate('#/')` `ctx.setTitle(text)` | 路由 / 头部标题 |
| `ctx.theme` `ctx.onTheme(cb)` | 当前皮肤 id：ink / cinnabar / nebula / paper / celadon |
| `ctx.setTimeout(fn, ms)` | 会随模块卸载自动清除的定时器（动画排程一律用它或 `kit.wait`） |
| `ctx.addCleanup(fn)` | 注册卸载回调 |
| `ctx.platform.prefersReducedMotion` | 为 true 时动画应瞬时完成 |

农历/八字：`import { Solar, Lunar, lunarFromDate, lunarFromYmd, almanacSummary } from '../../core/lunar.js'`（底层 lunar-javascript，API 见其 README：`lunar.getDayYi() getDayJi() getDayChongDesc() getEightChar() ...`）。

## 2. 体验硬性要求（每个模块都要满足）

1. **三条入口做同一件事**：体感（摇/甩）+ 屏幕手势（在舞台上滑动/拨动/摩擦）+ 一个 `primary: true` 的大按钮（`data-action="primary"`，冒烟测试会点它）。桌面浏览器没有传感器也必须完全可玩。
2. **舞台里有"实物"**：用 `kit.stage()` 放 3D/动画的实物（筊杯、签筒、铜钱、牌、转盘、罗盘、水晶球…），动作过程要有 **起飞 → 飞行 → 落地/停止 → 揭示** 的节奏，落地配 `sound` + `haptic`。参考 `src/modules/jiaobei/view.js`。
3. **结果用 `kit.resultCard()` 放进 `kit.sheet()` 底部抽屉**，含：kicker（小字）、大标题、badge、印章 seal（1–2 字）、verse（诗句/签文）、sections（解曰 / 建议 / 分项…）、footer 「仅供娱乐」。抽屉 actions 至少有「再来一次」与「分享」（用 `ctx.share`）。
4. **防重入**：动画进行中忽略新触发（`busy` 标志），按钮 disabled。
5. **只用 CSS 变量取色**（`var(--accent)` 等，见 `src/styles/themes.css`），五套皮肤下都要好看；不要写死颜色（材质色除外，如红漆、木头、金属、纸张——可写死但需在浅色皮肤检查对比度）。
6. **无外部资源**：不加载图片/音频/字体文件；图形用 CSS、内联 SVG（`kit.svg()` / `kit.fromHTML()`）或 Unicode（六十四卦符号 ䷀–䷿ 可用；卢恩字母请用 SVG 路径，字体覆盖不稳）。
7. **内容要"多而好"**：文案用白话带一点古意，具体、可读、不空洞、不恐吓（凶签也给出路）。全部放 `data.js`。避免医疗/法律/投资等确定性断言。
8. **模块内所有选择器以 `.m-<id>` 开头**，不改公共样式。需要新公共组件请在模块内部实现，不改 kit.js。
9. **模块文件 import 时不得触碰 DOM**（`node --test` 会 import core/data；view.js 顶层不要访问 document）。
10. **手机优先**：390px 宽必须完整可用，不横向滚动；触摸目标 ≥ 40px；使用 `.no-touch` 的手势区域要明显。
11. **卸载干净**：`mount` 返回的函数里取消动画、清定时器（motion/gesture 订阅由 ctx 自动清）。
12. 挂载完成后不需要做任何标记——应用壳会在 `mount` resolve 后设置 `data-ready="1"`。因此 `mount` 里**不要**长时间 await（先把界面画出来，再异步做别的）。

## 3. kit 速查

```js
h('div', {class:['a', cond && 'b'], style:{...}, onClick, dataset:{}, attrs:{}, html, text}, ...children)
button('文字', {variant:'primary'|'ghost'|'soft'|'danger', size:'small'|'large', block, icon:'refresh'|'share'|..., onClick, primary, disabled})
actionBar(btn1, btn2)
chips([{value,label}], {value, onChange, scroll})  → {el, value, set(v)}
tabs([...])  → {el, value, set(v)}
field(label, control)   input({placeholder, value, onInput, onEnter, maxlength})   select(options, {value,onChange})   toggle(on, onChange)
stage({cls, hint, badge, minHeight}) → {el, scene, setHint(t), setBadge(t)}   // scene 是 preserve-3d 的居中容器
hint('toss'|'shake'|'flick'|'flip'|'spin'|'tilt'|'rub'|'tap', '文字')
resultCard({kicker, title, titleGold, badge, sub, seal, verse, sections:[{label, text|node, stack}], footer})
sheet({title, content, actions:[buttons], onClose, dismissible}) → {open(), close(), setContent(node), setTitle(t)}
toast(msg)   wait(ms)   nextFrame()   animate(el, keyframes, {duration, easing}) → Promise
typewriter(el, text, {speed, onDone})   countUp(el, to)   confetti(container, {count, origin:{x,y}})
parallax(el, {max}) → fn(tilt)    historyBar(items, fmt)   stars(n, max)   ornament()   sectionHead(title, kicker)   seal(text)   icon(name)
svg(innerPaths, {viewBox, size, stroke, fill, strokeWidth})   fromHTML('<svg ...>')   clear(el)   append(el, children)
```

可用的 CSS 类（components.css）：`.card .card.strong .corners(+子元素 .corner-b) .paper-slip .btn .chip .tabs .field .input .select .result .seal .ornament .stars .history .placeholder .t-display .t-kicker .t-muted .t-faint .gold-text .row .col .grow .mt-*`。

## 4. 本地验证

```bash
npm test                                   # 全部单测（node:test）
node --test tests/<id>.test.mjs            # 单个模块
node scripts/smoke.mjs --module <id> --act # 构建 + 无头手机浏览器打开模块 + 模拟摇/甩 + 点主按钮 + 截图（dist/shots/<id>.png, <id>-2.png）
node scripts/smoke.mjs --module <id> --theme paper   # 浅色皮肤下检查
node scripts/build.mjs                     # 产出 dist/index.html（单文件）
```

冒烟测试通过标准：无 console.error / pageerror，`data-ready="1"` 出现，两张截图看起来正确（打开 PNG 检查！）。

## 5. 参考实现

`src/modules/jiaobei/` 是完整参考：core.js（可测的纯逻辑 + 会话状态机）、data.js（文案）、view.js（舞台 + 3D 翻转 + 体感/手势/按钮三入口 + 结果抽屉 + 历史 + 分享）、style.css（.m-jiaobei 作用域）、tests/jiaobei.test.mjs。
