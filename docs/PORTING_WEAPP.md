# 微信小程序移植指南（PORTING_WEAPP）

> 面向工程师。目标：把「来感觉 · 玄学占卜」从 Web 移植为原生微信小程序，**core / data / lunar 原样复制，只重写 view 层与一个 `platform/weapp.js`**。所有接口名以 `src/platform/web.js` 与 `src/ui/kit.js` 的实际导出为准；文中 wx API 的基础库版本以撰写时官方文档为据，落地前请在开发者工具里复核。

---

## 1. 为什么这套架构便于移植

| 设计 | 在 Web 里的样子 | 移植时的收益 |
| --- | --- | --- |
| **core / data 与 view 分离** | `modules/<id>/core.js` 纯逻辑（可被 `node --test` 直接 import），`data.js` 纯文案，`view.js` 才碰 DOM | `core.js`、`data.js`、`core/rng.js`、`core/lunar.js`、`vendor/lunar.cjs` **一行不改**地进小程序；单测 `tests/*.test.mjs` 继续在 Node 里跑，保证两端逻辑一致 |
| **platform 抽象** | 模块只通过 `ctx.motion / gesture / haptic / sound / storage / share` 触达设备，禁止直接 `window.addEventListener` | 只需写一个同名接口的 `platform/weapp.js`（映射表见 §3），view 层调用方式不变 |
| **CSS 变量皮肤** | `themes.css` 五套皮肤全部是 `--bg / --accent / --seal …` 变量；组件与模块样式只 `var()` 取色 | WXSS 支持 CSS 自定义属性且沿 DOM 继承，五套皮肤整段搬运，换皮肤 = 换根节点一个 class |
| **单模块目录 = 单页面** | `modules/<id>/{index,core,data,view,style}` 自包含，选择器全部 `.m-<id>` 前缀，无跨模块依赖 | 一个目录 → 一个 `pages/<id>/`，样式天然隔离，天然按分区分包 |
| **三入口约定** | 体感 + 屏幕手势 + `primary` 大按钮做同一件事 | 传感器在 web-view / 低端机不可用时体验不塌；小程序审核员在模拟器里也能点通 |
| **无外部资源** | 无图片、音频、字体文件，图形用 CSS / 内联 SVG / Unicode，音效 WebAudio 合成 | 包体几乎只有代码与文案；音效代码可复用到 `wx.createWebAudioContext` |

移植工作量集中在三块：**平台层（约 700 行）**、**kit 组件（约 30 个函数 → 十来个自定义组件）**、**13 个 view.js**（每个 200–400 行 DOM 代码 → WXML + Page 逻辑）。

---

## 2. 三条路线对比

| | A. 原生小程序重写 view 层 | B. uni-app / Taro | C. `<web-view>` 内嵌 H5 |
| --- | --- | --- | --- |
| 复用 | core / data / rng / lunar 100%；平台层算法照搬；view 重写 | 同 A，view 用 Vue/React 重写；platform 层仍需按 wx API 写一遍 | 100%（直接跑 `dist/index.html`） |
| 体验 | 原生渲染、`this.animate` 与 WXS 手势跟手；分享、震动、传感器全量可用 | 接近 A，多一层框架运行时（+200–500KB 主包），3D transform 与 keyframe 动画需绕过框架抽象 | 受限（见下） |
| 工时（1 名熟悉小程序的前端） | **约 6–7 人周**：平台层 2–3 天、组件 + 壳 3–4 天、筊杯参考页 2 天、其余 12 模块各 1–2 天、性能/包体/合规 3–5 天 | 约 5–6 人周（组件层用框架生态少写一点，但调试成本更高） | 1–2 天开发 + 备案周期 |
| 硬性限制 | 主包 2MB、需分包；需重写 DOM 代码 | 同 A；框架版本与基础库兼容问题 | **仅企业主体可用 web-view**（个人主体不可用）；需配置**业务域名**（HTTPS + 域名已 **ICP 备案** + 校验文件）；页面整屏被 web-view 占据，不能叠加小程序原生 UI |
| 传感器 | `wx.onAccelerometerChange` 等，无需授权弹窗 | 同 A | iOS WKWebView 内 `devicemotion` 大多可用但**不保证**，`DeviceMotionEvent.requestPermission` 行为受宿主控制；Android 依赖 X5/系统内核，差异大；罗盘 `deviceorientationabsolute` 基本不可用 |
| 分享 | `onShareAppMessage` 自定义标题/路径/图 | 同 A | 只能分享 web-view 当前 URL（`res.webViewUrl`），H5 内 `navigator.share` 不可用，需靠 `wx.miniProgram.postMessage` 回传文案 |
| 审核 | 类目与内容需合规（§6） | 同 A | 同样审核，且 H5 内容变更不受版本控制，审核更敏感 |

**推荐路线 A。** 理由：项目当初分层就是为此准备的，view 层重写是唯一真正的工作量；A 拿到完整的原生能力（震动分级、分享卡片、无授权传感器、分包按需加载），且没有框架层和 web-view 的双重不确定性。路线 C 适合**只做一周内的市场验证**，且前提是企业主体 + 已备案域名。路线 B 只在团队已有 uni-app/Taro 基建、且未来还要出支付宝/抖音小程序时才值得。

---

## 3. 平台层映射表（`platform/web.js` → `platform/weapp.js`）

`createPlatform()` 返回 `{ name, isIOS, isTouch, prefersReducedMotion, motion, gesture, haptic, sound, storage, share }`，`weapp.js` 保持同一形状（`name: 'weapp'`）。`isIOS` 取 `wx.getDeviceInfo().platform === 'ios'`，`prefersReducedMotion` 在小程序没有对应 API，固定 `false`（或做成设置项）。

### 3.1 motion

