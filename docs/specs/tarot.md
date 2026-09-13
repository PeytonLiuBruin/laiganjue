# 塔罗 tarot · 模块规格

摇动洗牌 → 甩出牌 → 点击翻面 → 逐张解读 + 综合。78 张全牌。

## 牌库（data.js，必须 78 张）
- 大阿卡纳 22：`{ id, arcana:'major', no:0–21, roman:'0'|'I'…'XXI', name:'愚者', en:'The Fool', glyph(内联 SVG 或 Unicode 符号，见下), keywords:{up:[3], rev:[3]}, up(80–120 字), rev(60–90 字), love, career, advice(各 15–30 字) }`。
- 小阿卡纳 56：四花色 权杖 Wands(火)/圣杯 Cups(水)/宝剑 Swords(风)/星币 Pentacles(土)，各 Ace–10 + 侍者/骑士/王后/国王。`{ id, arcana:'minor', suit, rank:1–14, name:'圣杯三', en:'Three of Cups', keywords:{up,rev}, up(50–80 字), rev(40–60 字) }`。
- 牌面视觉：
  - 牌背：`--card-back-1/2` 渐变 + 金色细边框 + 中央几何图腾（重复渐变/SVG 星形），任何皮肤下都好看。
  - 大牌正面：顶部罗马数字，底部中文名+英文名（`--font-latin-display`），中央一个大符号：每张牌自定一个简洁 SVG 图形或 Unicode（如 ☉ ☽ ★ ♆ ⚖ ✦ ♛ ⚚ ☿ ♃ ⚔ ☥ 🜂…，要有区分度，20 张以上不重复）。
  - 小牌正面：按点数排布花色符号（Ace 一个大符号，2–10 如真实点数牌的对称布局，宫廷牌大符号 + 头衔字），花色符号用内联 SVG（权杖/圣杯/宝剑/星币各画一个简洁图标）。
  - 逆位：整张牌 rotate(180deg) 显示，并在解读中标注「逆位」。
  - 牌尺寸 ≈ 96×160px（单张牌阵可放大至 130×220）。

## 牌阵（chips 切换）
- 单张指引（1）、时间之流（3：过去/现在/未来）、关系之镜（3：你/对方/关系）、抉择（3：选择A/选择B/建议）、每日一牌（1，按 `dailyRng('tarot')` 当日固定，逆位概率同样固定）。

## 流程（三入口）
1. 洗牌：`onShake` → 牌堆散开抖动动画（每张牌随机偏移旋转 300ms 后收拢）+ `shake` 音效 + `haptic.rattle`；屏幕：在牌堆上 `gesture.rub`；按钮「洗牌」。洗牌次数显示「已洗 N 次」。
2. 抽牌：在牌堆上向上快滑（`gesture.flick`）→ 顶牌飞到下一个空牌位（translate 到目标位置 + 轻微旋转，`whoosh`）；按钮「抽一张」（`primary`）；`onToss` 也可抽牌。
3. 翻牌：点击牌位上的牌（`gesture.tap`）→ 3D 翻面（rotateY 180，`flip`，`haptic.light`），逆位牌翻开后再转 180°；也可按钮「全部翻开」。
4. 全部翻开 → `shimmer` 音效 → 主按钮变「解 读」→ 结果抽屉。

## core.js（可测）
- `buildDeck()` 78 张 id 唯一；`shuffleDeck(deck, rnd)`；`drawCards(deck, n, rnd, {reversedRate:0.3})` → `[{card, reversed}]`；`SPREADS` 定义；`synthesize(spreadId, draws)` 纯函数返回一句综合语（基于牌的大类/花色/正逆比例的规则拼句，至少 12 种模板）；`dailyCard(date)`。
- 测试：78 唯一、四花色各 14、大牌 22；shuffle 保持集合；draw 不重复；reversedRate 0/1 极值；dailyCard 同日一致。

## 结果抽屉
kicker = 牌阵名、title = 单张时为牌名，多张时为「时间之流」等、每张一个 section（label = 牌位名，text = 「愚者（逆位）— 关键词 · 解读」，可用 node 自定义排版含小牌面缩略）、最后 section「综合」= synthesize 结果、footer。actions：「再抽一次」「分享」。

## 细节
- 牌堆用 5–7 张叠放的牌背表现厚度。
- 牌位空槽用虚线框 + 牌位名。
- 皮肤切换时牌背颜色随变量变化。
- 防重入：飞牌/翻牌动画中忽略输入。
