// 结果分享卡：把当前器物画面 + 签文排成一张竖版图片（1080 宽），先在抽屉里预览，再交给系统分享。
// 免费版在器物画面上铺一层淡淡的「来感觉」水印，Pro 无水印。卡片始终用明快的浅色配色，和皮肤无关。
//
// openShareCard(platform, text, { title }) → Promise<'shared'|'copied'|'failed'>，与 ctx.share 同形，
// 所以 17 个玩法原有的「分享」按钮不用改。
import { h, button, sheet, toast } from './kit.js';
import { openPaywall } from './paywall.js';

export const CARD_W = 1080;
const PAD = 72;
const FONT = '"PingFang SC", "SF Pro Rounded", "Hiragino Sans GB", system-ui, sans-serif';
const C = { ink: '#2b2240', soft: '#6b6585', red: '#e8463c', redDeep: '#b8302a', gold: '#ffc93c', cream: '#fffaf0', sky: '#eaf6ff', edge: 'rgba(43,34,64,.12)' };
const SIGN_RE = /^\s*——/;
// 行首不放的标点（避头）
const NO_START = new Set('，。、；：？！）」』》〉】,.;:?!)%·…'.split(''));

/** 把分享文字拆成标题、副标题、正文行。第一行「【标题】副标题」，末行「—— 来感觉 …」签名去掉。 */
export function parseShare(text) {
  const rows = String(text || '').split('\n').map((s) => s.trim()).filter(Boolean).filter((s) => !SIGN_RE.test(s));
  if (!rows.length) return { heading: '来感觉', sub: '', lines: [] };
  const m = rows[0].match(/^【(.+?)】\s*(.*)$/);
  if (m) return { heading: m[1], sub: m[2], lines: rows.slice(1) };
  return { heading: rows[0], sub: '', lines: rows.slice(1) };
}

