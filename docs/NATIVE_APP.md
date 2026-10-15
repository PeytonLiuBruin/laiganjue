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

## 三、装到自己的 iPhone 上试用（需要一台 Mac）

苹果规定 iPhone App 只能用 Mac 上的 Xcode 打包，这一步无法绕开。已经是付费的 Apple 开发者时，装上的 App 一年内都能用（免费 Apple ID 只能用 7 天）。

### 第一次准备（一次性，约 30–60 分钟，大部分时间在等 Xcode 下载）

1. **安装 Xcode**：在 Mac 的 App Store 搜索「Xcode」，点「获取」（免费，体积很大）。
2. **打开一次 Xcode**：在「应用程序」里打开 Xcode，弹出许可协议点「Agree」，输入电脑密码；
   如果询问要安装哪些组件（Platforms / Components），勾选 **iOS** 后继续，等它装完。
3. **在 Xcode 里登录开发者帐号**（Xcode 只有英文界面）：菜单栏「Xcode」→「Settings…」→「Accounts」（新版叫「Apple Accounts」）
   → 左下角「+」→「Apple ID」，登录你加入 Apple Developer Program 的那个 Apple ID。登录后右侧能看到你的团队（Team），就可以关掉 Xcode 了。
4. **连接 iPhone**：用数据线把 iPhone 连到 Mac，解锁 iPhone；弹出「要信任此电脑吗？」时点「信任」并输入锁屏密码。

### 一条命令装到 iPhone

打开「终端」（在「启动台」或聚焦搜索里输入「终端」），粘贴下面这一行，按回车：

```bash
curl -fsSL https://raw.githubusercontent.com/PeytonLiuBruin/laiganjue/claude/ecstatic-allen-lh1flx/scripts/ios-try.sh | bash
```

脚本会自动完成：检查 Xcode → 准备 Node.js（缺了就自动下载，不需要管理员密码）→ 把代码下载到「个人文件夹/laiganjue」→ 构建 →
签名 → 安装到 iPhone 并打开。过程中它可能会请你做两件事：

- **填团队 ID**（只问一次）：打开 <https://developer.apple.com/account> →「会员资格详细信息」（Membership details）里的「团队 ID」（Team ID），复制粘贴到终端回车。
- **打开 iPhone 的「开发者模式」**（只需一次）：iPhone「设置」→「隐私与安全性」→ 拉到最下面「开发者模式」→ 打开 → 按提示重启；
  重启后解锁，在弹窗里点「打开」并输入锁屏密码。脚本会一直等，等你打开后自动继续。

第一次编译大约 2–5 分钟。看到「完成！」时，iPhone 上的「来感觉」已经打开了。
**以后想装最新版本，再运行同一行命令即可**（已经做过的准备会自动跳过）。

如果中途出错，终端会用中文说明原因和解决办法；完整记录在 `~/laiganjue/ios/App/build/ios-try.log`，可以把这个文件发给开发同事或 Claude 看。

### 想用 Xcode 自己点「运行」也可以

```bash
cd ~/laiganjue && npm run app:ios
```

会打开 Xcode：顶部选择你的 iPhone，点左上角 ▶。团队已经由上面的脚本设置好；如果没跑过脚本，
需要在左侧点 **App** →「Signing & Capabilities」→「Team」里选择你的团队。

