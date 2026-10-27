// 原生外壳（Capacitor：iOS / 安卓 App）。同一份网页代码既跑在浏览器里，也被打包进 App。
// 只有在 App 里 isNative 才为 true；在浏览器里这里的每个方法都静默无操作，网页行为不变。
//
// isNative / os ('ios' | 'android' | 'web')
// vibrate(ms | [on, off, on…]) → 与 navigator.vibrate 同形；iPhone 用 Taptic 轻/中/重击，安卓按时长震动
// share({ title, text }) → 'shared' | 'failed'（用户取消）| null（原生不可用，交回网页分享）
// keepAwake(bool)  屏幕常亮      immersive(bool)  隐藏/恢复状态栏与导航栏
// setBarStyle(背景色)  按皮肤深浅切换状态栏文字颜色
// onBack(cb) → 取消函数   安卓返回键（注册后不再走 WebView 默认的历史后退）
// minimize()  退到后台
// onUrlOpen(cb) → 取消函数   App 被 laiganjue:// 链接打开（含冷启动时的链接）
// notifier   本地通知（断签提醒），网页版为 null
// onNotificationTap(cb(route)) → 取消函数   轻点提醒通知
//
// 各插件只用 registerPlugin 按名字取原生实现，不把插件的网页实现打进包里。
import { Capacitor, registerPlugin, SystemBars } from '@capacitor/core';

const noop = () => {};
const quiet = (p) => {
  p?.catch?.(noop);
  return p;
};

/** '#f4ecdc' / 'rgb(244, 236, 220)' → 是否浅色背景（需要深色状态栏文字）。 */
export function isLightColor(color) {
  const s = String(color || '').trim();
  let rgb = null;
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const v = hex[1].length === 3 ? hex[1].replace(/./g, '$&$&') : hex[1];
    rgb = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16));
  } else {
    const m = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
    if (m) rgb = m.slice(1, 4).map(Number);
  }
  if (!rgb) return false;
  const [r, g, b] = rgb.map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4;
}

/** 震动时长 → iPhone 击打力度。 */
export const impactStyle = (ms) => (ms <= 20 ? 'LIGHT' : ms <= 45 ? 'MEDIUM' : 'HEAVY');

export function createNative(cap = Capacitor, register = registerPlugin, bars = SystemBars) {
  const isNative = cap.isNativePlatform();
  const os = cap.getPlatform();
  if (!isNative) {
    return { isNative: false, os, vibrate: null, notifier: null, onNotificationTap: () => noop, share: async () => null, shareImage: async () => null, keepAwake: noop, immersive: noop, setBarStyle: noop, onBack: () => noop, minimize: noop, onUrlOpen: () => noop };
  }

  const Haptics = register('Haptics');
  const Share = register('Share');
  const KeepAwake = register('KeepAwake');
  const App = register('App');

  // 与 navigator.vibrate 同形：数组里偶数位是"震"，奇数位是"停"。
  let timers = [];
  const pulse = (ms) => quiet(os === 'ios' ? Haptics.impact({ style: impactStyle(ms) }) : Haptics.vibrate({ duration: ms }));
  function vibrate(p) {
    for (const t of timers) clearTimeout(t);
    timers = [];
    const seq = Array.isArray(p) ? p : [p];
    let at = 0;
    seq.forEach((value, i) => {
      const ms = Math.max(0, Number(value) || 0);
      if (i % 2 === 0 && ms > 0) {
        if (at === 0) pulse(ms);
        else timers.push(setTimeout(() => pulse(ms), at));
      }
      at += ms;
    });
    return true;
  }

  async function share({ title, text }) {
    try {
      await Share.share({ title, text, dialogTitle: title });
      return 'shared';
    } catch (e) {
      return /cancel/i.test(String(e?.message || e)) ? 'failed' : null;
    }
  }

  // 分享图片：先把 PNG 写进缓存目录，再交给系统分享面板（保存到相册、微信、小红书都走这里）
  const Filesystem = register('Filesystem');
  async function shareImage({ title, dataUrl, name = 'laiganjue' }) {
    try {
      const data = String(dataUrl).replace(/^data:[^,]*,/, '');
      const { uri } = await Filesystem.writeFile({ path: `${name}-${Date.now()}.png`, data, directory: 'CACHE' });
      await Share.share({ title, files: [uri], dialogTitle: title });
      return 'shared';
    } catch (e) {
      return /cancel/i.test(String(e?.message || e)) ? 'failed' : null;
    }
  }

  // 断签提醒用的本地通知（src/platform/reminder.js），只在用户打开设置开关时才申请权限
  const LocalNotifications = register('LocalNotifications');
  const notifier = {
    async requestPermission() {
      const r = await LocalNotifications.requestPermissions();
      return r?.display === 'granted';
    },
    schedule: (list) => LocalNotifications.schedule({
      notifications: list.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: n.at, allowWhileIdle: true }, extra: { route: '#/m/qian' } })),
    }),
    cancel: (ids) => LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) }),
  };
  function onNotificationTap(cb) {
    const handle = quiet(LocalNotifications.addListener('localNotificationActionPerformed', (e) => cb(e?.notification?.extra?.route || '#/m/qian')));
    return () => quiet(handle?.then?.((h) => h.remove()));
  }

  let lastStyle = null;
  return {
    notifier,
    onNotificationTap,
    isNative: true,
    os,
    vibrate,
    share,
    shareImage,
    keepAwake: (on) => quiet(on ? KeepAwake.keepAwake() : KeepAwake.allowSleep()),
    immersive: (on) => quiet(on ? bars.hide() : bars.show()),
    setBarStyle(background) {
      const style = isLightColor(background) ? 'LIGHT' : 'DARK';
      if (style === lastStyle) return;
      lastStyle = style;
      quiet(bars.setStyle({ style }));
    },
    onBack(cb) {
      const handle = quiet(App.addListener('backButton', () => cb()));
      return () => quiet(handle?.then?.((h) => h.remove()));
    },
    minimize: () => quiet(App.minimizeApp()),
    onUrlOpen(cb) {
      // 冷启动时 getLaunchUrl 和 appUrlOpen 可能报同一个链接，2 秒内同一链接只处理一次，免得叠出两张付费卡
      let last = '', at = 0;
      const once = (url) => {
        if (!url) return;
        const t = Date.now();
        if (url === last && t - at < 2000) return;
        last = url; at = t;
        cb(url);
      };
      quiet(App.getLaunchUrl()?.then?.((r) => once(r?.url)));
      const handle = quiet(App.addListener('appUrlOpen', (e) => once(e?.url)));
      return () => quiet(handle?.then?.((h) => h.remove()));
    },
  };
}
