// 分享卡配图：没有器物画布的玩法（塔罗、黄历、星座生肖）自己画一张 1200×864 的图，
// 放进分享卡的器物区域。画风和 3D 器物一致：明快底色、白卡厚度边、深色描边、金星点缀。
// 用法：ctx.share(text, { image: () => tarotArt(draws) })，image 可以是画布或返回画布的 Promise。
export const ART_W = 1200, ART_H = 864;
const FONT = '"PingFang SC", "SF Pro Rounded", "Hiragino Sans GB", system-ui, sans-serif';
const INK = '#2b2240', GOLD = '#ffc93c', GOLD_DEEP = '#d8901e', RED = '#e8463c', GREEN = '#2fae6b';
const font = (size, weight = 800) => `${weight} ${size}px ${FONT}`;

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** 白卡 + 下方厚度边 + 深色描边（卡通器物同款） */
function tile(g, x, y, w, h, r, { fill = '#fff', edge = 'rgba(43,34,64,.9)', depth = 10, stroke = 4 } = {}) {
  g.fillStyle = edge; rr(g, x, y + depth, w, h, r); g.fill();
  g.fillStyle = fill; rr(g, x, y, w, h, r); g.fill();
  if (stroke) { g.lineWidth = stroke; g.strokeStyle = INK; rr(g, x, y, w, h, r); g.stroke(); }
}

function star(g, cx, cy, r, fill = GOLD) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rad = i & 1 ? r * .45 : r;
    g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  g.closePath(); g.fillStyle = fill; g.fill();
  g.lineWidth = Math.max(2, r * .16); g.strokeStyle = INK; g.lineJoin = 'round'; g.stroke();
}