/** 按宽度折行。measure(s) 返回像素宽。中文逐字折，连续的英文单词与数字尽量不拆，行首不放标点。 */
export function wrapText(text, maxWidth, measure) {
  const tokens = String(text).match(/[A-Za-z0-9'’.\-]+\s*|\s+|./gu) || [];
  const out = [];
  let line = '';
  for (const tok of tokens) {
    const next = line + tok;
    if (!line || measure(next.trimEnd()) <= maxWidth) { line = next; continue; }
    // 标点悬挂：允许一个标点伸出行尾（卡片两侧还有 48 像素内边距）
    if (NO_START.has(tok[0]) && tok.length === 1 && measure(line.trimEnd()) <= maxWidth) { line = next; continue; }
    out.push(line.trimEnd());
    line = tok.trimStart();
  }
  if (line.trim()) out.push(line.trimEnd());
  return out;
}

/** 正文行数上限：超出的最后一行以「…」收尾。 */
export function clampLines(lines, max, measure, maxWidth) {
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  let last = kept[max - 1];
  while (last && measure(last + '…') > maxWidth) last = [...last].slice(0, -1).join('');
  kept[max - 1] = last + '…';
  return kept;
}

/** 当前页面上最大的那块可见器物画面（WebGL 舞台或 2D 画布），抽屉里的不算。 */
export function captureStage(root = document) {
  let best = null, area = 0;
  for (const c of root.querySelectorAll('canvas')) {
    if (c.closest('.sheet, [hidden]') || !c.isConnected) continue;
    const r = c.getBoundingClientRect();
    const a = r.width * r.height;
    if (r.width < 120 || r.height < 120 || a <= area) continue;
    best = c; area = a;
  }
  if (!best) return null;
  const host = best.parentElement;
  try {
    if (host?.__stage) return host.__stage.snapshot();
    if (!best.getContext('2d')) return null; // 别的 WebGL 画布读不到像素，不用
    // 2D 画布器物背景透明、构图按页面排的，整张放进卡片（不裁切）
    const copy = document.createElement('canvas');
    copy.width = best.width; copy.height = best.height; copy.dataset.fit = 'contain';
    copy.getContext('2d').drawImage(best, 0, 0);
    return copy;
  } catch { return null; }
}

function roundRect(g, x, y, w, hh, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + hh, r); g.arcTo(x + w, y + hh, x, y + hh, r);
  g.arcTo(x, y + hh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

const font = (size, weight = 700) => `${weight} ${size}px ${FONT}`;

/** 画分享卡，返回 1080 宽的画布（高度随文字变化，至少 1350，文字行数有上限所以不超过约 2100）。 */
export function drawShareCard({ heading, sub = '', lines = [], image = null, watermark = true, date = new Date() }, doc = document) {
  const canvas = doc.createElement('canvas');
  const g = canvas.getContext('2d');
  const cardX = 48, cardW = CARD_W - 96, inner = cardW - 96;
  const imgW = inner, imgH = Math.round(inner * .72);
  // 先量好文字，再定高度
  const measureWith = (f) => (s) => { g.font = f; return g.measureText(s).width; };
  const mHead = measureWith(font(64, 800)), mSub = measureWith(font(40, 700)), mBody = measureWith(font(38, 500));
  const headLines = clampLines(wrapText(heading, inner, mHead), 2, mHead, inner);
  const subLines = sub ? clampLines(wrapText(sub, inner, mSub), 2, mSub, inner) : [];
  const bodyLines = clampLines(lines.flatMap((l) => wrapText(l, inner, mBody)), 9, mBody, inner);
  const textH = headLines.length * 84 + (subLines.length ? 18 + subLines.length * 58 : 0) + (bodyLines.length ? 56 + bodyLines.length * 60 : 0);
  const cardY = 196, cardH = 48 + imgH + 52 + textH + 56;
  const H = Math.max(1350, cardY + cardH + 10 + 190);
  canvas.width = CARD_W; canvas.height = H;

  // 背景：奶油白到浅天蓝，加几颗淡金星点
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, C.cream); bg.addColorStop(1, '#dff1ff');
  g.fillStyle = bg; g.fillRect(0, 0, CARD_W, H);
  g.fillStyle = 'rgba(255,201,60,.35)';
  for (const [x, y, r] of [[930, 90, 14], [990, 150, 8], [110, H - 120, 10], [70, H - 70, 6], [1010, H - 150, 9]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }

  // 顶部品牌行
  g.font = font(44, 800);
  const brand = '来感觉', bw = g.measureText(brand).width + 64;
  g.fillStyle = C.redDeep; roundRect(g, PAD, 64 + 6, bw, 84, 28); g.fill();
  const btn = g.createLinearGradient(0, 64, 0, 148); btn.addColorStop(0, '#ff6a4d'); btn.addColorStop(1, C.red);
  g.fillStyle = btn; roundRect(g, PAD, 64, bw, 84, 28); g.fill();
  g.fillStyle = '#fff'; g.textBaseline = 'middle'; g.fillText(brand, PAD + 32, 107);
  g.font = font(32, 600); g.fillStyle = C.soft; g.textAlign = 'right';
  g.fillText(`${date.getFullYear()}.${date.getMonth() + 1}.${date.getDate()}`, CARD_W - PAD, 107);
  g.textAlign = 'left';

  // 白卡 + 厚度边
  g.fillStyle = C.edge; roundRect(g, cardX, cardY + 10, cardW, cardH, 48); g.fill();
  g.fillStyle = '#fff'; roundRect(g, cardX, cardY, cardW, cardH, 48); g.fill();

  // 器物画面（居中裁成 imgW×imgH）
  const ix = cardX + 48, iy = cardY + 48;
  g.save(); roundRect(g, ix, iy, imgW, imgH, 32); g.clip();
  // 先铺晴天底色：2D 画布器物（签筒、筊杯等）背景是透明的
  const sky = g.createLinearGradient(0, iy, 0, iy + imgH); sky.addColorStop(0, '#5ab8ff'); sky.addColorStop(1, '#b4e3ff');
  g.fillStyle = sky; g.fillRect(ix, iy, imgW, imgH);
  if (image && image.width > 1) {
    const contain = image.dataset?.fit === 'contain';
    const s = contain ? Math.min(imgW / image.width, imgH / image.height) * .92 : Math.max(imgW / image.width, imgH / image.height);
    const w = image.width * s, hh = image.height * s;
    g.drawImage(image, ix + (imgW - w) / 2, iy + (imgH - hh) / 2, w, hh);
  } else {
    const cx = ix + imgW / 2, cy = iy + imgH / 2;
    g.fillStyle = '#d8901e'; g.beginPath(); g.arc(cx, cy + 10, 170, 0, Math.PI * 2); g.fill();
    g.fillStyle = C.gold; g.beginPath(); g.arc(cx, cy, 170, 0, Math.PI * 2); g.fill();
    g.fillStyle = C.ink; g.font = font(150, 800); g.textAlign = 'center';
    g.fillText([...heading][0] || '签', cx, cy + 4); g.textAlign = 'left';
  }
  if (watermark) {
    g.translate(ix + imgW / 2, iy + imgH / 2); g.rotate(-Math.PI / 9);
    g.font = font(40, 800); g.fillStyle = 'rgba(255,255,255,.2)'; g.textAlign = 'center';
    for (let row = -6; row <= 6; row++) for (let x = -imgW; x <= imgW; x += 260) g.fillText('来感觉', x + (row & 1 ? 130 : 0), row * 130);
    g.textAlign = 'left';
  }
  g.restore();
  g.strokeStyle = 'rgba(43,34,64,.08)'; g.lineWidth = 3; roundRect(g, ix, iy, imgW, imgH, 32); g.stroke();

  // 文字
  let y = iy + imgH + 52;
  g.textBaseline = 'top';
  g.font = font(64, 800); g.fillStyle = C.ink;
  for (const l of headLines) { g.fillText(l, ix, y); y += 84; }
  if (subLines.length) { y += 18; g.font = font(40, 700); g.fillStyle = C.red; for (const l of subLines) { g.fillText(l, ix, y); y += 58; } }
  if (bodyLines.length) {
    y += 22; g.strokeStyle = 'rgba(43,34,64,.14)'; g.lineWidth = 3; g.setLineDash([12, 12]);
    g.beginPath(); g.moveTo(ix, y); g.lineTo(ix + inner, y); g.stroke(); g.setLineDash([]); y += 34;
    g.font = font(38, 500); g.fillStyle = C.soft;
    for (const l of bodyLines) { g.fillText(l, ix, y); y += 60; }
  }

  // 底部：一句话 + 去哪下载
  const fy = cardY + cardH + 10 + 64;
  g.textAlign = 'center'; g.fillStyle = C.ink; g.font = font(40, 800);
  g.fillText('摇一摇，来点感觉', CARD_W / 2, fy);
  g.fillStyle = C.soft; g.font = font(30, 500);
  g.fillText('App Store 搜索「来感觉」 · 仅供娱乐', CARD_W / 2, fy + 60);
  g.textAlign = 'left';
  return canvas;
}

const RESULT_TEXT = { shared: '已分享', copied: '已复制', saved: '图片已保存', failed: '分享已取消' };

/** 预览抽屉：分享图片 / 只分享文字。免费版有「开通 Pro 去水印」。 */
export function openShareCard(platform, text, { title = '分享' } = {}) {
  const parsed = parseShare(text);
  const image = captureStage();
  const isPro = () => !!platform.purchases?.pro;
  let url = '';
  const img = h('img', { class: 'share-card-img', attrs: { alt: `分享卡：${parsed.heading}` } });
  const render = () => {
    try { url = drawShareCard({ ...parsed, image, watermark: !isPro() }).toDataURL('image/png'); img.src = url; }
    catch (e) { console.warn('[share] 分享卡生成失败', e); url = ''; }
  };
  render();
  return new Promise((resolve) => {
    let done = false;
    const finish = (r) => { if (done) return; done = true; resolve(r); };
    const proLink = isPro() ? null : h('button', { type: 'button', class: 'pw-link share-card-pro', onClick: async () => { await openPaywall(platform, { reason: '无水印分享卡' }); if (isPro()) { render(); proLink.remove(); } } }, '开通 Pro 去掉水印');
    const content = h('div', { class: 'share-card' }, img, proLink);
    const textBtn = button('只分享文字', { variant: 'ghost', onClick: async () => { const r = await platform.share(text); s.close(); finish(r === 'saved' ? 'shared' : r); } });
    const imgBtn = button('分享图片', { variant: 'primary', icon: 'share', onClick: async () => {
      if (!url) { const r = await platform.share(text); s.close(); return finish(r); }
      const r = await platform.shareImage(url, { title: parsed.heading });
      if (r === 'failed') return; // 系统面板里取消：留在预览，可以再选
      if (r === 'saved') toast(RESULT_TEXT.saved);
      s.close(); finish(r === 'saved' ? 'shared' : r);
    } });
    const s = sheet({ title, content, actions: [textBtn, imgBtn], onClose: () => finish('failed') });
    s.open();
  });
}
