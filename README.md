# 来感觉 · 玄学占卜合集

> 筊杯 · 灵签 · 六爻 · 黄历 · 八字 · 风水 · 转盘 · 塔罗 · 卢恩 · 星座/生肖 · 水晶球/灵摆 · 御神签 · 硬币骰子
> 摇一摇、甩一甩、拨一拨、翻一翻 —— 怎么好玩怎么来。手机网页即可玩，架构上为日后移植微信小程序做好了准备。

**在线地址**：https://peytonliubruin.github.io/laiganjue/ （推送后由 GitHub Actions 自动发布，约 1 分钟生效）

## 这是什么

一个面向手机的「占卜合集」网页应用，一个文件（`dist/index.html`）就能打开，包含 13 个玩法，5 套可切换皮肤，支持手机体感操作：

| 玩法 | 怎么玩 | 内容 |
| --- | --- | --- |
| 筊杯 | 向上甩手机 / 屏幕上滑 / 点按钮，两枚筊杯翻飞落地 | 圣杯 · 笑杯 · 阴杯 · 立筊（极罕见彩蛋），连掷三圣杯模式 |
| 灵签 | 摇手机摇签筒，一支签跃出，取签展纸 | 64 支以上原创灵签，七言签诗 + 解曰 + 六项分述 |
| 六爻 | 甩手机掷三枚铜钱，掷六次成卦 | 六十四卦全表，本卦/变卦/动爻，卦辞象辞与白话解 |
| 黄历 | 用日期选择器或前后按钮翻页 | 宜忌、冲煞、值神、二十八宿、吉神方位、时辰吉凶、每日一言 |
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

## 屏保模式「静观」

- 首页左上角的月亮按钮，或设置里的「现在进入屏保」，或直接打开网址后加 `#/zen`。
- 大字时间、农历干支、今日一宜一忌、缓慢轮换的古语，十二时辰日晷环上一颗金点标记此刻；八卦环慢转，微尘轻浮。
- 进入后屏幕保持常亮（需浏览器支持 Wake Lock），每分钟微移防烙印；轻触任意处返回。
- 默认闲置 3 分钟自动进入，可在设置里改成 1 / 5 / 10 分钟或关闭。

## 装到 iPhone / 安卓主屏幕

1. 用手机浏览器打开网址（Safari / Chrome）。
2. iPhone：点底部「分享」→「添加到主屏幕」；安卓 Chrome：右上菜单 →「添加到主屏幕」。
3. 从主屏幕图标打开：全屏、无地址栏，体感与屏保体验最佳。首次进入需要体感的玩法时，点「开启」允许访问运动与方向。

## 发布到 GitHub Pages（一次性设置）

仓库已带自动发布流程（`.github/workflows/pages.yml`）：每次推送都会自动测试、构建并发布。只需在 GitHub 上开一次开关：

1. 打开 `https://github.com/PeytonLiuBruin/laiganjue/settings/pages`
2. 「Build and deployment」→「Source」选 **GitHub Actions**，保存。
3. 到 Actions 页签点开「Deploy to GitHub Pages」→「Run workflow」，或随便再推送一次。
4. 网址：`https://peytonliubruin.github.io/laiganjue/`

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


## 器物交互与界面更新

- 筊杯由平面和弧面组成三维网格，Canvas 投影与光照实时渲染。手势先带动器物，再按力度决定腾空高度、翻转和回弹；落地结果保留在场景内，详细解读由用户打开。
- 塔罗保持洗牌、抽牌、逐张翻牌流程，支持拖动翻面和键盘操作。翻完后牌面与摘要停留，点击主按钮展开完整解读。
- 御神签展纸后停留。凶签可进入结签场景，拖到高亮签绳后松手，完成折纸、打结、悬挂动画；也提供「帮我结签」按钮和回车操作。取消拖动或未到签绳时，纸张回到原位。
- 初次访问默认宣纸主题；已有主题选择继续保留。五套皮肤沿用统一组件、留白和文字层级。
- 经典塔罗牌面打包为本地 WebP 图集，约 1.1 MB，仅进入塔罗后加载。出处与牌面映射在 `assets/tarot/`。部署时保留整个 `dist/`，其中 `tarot/` 提供完整牌面；单独打开 `index.html` 时，仍能使用原有矢量牌面作为备用。
- 转盘以较慢的摩擦减速停下，落定后高亮选择并显示摘要；「自己填写」与「编辑选项」支持填写、修改和保存 2–16 项，文本输入会在本次旋转前同步。
- 筊杯和硬币的腾空之后保留弹跳与逐渐衰减的翻滚，约 4 秒落定，再停留片刻揭晓。塔罗翻面约 1.7 秒，在侧面略作停留，逐张翻牌留出阅读间隔；牌下只显示牌位与正逆位。
- 灵签接入 64 支原创签库，支持摇筒、竹签升起落下、主动取签展纸、解读和历史回看。御神签的摇筒、出签和展纸节奏同步放慢。
- 黄历采用传统黄色纸面；阅读与滚动保持原生行为，通过按钮切换日期。修复详解与背景纸张样式重名，窄屏下宜忌、方位与十二时辰分行显示。
- 筊杯与转盘的动画帧、共用的仪式等待及翻牌动画在切换到后台时暂停，返回后继续播放。减少动态效果设置仍然生效。

构建、逻辑测试：`npm run build`、`npm test`。手机体感需要 HTTPS 与用户授权；浏览器不支持震动时，动画、音效与文字反馈继续工作。
