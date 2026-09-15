// 模块清单（纯数据，无任何 DOM / 平台依赖，Node 与浏览器都可直接 import）。
// 新增模块：在此加一条 + 在 registry.js 里 import 其 index.js + 在 modules/index.css 里 @import 其 style.css。
//
// region:  east(东方玄学) | west(西方神秘) | japan(东瀛神社) | play(趣玩)
// gesture: shake(摇) | toss(甩/抛) | flick(屏幕甩牌) | flip(翻面) | spin(拨转) | tilt(倾斜/指向) | rub(摩擦) | tap(点)
export const REGIONS = [
  { id: 'east', title: '东方玄学', kicker: '问天问地问自己' },
  { id: 'west', title: '西方神秘', kicker: 'Mystic · Arcana' },
  { id: 'japan', title: '东瀛神社', kicker: '御神签 · おみくじ' },
  { id: 'play', title: '趣玩一下', kicker: '决定不了？交给运气' },
];

export const MODULE_LIST = [
  { id: 'jiaobei', title: '筊杯', glyph: '筊', region: 'east', gestures: ['toss', 'flick'], subtitle: '向上一甩，圣杯笑杯阴杯见分晓' },
  { id: 'qian', title: '灵签', glyph: '签', region: 'east', gestures: ['shake'], subtitle: '摇动签筒，一支灵签跃然而出' },
  { id: 'liuyao', title: '六爻', glyph: '卦', region: 'east', gestures: ['toss', 'shake'], subtitle: '三枚铜钱掷六次，成卦解卦' },
  { id: 'almanac', title: '黄历', glyph: '历', region: 'east', gestures: ['tap'], subtitle: '今日宜忌、冲煞、吉神方位，撕一页看明天' },
  { id: 'bazi', title: '八字', glyph: '命', region: 'east', gestures: ['tap'], subtitle: '生辰四柱、五行强弱、日主性情' },
  { id: 'fengshui', title: '风水', glyph: '风', region: 'east', gestures: ['tilt'], subtitle: '手机当罗盘，本命卦吉凶方位一望即知' },
  { id: 'wheel', title: '转盘', glyph: '转', region: 'play', gestures: ['spin', 'shake'], subtitle: '拨一下转起来，吃什么做什么去哪儿' },
  { id: 'tarot', title: '塔罗', glyph: '塔', region: 'west', gestures: ['shake', 'flick', 'flip'], subtitle: '摇动洗牌，甩出一张，翻开命运' },
  { id: 'runes', title: '卢恩', glyph: '符', region: 'west', gestures: ['shake', 'flip'], subtitle: '北欧符文石，从袋中摸出你的答案' },
  { id: 'zodiac', title: '星座', glyph: '星', region: 'west', gestures: ['tap'], subtitle: '十二星座今日运势 · 东方生肖同场' },
  { id: 'crystal', title: '水晶球', glyph: '晶', region: 'west', gestures: ['rub', 'shake', 'tilt'], subtitle: '摩擦水晶球，雾散见神谕；灵摆问是非' },
  { id: 'omikuji', title: '御神签', glyph: '神', region: 'japan', gestures: ['shake'], subtitle: '摇出签棒抽签纸，大吉还是凶' },
  { id: 'coin', title: '硬币骰子', glyph: '币', region: 'play', gestures: ['flick', 'shake'], subtitle: '甩出硬币，摇出骰子，二选一交给天意' },
  { id: 'plinko', title: '落球盘', glyph: '落', region: 'play', gestures: ['shake', 'tap'], subtitle: '写下选项，看小球弹跳着替你做决定' },
];

export const GESTURE_LABEL = {
  shake: '摇一摇',
  toss: '向上甩',
  flick: '屏幕甩动',
  flip: '点击翻面',
  spin: '拨动旋转',
  tilt: '倾斜/指向',
  rub: '摩擦屏幕',
  tap: '点选',
};

export function getModuleMeta(id) {
  return MODULE_LIST.find((m) => m.id === id) || null;
}
