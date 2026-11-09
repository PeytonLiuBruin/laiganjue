# 本项目的 Claude Code Skills

在这个仓库里工作的 Claude Code 会话会自动加载这里的技能（每个子目录一个，入口是 `SKILL.md`）。
前两个是本项目自己的工作方法，其余是从 GitHub 挑选、逐个读过全文后原样收录的第三方技能。

## 本项目自有

| 技能 | 用途 |
| --- | --- |
| `laiganjue-round` | 接着做来感觉时怎么开工、按什么顺序做、怎么验收、怎么记录（docs/claude-plan 的约定） |
| `laiganjue-ios-ship` | 装到 iPhone、上传 TestFlight、版本号、常见报错（scripts/ios-try.sh） |

## 第三方（原样收录，保留各自许可证）

| 技能 | 来源（收录时的提交） | 许可证 | 为什么收录 |
| --- | --- | --- | --- |
| `capacitor-apple-review-preflight` | [Cap-go/capgo-skills](https://github.com/Cap-go/capgo-skills/tree/e90bb5639130e34387f00bf0a95c6d47e4a2ebb8/skills/capacitor-apple-review-preflight) | MIT | 提交 App Store 审核前逐条对照审核指南（4.2 最低功能、3.1.1 内购、5.1.1 隐私、4.3 同质化），本 App 是占卜类 + 订阅，正好命中 |
| `capacitor-app-store` | [Cap-go/capgo-skills](https://github.com/Cap-go/capgo-skills/tree/e90bb5639130e34387f00bf0a95c6d47e4a2ebb8/skills/capacitor-app-store) | MIT | 版本号 / 构建号、截图、商店资料、上传前检查 |
| `subscription-app-revenue` | [Cap-go/capgo-skills](https://github.com/Cap-go/capgo-skills/tree/e90bb5639130e34387f00bf0a95c6d47e4a2ebb8/skills/subscription-app-revenue) | MIT | 付费墙位置、价格档位、留存与流失的判断方法，配合 docs/claude-plan/monetization.md |
| `safe-area-handling` | [Cap-go/capgo-skills](https://github.com/Cap-go/capgo-skills/tree/e90bb5639130e34387f00bf0a95c6d47e4a2ebb8/skills/safe-area-handling) | MIT | 灵动岛、底部横条、安卓全面屏的留白（Capacitor 8 SystemBars） |
| `capacitor-accessibility` | [Cap-go/capgo-skills](https://github.com/Cap-go/capgo-skills/tree/e90bb5639130e34387f00bf0a95c6d47e4a2ebb8/skills/capacitor-accessibility) | MIT | VoiceOver、系统字号、减少动态效果在 WebView 里的坑 |
| `frontend-design` | [anthropics/skills](https://github.com/anthropics/skills/tree/2c5958ecac7cee2b583967a2c4981d0f4a75c579/skills/frontend-design) | Apache-2.0 | 视觉打磨时避免模板化的设计判断（与 docs/claude-plan/visual-direction.md 冲突时以后者为准） |
| `verification-before-completion` | [obra/superpowers](https://github.com/obra/superpowers/tree/22f0b463e7a5e579904dd6211a520321035526f7/skills/verification-before-completion) | MIT | 说「完成 / 通过」之前必须跑过验证命令并看到结果 |

## 看过但没有收录的

- `vercel-labs/agent-skills` 的 `web-design-guidelines`：每次运行都从网上拉取最新规则再照做，内容随时可能变化，不适合放进仓库自动加载。界面检查已由本项目的重叠、对比度、触控尺寸审计脚本覆盖。
- `TimBroddin/app-store-aso-skill`：校验脚本只数字符，另一半内容是推荐作者自己的排名工具（全局安装加定时任务）。商店文案在 docs/claude-plan/store-listing.md，字数限制已写进 `capacitor-app-store`。
- `anthropics/skills` 的 `webapp-testing`：用 Python 写 Playwright，本项目已有 Node 版的 smoke、e2e 与截图脚本。

更新第三方技能：重新从上表的仓库取对应目录，读过差异后整目录替换，并更新上表的提交号。
