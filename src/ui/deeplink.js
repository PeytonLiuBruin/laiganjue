// laiganjue:// 深链：给分享卡、主屏小组件、推广链接和自动化截图用。
//   laiganjue://pro          打开来感觉 Pro 付费卡
//   laiganjue://m/qian       打开某个玩法
//   laiganjue://skin/nebula  打开某套付费皮肤的单买卡（skins 里列出的才认）
//   laiganjue://             回首页
// 不认识的链接返回 null，不做任何事。
export const SCHEME = 'laiganjue';

export function routeFromUrl(url, modules = {}, skins = []) {
  if (typeof url !== 'string') return null;
  const m = url.match(/^([a-z][a-z0-9+.-]*):\/\/(.*)$/i);
  if (!m || m[1].toLowerCase() !== SCHEME) return null;
  const path = m[2].split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
  if (!path) return { hash: '#/' };
  if (path === 'pro') return { paywall: true };
  const skin = path.match(/^skin\/([a-z0-9_-]+)$/i);
  if (skin) return skins.includes(skin[1].toLowerCase()) ? { skin: skin[1].toLowerCase() } : null;
  const mod = path.match(/^m\/([a-z0-9_-]+)$/i);
  if (mod && Object.prototype.hasOwnProperty.call(modules, mod[1])) return { hash: '#/m/' + mod[1] };
  return null;
}