| web.js | weapp.js | 说明 |
| --- | --- | --- |
| `onShake / onToss / onMotion(cb)` → 返回取消函数 | `wx.startAccelerometer({ interval: 'game' })` + `wx.onAccelerometerChange(handler)`；取消用 `wx.offAccelerometerChange(handler)`，无订阅者时 `wx.stopAccelerometer()` | `interval` 三档：`game` ≈ 20ms、`ui` ≈ 60ms、`normal` ≈ 200ms。峰值检测必须用 `game`；`onMotion` 只做视觉反馈的模块可降到 `ui`。**`wx.onAccelerometerChange` 是全局监听，不随页面销毁**，务必集中在 weapp.js 单例里管理，页面 `onHide/onUnload` 时退订 |
| 单位 m/s²，去重力后的线性加速度；`e.acceleration` 缺失时用 `accelerationIncludingGravity` 走一阶高通（k = 0.85） | `res.x/y/z` **单位是 g**（静止时模长 ≈ 1），且**始终含重力** | 先 `ax = res.x * 9.8` 换回 m/s²，再**固定走 web.js 里 `accelerationIncludingGravity` 的那条分支**：`grav = k*grav + (1-k)*a`，`lin = a - grav`。这样 `PEAK = 13`、`REFRACTORY = 90`、`WINDOW = 900`、`TOSS_WAIT = 380`、`SHAKE_COOLDOWN = 800` 五个常量与 `handlePeak()`（首个峰值起 380ms 内只出现 1–2 个峰 = 甩，取最大峰为 `intensity`；900ms 窗口内累计 ≥3 个峰 = 摇，`intensity` 为均值，之后 800ms 冷却）**原样照搬** |
| `performance.now()` | `Date.now()`（或 `wx.getPerformance().now()`） | 精度到 ms 足够；采样间隔 20ms，`REFRACTORY = 90` 意味着最多每 4–5 帧记一个峰 |
| `emit('motion', { mag, smooth, ax, ay, az, t })` | 同 | `smooth = 0.8*smooth + 0.2*mag` 照抄。**禁止在 onMotion 回调里 setData**（50Hz），只更新内存，用节流 ≥ 80ms 的一次 setData 或 `this.animate` 驱动画面 |
| `onTilt(cb)` → `{ alpha, beta, gamma, absolute }` | `wx.startDeviceMotionListening({ interval: 'ui' })` + `wx.onDeviceMotionChange(res => cb({ alpha: res.alpha, beta: res.beta, gamma: res.gamma, absolute: false }))`；退订 `wx.offDeviceMotionChange` / `wx.stopDeviceMotionListening` | 角度单位与 `deviceorientation` 一致（度）。`kit.parallax` 的 `(beta - 45) / 30` 归一化可继续用。iOS/Android 的 alpha 参考系不同，不要用它算朝向 |
| `onHeading(cb)` → `{ heading 0–360, accuracy }` | `wx.startCompassListening()` + `wx.onCompassChange(res => cb({ heading: res.direction, accuracy: res.accuracy }))` | 比 Web 简单得多，无需 `webkitCompassHeading` / `(360 - alpha) % 360` 分支。`accuracy` 在 iOS 是数字，在 Android 是字符串枚举（`high/medium/low/no-contact/unreliable/unknow`），风水模块要显示"校准提示"时按类型判断 |
| `requestPermission()` → `'granted' \| 'denied' \| 'unsupported'`；`needsPermission`（iOS 13+ 的 `DeviceMotionEvent.requestPermission`） | **无需授权**。`requestPermission` 直接 `return 'granted'`，`needsPermission = false`，`state = 'granted'`，`supported = true` | app.js 里的 `motionBanner()` 与 `ensureMotion()` 因此永远不显示，可以删掉；`ctx.ensureMotion()` 保留为 no-op 以免模块改代码 |
| `simulate(type, payload)` | 同，纯 JS 事件总线 | 屏幕手势回退与自动化测试仍走这一条入口 |
| `live / lastEventAt` | 同 | 在设置页显示"传感器正常"时用 |

### 3.2 gesture

| web.js（Pointer Events） | weapp.js（Touch Events） |
| --- | --- |
| `track(el, { onStart, onMove, onEnd, prevent })` 以 `pointerdown/move/up/cancel` 采样，保留最近 12 个样本，松手时用**最近 110ms** 的样本算 `vx, vy`（px/ms） | 做成纯 JS 类 `Tracker`，方法 `start(e) / move(e) / end(e)`，页面把 `bindtouchstart / catchtouchmove / bindtouchend / bindtouchcancel` 转发进来；坐标取 `e.touches[0].clientX/clientY`（`end` 用 `e.changedTouches[0]`），时间 `Date.now()`。**采样、速度、距离算法一字不改**。`prevent` → 在 WXML 里用 `catchtouchmove`（阻止页面滚动），无需 `preventDefault` |
| `setPointerCapture` | 不需要：touch 事件天然锁定到起始元素 |
| `flick(el, cb, { minSpeed = 0.55, minDist = 40, axis, direction })` → `cb({ direction, speed, dx, dy, intensity })` | 建在 `Tracker.onEnd` 上，`intensity = min(40, 10 + |v| * 14)` 等公式照抄。小程序没有 `el` 可传，第一个参数忽略，**返回值从"取消函数"改为句柄 `{ start, move, end, off }`**，页面把三个 touch 事件转发给它（§7 示例即如此），`ctx.cleanup()` 时调 `off()` |
| `drag(el, handlers)` | 同；实时跟手请改用 **WXS 响应事件**（`bindtouchmove="{{wxs.move}}"`，在渲染层直接 `setStyle`），逻辑层只收 `onEnd` 的速度 |
| `spin(el, cb, { onMove })`：以 `getBoundingClientRect()` 中心算角度，`omegaSamples` 保留 6 个、松手取最近 120ms 平均 | 中心坐标需 `wx.createSelectorQuery().select(sel).boundingClientRect()`，**异步**——在 `touchstart` 时查一次并缓存；角度差归一化到 (-π, π] 与角速度平均照抄。实时旋转同样建议 WXS |
| `rub(el, cb, { throttle = 120 })` → `intensity = min(1, acc / 260)` | 同算法；`rub` 频率低（120ms 节流），可以直接 setData |
| `tap(el, cb)`（位移 < 10px 且 < 400ms）/ `longPress(el, cb, { ms = 500 })` | 可直接用 `bindtap` / `bindlongpress`（小程序 longpress 固定 350ms），或沿用 Tracker 实现以保持阈值一致 |

### 3.3 haptic

| web.js | weapp.js |
| --- | --- |
| `pattern(p)` → `navigator.vibrate(p)` | 无 pattern API。用 `setTimeout` 串行模拟：数组偶数位为震动、奇数位为间隔；每段震动映射到一次 `wx.vibrateShort` |
| `tap()` 10ms / `light()` 15ms | `wx.vibrateShort({ type: 'light' })` |
| `medium()` 30ms | `wx.vibrateShort({ type: 'medium' })` |
| `heavy()` 55ms | `wx.vibrateShort({ type: 'heavy' })` |
| `success()` `[20,40,20]` | `light` → 40ms 后 `medium` |
| `double()` `[15,60,15]` | `light` → 60ms 后 `light` |
| `rattle()` `[8,18,8,18,8,18,8]` | 4 次 `light`，间隔 26ms；iOS 会合并过密的调用，实测保留 3–4 下即可 |
| `enabled / setEnabled / supported` | 同；`supported` 固定 `true`；`type` 参数需基础库 ≥ 2.13.0，旧版本忽略即可 |
| — | `wx.vibrateLong()`（约 400ms）可给「立筊 / 大吉」这类重揭示用，Web 端无对应，仅在 weapp.js 内部使用 |

