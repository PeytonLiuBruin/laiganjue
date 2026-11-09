---
name: laiganjue-round
description: How to continue building the 来感觉 (Laiganjue) divination app in this repo — where the plan lives (docs/claude-plan TODO.md / run-log.md), how to pick the next item, the iPhone-viewport screenshot, overlap, contrast and tap-size checks that every UI change must pass, and how to record and push a round. Use at the start of any "keep improving / 继续做 / 接着优化" session, before changing UI, styles, 3D stage objects, paywall or module behaviour, and before declaring a round finished.
---

# 来感觉 · 一轮工作怎么做

来感觉是面向 18–30 岁中文用户的玄学占卜合集（17 个玩法），网页版与 iPhone / 安卓 App 共用一份代码（Capacitor 8）。
目标是做到能上架 App Store 并开始收费。Peyton（产品负责人，非工程背景）希望全程不被提问，自行判断推进。

## 先读这些（每轮都读）

| 文件 | 作用 |
| --- | --- |
| `docs/claude-plan/TODO.md` | 按 P0 上架必需 → P1 付费转化 → P2 体验打磨排序的待办，每项有完成标准；做完打勾并写日期 |
| `docs/claude-plan/run-log.md` | 每轮记录：完成项、检查结果、遗留、下一轮计划、「待 Peyton 决定」 |
| `docs/claude-plan/visual-direction.md` | 明快卡通手游风格的验收参数（色值、描边、圆体字重）。改视觉必须照它，`frontend-design` 技能与它冲突时以它为准 |
| `docs/claude-plan/monetization.md` | 免费额度、Pro 订阅、皮肤单买；真实价格由 Peyton 在 App Store Connect 配置 |
| `docs/claude-plan/user-persona.md` | 用户画像，判断取舍时用 |
| `docs/MODULE_GUIDE.md`、`docs/NATIVE_APP.md` | 模块约定、App 打包与上架步骤 |

## 选题

1. 从 TODO.md 最高优先级、没有被外部条件卡住的未完成项开始（卡住的典型原因：需要 Peyton 的开发者账号、真机、App Store Connect 操作）。
2. 每轮做 1–3 项完整结果，不留半成品。发现新问题就加进 TODO.md 并排好优先级。
3. 需要 Peyton 决定且不可撤回的事（真实价格、账号操作、首发地区）写进 run-log 的「待 Peyton 决定」，跳过它继续做别的。

## 改动约定

- 逻辑与数据（`core.js` / `data.js`）不碰 DOM；界面只通过 `ctx.kit`、`ctx.platform` 触达平台；颜色只来自 CSS 变量。
- App 专属能力只放在 `src/platform/native.js`，网页版对应空实现。
- 新增或修改行为要补 `tests/*.test.mjs`；交互流程用 `tests/e2e/*.e2e.mjs`。
- 中文界面文案短、直白、动词开头；写给 Peyton 的中文不用分号。

## 每轮收尾的验收（全部要跑，并看到结果再说「通过」，见 `verification-before-completion`）

```bash
npm test                                   # 单元测试，全部通过
npm run build                              # 单文件构建成功
node scripts/smoke.mjs --act --until-sheet 8 --viewport 390x844     # 17 个玩法 + 结果抽屉：报错、横向溢出、[overlap] 文字重叠
node scripts/smoke.mjs --act --until-sheet 8 --viewport 360x640     # 小屏再跑一次
node scripts/contrast-audit.mjs --routes <改过的页面>              # 文字对比度 WCAG AA，五套皮肤 0 处
node scripts/tap-audit.mjs --routes <改过的页面>                   # 可点元素 ≥ 44pt
node scripts/iphone-shots.mjs --routes <改过的页面> --clean        # 393×852 与 430×932 截图，逐张看
npm run e2e                                # 改了交互、3D 舞台或付费流程时跑
```

- 截图要真的打开看：排版是否溢出、字是否被截断或压住、按钮是否折行、3D 器物是否符合 visual-direction.md。
- 3D 舞台在这台机器上可能没有 GPU：`--no-webgl` 只验 2D 回退；需要看 3D 时用默认（软件 WebGL）并接受更慢。
- 截图放 `docs/claude-plan/screenshots/`，只保留最新一轮。

## 记录与推送

1. `git add` 本轮改动的文件（不要 `git add -A` 把别人的未提交改动带进去），提交说明写清改了什么、为什么。
2. 在 `run-log.md` 追加本轮：时间、完成的待办、检查结果（命令与数字）、遗留问题、下一轮计划、待 Peyton 决定。
3. TODO.md 打勾写日期。推送到当前会话指定的分支，不 force push，不改写已推送的历史。

## 边界

- 不提交 App Store 审核或 TestFlight，不登录、不改动 App Store Connect 与 Apple Developer 账号，不填任何支付信息或真实密钥。
- 不装需要 sudo 的软件；npm 依赖装了要写进 package.json。
- 删除或替换文件只通过 git 操作，保证能从历史找回。
