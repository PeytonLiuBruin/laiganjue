# 八字 bazi · 模块规格

输入生辰 → 排出四柱 → 五行强弱 → 日主性情与建议。算命的"命"。

## 计算（core.js，全部基于 lunar-javascript）
```js
import('./src/core/lunar.js').then(({Solar})=>{const bz=Solar.fromYmdHms(1995,6,18,14,30,0).getLunar().getEightChar();console.log(bz.toString(),bz.getYearNaYin(),bz.getMonthNaYin(),bz.getDayNaYin(),bz.getTimeNaYin(),bz.getYearShiShenGan(),bz.getMonthShiShenGan(),bz.getTimeShiShenGan(),bz.getYearShiShenZhi(),bz.getDayShiShenZhi(),bz.getYearWuXing(),bz.getMonthWuXing(),bz.getDayWuXing(),bz.getTimeWuXing(),bz.getYearHideGan(),bz.getDayHideGan(),bz.getMingGong(),bz.getShenGong(),bz.getTaiYuan())})
```
- `computeChart({y,m,d,hour|null,gender})` → `{ pillars:[{label:'年柱', gan, zhi, wuxingGan, wuxingZhi, naYin, shiShen(十神，日柱为"日主"), hideGan:[藏干]}], dayMaster:{gan, wuxing, yinYang}, elements:{金,木,水,火,土}(计数：四柱天干+地支本气，时辰未知则只算三柱), strong:[], weak:[], missing:[], shengXiao, xingZuo(星座), mingGong, taiYuan, todayRelation }`。
- `todayRelation`：今日日干 与 日主 的十神关系（用 `LunarUtil.SHI_SHEN` 或自算：同五行同阴阳=比肩…，可从 lunar-javascript 现有方法取），给一句白话。
- 十天干日主性情文本（data.js，各 120–180 字，白话有画面感，正反两面），五行旺/缺 建议（每行 40–80 字 × 5 × 2），十神一句话释义（10 条），纳音一句话（30 条，可精简为按五行归类）。
- 测试锚点：1995-06-18 14:30 → 乙亥 壬午 庚辰 癸未；2000-01-01 → 日柱 戊午；时辰未知时 pillars 长度 3；elements 合计 = 8（或 6）；missing 逻辑。

## 界面
- 表单卡：年（1940–今年 select）/ 月 / 日 / 时辰（12 时辰 + 「不知道」）/ 性别（男/女 chips）。主按钮「排 盘」（`primary`）。记住上次输入（storage）。
- 排盘动画：舞台上四块竖长"命牌"依次翻出（rotateY，`flip` 音效），每块：顶部小字柱名、中间大字天干（按五行着色：金-淡金/白、木-青绿、水-蓝、火-朱红、土-土黄，五种颜色写在模块 CSS 变量里，浅色皮肤要有对比度）、下方地支大字、再下方 藏干 小字、纳音、十神。
- 五行分布：五根竖条/横条图（CSS），标注数量与「旺/中/弱/缺」。
- 「日主 · 庚金」大卡：性情文本 + 关键词 chips。
- 「今日与你」小卡：今日干支与日主的关系一句话。
- 结果抽屉「命理详批」（按钮触发）：sections：命格概览 / 日主性情 / 五行建议（缺什么补什么：颜色、方位、习惯，非医疗）/ 十神分布 / 命宫·胎元 / 提醒（"八字是传统文化的性格镜子，不是命运判决"）。actions「重新排盘」「分享」。

## 细节
- 时辰未知：隐藏时柱，提示"补上出生时辰会更完整"。
- 立春前后的年柱由库处理，无需手工。
- 星座：`Solar.getXingZuo()`。