### 3.4 sound（15 个合成音效：`clack coin shake rattle whoosh flip chime tick gong pop thud paper shimmer low success`）

**方案一（推荐）：`wx.createWebAudioContext()`，基础库 ≥ 2.19.0。** web.js 里 `createSound()` 的 `env / noise / tone / recipes` 约 150 行可以**近乎原样复用**，差异只在 `ensure()`：

```js
// weapp.js
function ensure() {
  if (!ctx) {
    ctx = wx.createWebAudioContext();          // 替代 new (window.AudioContext || webkitAudioContext)()
    master = ctx.createGain(); master.gain.value = 0.7; master.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 1.2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
```

差异清单：① 没有 `window.addEventListener('pointerdown', unlock)`，改为在首页任意 `bindtap`（或 `app.onShow`）里调一次 `ensure()`；② 页面 `onHide` 时 `ctx.suspend()`，`app.onHide` 时可 `ctx.close()` 并置空，避免后台占用音频会话；③ `OscillatorNode.detune`、`BiquadFilterNode.Q`、`AudioBufferSourceNode.loop`、`exponentialRampToValueAtTime` 官方文档均列为支持，但**低端 Android 上 `createWebAudioContext` 有爆音/延迟报告**，上线前用 3 台 Android 真机过一遍 15 个音效；④ iOS 静音键：WebAudio 是否跟随静音开关请真机验证，若需与 H5 一致可尝试 `wx.setInnerAudioOption({ obeyMuteSwitch: false })`。

**方案二（退化）：预生成短音频 + `wx.createInnerAudioContext({ useWebAudioImplement: true })`。** 用仓库里已有的 Playwright 起一个无头页面，在 `OfflineAudioContext` 里跑 15 个 recipe 各渲染 1–2.2 秒，导出 WAV 再转 MP3（每个 5–30KB，合计 < 300KB，放分包或 CDN）。每个音效常驻一个 InnerAudioContext（`src` 指向文件，`play()` 前 `stop()` 以便重叠触发），`useWebAudioImplement: true` 保证短音效低延迟。`play(name, { delay })` 的 `delay` 用 `setTimeout` 实现。缺点：`shake/rattle` 里的随机频率变成固定采样，且引入资源文件。

### 3.5 storage / share / toast / 剪贴板

| web.js | weapp.js |
| --- | --- |
| `createStorage(prefix = 'lgj:')` → `{ get(key, def), set(key, val), remove(key), namespace(ns) }`，值 `JSON.stringify` 后存 `localStorage`，失败静默 | `wx.getStorageSync(prefix + key)` / `wx.setStorageSync` / `wx.removeStorageSync`，**全部同步**，需 `try/catch`（`setStorageSync` 超配额会 throw）。**注意：key 不存在时 `getStorageSync` 返回 `''` 而不是 `null`**，判空要写 `raw === '' || raw == null`。继续自己 `JSON.stringify/parse`（小程序虽可直接存对象，但保持与 Web 端同一份序列化，便于将来做云同步）。单 key ≤ 1MB，总量 ≤ 10MB，本项目每个模块只存 `history`（≤ 12 条）与 `mode`，远低于上限 |
| `share(text, { title })` → `Promise<'shared' \| 'copied' \| 'failed'>`，优先 `navigator.share`，回退剪贴板 | 小程序**不能用 JS 主动弹分享面板**，只能由 `<button open-type="share">` 触发页面的 `onShareAppMessage(res)`。实现：`share(text)` 把 `text` 写进 `getCurrentPages().pop().__lgjShare = { text }`，然后 `wx.setClipboardData({ data: text })` 并返回 `'copied'`；结果抽屉里的「分享」按钮改为 `open-type="share"`，`onShareAppMessage` 从 `this.__lgjShare` 生成 `{ title: text.split('\n')[0].slice(0, 30), path: '/pages/jiaobei/index', imageUrl }`。这样模块代码 `const r = await ctx.share(text)` 不用改，只是 toast 文案永远走 `'copied'` 分支 |
| `kit.toast(msg, { duration = 1800 })` | `wx.showToast({ title: msg, icon: 'none', duration: 1800 })`。`icon: 'none'` 时标题可两行、不限 7 字。若要保留项目的胶囊样式，做一个 `lgj-toast` 组件放在每页底部 |
| 剪贴板回退 `navigator.clipboard.writeText` / `execCommand('copy')` | `wx.setClipboardData({ data })`——**成功后微信自带一个「内容已复制」toast**，较新基础库支持 `showToast: false` 关掉；否则 `ctx.share` 返回 `'copied'` 后模块不要再 toast，避免重复 |

---

## 4. UI 映射

### 4.1 `kit.h` / DOM → WXML + setData

Web 端 view.js 是"命令式建 DOM + 直接改节点"，小程序是"声明式模板 + `setData` 改数据"。映射原则：**把 view.js 里每个会被修改的 DOM 节点变成一个 data 字段**。以筊杯为例：

| view.js 里的操作 | Page data / WXML |
| --- | --- |
| `st.setBadge(text)` `st.setHint(text)` | `stage.badge` `stage.hint` → `<lgj-stage badge="{{stage.badge}}" hint="{{stage.hint}}">` |
| `streakEl.textContent = STREAK_LABELS[n]; streakEl.hidden = …` | `streak: { text, show }` → `<view class="jb-streak" hidden="{{!streak.show}}">{{streak.text}}</view>` |
| `tossBtn.disabled = true` | `busy: true` → `disabled="{{busy}}"` |
| `renderHistory()` 重建子节点 | `historyNames: string[]` → `<lgj-history-bar items="{{historyNames}}"/>` |
| `el.dataset.face = face; el.classList.add('standing')` | `blocks.a.face` `blocks.a.standing` → `class="jb-block {{blocks.a.standing ? 'standing' : ''}}"` |
| `sheet({...}).open()` | `sheet: { show: true, title, card: {...}, actions: [...] }` → `<lgj-sheet show="{{sheet.show}}">` |

`h()` 的 `class: [a, cond && b]` 数组写法对应 WXML 三元表达式；`html:` 注入的 SVG 见 §4.4；`dataset` 对应 `data-*` 属性（在事件 `e.currentTarget.dataset` 里取）。

### 4.2 自定义组件清单（`components/`）

所有组件 `options: { styleIsolation: 'apply-shared' }`（让页面级 `.theme-*` 变量与公共 class 进得来），命名 `lgj-*`。

