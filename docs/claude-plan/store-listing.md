# 商店文案草稿与审核备注

状态：草稿，Peyton 审过后再粘贴到 App Store Connect。字数已按 App Store 限制核对（名称、副标题各 30 字符以内，关键词 100 字符以内，宣传文本 170 字符以内）。

## 1. 名称与副标题

| 字段 | 简体中文 | English (U.S.) |
| --- | --- | --- |
| 名称 | 来感觉 · 摇一摇的灵感签 | Laiganjue: Shake for Signs |
| 副标题 | 灵签 塔罗 六爻 姻缘，摇一摇就有答案 | Fortune sticks, tarot, I Ching |

备选副标题：「手机变签筒，今天来点好感觉」/「Daily oracle you can shake」。

## 2. 宣传文本（可随时改，不用重新审核）

- 中文：新版器物换上明快的卡通 3D 风格。摇一摇签筒、甩一甩筊杯，每天一签，看看今天的好感觉。
- English: Shake your phone like a fortune-stick cup. Bright 3D charms, daily signs, tarot spreads and more, no sign-up needed.

## 3. 描述

### 中文

来感觉把签筒、筊杯、铜钱、塔罗牌和水晶球都装进你的手机。摇一摇、甩一甩，就像在庙里求签一样，得到今天的一点感觉。

十几种玩法
- 灵签：摇签筒求一支签，签诗逐句解读
- 筊杯与六爻：甩手机掷筊、掷铜钱，自动起卦
- 塔罗与卢恩：经典 RWS 牌面，多种牌阵
- 姻缘、事业、财运：填上生辰，看缘分、贵人和财库
- 黄历、八字、星座、风水罗盘、水晶球、御神签、转盘

手感好看
- 卡通 3D 器物，摇签筒、摇钱树、同心结都会跟着你的手机动
- 震动与音效配合每一次出手
- 多套皮肤，白天明快，夜里安静

不打扰
- 不用注册，没有广告
- 生辰、历史与设置只保存在你的手机上

来感觉 Pro（可选）
- 无限次深度解读
- 全部付费皮肤（朱砂、星穹、青瓷）
- 无水印分享卡
订阅按月或按年自动续期，可随时在 iPhone「设置 → Apple 账户 → 订阅」中取消。也可以一次买断，或单买 5 次深度解读。

所有结果由随机算法与传统文化文本生成，仅供娱乐与自我觉察。

使用条款：https://peytonliubruin.github.io/laiganjue/terms.html
隐私政策：https://peytonliubruin.github.io/laiganjue/privacy.html

### English

Laiganjue puts a fortune-stick cup, moon blocks, I Ching coins, tarot cards and a crystal ball in your pocket. Shake or flick your phone and draw a sign for the day.

- Fortune sticks with line-by-line poem readings
- Moon blocks and I Ching by tossing your phone
- Tarot and runes with classic RWS art and spreads
- Love, career and wealth readings from your birth date
- Almanac, BaZi, zodiac, feng shui compass, crystal ball, omikuji and more

Bright cartoon 3D charms that react to your motion, with haptics and sound. No account, no ads. Your data stays on your phone.

Laiganjue Pro (optional): unlimited deep readings, all premium themes and watermark-free share cards. Subscriptions renew automatically and can be cancelled anytime in Settings → Apple Account → Subscriptions. A lifetime unlock and a 5-reading pack are also available.

For entertainment and self-reflection only.

## 4. 关键词（逗号分隔，不加空格）

- 中文（53 字符）：求签,抽签,灵签,塔罗,占卜,六爻,筊杯,黄历,八字,运势,姻缘,星座,解签,算卦,水晶球,风水,每日一签
- English（100 字符）：fortune,tarot,oracle,iching,divination,horoscope,astrology,omikuji,fengshui,bazi,luck,daily,sign,zen

名称和副标题里已经出现的词不重复放进关键词。

## 5. 分类与分级

- 主分类：娱乐（Entertainment），次分类：生活（Lifestyle）
- 年龄分级预计 12+：问卷中「模拟赌博」选「无」，「成熟或暗示性主题」选「无」或「偶尔 / 轻微」（姻缘玩法），以 Peyton 实际填写为准
- 内容版权：塔罗牌面为公有领域 Rider–Waite–Smith 图像（见 assets/tarot/ATTRIBUTION.md），签诗为传统文本

## 6. 审核备注（App Review Information → Notes）

```
Thank you for reviewing Laiganjue.

No account is required. All features work offline after install except font loading.

Motion: Most rituals can be triggered by shaking or flicking the phone. On first use, tap “开启手机体感” (Enable motion) to grant motion access. Every ritual also has a large on-screen primary button, so motion is optional.

In-App Purchases (all in the “来感觉 Pro” subscription group unless noted):
- laiganjue.pro.monthly (auto-renewable)
- laiganjue.pro.yearly (auto-renewable, 3-day free trial)
- laiganjue.pro.lifetime (non-consumable)
- laiganjue.reading.pack5 (consumable, 5 deep readings)
- laiganjue.skin.cinnabar / laiganjue.skin.nebula / laiganjue.skin.celadon (non-consumable, one theme each; included in Pro)
To see the theme store: tap the palette icon in the top bar, tap a theme marked “Pro · 试穿” to try it on for 10 seconds, then tap “解锁” (Unlock).
To see the paywall: open 灵签 (Fortune Sticks), tap the main button until a sign appears, tap “展开解读 · 今日免费” once (free daily reading), then draw again and tap “解锁深度解读”. The paywall can also be opened from Settings (gear icon) → 来感觉 Pro → 了解 Pro. “恢复购买” (Restore Purchases) is in both places.

Guideline 4.3: The app contains original 3D interactive charms, 17 rituals in one app, and motion-based interaction. All readings are for entertainment only, as stated in the app and the description.

Privacy: No data is collected. Purchases are processed by Apple.
```

## 7. 截图

`node scripts/store-shots.mjs` 生成，存放在 `docs/claude-plan/store/`：6.9 寸（1290×2796）与 6.5 寸（1242×2688）各 6 张。顺序：首页 → 灵签 → 塔罗 → 财运摇钱树 → 姻缘 → 水晶球。2D 界面明快化完成后需要重新生成一次。
