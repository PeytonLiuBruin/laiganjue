// 内购与权益（来感觉 Pro）。原生端用 @capgo/native-purchases（StoreKit 2 / Google Play Billing），
// 只按名字 registerPlugin('NativePurchases') 取原生实现，不把插件的网页实现打进包里。
// 网页版不卖任何东西：available=false，purchase() 直接返回 { ok:false, reason:'web' }。
//
// 产品 ID 与 docs/claude-plan/monetization.md 第 3 节一致，真实价格在 App Store Connect 配置，
// 界面只显示 StoreKit 返回的本地化价格（priceString），代码里不写死价格。
//
// createPurchases({ plugin, storage, now, os }) →
//   available            是否能在本设备购买（原生 App）
//   pro / plan / until   当前是否 Pro、来自哪个产品、订阅到期时间（毫秒，买断为 null）
//   credits              单次购买的深度解读剩余次数
//   init()               监听交易更新并从商店刷新权益
//   refresh()            从商店读当前有效购买，重算权益
//   loadProducts()       → { [key]: { id, priceString, price, currencyCode, period, trialDays } }
//   purchase(key)        → { ok, cancelled?, reason? }
//   restore()            → { ok, pro, reason? }
//   manage()             打开系统的订阅管理页
//   useCredit()          消耗 1 次单次解读，成功返回 true
//   onChange(cb)         权益变化回调，返回取消函数
import { Capacitor, registerPlugin } from '@capacitor/core';

export const PRODUCTS = {
  yearly: { id: 'laiganjue.pro.yearly', type: 'subs', pro: true },
  monthly: { id: 'laiganjue.pro.monthly', type: 'subs', pro: true },
  lifetime: { id: 'laiganjue.pro.lifetime', type: 'inapp', pro: true },
  pack5: { id: 'laiganjue.reading.pack5', type: 'inapp', credits: 5 },
  // 单套皮肤（非消耗型），Pro 自动拥有全部皮肤
  skin_cinnabar: { id: 'laiganjue.skin.cinnabar', type: 'inapp', skin: 'cinnabar' },
  skin_nebula: { id: 'laiganjue.skin.nebula', type: 'inapp', skin: 'nebula' },
  skin_celadon: { id: 'laiganjue.skin.celadon', type: 'inapp', skin: 'celadon' },
};
export const PRO_IDS = Object.values(PRODUCTS).filter((p) => p.pro).map((p) => p.id);
const keyOf = (id) => Object.keys(PRODUCTS).find((k) => PRODUCTS[k].id === id) || null;

const ms = (v) => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Date.parse(v);
  return Number.isFinite(n) ? n : null;
};

/** 一笔交易此刻是否仍提供 Pro 权益。 */
export function grantsPro(tx, now = Date.now()) {
  if (!tx || !PRO_IDS.includes(tx.productIdentifier)) return false;
  if (tx.revocationDate) return false;
  if (tx.subscriptionState === 'revoked' || tx.subscriptionState === 'expired') return false;
  const p = PRODUCTS[keyOf(tx.productIdentifier)];
  if (p.type === 'inapp') return true;
  if (tx.subscriptionState === 'inGracePeriod' || tx.isInGracePeriod === true) return true;
  const exp = ms(tx.expirationDate);
  if (exp != null) return exp > now;
  return tx.isActive === true;
}

/** 交易列表 → { pro, plan, until }。买断优先，其次到期最晚的订阅。 */
export function entitlementFrom(transactions = [], now = Date.now()) {
  const active = transactions.filter((t) => grantsPro(t, now));
  if (!active.length) return { pro: false, plan: null, until: null };
  const life = active.find((t) => t.productIdentifier === PRODUCTS.lifetime.id);
  if (life) return { pro: true, plan: 'lifetime', until: null };
  const best = active.reduce((a, b) => ((ms(b.expirationDate) ?? 0) > (ms(a.expirationDate) ?? 0) ? b : a));
  const exp = ms(best.expirationDate);
  // 宽限期内到期时间已过，缓存里不写到期时间，等下次启动 refresh() 再判断
  return { pro: true, plan: keyOf(best.productIdentifier), until: exp != null && exp > now ? exp : null };
}