| kit 函数 | 组件 | properties | 事件 / 说明 |
| --- | --- | --- | --- |
| `button(label, opts)` | `lgj-button` | `label, variant('primary'\|'ghost'\|'soft'\|'danger'), size('small'\|'large'), block, icon, primary, disabled, openType` | `bind:tap`；`primary` 渲染为 `data-action="primary"` 供自动化点按；`openType="share"` 透传给内部 `<button>` |
| `actionBar(...btns)` | 不做组件 | — | 一个 `.action-bar` flex 容器 + slot |
| `chips(items, {value, onChange, scroll})` | `lgj-chips` | `items: [{value,label}], value, scroll` | `bind:change` → `e.detail.value`；`scroll` 时内部用 `<scroll-view scroll-x>` |
| `tabs(items, {value, onChange})` | `lgj-tabs` | `items, value` | `bind:change`；`role=tablist` 换成 `aria-role` |
| `field / input / select / toggle` | 原生 | — | `<input>`（`maxlength`, `confirm-type`, `bindinput`, `bindconfirm` 对应 `onEnter`）、`<picker mode="selector">` 对应 `select`、`<switch>` 对应 `toggle`；八字页的日期用 `<picker mode="date">` |
| `stage({cls, hint, badge, minHeight})` → `{el, scene, setHint, setBadge}` | `lgj-stage` | `hint, badge, minHeight, cls` | 默认 slot 即 `scene`（`transform-style: preserve-3d` 的居中层）；`stage-floor` 内置；hint 淡出用 `transition: opacity` |
| `hint(gesture, text)` | `lgj-hint` | `gesture('toss'\|'shake'\|'flick'\|'flip'\|'spin'\|'tilt'\|'rub'\|'tap'), text` | 图标见 §4.4；各手势的小动画（摇/甩）用 WXSS `@keyframes` |
| `resultCard({...})` | `lgj-result-card` | `kicker, title, titleGold=true, badge, sub, seal, verse, sections: [{label, text, stack}], footer` | `verse` 按 `\n` 拆行用 `wx:for`；`sections[i].node`（Web 端允许塞节点，如六爻的卦象）改为**具名 slot** `slot="section-{{i}}"` + `multipleSlots: true` |
| `sheet({title, content, actions, onClose, dismissible})` → `{open, close, setContent, setTitle}` | `lgj-sheet` | `show, title, dismissible=true` | slot `default`（内容）与 `actions`；`bind:close`。过渡：`.sheet { transform: translate(-50%,105%); transition: transform 600ms var(--ease-out) }` + `.sheet.open`，关闭后 420ms 再 `hidden`（对应 Web 端 `setTimeout(…, 420)`）。下拉关闭：`bindtouchstart/move/end` 记录 `dy`，`> 90px` 触发 close；内容区滚动用 `<scroll-view scroll-y>`，`scrollTop > 0` 时不接管手势 |
| `seal(text, {stamp})` | `lgj-seal` | `text, stamp` | 纯样式 |
| `stars(n, max=5)` | `lgj-stars` | `n, max` | `wx:for="{{max}}"` |
| `historyBar(items, fmt)` | `lgj-history-bar` | `items: string[]` | 格式化在页面 JS 里做完再传字符串 |
| `ornament()` / `sectionHead(title, kicker)` | `lgj-ornament` / `lgj-section-head` | `title, kicker` | 首页与设置页用 |
| `toast(msg)` | `wx.showToast` 或 `lgj-toast` | — | 见 §3.5 |
| `wait(ms)` `nextFrame()` | 工具函数 | — | `nextFrame` → `wx.nextTick` 或 `setTimeout(fn, 16)` |
| `animate(el, keyframes, opts)` `confetti` `typewriter` `countUp` `parallax` | 见 §4.3 | — | |
| `placeholder(glyph, title, desc)` | `lgj-placeholder` | — | 未构建/失败占位 |

### 4.3 动画：CSS 3D / Web Animations → 小程序

| Web 端 | 小程序 | 备注 |
| --- | --- | --- |
| `el.animate(keyframes, { duration, fill, easing })`（`jiaobei/view.js` 的 `fly()`：位移弹跳 + 内层 `rotateX(spins + finalRot)` 翻转 + 阴影缩放三条并行） | **`this.animate(selector, keyframes, duration, callback)`**（Page/Component 方法，基础库 ≥ 2.9.0，关键帧动画在渲染层执行） | 关键帧写法从 `transform: 'translate(…) rotateZ(…)'` 字符串拆成独立字段 `{ translateX, translateY, rotateZ, offset, ease }`；`easing` 名 → `ease: 'cubic-bezier(.2,.9,.4,1)'`。`fill: forwards` 是默认行为；`rest()` 里的 `getAnimations().forEach(a => a.cancel())` → `this.clearAnimation(selector, { transform: true })` 后再 setData 回静止位姿 |
| `@keyframes jb-ember / jb-smoke` 等无限循环环境动画 | WXSS `@keyframes` **原样可用** | 只需把 `.m-jiaobei` 前缀去掉（页面样式天然隔离）或保留也无妨 |
| `perspective: 900px` `transform-style: preserve-3d` `backface-visibility: hidden` `rotateX(180deg)` 两面翻转 | WebView 渲染器支持（iOS WKWebView / Android Chromium 内核） | **Skyline 渲染器对 `preserve-3d`、`mix-blend-mode`、`backdrop-filter` 支持不完整**，第一阶段 `app.json` 不要开 `"renderer": "skyline"` |
| `wx.createAnimation()` | 备选 | 老 API，按 step 导出 `animation` 数据绑定到节点，无法表达多段 offset 曲线，仅当基础库 < 2.9.0 需要兼容时使用 |
| `confetti(container, { count: 60 })`：60 个 `span.animate` | `count ≤ 40` 用 `wx:for` 出 view + `this.animate` 逐个；更多用 `<canvas type="2d">` 画 | 立筊彩蛋出现概率 1/300，用 canvas 不亏 |
| `typewriter(el, text, { speed: 45 })` `countUp(el, to)` | `setData` 逐字/逐帧 | 签文 ≤ 40 字、800ms 内约 24 次 setData，可接受；放在 `sheet` 内、不要与舞台动画同时进行 |
| `parallax(el, { max })`：`onTilt` 直接改 `style.transform` | `onTilt` 节流 ≥ 80ms → setData 一个 `style` 字符串，元素加 `transition: transform 120ms linear` 平滑 | 或者干脆在小程序端关掉视差（非核心） |
| `ui/zen.js` 静观屏保：Canvas 2D + `requestAnimationFrame`、`navigator.wakeLock`、`requestFullscreen`、`visibilitychange`、闲置计时自动进入 | 独立页面 `pages/zen`（`navigationStyle: custom` 即全屏）；`<canvas type="2d">` + `canvas.requestAnimationFrame`；防休眠 `wx.setKeepScreenOn({ keepScreenOn: true })`；`onHide/onShow` 替代 `visibilitychange` 停/起循环 | 无 Fullscreen API；"闲置 N 分钟自动进入"依赖全局 `pointerdown` 计时，小程序只能在各页面 touch 事件里更新时间戳，建议第一版仅保留手动进入 |

