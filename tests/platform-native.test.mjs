import test from 'node:test';
import assert from 'node:assert/strict';
import { createNative, isLightColor, impactStyle } from '../src/platform/native.js';

function rig(os = 'ios', { shareError = null } = {}) {
  const calls = [];
  const plugin = (name) => new Proxy({}, {
    get: (_, method) => (opts) => {
      calls.push([name, method, opts]);
      if (name === 'Share' && shareError) return Promise.reject(new Error(shareError));
      if (method === 'addListener') return Promise.resolve({ remove: () => calls.push([name, 'remove']) });
      return Promise.resolve();
    },
  });
  const cap = { isNativePlatform: () => os !== 'web', getPlatform: () => os };
  const native = createNative(cap, plugin, plugin('SystemBars'));
  return { native, calls };
}

test('web: every native hook is a silent no-op', async () => {
  const { native, calls } = rig('web');
  assert.equal(native.isNative, false);
  assert.equal(native.vibrate, null);
  assert.equal(await native.share({ title: 't', text: 'x' }), null);
  native.keepAwake(true); native.immersive(true); native.setBarStyle('#fff'); native.minimize();
  native.onBack(() => {})();
  assert.deepEqual(calls, []);
});

test('light/dark backgrounds pick readable system bar text', () => {
  assert.equal(isLightColor('#f4ecdc'), true); // 宣纸
  assert.equal(isLightColor('#e6efe8'), true); // 青瓷
  assert.equal(isLightColor('#0b0b10'), false); // 玄墨
  assert.equal(isLightColor('rgb(26, 10, 10)'), false);
  assert.equal(isLightColor('#fff'), true);
  assert.equal(isLightColor('nonsense'), false);
});

test('vibration lengths map to iPhone impact strength', () => {
  assert.equal(impactStyle(16), 'LIGHT');
  assert.equal(impactStyle(42), 'MEDIUM');
  assert.equal(impactStyle(65), 'HEAVY');
});

test('iOS: patterns become timed Taptic impacts on the "on" segments', async () => {
  const { native, calls } = rig('ios');
  assert.equal(native.vibrate([18, 40, 50]), true);
  assert.deepEqual(calls, [['Haptics', 'impact', { style: 'LIGHT' }]]);
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(calls.at(-1), ['Haptics', 'impact', { style: 'HEAVY' }]);
  assert.equal(calls.length, 2);
});

test('Android: keeps the tuned durations; a new pattern cancels the pending tail', async () => {
  const { native, calls } = rig('android');
  native.vibrate([24, 70, 24]);
  native.vibrate(0);
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(calls, [['Haptics', 'vibrate', { duration: 24 }]]);
});

test('share: success, user cancel and plugin failure', async () => {
  assert.equal(await rig('ios').native.share({ title: 't', text: 'x' }), 'shared');
  assert.equal(await rig('ios', { shareError: 'Share canceled' }).native.share({ title: 't', text: 'x' }), 'failed');
  // 原生分享不可用 → null，交回网页的复制兜底
  assert.equal(await rig('android', { shareError: 'boom' }).native.share({ title: 't', text: 'x' }), null);
});

test('status bar style follows the theme and skips repeats', () => {
  const { native, calls } = rig('android');
  native.setBarStyle('#f4ecdc');
  native.setBarStyle('#e6efe8');
  native.setBarStyle('#0b0b10');
  assert.deepEqual(calls, [['SystemBars', 'setStyle', { style: 'LIGHT' }], ['SystemBars', 'setStyle', { style: 'DARK' }]]);
});

test('back button listener can be removed; screensaver hooks reach the plugins', async () => {
  const { native, calls } = rig('android');
  const off = native.onBack(() => {});
  off();
  await new Promise((r) => setTimeout(r, 0));
  native.keepAwake(true); native.keepAwake(false); native.immersive(true); native.immersive(false); native.minimize();
  assert.deepEqual(calls.map(([n, m]) => `${n}.${m}`), [
    'App.addListener', 'App.remove',
    'KeepAwake.keepAwake', 'KeepAwake.allowSleep', 'SystemBars.hide', 'SystemBars.show', 'App.minimizeApp',
  ]);
});

test('断签提醒的本地通知：排期带时间与灵签路由，按 id 取消，网页版没有通知器', async () => {
  assert.equal(rig('web').native.notifier, null);
  const { native, calls } = rig('ios');
  const at = new Date(2026, 9, 24, 21);
  await native.notifier.schedule([{ id: 7100, title: '连续 3 天了', body: 'b', at }]);
  const sched = calls.find((c) => c[0] === 'LocalNotifications' && c[1] === 'schedule');
  assert.deepEqual(sched[2].notifications[0], { id: 7100, title: '连续 3 天了', body: 'b', schedule: { at, allowWhileIdle: true }, extra: { route: '#/m/qian' } });
  await native.notifier.cancel([7100, 7101]);
  assert.deepEqual(calls.find((c) => c[1] === 'cancel')[2], { notifications: [{ id: 7100 }, { id: 7101 }] });
  native.onNotificationTap(() => {})();
  assert.ok(calls.some((c) => c[0] === 'LocalNotifications' && c[1] === 'addListener' && c[2] === 'localNotificationActionPerformed'));
});

test('深链：冷启动时 getLaunchUrl 与 appUrlOpen 报同一链接只处理一次', async () => {
  let listener = null;
  const plugin = (name) => new Proxy({}, {
    get: (_, method) => (opts, cb) => {
      if (name === 'App' && method === 'getLaunchUrl') return Promise.resolve({ url: 'laiganjue://pro' });
      if (method === 'addListener') { if (opts === 'appUrlOpen') listener = cb; return Promise.resolve({ remove() {} }); }
      return Promise.resolve();
    },
  });
  const native = createNative({ isNativePlatform: () => true, getPlatform: () => 'ios' }, plugin, plugin('SystemBars'));
  const got = [];
  native.onUrlOpen((u) => got.push(u));
  await new Promise((r) => setTimeout(r, 0));
  listener({ url: 'laiganjue://pro' });
  listener({ url: 'laiganjue://skin/nebula' });
  listener({ url: '' });
  assert.deepEqual(got, ['laiganjue://pro', 'laiganjue://skin/nebula']);
});
