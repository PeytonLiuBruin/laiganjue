// 皮肤商店：付费皮肤先试穿 10 秒，再出购买卡（monetization.md 第 4 节第 5 条）。
// 免费皮肤：宣纸（新卡通浅色）与玄墨（深色）。其余皮肤可单买，或随 Pro 全部解锁。
//
// createSkinPreview({ seconds, onTick, onEnd, setTimer, clearTimer }) → 纯计时逻辑，供测试
// openSkinOffer(platform, theme) → Promise<boolean>：关闭时是否已拥有这套皮肤
// startSkinTryOn({ platform, theme, apply, revert, openPaywall }) → 试穿条 + 到时出购买卡
import { h, button, sheet, toast } from './kit.js';
import { TERMS_URL, PRIVACY_URL } from './paywall.js';

export const FREE_THEMES = ['paper', 'ink'];
export const PREVIEW_SECONDS = 10;
export const skinKey = (id) => `skin_${id}`;
export const isFreeTheme = (id) => FREE_THEMES.includes(id);

/** 当前能否使用某套皮肤。 */
export function canUseTheme(purchases, id) {
  return isFreeTheme(id) || !!purchases?.ownsSkin?.(id);
}

/** 倒计时：每秒回调剩余秒数，到 0 时 onEnd('timeout')。stop() 停止且不回调。 */
export function createSkinPreview({ seconds = PREVIEW_SECONDS, onTick = () => {}, onEnd = () => {}, setTimer = setInterval, clearTimer = clearInterval } = {}) {
  let left = seconds, timer = null, done = false;
  const finish = (why) => {
    if (done) return;
    done = true;
    if (timer != null) clearTimer(timer);
    timer = null;
    if (why) onEnd(why);
  };
  onTick(left);
  timer = setTimer(() => {
    left -= 1;
    onTick(Math.max(0, left));
    if (left <= 0) finish('timeout');
  }, 1000);
  return {
    get left() { return left; },
    get done() { return done; },
    end: (why = 'user') => finish(why),
    stop: () => finish(null),
  };
}

/** 单套皮肤购买卡：单买这套，或开通 Pro 解锁全部。 */
export function openSkinOffer(platform, theme, { openPaywall } = {}) {
  const iap = platform.purchases;
  const key = skinKey(theme.id);
  let info = null, busy = false;
  const owned = () => !!iap?.ownsSkin?.(theme.id);

  const buyBtn = button('单买这套皮肤', { variant: 'primary', size: 'large', block: true, cls: 'skin-buy', onClick: buy });
  const proBtn = button('开通 Pro · 解锁全部皮肤', { variant: 'soft', block: true, cls: 'skin-pro', onClick: async () => {
    if (!openPaywall) return;
    await openPaywall(platform, { reason: '全部皮肤，外加无限深度解读' });
    if (owned()) { toast(`已解锁「${theme.name}」`); sh.close(); }
  } });
  const restoreBtn = h('button', { type: 'button', class: 'pw-link', onClick: restore }, '恢复购买');
  const webNote = iap?.available ? null : h('p', { class: 'pw-web' }, '网页版不提供购买。在 iPhone 上安装「来感觉」App 即可解锁皮肤。');
  const fine = h('p', { class: 'pw-fine' }, '一次性购买，确认后由你的 Apple ID 账户扣款，不会自动续费。换手机后点「恢复购买」即可找回。');

  const content = h('div', { class: 'skin-offer' },
    h('div', { class: 'skin-offer-hero' },
      h('span', { class: 'swatch-ball skin-offer-ball', style: { background: theme.swatch } }),
      h('div', null, h('div', { class: 'pw-title' }, `「${theme.name}」皮肤`), h('div', { class: 'pw-reason' }, theme.blurb || '整套界面与 3D 舞台一起换装'))),
    buyBtn, proBtn, fine, webNote,
    h('div', { class: 'pw-links' }, restoreBtn),
    h('div', { class: 'pw-legal' },
      h('a', { attrs: { href: TERMS_URL, target: '_blank', rel: 'noopener' } }, '使用条款（EULA）'),
      h('span', null, '·'),
      h('a', { attrs: { href: PRIVACY_URL, target: '_blank', rel: 'noopener' } }, '隐私政策')),
  );

  function render() {
    buyBtn.setLabel(info?.priceString ? `${info.priceString} 单买这套皮肤` : '单买这套皮肤');
    buyBtn.disabled = busy || !iap?.available || !info;
    proBtn.disabled = restoreBtn.disabled = busy;
  }
  async function buy() {
    if (busy || !iap?.available) return;
    busy = true; render();
    const r = await iap.purchase(key);
    busy = false; render();
    if (r.ok) { toast(`已解锁「${theme.name}」`); platform.haptic?.success?.(); sh.close(); }
    else if (!r.cancelled) toast('购买没有完成，请稍后再试');
  }
  async function restore() {
    if (busy) return;
    if (!iap?.available) { toast('请在 App 中恢复购买'); return; }
    busy = true; render();
    const r = await iap.restore();
    busy = false; render();
    if (owned()) { toast(`已恢复「${theme.name}」`); sh.close(); }
    else toast(r.ok ? '没有找到这套皮肤的购买记录' : '恢复失败，请检查网络后再试');
  }

  let done;
  const result = new Promise((r) => (done = r));
  const sh = sheet({ title: '解锁皮肤', content, onClose: () => done(owned()) });
  render();
  sh.open();
  sh.el.classList.add('paywall', 'skin-sheet');
  if (iap?.available) iap.loadProducts().then((p) => { info = p?.[key] || null; render(); });
  return result;
}

/**
 * 试穿：立刻换上皮肤，屏幕顶部出现「试穿中 · 10」条，到时或点「解锁」出购买卡。
 * 购买卡关闭时没买就换回原皮肤，买了就保留。返回 { end } 供外部提前结束（例如再次打开皮肤抽屉）。
 */
export function startSkinTryOn({ platform, theme, apply, revert, openPaywall, onDone = () => {}, seconds = PREVIEW_SECONDS, host = document.body }) {
  let offering = false, finished = false;
  const count = h('b', { class: 'skin-try-count' }, String(seconds));
  const unlock = h('button', { type: 'button', class: 'skin-try-unlock', onClick: () => preview.end('unlock') }, '解锁');
  const close = h('button', { type: 'button', class: 'skin-try-close', attrs: { 'aria-label': '结束试穿' }, onClick: () => preview.end('cancel') }, '×');
  const bar = h('div', { class: 'skin-try', attrs: { role: 'status' } },
    h('span', { class: 'swatch-ball skin-try-ball', style: { background: theme.swatch } }),
    h('span', { class: 'skin-try-text' }, `试穿「${theme.name}」`, count),
    unlock, close);
  apply(theme.id, { persist: false });
  host.append(bar);
  requestAnimationFrame(() => bar.classList.add('in'));

  const finish = (keep) => {
    if (finished) return;
    finished = true;
    bar.classList.remove('in');
    setTimeout(() => bar.remove(), 260);
    if (keep) apply(theme.id, { persist: true });
    else revert();
    onDone(keep);
  };
  const preview = createSkinPreview({
    seconds,
    onTick: (n) => { count.textContent = `${n} 秒`; },
    onEnd: async (why) => {
      if (why === 'cancel') { finish(false); return; }
      offering = true;
      count.textContent = '';
      const owned = await openSkinOffer(platform, theme, { openPaywall });
      offering = false;
      finish(owned);
    },
  });
  return {
    get offering() { return offering; },
    end() { if (!offering) { preview.stop(); finish(canUseTheme(platform.purchases, theme.id)); } },
  };
}