### 4.4 SVG、图标与需要 Canvas 的场景

小程序 **WXML 不能内联 `<svg>`**，也没有 DOM 可改。三种替代：

1. **静态 SVG 当图片**：`<image src="data:image/svg+xml;utf8,…" />` 或 WXSS `background-image: url("data:image/svg+xml,…")`。`kit.icon()` 的二十余个图标路径（含 8 个 `g-*` 手势图标）在构建期转成 data URI 表 `icons.js`。要保留 `currentColor` 随皮肤变色，用遮罩：`.icon { -webkit-mask: url(data:…) center / contain no-repeat; background: currentColor; }`（WebView 渲染器可用）。
2. **多层 view 叠加 + transform**：罗盘的 24 山圈、转盘的扇区完全可以用**一张预先绘制的底图（canvas 离屏绘一次，或构建期生成 SVG data URI）+ 外层 `rotate()`** 实现，转动只改一个 transform，性能最好。转盘扇区也可以用 `conic-gradient` 背景 + 绝对定位旋转文字。
3. **Canvas 2D**（`<canvas type="2d">` + `wx.createSelectorQuery().select('#c').fields({ node: true, size: true })` 拿 `node.getContext('2d')`）：当图形**每帧变化且元素多**时才用——彩纸 > 40 片、六爻卦象逐爻描画、水晶球雾气粒子。注意 `canvas.width = size.width * wx.getWindowInfo().pixelRatio` 防模糊。

结论：**筊杯 / 签筒 / 铜钱 / 牌 / 符石用 view + 3D transform；转盘 / 罗盘用底图 + rotate；只有粒子类才上 canvas。** 六十四卦符号 `䷀–䷿` 是 Unicode，直接当文字用即可。

### 4.5 布局与样式差异

| Web | 小程序 |
| --- | --- |
| `:root` / `<html data-theme="ink">` + `[data-theme='ink'] { --bg: … }` | WXSS **属性选择器不可靠**。改为 class：`themes.css` 里 `[data-theme='ink']` 全局替换为 `.theme-ink`，`:root` 替换为 `page`；每页根节点 `<view class="app theme-{{theme}}">`。`page { background: var(--bg) }` 拿不到主题类，改为 `wx.setBackgroundColor` + `wx.setNavigationBarColor({ frontColor: dark ? '#ffffff' : '#000000', backgroundColor: themes[id].bg })` 在 `onShow` 时同步 |
| `env(safe-area-inset-top/bottom)` | 支持，写 `constant()` 回退：`padding-bottom: constant(safe-area-inset-bottom); padding-bottom: env(safe-area-inset-bottom);`。也可用 `wx.getWindowInfo().safeArea` 算 |
| `100dvh` / `88dvh` | 不支持 `dvh`；`100vh` 在小程序等于页面可视高度（不含导航栏），直接用 `vh` 即可 |
| `position: sticky` 顶栏 + `backdrop-filter: blur(16px)` | 默认导航栏由微信绘制；要复刻项目的毛玻璃标题栏需 `"navigationStyle": "custom"` + `wx.getMenuButtonBoundingClientRect()` 对齐胶囊按钮。`backdrop-filter` iOS 可用、Android 视内核，**必须写纯色 `background: var(--header-bg)` 回退**（`--header-bg` 本身带 alpha，可接受） |
| `mix-blend-mode: overlay`（木纹、噪点） | 视内核，装饰性，可直接去掉 |
| `px` | 项目所有尺寸令牌是 px 且 `--max-w: 540px` 居中——**保持 px**，不要机械换 `rpx`。小程序 750rpx = 屏宽，用 `rpx` 会让 iPad/折叠屏上的筊杯放大失真；只有需要"按屏宽等比"的地方（首页两列瓦片）用 `rpx` 或百分比 |
| Google Fonts `Noto Serif SC` + `Cinzel` | **放弃网络字体**：`wx.loadFontFace` 需要 HTTPS 域名白名单、体积（中文字体数 MB）与首屏闪烁都不划算。`--font-serif` 回退栈已有 `Songti SC / STSong / Source Han Serif SC / SimSun`，在 iOS 上是宋体、Android 视厂商；`Cinzel` 只用于极少量拉丁字母装饰，回退 `Times New Roman` 可接受。若坚持品牌字体，用 fontmin 子集化后 `wx.loadFontFace({ family, source: 'url(https://…woff2)', global: true })` |
| `.no-touch` / `touch-action` | `catchtouchmove` 已阻止滚动，无需 |
| `prefers-reduced-motion` | 无对应 media query；做成设置项写进 storage |

---

## 5. 目录结构建议

```
miniprogram/
  app.js  app.json  app.wxss  sitemap.json  project.config.json
  core/                 ← 原样复制 src/core/：rng.js  lunar.js
  vendor/               ← lunar.cjs 改名为 lunar.js（内容不改，见下）
  platform/weapp.js     ← 本文 §3 的实现，导出 createPlatform()
  ui/
    ctx.js              ← createPageCtx(page, meta)：组装 ctx，onUnload 自动清理
    list.js             ← 原样复制 src/modules/list.js（纯数据）
    themes.wxss         ← themes.css 做 [data-theme=x] → .theme-x、:root → page 替换
    tokens.wxss  base.wxss  components.wxss
  components/lgj-button/  lgj-chips/  lgj-tabs/  lgj-stage/  lgj-hint/
             lgj-result-card/  lgj-sheet/  lgj-seal/  lgj-stars/  lgj-history-bar/ …
  pages/
    index/              ← 首页（app.js renderHome + renderHero）
    settings/           ← 设置（原设置抽屉，改为页面或半屏组件）
    jiaobei/            ← 一个模块 = 一个页面目录
      index.js  index.wxml  index.wxss  index.json
      core.js  data.js    ← 原样复制自 src/modules/jiaobei/
    qian/  liuyao/  almanac/  bazi/  fengshui/  wheel/  tarot/  runes/  zodiac/  crystal/  omikuji/  coin/
  packages/             ← 分包（见 §6），按 list.js 的 region：east / west / japan / play
```

