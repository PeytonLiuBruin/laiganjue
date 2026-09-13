# 黄历 almanac · 模块规格

一页可撕的老黄历：今日宜忌、冲煞、吉神方位、时辰吉凶，向上/向下甩动翻到明天/昨天。

## 数据来源
全部来自 `src/core/lunar.js`（lunar-javascript）。先用 `node -e` 探索 API，例如：
```js
import('./src/core/lunar.js').then(({Solar})=>{const l=Solar.fromYmd(2026,9,13).getLunar();console.log(l.toFullString());console.log(l.getDayYi(),l.getDayJi(),l.getDayJiShen(),l.getDayXiongSha(),l.getDayTianShen(),l.getDayTianShenType(),l.getDayTianShenLuck(),l.getDayPositionTai(),l.getDayNaYin(),l.getZhiXing(),l.getXiu(),l.getXiuLuck(),l.getXiuSong(),l.getPengZuGan(),l.getPengZuZhi(),l.getDayLu(),l.getTimes().map(t=>t.getGanZhi()+t.getTianShenLuck()))})
```
（`getTimes()` 返回 13 个时辰对象；`LunarTime` 有 `getTianShen()`, `getTianShenLuck()`, `getPositionXiDesc()` 等。若某方法不存在，以实际探索结果为准。）

## 页面结构
- 舞台 = 一张挂历纸（`.paper-slip` 材质，顶部两颗"挂钉"），内容：
  - 顶部小字：公历 年月日 · 星期 · 节气/节日
  - 巨大日期数字（80px+，`gold-text` 或墨色）
  - 农历「丙午年 八月初三」· 干支「丁酉月 庚寅日」· 生肖 · 星座
  - 宜 / 忌 两栏（完整列表，用 chip 样式的小标签）
  - 冲煞、值神(黄道/黑道)、建除、二十八宿(+吉凶)、纳音、彭祖百忌
  - 吉神方位：喜神 / 财神 / 福神 / 阳贵 / 阴贵 / 胎神
  - 时辰吉凶：12 格（子丑寅…），吉/凶 颜色区分，当前时辰高亮
  - 每日一言：40+ 句古典格言/诗句（data.js），按日期 `dailyRng` 稳定抽取
- 翻页：在纸上向上快滑或向下快滑（`gesture.flick` axis y, direction any）→ 撕页动画（当前页 rotateX/translateY 飞出 + `paper` 音效）→ 新一页从后方浮现；`onShake` 回到今天（toast「回到今天」）。
- 顶部日期选择：`<input type="date">`（.input 样式）+ 「今天」按钮 + 前一天/后一天箭头按钮；主按钮 `primary` = 「明天」（翻到下一天）。
- 「黄历详解」抽屉（点击纸面任意区域或按钮）：resultCard 形式，把所有项目分 sections 展示，并附各名词的一句话解释（data.js：如"值神：青龙 —— 黄道吉日，诸事皆宜"）。

## core.js（可测）
- `buildDay(date)` → 结构化对象（所有字段字符串/数组，UI 不直接碰 lunar 对象）。
- `shiftDay(date, n)`（跨月/跨年正确）、`hourIndex(date)` 当前时辰下标、`dailyQuote(date)` 稳定。
- 测试：2026-09-13 的干支 庚寅、生肖 马；2026-02-17 为正月初一；shiftDay 跨年；hourIndex 23:30→子时(0)；dailyQuote 同日一致。

## 细节
- 皮肤：纸面用 `--paper/--paper-ink`（五套皮肤下纸都是暖白，墨字），页面其余用主题色。
- 宜忌为「诸事不宜」时也要正常显示。
- 性能：翻页动画 ≤ 600ms；不要在每帧重建 DOM。
