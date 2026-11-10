# 上架清单（第 52 轮整理，2026-11-10）

按提交顺序排。✅ 是代码和文件里已经做好的，👤 是要 Peyton 本人在 Apple 后台或真机上做的（定时任务不碰账号、价格和提交）。每一步做完可以在这里打勾。

## 一、发布前一次性准备

| # | 事项 | 状态 |
| --- | --- | --- |
| 1 | 决定首发地区：含不含中国大陆。含的话要先办 App 备案号（几周），不含就先上港澳台、新加坡、美国等地区 | 👤 见 TODO P0 |
| 2 | 把 `claude/polish-ui-monetize` 合并到 GitHub Pages 发布分支，让隐私政策、使用条款、支持页三个网址能打开 | 👤 见下方「网址」 |
| 3 | Apple Developer 账号里签好付费 App 协议，填税务与银行信息（不签收不了钱，内购产品也提交不了） | 👤 |
| 4 | App Store Connect 新建 App：Bundle ID `io.github.peytonliubruin.laiganjue`，主语言简体中文，SKU 随意 | 👤 |

网址（App Store Connect 里要填）：

- 隐私政策：`https://peytonliubruin.github.io/laiganjue/privacy.html`
- 支持网址（必填）：`https://peytonliubruin.github.io/laiganjue/support.html`（第 52 轮新增，含联系方式、恢复购买、取消订阅、退款、体感与小组件说明）
- 使用条款：`https://peytonliubruin.github.io/laiganjue/terms.html`（付费卡和设置页已经链接到这里，订阅的 App 描述末尾也建议贴一次）

## 二、工程与合规（已在代码里）

| 事项 | 状态 |
| --- | --- |
| 只上 iPhone（`TARGETED_DEVICE_FAMILY = 1`），设备能力 arm64，不需要 iPad 截图 | ✅ 第 52 轮，`tests/ios-launch.test.mjs` |
| 出口合规 `ITSAppUsesNonExemptEncryption = false`，每次上传不用再答加密问题 | ✅ |
| 隐私清单 `PrivacyInfo.xcprivacy`（不追踪、不收集，UserDefaults CA92.1、文件时间戳 C617.1） | ✅ 第 3 轮 |
| 构建号自动递增（`ios-try.sh --testflight` 按时间生成 CURRENT_PROJECT_VERSION） | ✅ |
| 内购：付费卡显示本地化价格、周期、自动续期、试用说明、条款与隐私链接、恢复购买、关闭按钮 | ✅ 第 2、35、43 轮，模拟器 UI 测试通过 |
| 小组件扩展 `io.github.peytonliubruin.laiganjue.widget` | ✅ 模拟器编译通过，真机签名见第四节 |

## 三、App Store Connect 里填写

| # | 事项 | 现成材料 |
| --- | --- | --- |
| 5 | 订阅组「来感觉 Pro」：`laiganjue.pro.monthly`、`laiganjue.pro.yearly`（3 天免费试用） | 价格建议见 monetization.md 第 3 节 👤 |
| 6 | 其余内购：`laiganjue.pro.lifetime`、`laiganjue.reading.pack5`、`laiganjue.skin.cinnabar` / `nebula` / `celadon` | 同上，每个产品要一张审核截图，可用 `bash scripts/paywall-shot.sh` 导出的付费卡与皮肤卡截图 👤 |
| 7 | 名称、副标题、描述、关键词、宣传文本（中英） | store-listing.md 第 1 到 4 节 👤 审 |
| 8 | 分类：娱乐，次分类生活 | store-listing.md 第 5 节 |
| 9 | 年龄分级问卷 | store-listing.md 第 8 节逐题建议，结论 13+ 👤 |
| 10 | App 隐私「营养标签」：选「不收集数据」 | 购买由 Apple 处理，App 不联网收集任何东西 👤 |
| 11 | 6.9 寸截图 6 张（1290×2796） | `docs/claude-plan/store/`，界面改版后要重拍，见 TODO |
| 12 | 审核备注 | store-listing.md 第 6 节，直接粘贴 |
| 13 | 内购产品勾选「随此版本提交」 | 第一个版本必须和内购一起送审 👤 |

## 四、上传与送审

| # | 事项 | 怎么做 |
| --- | --- | --- |
| 14 | 真机装一次，看图标、小组件、断签提醒、分享到相册 | `bash scripts/ios-try.sh`，第一次会为小组件注册新的 App ID 👤 |
| 15 | 沙盒账号走一次购买、恢复、取消 | App Store Connect → 用户和访问 → 沙盒测试员 👤 |
| 16 | 上传 TestFlight | `bash scripts/ios-try.sh --testflight`（步骤见 docs/NATIVE_APP.md 第四节）👤 |
| 17 | 选构建版本，提交审核 | 👤 |

## 常见被拒原因，对照自查

- 2.1 功能不完整：付费卡价格取不到时会自动重试并有「轻点重试」（第 35 轮）。审核前确认内购产品状态是「准备提交」。
- 2.3.1 描述不准确：付费卡三条权益和商店描述一致（第 9 轮核对）。以后加 Pro 功能要三处一起改。
- 3.1.2 订阅信息：付费卡与使用条款已写全。App 描述里也要有使用条款链接或在后台填自定义 EULA。
- 4.3 同质化：审核备注里强调 17 个玩法、原创 3D 器物与体感交互、仅供娱乐。
- 5.1.1 隐私：没有账号、不收集数据，隐私政策网址必须能打开（第一节第 2 步）。