**为什么 `core.js` 可以零修改**：`src/modules/jiaobei/core.js` 写的是 `import { random, chance } from '../../core/rng.js'`，从 `pages/jiaobei/core.js` 出发 `../../core/rng.js` 恰好还是根目录 `core/`——**目录深度相同，相对路径不用改**。如果模块进了分包（`packages/east/pages/jiaobei/`），深度变了，要么在同步脚本里 `sed` 一行 import，要么用 `app.json` 的 `resolveAlias`（需较新基础库）把 `@core/*` 指向根 `core/*`。

**CommonJS / ESM**：
- 微信开发者工具自带 ES6→ES5（勾选「将 JS 编译成 ES5」与「增强编译」），`import / export` 语法、`padStart`、可选链等直接可用；`core/lunar.js` 里的 `import lib from '../vendor/lunar.cjs'` 只需改扩展名为 `.js`（小程序不识别 `.cjs`）。
- `vendor/lunar.cjs` 是 UMD：`if (typeof define==='function' && define.amd) … else if (module.exports) …`。小程序逻辑层存在模块系统用的全局 `define`，但**不带 `.amd` 标记**，所以正确落到 `module.exports = factory()` 分支；`import lib from` 经过工具的 interop 会拿到整个 `module.exports` 对象，`lib.Solar / lib.Lunar` 用法不变。
- `rng.js` 用 `globalThis.crypto.getRandomValues`，小程序没有同步的 crypto（`wx.getRandomValues` 是异步的），代码里已有 try/catch 回退 `Math.random`，无需改。
- 建议写一个 `scripts/sync-weapp.mjs`：单向把 `src/core`、`src/vendor`、`src/modules/list.js`、各模块 `core.js/data.js` 复制进 `miniprogram/`，**Web 仓库仍是唯一事实源**，小程序端禁止手改这些文件。

---

## 6. 分步计划、常见坑与合规

### 6.1 里程碑

| 里程碑 | 工时 | 产出 | 验证方式 |
| --- | --- | --- | --- |
| **M0 立项** | 0.5 天 | AppID、主体、类目预选；空项目 + `sync-weapp.mjs`；分包规划 | 开发者工具编译无错；`core/rng.js` 与 `vendor/lunar.js` 在小程序里 `require` 成功并输出今日黄历 |
| **M1 平台层** | 2–3 天 | `platform/weapp.js` 全部接口；一个隐藏调试页实时画 `mag` 曲线并计数 shake/toss | iOS + Android 各 1 台真机：连甩 10 次识别 ≥ 9；连摇 10 次识别 ≥ 9；误触发（走路/放桌上拿起）≤ 1/分钟；15 个音效逐个播放；震动分级可感知 |
| **M2 组件 + 壳** | 3–4 天 | `components/*`、首页、皮肤切换、设置页、`ui/ctx.js` | 5 套皮肤 × 首页/设置/一张结果卡截图对比 Web 端；iPhone 带灵动岛机型底部安全区正确；主包体积 < 1.2MB |
| **M3 筊杯参考页** | 2 天 | `pages/jiaobei` 完整（三入口、3D 翻飞、结果抽屉、历史、分享） | 甩手机 / 舞台上滑 / 按钮三种触发结果一致；连掷三圣杯状态机与 `tests/jiaobei.test.mjs` 行为一致；分享卡片可发到会话 |
| **M4 其余 12 模块** | 2–3 周 | 按分包顺序：east → play → west → japan | 每页跑同一份 checklist（见下）；分包各 < 2MB |
| **M5 打磨与提审** | 3–5 天 | 性能审计、隐私指引、免责声明、提审材料 | 开发者工具「性能」面板 setData 单次 < 64KB、无 20ms+ 长任务；体验评分 ≥ 85；提审一次通过 |

每页 checklist：三入口一致 → `busy` 防重入 → 动画中断（切后台再回来）不残留 → 抽屉可下拉关 → 结果卡 footer 有「仅供娱乐」→ 分享按钮 `open-type="share"` → `onHide` 停传感器 → 暗/亮皮肤各截一张。

### 6.2 常见坑

1. **包体**：主包 ≤ 2MB，整包上限以当时文档为准（20MB 起）。`vendor/lunar.js` 原文 436KB，压缩后约 250KB，可以放主包（首页黄历卡要用），但 `data.js` 文案总量（塔罗 78 张、灵签 64 支、御神签 50 支、六十四卦）应随页面进分包；`preloadRule` 在首页预载 east 包。
2. **setData 频率**：`onMotion` 50Hz、`spin/drag` 的 `onMove` 每帧——都不许直达 setData。实时跟手用 WXS 响应事件，传感器视觉反馈节流 ≥ 80ms，动画交给 `this.animate`。一次 setData 只发变化的路径（`this.setData({ 'blocks.a.face': 'flat' })`）。
3. **传感器生命周期**：`wx.onAccelerometerChange` 全局且不随页面销毁；忘记 `off` 会导致回到首页还在耗电、进入第二个模块回调翻倍。在 `ctx.cleanup()` 里退订，无订阅者时 `stopAccelerometer`；`onHide` 也停、`onShow` 再起。
4. **iOS 安全区**：底部抽屉 `.sheet-body` 与 `.action-bar` 的 `padding-bottom` 加 `env(safe-area-inset-bottom)`；自定义导航栏顶部用 `statusBarHeight`。横屏不支持（`app.json` 不开 `pageOrientation`）。
5. **暗色模式**：项目自己有 5 套皮肤，与系统深浅色无关；但 `app.json` 若开 `"darkmode": true`，导航栏/背景会跟随 `theme.json`。建议**不开** darkmode，全部由 `wx.setNavigationBarColor / setBackgroundColor` 跟随项目皮肤；`wx.onThemeChange` 可选地在用户从未手选皮肤时把默认皮肤映射为 ink（深）/ paper（浅）。
6. **`getStorageSync` 缺省返回 `''`**，直接 `JSON.parse('')` 会 throw——虽然 web.js 的 try/catch 会吞掉并返回默认值，但每次 miss 都走异常路径，性能差，显式判空。
7. **`this.animate` 与 setData 抢 transform**：动画结束后如果又 setData 了同一节点的 `style`，会互相覆盖；静止位姿只在 `rest()` 里通过 `clearAnimation` + setData 设置，飞行期间不要碰。
8. **WebAudio 首次创建卡顿**：Android 上 `createWebAudioContext` 首次要 100–300ms，放在首页首次 tap 里预热，而不是在筊杯落地那一帧。
9. **分享图**：`onShareAppMessage.imageUrl` 建议 5:4 本地图（`assets/share-<id>.png`，每张 < 50KB）；不要用 canvas 动态截图（`canvasToTempFilePath` 在 iOS 上偶发空白）。
10. **`<input>` 在舞台上方**：iOS 键盘弹起会推页面，`adjust-position="{{false}}"` + 自己处理；筊杯页的问题输入框建议放进结果抽屉或用 `wx.showModal({ editable: true })` 收集。