/** 交易列表 → 已买下的单套皮肤 id（退款的不算），按 PRODUCTS 顺序。 */
export function skinsFrom(transactions = []) {
  const owned = new Set(transactions.filter((t) => t && !t.revocationDate).map((t) => PRODUCTS[keyOf(t.productIdentifier)]?.skin).filter(Boolean));
  return Object.values(PRODUCTS).map((p) => p.skin).filter((id) => id && owned.has(id));
}

/** 订阅周期 → 中文。 */
export function periodLabel(period) {
  const unit = period?.unitString || ['day', 'week', 'month', 'year'][period?.unit] || null;
  const n = Number(period?.numberOfUnits) || 1;
  const name = { day: '天', week: '周', month: '个月', year: '年' }[unit];
  if (!name) return '';
  if (n === 1) return { day: '每天', week: '每周', month: '每月', year: '每年' }[unit];
  return `每 ${n} ${name}`;
}

/** 免费试用天数（只认免费的推介优惠）。 */
export function trialDays(product) {
  const intro = product?.introductoryPrice;
  if (!intro || Number(intro.price) > 0) return 0;
  const p = intro.subscriptionPeriod || {};
  const per = { day: 1, week: 7, month: 30, year: 365 }[p.unitString || ['day', 'week', 'month', 'year'][p.unit]] || 0;
  return per * (Number(p.numberOfUnits) || 1) * (Number(intro.numberOfPeriods) || 1);
}

const isCancel = (e) => /cancel|取消|userCancel|SKErrorPaymentCancelled|USER_CANCELED/i.test(String(e?.code || '') + ' ' + String(e?.message || e));

