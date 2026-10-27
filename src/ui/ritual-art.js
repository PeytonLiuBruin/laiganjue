// 首页玩法卡上的小图标（第 41 轮卡通化）。
// 原来是 1.3 线宽的细线描，填充只有 8% 到 13% 透明度，在手游风的厚边卡片上发虚。
// 改为手游道具图标的画法：实色块面 + 深色 2.4 描边 + 一块白色硬高光。
// 主色用 currentColor（每个玩法卡的 --tint），金、红、白、沙岩等固定色写死，描边色由 CSS 的 --icon-ink 控制。
import { svg } from './kit.js';

const GOLD = '#ffc93c', GOLD_D = '#e0942a', RED = '#e8463c', CREAM = '#fff6df', SAND = '#f8e6bc', BLUE = '#3d8bff';
// 白色硬高光：不描边，叠在色块左上
const hi = (d) => `<path d="${d}" fill="#fff" fill-opacity=".55" stroke="none"/>`;
const spark = (x, y, r = 4) => `<path d="M${x} ${y - r}L${x + r * 0.32} ${y - r * 0.32}L${x + r} ${y}L${x + r * 0.32} ${y + r * 0.32}L${x} ${y + r}L${x - r * 0.32} ${y + r * 0.32}L${x - r} ${y}L${x - r * 0.32} ${y - r * 0.32}Z" fill="${GOLD}" stroke-width="1.6"/>`;

