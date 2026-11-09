---
name: laiganjue-ios-ship
description: Getting 来感觉 onto iPhones — the one-command device install and TestFlight upload in scripts/ios-try.sh, what it checks, the Chinese error hints it prints, how to read ios/App/build/ios-try.log when Peyton pastes a failure, version and build numbers, the home-screen widget target, GitHub Pages legal URLs, and the macOS CI jobs that guard the script. Use when Peyton asks to install, update or share the iPhone app, pastes Terminal output from ios-try.sh, or when changing ios/, capacitor.config.json, Info.plist, signing, or the script itself.
---

# 来感觉 · 装到 iPhone 与发 TestFlight

所有 iPhone 相关的操作都在 Peyton 自己的 Mac 上执行，云端会话碰不到他的 Mac 和手机。
能做的是：改好脚本 / 工程，在 GitHub Actions 的 macOS 机器上验证，然后给 Peyton 一行命令。

## 两条命令（写给 Peyton 时原样给出）

```bash
# 装到用数据线连着的 iPhone（第一次或想更新到最新版）
curl -fsSL https://raw.githubusercontent.com/PeytonLiuBruin/laiganjue/<提交号>/scripts/ios-try.sh | bash
# 以后（本机已有代码）
bash ~/laiganjue/scripts/ios-try.sh
# 打包正式版并上传到 App Store Connect（TestFlight），不需要连手机
bash ~/laiganjue/scripts/ios-try.sh --testflight
```

- 第一条用提交号而不是分支名：raw.githubusercontent.com 会缓存约 5 分钟，分支链接可能拿到旧脚本。
- 脚本拉取的分支是 `DEFAULT_BRANCH`（脚本顶部）。工作推到别的分支时，Peyton 用上面的命令装不到新内容，注意同步。
- 脚本改了行为就把 `SCRIPT_REV` 加 1：本机旧脚本更新代码后会自动换成新脚本重跑。

## 脚本做什么（scripts/ios-try.sh，macOS 自带 bash 3.2）

1. 找 Xcode（不改 xcode-select，只设 `DEVELOPER_DIR`），许可协议 / 首次组件没装好就打开 Xcode 原地等。版本须 ≥ 26。
2. Node：已有 ≥ 22 就用，否则下载固定版本到 `~/Library/Caches/laiganjue`，按内置 SHA256 校验。
3. 代码：在仓库里运行就用当前目录，否则 clone / 更新 `~/laiganjue`（有本地改动时不更新）。
4. `npm ci` → `npm run build:app` → `npx cap sync ios`；缺 iOS 平台组件时 `xcodebuild -downloadPlatform iOS`。
5. 团队 ID：`LGJ_TEAM` → `ios/local.xcconfig`（不提交，由 `ios/debug.xcconfig` 的 `#include?` 引入）→ Xcode 偏好里唯一的付费团队 → 询问。
6. 设备：`xcrun devicectl list devices --json-output`，排除模拟器与以前配对过但没连上的设备，用硬件 UDID 编译、安装、打开；锁屏会重试。
7. `--testflight`：Release 归档，构建号 = `date +%Y%m%d%H%M`，ExportOptions `app-store-connect` + `upload` + 自动签名，用 Xcode 里登录的 Apple ID 上传。

## Peyton 贴来报错时

- 先看终端里中文那几行（脚本已按原因分类），再要 `~/laiganjue/ios/App/build/ios-try.log` 的最后 50 行。
- 常见原因与处理：
  | 日志特征 | 原因 | 处理 |
  | --- | --- | --- |
  | `No Accounts` / `No Account for Team` | Xcode 没登录或团队 ID 错 | Xcode → Settings… → Accounts 登录；删 `ios/local.xcconfig` 重填 |
  | `PLA Update` / `License Agreement` | 开发者协议待同意 | developer.apple.com/account 或 App Store Connect「商务」里同意 |
  | `is not installed` | 缺 iOS 平台组件或 iPhone 系统比 Xcode 新 | Settings → Components 下载 iOS，或更新 Xcode |
  | `Developer Mode` | 手机未开开发者模式 | 设置 → 隐私与安全性 → 开发者模式 → 重启 |
  | `is busy` / `Preparing` / `locked` | 手机刚连接、刚重启或锁屏 | 解锁、等一两分钟重跑 |
  | `No suitable application records` | App Store Connect 没建 App 记录 | App → + → 新建 App，套装 ID 选 `io.github.peytonliubruin.laiganjue` |
  | `ITMS-90189` | 构建号重复 | 等一分钟重跑 |
  | `ITMS-90186` / `ITMS-90062` | 这个版本号已提交 / 上架 | 调高 `MARKETING_VERSION`（例如 1.1） |
- 第一次装带主屏小组件的版本时，自动签名会为 `.widget` 扩展注册新的 App ID，需要 `-allowProvisioningUpdates`（脚本已带）。

## 改脚本或 iOS 工程之后

- 本地：`bash -n scripts/ios-try.sh`；变量后紧跟中文要写成 `${var}`（bash 3.2 在非 UTF-8 区域会把全角字符读进变量名）；
  `set -o pipefail` 下不要用 `大输出 | grep -q`（提前退出会让前面的命令收到 SIGPIPE），先存到变量再用 `case` 匹配。
- 用 `LGJ_SOURCE_ONLY=1 bash -c 'source scripts/ios-try.sh; …'` 单测函数（如 `pick_device`、`explain_build_failure`）。
- CI：`.github/workflows/app.yml` 的 `ios-try` 任务在 macos-latest 上像新 Mac 一样从标准输入跑脚本（隐藏预装 Node）、再跑一遍验证复用、试打 Release 包、检查团队 ID 生效和仓库保持干净。推送后确认它是绿的再给 Peyton 命令。
- 真机这一步（签名、安装、打开）只有 Peyton 的手机能验证，说明时要讲清哪些已在云端验证、哪些要他来试。

## 版本号与网页

- `MARKETING_VERSION`（1.0）在 Xcode 工程里，1.0 上架后再传必须调高。构建号由脚本按时间生成，只增不减。
- 隐私政策 `privacy.html` 与使用条款 `terms.html` 随网页发布到 GitHub Pages，Pages 只从默认分支发布：合并之前这两个网址打不开。