### 6.3 审核类目与合规写法

平台规则对「宣扬迷信」「占卜算命」类内容有明确限制，**没有可以合法选择的"算命/占卜"类目**，这是整个项目上线最大的不确定性，需要从命名到文案统一处理：

- **定位为传统文化 + 娱乐工具**：名称、简介、截图、类目全部避开「算命」「测算」「改运」「大师」「灵验」。类目选择与实际最接近的通用类目（如「工具 → 效率」或「文娱 → 其他」，以提审时后台可选项为准），简介写成"传统民俗文化互动体验：筊杯、灵签、黄历、塔罗等玩法，随机生成，仅供娱乐"。
- **免责声明前置且处处可见**：首页底部与设置页已有的那段（"所有结果均由随机算法与传统文化文本生成，仅供娱乐与自我觉察，请勿据此做出医疗、财务、法律等重要决定"）保留；每张结果卡的 `footer: '仅供娱乐'` 是硬性约定（MODULE_GUIDE §2.3），不得省略；首次启动可加一次性弹窗确认。
- **文案审读**：`data.js` 里的「神明允诺」「焚香再拜」这类宗教语义词，小程序版建议用一份 `data.weapp.js` 覆盖为「签意为允」「静心再思」等中性表达（`core.js` 不变）。MODULE_GUIDE §2.7 已禁止医疗/法律/投资的确定性断言，提审前 grep 一遍 `必`「一定」「保证」「治」「赔」「涨」。
- **不做付费**：不要接「付费解签」「大师人工解读」等虚拟支付，iOS 端虚拟支付本身受限，且会把类目推向"占卜服务"。
- **隐私**：八字页需要出生日期，属个人信息。全部**在本地计算、不上传**，`app.json` 声明 `__usePrivacyCheck__` 并在「用户隐私保护指引」中说明"出生日期仅用于本地排盘、不收集不上传"；不接入 `wx.login`、不拿手机号。
- **抽奖歧义**：转盘不涉及奖品，页面文案里避免「抽奖」「中奖」，用「决定」「转一转」。

---

## 7. 最小示例：把筊杯移植为一个小程序页面

目标只展示复用方式，省略了历史条、模式切换和大部分样式。三个文件都放在 `pages/jiaobei/`，`core.js`、`data.js` 与 Web 端**逐字节相同**。

**index.wxml**

```xml
<view class="app theme-{{theme}}">
  <lgj-stage badge="{{stage.badge}}" hint="{{stage.hint}}" min-height="320"
             bindtouchstart="onTouchStart" catchtouchmove="onTouchMove" bindtouchend="onTouchEnd">
    <view class="jb-altar"></view>
    <block wx:for="{{['a','b']}}" wx:key="*this" wx:for-item="w">
      <view class="jb-block jb-{{w}} {{blocks[w].standing ? 'standing' : ''}}" id="block-{{w}}">
        <view class="jb-body" id="body-{{w}}">
          <view class="jb-face jb-flat"><view class="jb-grain"></view></view>
          <view class="jb-face jb-round"><view class="jb-shine"></view></view>
        </view>
        <view class="jb-shadow" id="shadow-{{w}}"></view>
      </view>
    </block>
  </lgj-stage>

  <lgj-hint gesture="toss" text="向上甩动手机，或在筊杯上向上快滑" />
  <view class="action-bar">
    <lgj-button label="掷 筊" variant="primary" size="large" primary="{{true}}" disabled="{{busy}}" bind:tap="onPrimary" />
    <lgj-button label="重来" variant="ghost" icon="refresh" bind:tap="onReset" />
  </view>

  <lgj-sheet show="{{sheet.show}}" title="筊杯启示" bind:close="onSheetClose">
    <lgj-result-card kicker="{{sheet.card.kicker}}" title="{{sheet.card.title}}" sub="{{sheet.card.sub}}"
                     badge="{{sheet.card.badge}}" seal="{{sheet.card.seal}}" verse="{{sheet.card.verse}}"
                     sections="{{sheet.card.sections}}" footer="仅供娱乐 · 心诚则灵" />
    <view slot="actions">
      <lgj-button label="再问一次" variant="primary" bind:tap="onAgain" />
      <lgj-button label="分享" variant="ghost" icon="share" open-type="share" bind:tap="onShare" />
    </view>
  </lgj-sheet>
</view>
```

**index.wxss**（选择器直接来自 `style.css`，去掉 `.m-jiaobei` 前缀；颜色仍全部 `var()`）

```css
@import '../../ui/themes.wxss';
@import '../../ui/components.wxss';

.jb-altar { position: absolute; left: 8%; right: 8%; bottom: 14%; height: 22%; border-radius: 50%;
  background: radial-gradient(ellipse at 50% 40%, var(--wood-1), var(--wood-2) 70%, transparent 100%); opacity: .85; }
.jb-block { position: absolute; left: 50%; bottom: 24%; width: 92px; height: 46px; margin-left: -46px;
  transform-style: preserve-3d; }
.jb-a { transform: translateX(-58px) rotateZ(-10deg); }
.jb-b { transform: translateX(58px) rotateZ(12deg); }
.jb-body { position: absolute; left: 0; right: 0; top: 0; bottom: 0; transform-style: preserve-3d; }
.jb-face { position: absolute; left: 0; right: 0; top: 0; bottom: 0; -webkit-backface-visibility: hidden; backface-visibility: hidden;
  border-radius: 46px 46px 40px 40px / 40px 40px 60px 60px; overflow: hidden; }
.jb-flat { background: linear-gradient(160deg, #d8483a, #b2271e 60%, #8c1a14); }
.jb-round { transform: rotateX(180deg); background: radial-gradient(ellipse at 40% 35%, #c9382b, #7a1710 70%, #4a0e0a); }
.jb-shadow { position: absolute; left: 6%; right: 6%; bottom: -14px; height: 14px; border-radius: 50%;
  background: rgba(0,0,0,.55); filter: blur(4px); opacity: .55; }
.jb-block.standing .jb-body { transform: rotateX(90deg) !important; }
.jb-block.standing { filter: drop-shadow(0 0 14px var(--glow)); }
.action-bar { display: flex; gap: 12px; padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); }
```

**index.js**