const art = {
  // 姻缘：红心 + 金色红线结
  yinyuan: `<path d="M32 55C11 42 6 28 13 19C20 11 28 13 32 21C36 13 44 11 51 19C58 28 53 42 32 55Z" fill="currentColor"/>${hi('M16 22C19 17 24 17 26 20C22 21 19 24 18 28C16 27 15 24 16 22Z')}<path d="M24 36Q32 30 40 36Q32 42 24 36Z" fill="${GOLD}"/><path d="M32 39L28 48M32 39L36 48" stroke-width="2"/>`,
  // 财运：元宝 + 金星
  caiyun: `<path d="M20 38Q20 20 32 20Q44 20 44 38Z" fill="#ffe08a"/><path d="M6 32Q32 46 58 32L51 50Q32 58 13 50Z" fill="${GOLD}"/>${hi('M24 34Q24 25 30 23Q27 29 28 35Z')}<path d="M14 43Q32 50 50 43" stroke-width="1.8" opacity=".5"/>${spark(52, 14)}${spark(12, 18, 3)}`,
  // 事业：三级台阶 + 顶上金星
  shiye: `<path d="M8 56V46H21V36H34V26H47V56Z" fill="currentColor"/>${hi('M10 48H19V51H10ZM23 38H32V41H23ZM36 28H45V31H36Z')}<path d="M8 56H56" />${spark(48, 13, 7)}`,
  // 筊杯：两枚朱红月牙，一枚正面一枚反面
  jiaobei: `<g transform="rotate(-12 20 33)"><path d="M29 8Q4 12 6 33Q8 54 29 58Q16 33 29 8Z" fill="currentColor"/>${hi('M22 13Q11 18 11 30Q14 22 21 18Z')}</g><g transform="rotate(12 44 33)"><path d="M35 8Q60 12 58 33Q56 54 35 58Q48 33 35 8Z" fill="currentColor"/><path d="M35 8Q60 12 58 33Q56 54 35 58Q48 33 35 8Z" fill="#fff" fill-opacity=".38" stroke="none"/></g>`,
  // 灵签：朱漆签筒 + 竹签
  qian: `<g fill="#ffd966"><path d="M18 30L14 8L19 7L23 30Z"/><path d="M26 30L25 4H30L31 30Z"/><path d="M34 30L37 6L42 7L39 30Z"/><path d="M42 30L48 11L52 13L46 30Z"/></g><path d="M25 4H30V9H25Z" fill="${RED}" stroke-width="1.6"/><path d="M13 27H51L47 55Q32 61 17 55Z" fill="currentColor"/>${hi('M17 30H23L21 52Q19 51 18 50Z')}<path d="M15 40H49L48 46H16Z" fill="${GOLD}"/><ellipse cx="32" cy="27" rx="19" ry="5" fill="#7a1a14"/>`,
  // 六爻：三枚方孔金钱
  liuyao: [[20, 22], [44, 22], [32, 43]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="${GOLD}"/><circle cx="${x}" cy="${y}" r="9" fill="none" stroke="${GOLD_D}" stroke-width="1.6"/><path d="M${x - 4} ${y - 4}H${x + 4}V${y + 4}H${x - 4}Z" fill="var(--surface, #fff)"/>${hi(`M${x - 9} ${y - 3}Q${x - 8} ${y - 9} ${x - 2} ${y - 10}Q${x - 6} ${y - 6} ${x - 6} ${y - 1}Z`)}`).join(''),
  // 黄历：撕页日历，红色页头 + 大字「宜」
  almanac: `<rect x="10" y="12" width="44" height="44" rx="7" fill="${CREAM}"/><path d="M10 26V19Q10 12 17 12H47Q54 12 54 19V26Z" fill="currentColor"/>${hi('M14 22V18Q14 15 18 15H30V18H18V22Z')}<path d="M22 7V17M42 7V17" stroke-width="3.4"/><text x="32" y="50" text-anchor="middle" font-size="22" font-weight="900" fill="${RED}" stroke-width="0" font-family="ui-rounded,'PingFang SC',sans-serif">宜</text>`,
  // 八字：四块命牌，金帽
  bazi: [10, 23, 36, 49].map((x, i) => { const top = i === 0 || i === 3 ? 16 : 11; return `<rect x="${x - 4}" y="${top}" width="11" height="${52 - top}" rx="2" fill="currentColor"/><rect x="${x - 5}" y="${top - 4}" width="13" height="5" rx="2" fill="${GOLD}" stroke-width="1.8"/>${hi(`M${x - 2} ${top + 3}H${x + 1}V${top + 22}H${x - 2}Z`)}`; }).join('') + `<path d="M4 54H60" stroke-width="3"/>`,
  // 风水：金边罗盘，红蓝磁针
  fengshui: `<circle cx="32" cy="32" r="25" fill="${GOLD}"/><circle cx="32" cy="32" r="18" fill="${CREAM}"/><circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 7V12M32 52V57M7 32H12M52 32H57" stroke-width="2"/><path d="M32 16L37 32H27Z" fill="${RED}" stroke-width="1.8"/><path d="M32 48L27 32H37Z" fill="${BLUE}" stroke-width="1.8"/><circle cx="32" cy="32" r="3" fill="#fff" stroke-width="1.6"/>${hi('M12 26Q15 15 25 10Q18 17 16 27Z')}`,
  // 转盘：四色扇面 + 指针
  wheel: `<path d="M32 34V10A24 24 0 0 1 56 34Z" fill="${RED}"/><path d="M32 34H56A24 24 0 0 1 32 58Z" fill="${GOLD}"/><path d="M32 34V58A24 24 0 0 1 8 34Z" fill="currentColor"/><path d="M32 34H8A24 24 0 0 1 32 10Z" fill="${BLUE}"/><circle cx="32" cy="34" r="24" fill="none"/>${hi('M12 26Q16 16 26 12Q20 19 17 27Z')}<circle cx="32" cy="34" r="5" fill="#fff"/><path d="M26 2H38L32 13Z" fill="${CREAM}"/>`,
  // 塔罗：紫色牌背 + 前面一张金色日月牌
  tarot: `<rect x="6" y="12" width="30" height="46" rx="5" transform="rotate(-14 21 35)" fill="currentColor"/>${hi('M8 20L13 19L19 47L14 48Z')}<rect x="22" y="6" width="34" height="50" rx="5" fill="${CREAM}"/><rect x="26" y="10" width="26" height="42" rx="3" fill="none" stroke="${GOLD_D}" stroke-width="1.8"/><circle cx="39" cy="27" r="10" fill="${GOLD}"/><path d="M42 18A9 9 0 1 0 42 36A11 11 0 0 1 42 18Z" fill="currentColor" stroke-width="1.8"/>${spark(39, 45, 4)}`,
  // 卢恩：两块沙岩符石，朱红符文
  runes: `<path d="M4 32C2 16 15 6 28 12C40 16 40 42 29 48C15 54 6 46 4 32Z" fill="${SAND}"/><path d="M28 40C26 26 39 18 50 23C62 28 63 48 53 55C38 62 29 53 28 40Z" fill="currentColor"/>${hi('M8 26Q10 16 19 13Q13 19 12 28Z')}${hi('M32 33Q34 26 41 24Q36 29 35 35Z')}<path d="M17 19V42M17 20L26 16M17 29L27 23" stroke="${RED}" stroke-width="3.4"/><path d="M39 34L51 49M51 34L39 49" stroke="#fff" stroke-width="3.4"/>`,
  // 星座：紫色星盘 + 金色大星
  zodiac: `<circle cx="32" cy="32" r="25" fill="currentColor"/>${hi('M12 26Q15 15 25 10Q18 17 16 27Z')}<path d="M32 15L36.5 27.5L49.5 28L39 36L43 49L32 41.5L21 49L25 36L14.5 28L27.5 27.5Z" fill="${GOLD}" stroke-width="2"/><g fill="#fff" stroke="none"><circle cx="48" cy="16" r="2"/><circle cx="15" cy="45" r="1.6"/><circle cx="50" cy="46" r="1.4"/></g>`,
  // 水晶球：紫球 + 白高光 + 金底座
  crystal: `<path d="M18 48H46L50 58H14Z" fill="${GOLD}"/><circle cx="32" cy="29" r="21" fill="currentColor"/><path d="M15 24Q17 13 28 9Q21 16 20 26Z" fill="#fff" fill-opacity=".7" stroke="none"/><circle cx="40" cy="36" r="3" fill="#fff" fill-opacity=".55" stroke="none"/>${spark(36, 24, 5)}`,
  // 御神签：朱红横梁 + 两条系起的签纸
  omikuji: `<rect x="5" y="10" width="54" height="10" rx="4" fill="${RED}"/>${hi('M9 12H32V15H9Z')}<g transform="rotate(-7 19 36)"><rect x="12" y="20" width="14" height="32" rx="3" fill="#fff"/><path d="M19 27V44" stroke="${RED}" stroke-width="3"/></g><rect x="25" y="20" width="14" height="38" rx="3" fill="currentColor"/>${hi('M28 24H32V46H28Z')}<g transform="rotate(7 45 34)"><rect x="38" y="20" width="14" height="28" rx="3" fill="#fff"/><path d="M45 26V40" stroke="${RED}" stroke-width="3"/></g>`,
  // 硬币骰子：金币 + 白骰子
  coin: `<circle cx="22" cy="22" r="15" fill="${GOLD}"/><circle cx="22" cy="22" r="10" fill="none" stroke="${GOLD_D}" stroke-width="1.6"/>${hi('M10 18Q12 10 20 8Q14 13 13 20Z')}<path d="M32 30L50 26L58 44L41 56L26 47Z" fill="#fff"/><path d="M32 30L44 40L50 26M44 40L41 56" stroke-width="1.8"/><g fill="${RED}" stroke="none"><circle cx="35" cy="42" r="2.2"/><circle cx="51" cy="40" r="2.2"/><circle cx="53" cy="47" r="2.2"/></g>`,
  // 落球盘：白板 + 金钉 + 红球 + 彩色底槽
  plinko: `<rect x="9" y="5" width="46" height="54" rx="8" fill="#fff"/><path d="M11 45H53V51Q53 57 47 57H17Q11 57 11 51Z" fill="currentColor" stroke-width="0"/><path d="M11 45H53M25 45V57M39 45V57" stroke-width="2"/><rect x="9" y="5" width="46" height="54" rx="8" fill="none"/><g fill="${GOLD}" stroke-width="1.4">${[[22, 22], [42, 22], [16, 33], [32, 33], [48, 33]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6"/>`).join('')}</g><circle cx="32" cy="14" r="5" fill="${RED}" stroke-width="1.8"/>`,
};
export function ritualArt(id) {
  return svg(art[id] || art.zodiac, { viewBox: '0 0 64 64', size: 64, stroke: '#2b2240', strokeWidth: 2.4, cls: 'ritual-art' });
}
export const RITUAL_ART_IDS = Object.keys(art);
