# 卢恩符文 runes · 模块规格

北欧古弗萨克 24 符文。摇动皮袋，符石滚落，翻面见符。

## 数据（data.js，24 枚 Elder Futhark）
Fehu Uruz Thurisaz Ansuz Raidho Kenaz Gebo Wunjo / Hagalaz Nauthiz Isa Jera Eihwaz Perthro Algiz Sowilo / Tiwaz Berkano Ehwaz Mannaz Laguz Ingwaz Dagaz Othala
- 每枚：`{ id, name:'Fehu', zh:'菲胡', aett:'弗雷之族'|'海姆达尔之族'|'提尔之族', sound:'F', symbol:'牛/财富', path:'<SVG path d，在 0 0 100 160 视野内的直线组合>', reversible:true|false, up:{keywords:[3], meaning(80–120 字)}, rev:{keywords:[2–3], meaning(60–90 字)}|null, advice(20–40 字) }`。
- 不可逆位（无 rev）：Gebo Hagalaz Isa Jera Eihwaz Sowilo Ingwaz Dagaz（8 枚，其他 16 枚可逆位）。
- 每枚符文的 SVG path 必须正确表现其字形（全部由直线段构成，笔画用 `stroke`，`stroke-width` 8–10，`stroke-linecap: round`）。
- 附：三符牌阵位名与含义、今日符文说明。

## 视觉
- 符石：椭圆/鹅卵石形（border-radius 不规则 + 径向渐变，深灰石材或琥珀色木牌两种材质，随皮肤：深色皮肤用浅石灰色石头对比、浅色皮肤用深石），符文刻痕用 `stroke: var(--accent)` 并加 `filter: drop-shadow` 制造刻入感。
- 皮袋：舞台里一个皮革色（`--wood-1/2`）束口袋（CSS 形状 + 收口绳），摇动时晃动。
- 布面：舞台底部一块深色麻布（重复渐变纹理）承接符石。

## 流程（三入口）
- 牌阵 chips：单符（1）/ 三符·诺伦（过去/现在/未来）/ 五符·十字（现状/阻碍/助力/建议/结果）/ 今日符文（`dailyRng`）。
- 摇：`onShake` 或在皮袋上 `gesture.rub`/`drag` 来回，皮袋抖动 + `rattle`；主按钮「摸一枚」`primary`（先自动摇 0.8s）。
- 出石：N 枚符石从袋口滚出（translate + rotate 落到各自槽位，`thud` 逐枚），背面朝上（素面）。
- 翻面：点石头 → rotateY 翻面显示符文（`flip`），逆位则符文倒置显示；「全部翻开」按钮。
- 全翻 → `shimmer` → 结果抽屉。

## core.js（可测）
- `RUNES` 校验函数 `validateRunes()`（24 枚、名唯一、path 非空、不可逆列表正确）；`drawRunes(n, rnd, {reversedRate:0.35})` 不重复且不可逆者永不逆位；`dailyRune(date)`；`SPREADS`。
- 测试覆盖上述。

## 结果抽屉
kicker = 牌阵名、title = 单符时符文中文名 + 拉丁名、verse = 关键词、每符一个 section（含小 SVG 符形 node）、最后「符文的建议」、footer。actions：「再摸一次」「分享」。

## 细节
- 石头槽位用虚线圆。
- 皮袋摇动动画用 CSS keyframes，摇动强度由 intensity 决定 class（轻/中/重）。
