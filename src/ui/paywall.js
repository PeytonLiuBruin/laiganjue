// 来感觉 Pro 付费卡：半屏抽屉，可一键关闭，不做全屏拦截。
// 权益列表只写已经实现的 Pro 功能（指南 2.3.1），与设置页、商店描述保持一致。
// 合规要点（App Store 指南 3.1.1 / 3.1.2）：价格与周期来自 StoreKit 的本地化字符串，写明自动续期、
// 试用结束后扣费与取消方式，链接使用条款与隐私政策，提供恢复购买。网页版只展示权益，不出售。
//
// openPaywall(platform, { reason }) → Promise<boolean>：关闭时是否已获得 Pro 或单次解读次数
import { h, button, sheet, toast } from './kit.js';

export const TERMS_URL = 'https://peytonliubruin.github.io/laiganjue/terms.html';
export const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
export const PRIVACY_URL = 'https://peytonliubruin.github.io/laiganjue/privacy.html';

const BENEFITS = [
  ['解', '无限次深度解读', '签诗逐句解、牌阵完整解读、合婚六项展开'],
  ['妆', '全部付费皮肤', '朱砂、星穹、青瓷，界面与 3D 舞台一起换装'],
  ['印', '无水印高清分享卡', '结果卡片干干净净发给朋友'],
];
const PLANS = [
  { key: 'yearly', name: '年度', badge: '最划算' },
  { key: 'monthly', name: '月度' },
  { key: 'lifetime', name: '永久', note: '一次买断' },
];

/** 订阅说明（按所选方案生成，供界面与测试共用）。 */
export function fineprint(plan, info = {}) {
  if (plan === 'lifetime' || plan === 'pack5') return '一次性购买，确认后由你的 Apple ID 账户扣款，不会自动续费。';
  const price = info.priceString || '所示价格';
  const per = info.period || '';
  const trial = info.trialDays ? `免费试用 ${info.trialDays} 天，试用结束后按 ${price}${per ? ' / ' + per.replace(/^每/, '') : ''} 自动扣费。` : '';
  return `${trial}订阅按${per || '所选周期'}自动续期，确认后由你的 Apple ID 账户扣款。如不想续费，请在当前周期结束前至少 24 小时在「设置 → Apple 账户 → 订阅」中取消。`;
}

export function ctaLabel(plan, info = {}) {
  if (plan === 'lifetime') return info.priceString ? `${info.priceString} 永久解锁` : '永久解锁';
  if (plan === 'pack5') return info.priceString ? `${info.priceString} 购买 5 次解读` : '购买 5 次解读';
  if (info.trialDays) return `免费试用 ${info.trialDays} 天`;
  return '开通 Pro';
}

export function openPaywall(platform, { reason = '' } = {}) {
  const iap = platform.purchases;
  const before = () => !!iap?.pro || (iap?.credits || 0) > 0;
  let selected = 'yearly', info = {}, busy = false;

  const planEls = new Map();
  const planList = h('div', { class: 'pw-plans', attrs: { role: 'radiogroup', 'aria-label': '选择方案' } });
  for (const p of PLANS) {
    const price = h('span', { class: 'pw-price' }, iap?.available ? '…' : '—');
    const sub = h('span', { class: 'pw-sub' }, p.note || '');
    const el = h('button', { type: 'button', class: 'pw-plan', attrs: { role: 'radio', 'aria-checked': 'false' }, dataset: { plan: p.key }, onClick: () => pick(p.key) },
      h('span', { class: 'pw-plan-name' }, p.name, p.badge ? h('em', null, p.badge) : null),
      price, sub);
    planEls.set(p.key, { el, price, sub, plan: p });
    planList.append(el);
  }
  const fine = h('p', { class: 'pw-fine' });
  const cta = button('开通 Pro', { variant: 'primary', size: 'large', block: true, cls: 'pw-cta', onClick: () => buy(selected) });
  const packBtn = h('button', { type: 'button', class: 'pw-link', onClick: () => buy('pack5') }, '不想订阅？单买 5 次深度解读');
  const restoreBtn = h('button', { type: 'button', class: 'pw-link', onClick: restore }, '恢复购买');
  const webNote = iap?.available ? null : h('p', { class: 'pw-web' }, '网页版不提供购买。在 iPhone 上安装「来感觉」App 即可解锁 Pro。');

  const content = h('div', { class: 'pw' },
    h('div', { class: 'pw-hero' }, h('div', { class: 'pw-mark' }, '感'), h('div', null, h('div', { class: 'pw-title' }, '来感觉 Pro'), h('div', { class: 'pw-reason' }, reason || '看得更深，玩得更好看'))),
    h('ul', { class: 'pw-benefits' }, BENEFITS.map(([g, t, d]) => h('li', null, h('span', { class: 'pw-glyph' }, g), h('div', null, h('b', null, t), h('span', null, d))))),
    planList, cta, fine, webNote,
    h('div', { class: 'pw-links' }, packBtn, restoreBtn),
    h('div', { class: 'pw-legal' },
      h('a', { attrs: { href: TERMS_URL, target: '_blank', rel: 'noopener' } }, '使用条款（EULA）'),
      h('span', null, '·'),
      h('a', { attrs: { href: PRIVACY_URL, target: '_blank', rel: 'noopener' } }, '隐私政策')),
  );

  function pick(key) {
    selected = key;
    for (const [k, v] of planEls) { v.el.classList.toggle('on', k === key); v.el.setAttribute('aria-checked', String(k === key)); }
    render();
  }
  function render() {
    for (const [k, v] of planEls) {
      const p = info[k];
      if (p) {
        v.price.textContent = p.priceString + (p.period ? ` / ${p.period.replace(/^每/, '')}` : '');
        if (k !== 'lifetime') v.sub.textContent = p.trialDays ? `前 ${p.trialDays} 天免费` : '';
      } else if (iap?.available) v.price.textContent = '暂不可用';
    }
    cta.setLabel(ctaLabel(selected, info[selected]));
    cta.disabled = busy || !iap?.available || !info[selected];
    packBtn.hidden = !iap?.available || !info.pack5;
    packBtn.disabled = restoreBtn.disabled = busy;
    fine.textContent = fineprint(selected, info[selected]);
  }
  async function buy(key) {
    if (busy || !iap?.available) return;
    busy = true; render();
    const r = await iap.purchase(key);
    busy = false; render();
    if (r.ok) { toast(key === 'pack5' ? '已到账 5 次深度解读' : '欢迎加入来感觉 Pro'); platform.haptic?.success?.(); sh.close(); }
    else if (!r.cancelled) toast('购买没有完成，请稍后再试');
  }
  async function restore() {
    if (busy) return;
    if (!iap?.available) { toast('请在 App 中恢复购买'); return; }
    busy = true; render();
    const r = await iap.restore();
    busy = false; render();
    if (r.ok && r.pro) { toast('已恢复来感觉 Pro'); sh.close(); }
    else toast(r.ok ? '没有找到可恢复的购买' : '恢复失败，请检查网络后再试');
  }

  let done;
  const result = new Promise((r) => (done = r));
  const sh = sheet({ title: '解锁更多', content, onClose: () => done(before()) });
  pick('yearly');
  sh.open();
  sh.el.classList.add('paywall');
  if (iap?.available) iap.loadProducts().then((p) => { info = p || {}; render(); });
  return result;
}
