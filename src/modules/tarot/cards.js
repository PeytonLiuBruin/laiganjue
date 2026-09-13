// 塔罗 · 牌面渲染（依赖 kit 的 h / svg，通过参数注入，便于单独预览与移植）。
import { SUIT_GLYPHS, PIP_LAYOUT, COURT_CHAR } from './data.js';

/** 牌背中央图腾：双环 + 八角星 */
export const BACK_EMBLEM =
  '<circle cx="24" cy="24" r="21"/><circle cx="24" cy="24" r="16" stroke-dasharray="1.5 3"/>' +
  '<path d="M24 6L26.68 17.53L36.73 11.27L30.47 21.32L42 24L30.47 26.68L36.73 36.73L26.68 30.47L24 42L21.32 30.47L11.27 36.73L17.53 26.68L6 24L17.53 21.32L11.27 11.27L21.32 17.53Z"/>' +
  '<circle cx="24" cy="24" r="3.2" fill="currentColor" stroke="none"/>';

/** 空牌位里的淡饰纹：四角星 */
export const SLOT_ORNAMENT = '<path d="M24 8L27 21L40 24L27 27L24 40L21 27L8 24L21 21Z"/><circle cx="24" cy="24" r="2" fill="currentColor" stroke="none"/>';

export function createCardArt(kit) {
  const { h, svg } = kit;

  function backArt() {
    return h('div', { class: 'tr-back-art' }, h('div', { class: 'tr-back-frame' }), svg(BACK_EMBLEM, { viewBox: '0 0 48 48', size: 48, strokeWidth: 1.1, cls: 'tr-back-emblem' }));
  }

  function suitSvg(suit, cls = '') {
    return svg(SUIT_GLYPHS[suit], { viewBox: '0 0 24 24', size: 24, strokeWidth: 1.5, cls });
  }

  /** 牌面正面：大牌 = 罗马数字 + 符号 + 名；小牌 = 点数 + 花色符号排布 / 宫廷大字 + 名 */
  function frontArt(card) {
    const major = card.arcana === 'major';
    const top = h('div', { class: 'tr-f-top' }, major ? h('span', { class: 'tr-roman' }, card.roman) : h('span', { class: 'tr-rank' }, card.rankLabel));
    let mid;
    if (major) {
      mid = h('div', { class: 'tr-f-mid tr-f-major' }, h('div', { class: 'tr-glyph-ring' }, svg(card.glyph, { viewBox: '0 0 48 48', size: 48, strokeWidth: 1.6, cls: 'tr-glyph' })));
    } else if (card.court) {
      mid = h('div', { class: 'tr-f-mid tr-f-court' }, h('div', { class: 'tr-court-ring' }, suitSvg(card.suit, 'tr-court-suit')), h('div', { class: 'tr-court-char' }, COURT_CHAR[card.rank]));
    } else {
      const pips = h('div', { class: 'tr-pips' });
      for (const [x, y] of PIP_LAYOUT[card.rank]) {
        pips.append(h('span', { class: ['tr-pip', y > 0.5 && 'flip'], style: { left: x * 100 + '%', top: y * 100 + '%' } }, suitSvg(card.suit)));
      }
      mid = h('div', { class: ['tr-f-mid', card.rank === 1 && 'tr-ace'] }, pips);
    }
    const bot = h('div', { class: 'tr-f-bot' }, h('div', { class: 'tr-cn' }, card.name), h('div', { class: 'tr-en' }, card.en));
    return h('div', { class: ['tr-front-art', 'tr-suit-' + (card.suit || 'major')] }, top, mid, bot, h('span', { class: 'tr-sheen' }));
  }

  /** 一张可翻转的牌：外层定位 / 中层逆位旋转 / 内层翻面 */
  function makeCard(card) {
    const back = h('div', { class: 'tr-face tr-back' }, backArt());
    const front = h('div', { class: 'tr-face tr-front' }, frontArt(card));
    const inner = h('div', { class: 'tr-inner' }, back, front);
    const spin = h('div', { class: 'tr-spin' }, inner);
    const el = h('div', { class: 'tr-card', attrs: { role: 'button', 'aria-label': '塔罗牌，点击翻开' } }, spin);
    return { el, spin, inner, front, off: null };
  }

  function slotOrnament() {
    return svg(SLOT_ORNAMENT, { viewBox: '0 0 48 48', size: 48, strokeWidth: 1.2, cls: 'tr-slot-ornament' });
  }

  return { backArt, suitSvg, frontArt, makeCard, slotOrnament };
}
