# 来感觉 · 玄学占卜合集

> 筊杯 · 灵签 · 六爻 · 黄历 · 八字 · 风水 · 转盘 · 塔罗 · 卢恩 · 星座/生肖 · 水晶球/灵摆 · 御神签 · 硬币骰子
> 摇一摇、甩一甩、拨一拨、翻一翻 —— 怎么好玩怎么来。手机网页即可玩，架构上为日后移植微信小程序做好了准备。

## 这是什么

一个面向手机的「占卜合集」网页应用，一个文件（`dist/index.html`）就能打开，包含 13 个玩法，5 套可切换皮肤，支持手机体感操作：

| 玩法 | 怎么玩 | 内容 |
| --- | --- | --- |
| 筊杯 | 向上甩手机 / 屏幕上滑 / 点按钮，两枚筊杯翻飞落地 | 圣杯 · 笑杯 · 阴杯 · 立筊（极罕见彩蛋），连掷三圣杯模式 |
| 灵签 | 摇手机摇签筒，一支签跃出，取签展纸 | 64 支以上原创灵签，七言签诗 + 解曰 + 六项分述 |
| 六爻 | 甩手机掷三枚铜钱，掷六次成卦 | 六十四卦全表，本卦/变卦/动爻，卦辞象辞与白话解 |
| 黄历 | 撕日历页看明天/昨天 | 宜忌、冲煞、值神、二十八宿、吉神方位、时辰吉凶、每日一言 |
| 八字 | 输入生辰排盘 | 四柱、五行强弱、日主性情、十神、纳音、命宫胎元 |
| 风水 | 转动手机当罗盘 | 24 山罗盘、本命卦八宅吉凶方位、年紫白飞星九宫 |
| 转盘 | 手指拨动、摇手机 | 今日运势 / 吃什么 / 做不做 / 去哪儿 … 自定义转盘 |
| 塔罗 | 摇手机洗牌，上滑甩牌，点击翻面 | 78 张全牌，正逆位，单张/三张/关系/抉择/每日一牌 |
| 卢恩 | 摇皮袋，符石滚落翻面 | 24 枚古弗萨克符文，单符/三符/五符/今日符文 |
| 星座 | 选星座或生肖 | 十二星座每日运势 + 生肖今日与本年（太岁关系） |
| 水晶球 | 摩擦水晶球 / 摇手机充能 | 是非题 · 神谕 · 一字；灵摆问是非 |
| 御神签 | 摇六角签筒抽签棒 | 50 支以上御神签，大吉到凶，凶签可「结签」 |
| 硬币骰子 | 上抛硬币、摇骰子 | 抛硬币计数、多颗骰子、二选一 |

所有结果均由随机算法与传统文化文本生成，**仅供娱乐与自我觉察**，应用内已注明免责声明。

## 怎么打开

- **最简单**：拿到 `dist/index.html`（构建产物，单文件），用手机浏览器打开即可；或者放到任何静态网站空间（GitHub Pages、Vercel、腾讯云 COS…）。
- **体感（摇/甩/罗盘）需要 HTTPS**：本地文件双击打开时体感不可用，但屏幕手势和按钮完全可玩。放到 https 网址上，iPhone 会弹出「允许访问运动与方向」的授权，点允许即可。
- 皮肤：右上角调色盘图标 → 玄墨 / 朱砂 / 星穹 / 宣纸 / 青瓷。
- 设置：右上角齿轮 → 音效、震动、体感权限说明。

## 目录结构（给工程师）

```
src/
  core/        纯逻辑，无 DOM：rng.js 随机 / lunar.js 农历八字黄历（vendor lunar-javascript，MIT）
  platform/    web.js：体感（摇/甩/倾斜/罗盘）、手势（甩/拖/拨/摩擦）、震动、WebAudio 合成音效、存储、分享
  ui/          app.js 应用壳（路由/首页/皮肤/设置/模块上下文）  kit.js 组件库
  styles/      tokens.css 尺寸字体动效  themes.css 五套皮肤  base.css  components.css
  modules/     每个玩法一个目录：index.js / core.js（可测纯逻辑）/ data.js（内容）/ view.js（界面）/ style.css
  vendor/      lunar.cjs（农历库）
scripts/       build.mjs 单文件构建  serve.mjs 本地预览  smoke.mjs 无头手机浏览器冒烟测试 + 截图
tests/         node:test 单元测试
docs/          MODULE_GUIDE.md 模块开发约定  specs/ 各模块规格  PORTING_WEAPP.md 微信小程序移植指南
```

设计原则：**逻辑与数据（core.js / data.js）不碰 DOM**，界面（view.js）只通过 `ctx.kit` 与 `ctx.platform` 触达平台；颜色全部来自 CSS 变量。因此移植小程序时，core/data/lunar 原样复制，只需重写 view 层与一个 `platform/weapp.js`。详见 `docs/PORTING_WEAPP.md`。

## 开发命令

```bash
npm install            # 只需一次（esbuild + playwright）
npm run dev            # 构建并启动 http://localhost:4173 ，改 src/ 自动重建
npm run build          # 产出 dist/index.html（完整单文件）与 dist/artifact.html（无外壳片段）
npm test               # 全部单元测试
npm run smoke          # 无头 Chromium 手机视口逐个打开所有模块，检查报错并截图到 dist/shots/
node scripts/smoke.mjs --module tarot --act --theme paper   # 单模块 + 模拟摇/甩 + 指定皮肤
```

## 新增一个玩法

1. 在 `src/modules/list.js` 加一条元数据（id、标题、一个字的图徽、分区、手势、一句话）。
2. 新建 `src/modules/<id>/` 五个文件（参考 `jiaobei/`），在 `registry.js` 里 import，在 `modules/index.css` 里 `@import` 样式。
3. 写 `tests/<id>.test.mjs`，跑 `node scripts/smoke.mjs --module <id> --act` 看截图。

约定细节见 `docs/MODULE_GUIDE.md`。

## 换皮肤 / 改文案

- 皮肤：`src/styles/themes.css`，复制一段 `[data-theme='xxx']` 改颜色，再在 `src/ui/app.js` 的 `THEMES` 数组里加一项。
- 文案：各模块 `data.js` 全是纯数据，改字即可，不需要懂界面代码。
- 应用名：`src/ui/app.js` 顶部 `APP_NAME` / `APP_TAGLINE`。

## 许可

代码 MIT。`src/vendor/lunar.cjs` 来自 [lunar-javascript](https://github.com/6tail/lunar-javascript)（MIT，作者 6tail）。