function base(doc, top, bottom) {
  const c = doc.createElement('canvas');
  c.width = ART_W; c.height = ART_H;
  const g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, ART_H);
  bg.addColorStop(0, top); bg.addColorStop(1, bottom);
  g.fillStyle = bg; g.fillRect(0, 0, ART_W, ART_H);
  g.fillStyle = 'rgba(255,255,255,.18)';
  for (const [x, y, r] of [[120, 120, 90], [1090, 760, 120], [1040, 90, 50]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  return { c, g };
}

/* ------------------------------ 塔罗 ------------------------------ */
const ATLAS = { cols: 8, rows: 10, cw: 200, ch: 340 };
let atlasP = null;
function loadAtlas(src = 'tarot/rws-atlas.webp', ms = 2500) {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  if (!atlasP) {
    atlasP = new Promise((resolve) => {
      const img = new Image();
      const t = setTimeout(() => resolve(null), ms);
      img.onload = () => { clearTimeout(t); resolve(img); };
      img.onerror = () => { clearTimeout(t); atlasP = null; resolve(null); };
      img.src = src;
    });
  }
  return atlasP;
}

export function tarotIndex(card) {
  return card.arcana === 'major' ? card.no : ({ wands: 22, cups: 36, swords: 50, pentacles: 64 }[card.suit] + card.rank - 1);
}

/** n 张牌在 1200×864 里的位置：≤5 张一排，更多分两排。showLabel 时牌下留出名字条。 */
export function tarotLayout(n, { w = ART_W, h = ART_H } = {}) {
  const ratio = ATLAS.cw / ATLAS.ch;
  const rows = n <= 5 ? 1 : 2;
  const perRow = Math.ceil(n / rows);
  const showLabel = n <= 3;
  const gap = n <= 3 ? 44 : 26, padX = 60, padY = 56, label = showLabel ? 84 : 0, rowGap = 34;
  const byH = (h - padY * 2 - label * rows - rowGap * (rows - 1) - 10 * rows) / rows;
  const byW = (w - padX * 2 - gap * (perRow - 1)) / perRow / ratio;
  const ch = Math.floor(Math.min(byH, byW)), cw = Math.floor(ch * ratio);
  const blockH = rows * (ch + 10 + label) + rowGap * (rows - 1);
  let y0 = (h - blockH) / 2;
  const rects = [];
  for (let r = 0, i = 0; r < rows; r++) {
    const count = Math.min(perRow, n - i);
    const rowW = count * cw + (count - 1) * gap;
    let x = (w - rowW) / 2;
    for (let k = 0; k < count; k++, i++) { rects.push({ x: Math.round(x), y: Math.round(y0), w: cw, h: ch }); x += cw + gap; }
    y0 += ch + 10 + label + rowGap;
  }
  return { rects, showLabel };
}

/** draws: [{ card, reversed }] */
export async function tarotArt(draws, doc = document) {
  const atlas = await loadAtlas();
  const { c, g } = base(doc, '#8c7bff', '#c9e8ff');
  const { rects, showLabel } = tarotLayout(draws.length);
  // 背后几颗金星
  for (const [x, y, r] of [[90, 380, 22], [1110, 300, 26], [200, 790, 16], [1000, 820, 18], [300, 70, 14]]) star(g, x, y, r);
  draws.forEach((d, i) => {
    const { x, y, w, h } = rects[i];
    const r = Math.max(10, w * .08), inset = Math.max(6, w * .045);
    tile(g, x, y, w, h, r, { depth: Math.max(6, w * .045), stroke: Math.max(3, w * .02) });
    const ix = x + inset, iy = y + inset, iw = w - inset * 2, ih = h - inset * 2;
    g.save(); rr(g, ix, iy, iw, ih, r * .6); g.clip();
    if (d.reversed) { g.translate(ix + iw / 2, iy + ih / 2); g.rotate(Math.PI); g.translate(-(ix + iw / 2), -(iy + ih / 2)); }
    if (atlas) {
      const k = tarotIndex(d.card);
      g.drawImage(atlas, (k % ATLAS.cols) * ATLAS.cw, Math.floor(k / ATLAS.cols) * ATLAS.ch, ATLAS.cw, ATLAS.ch, ix, iy, iw, ih);
    } else {
      // 牌面图没加载到：金色牌面 + 名字首字
      const grad = g.createLinearGradient(0, iy, 0, iy + ih); grad.addColorStop(0, '#fff3c4'); grad.addColorStop(1, GOLD);
      g.fillStyle = grad; g.fillRect(ix, iy, iw, ih);
      g.fillStyle = INK; g.font = font(Math.round(iw * .5)); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText([...d.card.name][0], ix + iw / 2, iy + ih / 2); g.textAlign = 'left';
    }
    g.restore();
    if (d.reversed) {
      // 右上角「逆」小圆章
      const br = Math.max(16, w * .12), bx = x + w - br * .7, by = y + br * .7;
      g.fillStyle = RED; g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill();
      g.lineWidth = 3; g.strokeStyle = INK; g.stroke();
      g.fillStyle = '#fff'; g.font = font(Math.round(br * 1.1)); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('逆', bx, by + 1); g.textAlign = 'left';
    }
    if (showLabel) {
      const name = d.card.name;
      g.font = font(36);
      const tw = Math.min(w + 40, g.measureText(name).width + 48), lx = x + w / 2 - tw / 2, ly = y + h + 24;
      tile(g, lx, ly, tw, 56, 28, { fill: GOLD, depth: 6, stroke: 3 });
      g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(name, x + w / 2, ly + 29, tw - 24); g.textAlign = 'left';
    }
  });
  return c;
}

/* ------------------------------ 黄历 ------------------------------ */
/** 一行行排小标签，超出 maxRows 的丢掉。返回 [{ text, x, y, w }]（相对坐标）。 */
export function flowChips(words, maxW, measure, { pad = 24, gap = 14, rowH = 64, rowGap = 14, maxRows = 2 } = {}) {
  const out = [];
  let x = 0, row = 0;
  for (const text of words) {
    const w = Math.round(measure(text) + pad * 2);
    if (w > maxW) continue;
    if (x > 0 && x + w > maxW) { row++; x = 0; }
    if (row >= maxRows) break;
    out.push({ text, x, y: row * (rowH + rowGap), w });
    x += w + gap;
  }
  return out;
}

function panel(g, x, y, w, h, title, color, tint, words) {
  tile(g, x, y, w, h, 36, { fill: tint, depth: 10, stroke: 4 });
  // 标题圆章
  const cx = x + 64, cy = y + 66;
  g.fillStyle = color; g.beginPath(); g.arc(cx, cy, 40, 0, Math.PI * 2); g.fill();
  g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
  g.fillStyle = '#fff'; g.font = font(46); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(title, cx, cy + 2); g.textAlign = 'left';
  g.font = font(40, 700);
  const list = words.length ? words : ['无'];
  const chips = flowChips(list, w - 140 - 28, (s) => g.measureText(s).width, { maxRows: Math.max(1, Math.floor((h - 52) / 78)) });
  for (const ch of chips) {
    const px = x + 130 + ch.x, py = y + 34 + ch.y;
    g.fillStyle = '#fff'; rr(g, px, py, ch.w, 64, 32); g.fill();
    g.lineWidth = 3; g.strokeStyle = color; g.stroke();
    g.fillStyle = INK; g.textBaseline = 'middle'; g.fillText(ch.text, px + 24, py + 34);
  }
}

export function almanacArt(day, doc = document) {
  const { c, g } = base(doc, '#ffcf5c', '#fff3cf');
  // 左：撕页日历
  const x = 64, y = 84, w = 420, h = 660;
  tile(g, x, y, w, h, 44, { depth: 14, stroke: 5 });
  g.save(); rr(g, x, y, w, 150, 44); g.clip();
  g.fillStyle = RED; g.fillRect(x, y, w, 150);
  g.restore();
  g.lineWidth = 5; g.strokeStyle = INK; g.beginPath(); g.moveTo(x, y + 150); g.lineTo(x + w, y + 150); g.stroke();
  for (const rx of [x + 110, x + w - 110]) { // 两个装订环
    g.fillStyle = '#fff'; g.beginPath(); g.arc(rx, y + 4, 20, 0, Math.PI * 2); g.fill(); g.lineWidth = 4; g.stroke();
  }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#fff'; g.font = font(58); g.fillText(`${day.solar.month}月`, x + w / 2, y + 82);
  g.fillStyle = INK; g.font = font(250, 900); g.fillText(String(day.solar.day), x + w / 2, y + 330);
  g.font = font(48); g.fillStyle = RED; g.fillText(day.solar.weekText, x + w / 2, y + 500);
  g.font = font(44, 700); g.fillStyle = '#6b6585'; g.fillText(`农历${day.lunar.text}`, x + w / 2, y + 580, w - 40);
  g.textAlign = 'left';
  // 右：宜 / 忌
  panel(g, 540, 84, 596, 300, '宜', GREEN, '#e7f8ee', day.yi);
  panel(g, 540, 444, 596, 300, '忌', RED, '#ffe9e6', day.ji);
  star(g, 1120, 60, 22); star(g, 64, 810, 18);
  return c;
}

/* ------------------------------ 星座 / 生肖 ------------------------------ */
/** f：signFortune / animalFortune 的结果 */
export function zodiacArt(f, doc = document) {
  const isSign = f.kind === 'sign';
  const { c, g } = isSign ? base(doc, '#6a5cf0', '#a9dcff') : base(doc, '#ff9c55', '#ffe6ad');
  for (const [x, y, r] of [[150, 160, 26], [1060, 200, 30], [190, 690, 18], [1030, 640, 22], [930, 90, 14]]) star(g, x, y, r);
  const cx = ART_W / 2, cy = 330, R = 230;
  // 金币：厚度 + 外圈 + 内圈虚线
  g.fillStyle = GOLD_DEEP; g.beginPath(); g.arc(cx, cy + 16, R, 0, Math.PI * 2); g.fill();
  g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
  const coin = g.createRadialGradient(cx - 70, cy - 90, 20, cx, cy, R);
  coin.addColorStop(0, '#fff2b8'); coin.addColorStop(.55, GOLD); coin.addColorStop(1, '#f2a92c');
  g.fillStyle = coin; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill(); g.stroke();
  g.setLineDash([14, 14]); g.lineWidth = 4; g.strokeStyle = 'rgba(43,34,64,.35)';
  g.beginPath(); g.arc(cx, cy, R - 34, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  g.fillStyle = INK; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (isSign) { g.font = font(230, 700); g.fillText(f.sign.glyph, cx, cy + 8); }
  else { g.font = font(220, 900); g.fillText(f.animal.name, cx, cy + 10); }
  // 名字条
  const name = isSign ? f.sign.name : `属${f.animal.name}`;
  g.font = font(54);
  const tw = g.measureText(name).width + 80;
  tile(g, cx - tw / 2, 600, tw, 86, 43, { fill: '#fff', depth: 8, stroke: 4 });
  g.fillStyle = INK; g.fillText(name, cx, 645);
  // 综合星级
  const n = Math.max(0, Math.min(5, f.overall | 0));
  for (let i = 0; i < 5; i++) star(g, cx + (i - 2) * 78, 768, 32, i < n ? GOLD : 'rgba(255,255,255,.7)');
  g.textAlign = 'left';
  return c;
}