export function createPurchases({ plugin, storage, now = () => Date.now(), os } = {}) {
  if (plugin === undefined) {
    const native = Capacitor.isNativePlatform();
    plugin = native ? registerPlugin('NativePurchases') : null;
    os = os || Capacitor.getPlatform();
  }
  const available = !!plugin;
  const listeners = new Set();
  // 缓存上次的权益，冷启动、离线时先用它；订阅到期时间过了就自动失效
  let state = { pro: false, plan: null, until: null, skins: [], ...(storage?.get('iap.state', null) || {}) };
  if (!Array.isArray(state.skins)) state.skins = [];
  let credits = Math.max(0, Number(storage?.get('iap.credits', 0)) || 0);
  const granted = new Set(storage?.get('iap.granted', []) || []);
  let products = null;
  // 本次会话刚买到的交易：商店列表偶尔滞后（沙盒尤其明显），刷新时并入，避免刚买完又被判成未购买
  let justBought = null;
  const justSkins = [];

  const emit = () => { for (const cb of listeners) { try { cb(api); } catch (e) { console.error('[purchases]', e); } } };
  function save(next) {
    next = { ...next, skins: next.skins || state.skins || [] };
    const changed = next.pro !== state.pro || next.plan !== state.plan || next.until !== state.until || next.skins.join() !== (state.skins || []).join();
    state = next;
    storage?.set('iap.state', state);
    if (changed) emit();
  }
  function grantCredits(tx) {
    if (tx?.productIdentifier !== PRODUCTS.pack5.id) return false;
    const key = tx.transactionId || tx.orderId || tx.purchaseToken;
    if (key && granted.has(key)) return false;
    if (key) { granted.add(key); storage?.set('iap.granted', [...granted].slice(-50)); }
    credits += PRODUCTS.pack5.credits;
    storage?.set('iap.credits', credits);
    emit();
    return true;
  }

  async function refresh() {
    if (!available) return state;
    try {
      const { purchases = [] } = await plugin.getPurchases(os === 'ios' ? { onlyCurrentEntitlements: true } : {});
      const all = [...purchases, ...(justBought ? [justBought] : []), ...justSkins];
      save({ ...entitlementFrom(all, now()), skins: skinsFrom(all) });
    } catch (e) {
      console.warn('[purchases] refresh', e?.message || e);
    }
    return state;
  }

  async function loadProducts() {
    if (!available) return {};
    if (products) return products;
    const out = {};
    for (const type of ['subs', 'inapp']) {
      const ids = Object.values(PRODUCTS).filter((p) => p.type === type).map((p) => p.id);
      try {
        const { products: list = [] } = await plugin.getProducts({ productIdentifiers: ids, productType: type });
        for (const p of list) {
          const key = keyOf(p.identifier);
          if (!key) continue;
          out[key] = { id: p.identifier, priceString: p.priceString, price: p.price, currencyCode: p.currencyCode, period: PRODUCTS[key].type === 'subs' ? periodLabel(p.subscriptionPeriod) : '', trialDays: trialDays(p), offerToken: p.offerToken, planIdentifier: p.planIdentifier };
        }
      } catch (e) {
        console.warn('[purchases] products', type, e?.message || e);
      }
    }
    if (Object.keys(out).length) products = out;
    return out;
  }

  async function purchase(key) {
    const p = PRODUCTS[key];
    if (!p) return { ok: false, reason: 'unknown' };
    if (!available) return { ok: false, reason: 'web' };
    try {
      const info = products?.[key] || {};
      const tx = await plugin.purchaseProduct({
        productIdentifier: p.id,
        productType: p.type,
        quantity: 1,
        ...(os === 'android' && info.planIdentifier ? { planIdentifier: info.planIdentifier } : {}),
        ...(os === 'android' && info.offerToken ? { offerToken: info.offerToken } : {}),
        ...(p.credits ? { isConsumable: true } : {}),
      });
      if (p.credits) grantCredits(tx);
      else if (p.skin) {
        const owned = { ...tx, productIdentifier: p.id };
        justSkins.push(owned);
        save({ ...state, skins: skinsFrom([...justSkins, ...(state.skins || []).map((id) => ({ productIdentifier: `laiganjue.skin.${id}` }))]) });
      } else {
        // 购买成功即刻生效；交易字段不全时（例如安卓订阅不带到期时间）先按所买产品开通，再由 refresh() 校正
        justBought = grantsPro(tx, now()) ? tx : { ...tx, productIdentifier: p.id, isActive: true };
        save({ ...entitlementFrom([justBought], now()), skins: state.skins });
      }
      refresh();
      return { ok: true };
    } catch (e) {
      if (isCancel(e)) return { ok: false, cancelled: true };
      console.warn('[purchases] purchase', e?.message || e);
      return { ok: false, reason: String(e?.message || e) };
    }
  }

  async function restore() {
    if (!available) return { ok: false, pro: state.pro, reason: 'web' };
    try {
      await plugin.restorePurchases();
    } catch (e) {
      console.warn('[purchases] restore', e?.message || e);
      return { ok: false, pro: state.pro, reason: String(e?.message || e) };
    }
    await refresh();
    return { ok: true, pro: state.pro };
  }

  let inited = false;
  async function init() {
    if (!available || inited) return state;
    inited = true;
    try {
      await plugin.addListener('transactionUpdated', (tx) => {
        if (tx?.productIdentifier === PRODUCTS.pack5.id) grantCredits(tx);
        else refresh();
      });
    } catch (e) {
      console.warn('[purchases] listener', e?.message || e);
    }
    return refresh();
  }

  const api = {
    available,
    products: PRODUCTS,
    get pro() {
      if (state.pro && state.until != null && state.until <= now()) return false;
      return state.pro || (!available && storage?.get('dev.pro', false) === true);
    },
    get plan() { return this.pro ? state.plan : null; },
    get until() { return state.until; },
    get credits() { return credits; },
    get skins() { return [...(state.skins || [])]; },
    /** 是否能使用某套付费皮肤：Pro、单独买过，或网页开发预览（dev.skins）。 */
    ownsSkin(id) {
      return this.pro || (state.skins || []).includes(id) || (!available && storage?.get('dev.skins', false) === true);
    },
    useCredit() {
      if (credits <= 0) return false;
      credits -= 1;
      storage?.set('iap.credits', credits);
      emit();
      return true;
    },
    init,
    refresh,
    loadProducts,
    purchase,
    restore,
    manage: () => (available ? plugin.manageSubscriptions().catch(() => {}) : Promise.resolve()),
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  };
  return api;
}