安卓也可以用同样的方式在电脑上调试：装好 [Android Studio](https://developer.android.com/studio) 后运行 `npm run app:android`。

---

## 四、让别人也能装：TestFlight（iPhone）

TestFlight 是苹果官方的测试版发放渠道：别人在 iPhone 上装好苹果的「TestFlight」App，点你发的链接就能安装「来感觉」，
不需要数据线、不需要 Mac。一个 App 最多可以有 10,000 名测试者，每个上传的版本可以用 90 天。

> App Store Connect 网页有中文界面；下面写的是中文按钮名，括号里是英文界面的叫法。

### 第 1 步：在 App Store Connect 建一个 App 记录（只做一次）

1. 打开 <https://appstoreconnect.apple.com>，用开发者帐号登录。
   如果页面顶部提示有协议要同意，先到「商务」（Business）里把协议都同意掉，否则后面会被拦住。
2. 点「App」（Apps）→ 左上角「+」→「新建 App」（New App），填写：
   - **平台**：勾选 iOS
   - **名称**：来感觉（2–30 个字，在整个 App Store 里不能和别人重名；被占用时可以加后缀，例如「来感觉 · 玄学占卜」。
     手机桌面上图标下面的名字仍然是「来感觉」）
   - **主要语言**：简体中文
   - **套装 ID**（Bundle ID）：选结尾是 `io.github.peytonliubruin.laiganjue` 的那一项（之前装到自己手机时 Xcode 已自动登记）
   - **SKU**：`laiganjue-ios`（只给你自己看的编号，创建后不能改）
   - **用户访问权限**：完全访问权限（Full Access）
3. 点「创建」（Create）。
4. 顺手在左侧「App 信息」（App Information）里填好「年龄分级」（Age Rating）问卷：按实际情况都选「无」即可。

### 第 2 步：一条命令打包上传

Mac 上打开「终端」，运行：

```bash
bash ~/laiganjue/scripts/ios-try.sh --testflight
```

它会更新代码、打包正式版、用 Xcode 里已登录的帐号自动签名并上传（大约 5–15 分钟，不需要连手机）。
看到「上传完成！」后，等 10–30 分钟苹果处理完，会收到一封标题含「has completed processing」的邮件。

### 第 3 步：先发给自己（内部测试，不用审核）

1. App Store Connect → 「来感觉」→ 顶部「TestFlight」→ 左侧「内部测试」（Internal Testing）旁的「+」→ 新建一个群组，名字随意（如「自己」）。
2. 「邀请测试员」（Invite Testers）勾选你自己 →「添加」；再「添加构建版本」（Add Builds）选刚上传的版本。
3. 在自己的 iPhone 上装好 App Store 里的「TestFlight」，用开发者帐号对应的 Apple ID 登录，就能看到并安装。

### 第 4 步：发给别人（外部测试，需要苹果简单审核一次）

1. 先填一次测试信息：TestFlight → 左侧「其他」（Additional）→「测试信息」（Test Information）
   - **Beta 版 App 描述**（必填），例如：「来感觉是一款传统文化占卜合集，包含筊杯、灵签、六爻、黄历、八字、塔罗等 17 个玩法，摇一摇手机即可互动。所有内容在手机上生成，仅供娱乐。」
   - **反馈电子邮件**：你的邮箱（测试者在 TestFlight 里反馈会发到这里）
   - **隐私政策网址**（建议填）：`https://peytonliubruin.github.io/laiganjue/privacy.html`
   - **Beta 版 App 审核信息**：联系人姓名、电话（带国家区号，例如 +1 714…）、邮箱；「需要登录」不勾选；
     备注可写：「无需帐号，所有内容在本机生成，仅供娱乐与自我觉察。」
2. 左侧「外部测试」（External Testing）旁的「+」→ 新建群组（如「朋友」）→「添加构建版本」→ 填写「测试内容」（What to Test）
   → 勾选「自动通知测试员」→「提交审核」（Submit Review）。第一次审核一般 1–2 天，偶尔会更久。
3. 审核通过后，在这个群组的「测试员」页点「创建公共链接」（Create Public Link）→「向所有人开放」（Open to Anyone）→「确认」，
   复制得到的 `https://testflight.apple.com/join/…` 链接，发给想试用的人。

### 测试者怎么装（发给他们这段话即可）

> 1. 在 iPhone 的 App Store 搜索并安装「TestFlight」（苹果官方，免费）。
> 2. 在 iPhone 上打开我发的链接，点「接受」，再点「安装」。
> 3. 以后有新版本，TestFlight 会提醒你更新。

### 以后更新

- 改了内容想让大家用上：再运行一次 `bash ~/laiganjue/scripts/ios-try.sh --testflight`，然后在 TestFlight 里把新构建版本加到群组。
  同一个版本号（1.0）下的后续构建通常不用再审核。
- 每个构建 90 天后过期，至少每两三个月上传一次新的。
- 1.0 正式上架后，再上传需要先把版本号改成 1.1（告诉开发同事或 Claude 即可）。

---

## 五、上架应用商店（以后要做时的清单）

### 共同准备

- [ ] **隐私政策网址**：两个商店都要求提供。已经写好：`https://peytonliubruin.github.io/laiganjue/privacy.html`（源文件 `src/privacy.html`，随网页一起发布；合并到主分支后生效）。
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

## 六、给工程师：结构与约定

```
capacitor.config.json      App 名、包名、启动画面、状态栏设置
android/  ios/             原生工程（已提交，直接用 Android Studio / Xcode 打开）
src/platform/native.js     App 专用能力：只在 App 内生效，网页里全部静默无操作
scripts/app-assets.mjs     按 assets/icon.svg 的图案重新生成 App 图标与启动画面（改图标时才需要跑）
scripts/ios-try.sh         Mac 上一条命令装到 iPhone（准备 Node / 代码 → 签名 → 安装 → 打开）
ios/local.xcconfig         本机的签名团队 ID（脚本生成，不提交；ios/debug.xcconfig 用 #include? 引入）
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
| `bash scripts/ios-try.sh` | 编译并安装到用数据线连着的 iPhone（`LGJ_TEAM=团队ID` 可跳过询问，`LGJ_NO_DEVICE=1` 只编译） |
| `bash scripts/ios-try.sh --testflight` | 打包正式版并上传到 App Store Connect（构建号自动用「年月日时分」，签名用 Xcode 里登录的帐号） |

约定：

- **模块（`src/modules/*`）不感知 App**。所有差异都收在 `src/platform/`：`platform.native` 提供 `vibrate / share / keepAwake / immersive / setBarStyle / onBack / minimize`，`platform.inApp` 表示是否在 App 内。
- 原生插件只用 `registerPlugin('名字')` 取原生实现，不打包插件的网页实现，网页包只增加约 10 KB。
- 新增原生插件：`npm install --save-exact 插件@版本` → 在 `native.js` 里 `registerPlugin` → `npm run app:sync`。
- 以后如果要做「拍照看手相」这类用相机的功能：iPhone 要在 `ios/App/App/Info.plist` 加 `NSCameraUsageDescription`（说明为什么要用相机），安卓要在 `AndroidManifest.xml` 加 `CAMERA` 权限。网页里的 `getUserMedia` 在 App 内可以直接使用。
- 字体目前从 Google Fonts 在线加载。没有网络时会退回手机自带的字体，不影响使用；如果希望离线也保持同样的字体，可以把字体子集打包进 App。
- 体感、手势、音效、存储在 App 里照常使用网页实现（Capacitor 的 iOS 外壳会自动放行运动传感器权限）。