```js
import { throwJiaobei, initSession, reduceSession, OUTCOME } from './core.js';   // ← 与 Web 端同一文件
import { OUTCOMES } from './data.js';                                              // ← 与 Web 端同一文件
import { createPageCtx } from '../../ui/ctx.js';        // 组装 ctx：motion/gesture/haptic/sound/storage/share/theme

const REST = { a: { translateX: -58, rotateZ: -10 }, b: { translateX: 58, rotateZ: 12 } };
const faceRot = (f) => (f === 'flat' ? 0 : f === 'round' ? 180 : 90);

Page({
  data: { theme: 'ink', busy: false, stage: { badge: '单掷问事', hint: '心中默念所求之事' },
          blocks: { a: {}, b: {} }, sheet: { show: false, card: {} } },

  onLoad() {
    this.ctx = createPageCtx(this, { id: 'jiaobei' });        // onUnload 时自动 cleanup
    this.session = initSession();
    this.history = this.ctx.storage.get('history', []);
    this.setData({ theme: this.ctx.theme });
    this.ctx.motion.onToss((e) => this.doThrow(e.intensity));                       // 体感入口
    this.flick = this.ctx.gesture.flick(null, (g) => this.doThrow(g.intensity), { minSpeed: 0.5 }); // 手势入口（Tracker）
  },
  onShow() { this.ctx.resume(); },   // 重新 startAccelerometer
  onHide() { this.ctx.pause(); },    // stopAccelerometer / 暂停 WebAudio
  onTouchStart(e) { this.flick.start(e); }, onTouchMove(e) { this.flick.move(e); }, onTouchEnd(e) { this.flick.end(e); },

  onPrimary() { this.doThrow(22); },                                                // 按钮入口

  async doThrow(intensity = 20) {
    if (this.data.busy) return;
    this.setData({ busy: true, 'stage.hint': '' });
    const { haptic, sound, storage } = this.ctx;
    haptic.light(); sound.play('whoosh');

    const result = throwJiaobei();                                                  // ← core.js
    const power = Math.max(0.7, Math.min(1.5, intensity / 20));
    await Promise.all([this.fly('a', result.a, power, 0), this.fly('b', result.b, power, 90)]);
    haptic.heavy();

    const o = OUTCOMES[result.outcome];                                             // ← data.js
    if (result.outcome === OUTCOME.LI) { sound.play('gong'); haptic.success(); }
    else if (result.outcome === OUTCOME.SHENG) { sound.play('chime', { delay: 0.05 }); haptic.success(); }
    else sound.play(result.outcome === OUTCOME.XIAO ? 'pop' : 'low', { delay: 0.05 });

    this.history = this.history.concat([result.outcome]).slice(-12);
    storage.set('history', this.history);
    this.session = reduceSession(this.session, result);                             // ← core.js

    await new Promise((r) => setTimeout(r, 350));
    const verse = o.verses[Math.floor(Math.random() * o.verses.length)];
    this.shareText = `【筊杯】得「${o.name}」— ${verse}\n${o.meaning}\n—— 来感觉 · 玄学占卜`;
    this.setData({ busy: false, sheet: { show: true, card: { kicker: o.kicker, title: o.name, sub: o.alias, badge: o.badge,
      seal: o.seal, verse, sections: [{ label: '解曰', text: o.meaning }, { label: '建议', text: o.advice }] } } });
  },

  /** 对应 view.js 的 makeBlock().fly()：位移弹跳 + 内层翻转 + 阴影，三条 this.animate 并行 */
  fly(w, face, power, delay) {
    return new Promise((resolve) => setTimeout(() => {
      const dur = 900 + power * 220, height = -(180 + 120 * power);
      const spins = (2 + Math.round(power * 2)) * 360, finalRot = faceRot(face);
      const endX = (w === 'a' ? -1 : 1) * (40 + Math.random() * 40), endZ = (Math.random() - 0.5) * 60;
      this.animate(`#block-${w}`, [
        { ...REST[w], translateY: 0, offset: 0 },
        { translateX: endX * 0.5, translateY: height, rotateZ: endZ * 0.5, offset: 0.45, ease: 'cubic-bezier(.2,.9,.4,1)' },
        { translateX: endX, translateY: 0, rotateZ: endZ, offset: 0.82, ease: 'cubic-bezier(.6,0,.9,.4)' },
        { translateX: endX, translateY: -14, rotateZ: endZ, offset: 0.9 },
        { translateX: endX, translateY: 0, rotateZ: endZ, offset: 1 },
      ], dur);
      this.animate(`#body-${w}`, [
        { rotateX: 0, rotateY: 0, offset: 0 },
        { rotateX: spins + finalRot, rotateY: (Math.random() - 0.5) * 40, offset: 0.82, ease: 'cubic-bezier(.3,.7,.5,1)' },
        { rotateX: spins + finalRot, rotateY: 0, offset: 1 },
      ], dur);
      this.animate(`#shadow-${w}`, [
        { scale: [1, 1], opacity: 0.55, offset: 0 }, { scale: [0.4, 0.4], opacity: 0.15, offset: 0.45 },
        { scale: [1.05, 1.05], opacity: 0.55, offset: 0.82 }, { scale: [1, 1], opacity: 0.55, offset: 1 },
      ], dur);
      setTimeout(() => { this.ctx.sound.play('clack'); this.ctx.haptic.medium(); }, dur * 0.82);
      setTimeout(() => { this.setData({ [`blocks.${w}`]: { face, standing: face === 'stand' } }); resolve(); }, dur + 20);
    }, delay));
  },

  onReset() {
    this.session = initSession();
    ['a', 'b'].forEach((w) => { this.clearAnimation(`#block-${w}`); this.clearAnimation(`#body-${w}`); this.clearAnimation(`#shadow-${w}`); });
    this.setData({ blocks: { a: {}, b: {} }, 'stage.hint': '心中默念所求之事' });
    this.ctx.haptic.tap(); this.ctx.sound.play('flip');
  },
  onAgain() { this.setData({ 'sheet.show': false }); },
  onSheetClose() { this.setData({ 'sheet.show': false }); },
  onShare() { this.ctx.share(this.shareText); },   // 写剪贴板 + 登记分享文案，真正的分享面板由 open-type="share" 弹出
  onShareAppMessage() { return { title: (this.shareText || '筊杯启示').split('\n')[0].slice(0, 30), path: '/pages/jiaobei/index' }; },
});
```

这段代码里，**随机与判定（`throwJiaobei / reduceSession`）、全部文案（`OUTCOMES`）、飞行参数与节奏（`dur = 900 + power*220`、`0.82` 落地点、`350ms` 后开抽屉）、音效与震动的时序**都与 `src/modules/jiaobei/view.js` 一一对应；变化的只是"改 DOM"变成了 setData + `this.animate`，以及分享由 `open-type="share"` 接管。其余 12 个模块按同一套路展开即可。
