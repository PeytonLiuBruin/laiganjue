# 做成 iPhone / 安卓 App

「来感觉」现在除了是网页，也已经是一个可以装到 iPhone 和安卓手机上的 App 工程。
App 和网页**用的是同一份代码**：改一次玩法，网页和 App 都会跟着变，不需要写两遍。

> 打包用的工具叫 [Capacitor](https://capacitorjs.com)（开源、免费）。它把网页装进一个原生 App 的壳子里，
> 再补上网页做不到的原生能力（比如 iPhone 的震动）。

---

## 一、App 版比网页版多了什么

| 能力 | 网页版 | App 版 |
| --- | --- | --- |
| 震动反馈 | 安卓有；**iPhone 没有**（Safari 不开放） | 两边都有；iPhone 用 Taptic 引擎的轻 / 中 / 重击，手感更细腻 |
| 摇一摇 / 甩一甩 | iPhone 要先点「允许访问运动与方向」 | iPhone 不再弹授权窗，第一次碰屏幕就自动开启 |
| 分享 | 浏览器分享或复制文字 | 系统原生分享面板（微信、信息、备忘录…） |
| 屏保「静观」 | 依赖浏览器是否支持常亮 | 原生保持常亮，并隐藏状态栏，真正全屏 |
| 状态栏 | 浏览器决定 | 文字颜色随皮肤深浅自动切换（宣纸 / 青瓷用深色字，玄墨等用浅色字） |
| 安卓返回键 | 浏览器后退 | 先关弹出的面板 → 退出屏保 → 回首页 → 在首页再按就退到后台 |
| 图标 / 启动画面 | 「添加到主屏幕」的小图标 | 正式的 App 图标和启动画面 |
| 屏幕方向 | 跟随手机 | 锁定竖屏（摇手机时画面不会乱转） |

App 里还会自动去掉「在 Safari 里添加到主屏幕」这类只对网页有意义的说明文字。

---

## 二、马上在安卓手机上试一试（不用装任何软件）

仓库已经设置好**自动打包**：每次推送代码，GitHub 会自动生成一个安卓测试版安装包（APK）。

1. 打开 <https://github.com/PeytonLiuBruin/laiganjue/actions>（需要登录 GitHub）。
2. 左边点 **Build mobile apps**，再点最上面最新的一次（绿色对勾 ✅ 表示成功）。
3. 拉到页面最底部 **Artifacts**，点 **laiganjue-android-debug** 下载，得到一个 zip。
4. 解压出 `app-debug.apk`，发到安卓手机上（微信文件传输助手、数据线、网盘都行）。
5. 在手机上点开安装。第一次会提示「禁止安装未知来源应用」，按提示允许即可。

> 这是**测试版**，只适合自己和同事试用，不能直接上传到应用商店（正式版见第四节）。
> 同一页面的 **iOS 编译检查** 只确认 iPhone 工程没有问题，不会产出可安装的文件，原因见下一节。

---

## 三、在 iPhone 上运行（需要一台 Mac）

苹果规定 iPhone App 只能用 Mac 上的 Xcode 打包，这一步无法绕开。

**第一次准备（一次性）**

1. 在 Mac 的 App Store 安装 **Xcode**（免费，体积较大，安装需要一段时间）。
2. 安装 **Node.js**：到 <https://nodejs.org> 下载 LTS 版（22 或更新）安装。
3. 下载代码：打开「终端」，依次输入
   ```bash
   git clone https://github.com/PeytonLiuBruin/laiganjue.git
   cd laiganjue
   npm install
   ```

**每次运行**

```bash
npm run app:ios
```

这条命令会把最新的网页内容放进 iPhone 工程，并自动打开 Xcode。在 Xcode 里：

1. 顶部选择要运行的设备：可以选一个模拟器（如 iPhone 16），也可以用数据线连上自己的 iPhone。
2. 用真机时：左侧点 **App** → **Signing & Capabilities** → **Team** 里登录你的 Apple ID。
   免费 Apple ID 也能装到自己的手机上，但 7 天后需要重新安装一次。
3. 点左上角 ▶ 运行。

安卓也可以用同样的方式在电脑上调试：装好 [Android Studio](https://developer.android.com/studio) 后运行 `npm run app:android`。

---

## 四、上架应用商店（以后要做时的清单）

### 共同准备

- [ ] **隐私政策网址**：两个商店都要求提供。本 App 不注册、不收集个人信息，生辰等数据只存在用户自己的手机上。可以写一页简单的隐私说明，放到 GitHub Pages 上。
- [ ] **截图**：每个平台至少几张手机截图（`npm run smoke` 会在 `dist/shots/` 生成各玩法截图，可以作为素材）。
- [ ] **简介与关键词**：可以沿用 README 里的玩法介绍。
- [ ] **年龄分级问卷**：按实际情况填写（无暴力、无用户互动、无内购）。
- [ ] **包名**：现在是 `io.github.peytonliubruin.laiganjue`。**第一次上架之后就不能再改**，如果想换成公司或学校的名义，要在上架前改好（`capacitor.config.json`、`android/app/build.gradle`、Xcode 工程三处）。

### 苹果 App Store

- 需要 **Apple Developer Program**，个人或机构身份均可，**每年 99 美元**。
- 在 Xcode 里选 **Product → Archive** 打包，上传到 App Store Connect；先用 **TestFlight** 发给同事内测，再提交审核。
- **审核风险，务必提前了解**：苹果审核指南 4.3 明确写到，占卜算命（fortune telling）属于"已经饱和的类别"，除非体验独特、质量很高，否则会被拒。
  我们的优势在于：17 个玩法、原创签诗与文本、手机体感互动、精致的 3D 器物和多套皮肤，这些都值得在提交说明里重点写清楚。
  另外，指南 4.2 会拒绝"只是把网站包一层"的 App，所以 App 版专门加入了原生震动、原生分享、常亮屏保等能力。
- 上传时的「出口合规（加密）」问题已经在工程里预先回答为"未使用需要申报的加密"，不用每次手动选。

### Google Play

- 注册开发者账号，**一次性 25 美元**。
- 2023 年 11 月之后新注册的**个人**账号，在正式上架前要先做封闭测试：**至少 12 名测试者、连续 14 天**。机构账号没有这条要求。
- 正式版要用 Android Studio 的 **Build → Generate Signed App Bundle** 生成 `.aab` 文件。过程中会创建一个**签名密钥文件**：
  **一定要备份好这个文件和它的密码**，丢了就无法再给这个 App 发更新。
- 需要填写「数据安全」表单，本 App 可以如实填写"不收集数据"。

### 中国大陆的应用商店（华为、小米、OPPO、vivo、应用宝等）

- 通常要求 **软件著作权证书（软著）** 和 **APP 备案**；苹果中国区上架同样需要 APP 备案号。
- 占卜算命类内容在大陆审核较严。建议先上架海外区，或者上架前先咨询目标商店的具体要求。

### 发新版本时

每次更新上架前，把版本号加一：
- 安卓：`android/app/build.gradle` 里的 `versionCode`（每次 +1）和 `versionName`（如 `1.1`）。
- iPhone：Xcode → App → General 里的 **Version** 和 **Build**。

注意：网页版推送后约 1 分钟就生效；**App 版的改动要重新打包、重新提交审核**，用户更新 App 后才能看到。

---

## 五、给工程师：结构与约定

```
capacitor.config.json      App 名、包名、启动画面、状态栏设置
android/  ios/             原生工程（已提交，直接用 Android Studio / Xcode 打开）
src/platform/native.js     App 专用能力：只在 App 内生效，网页里全部静默无操作
scripts/app-assets.mjs     按 assets/icon.svg 的图案重新生成 App 图标与启动画面（改图标时才需要跑）
.github/workflows/app.yml  每次推送：打出安卓测试版 APK + 检查 iOS 能否编译
www/                       App 用的网页构建产物（自动生成，不提交）
```

| 命令 | 作用 |
| --- | --- |
| `npm run build:app` | 构建网页到 `www/` |
| `npm run app:sync` | 构建并同步到 `android/` 与 `ios/`（改完网页代码后跑这个） |
| `npm run app:android` | 同步并用 Android Studio 打开 |
| `npm run app:ios` | 同步并用 Xcode 打开（需要 Mac） |
| `node scripts/app-assets.mjs` | 重新生成图标与启动画面 |

约定：

- **模块（`src/modules/*`）不感知 App**。所有差异都收在 `src/platform/`：`platform.native` 提供 `vibrate / share / keepAwake / immersive / setBarStyle / onBack / minimize`，`platform.inApp` 表示是否在 App 内。
- 原生插件只用 `registerPlugin('名字')` 取原生实现，不打包插件的网页实现，网页包只增加约 10 KB。
- 新增原生插件：`npm install --save-exact 插件@版本` → 在 `native.js` 里 `registerPlugin` → `npm run app:sync`。
- 以后如果要做「拍照看手相」这类用相机的功能：iPhone 要在 `ios/App/App/Info.plist` 加 `NSCameraUsageDescription`（说明为什么要用相机），安卓要在 `AndroidManifest.xml` 加 `CAMERA` 权限。网页里的 `getUserMedia` 在 App 内可以直接使用。
- 字体目前从 Google Fonts 在线加载。没有网络时会退回手机自带的字体，不影响使用；如果希望离线也保持同样的字体，可以把字体子集打包进 App。
- 体感、手势、音效、存储在 App 里照常使用网页实现（Capacitor 的 iOS 外壳会自动放行运动传感器权限）。
