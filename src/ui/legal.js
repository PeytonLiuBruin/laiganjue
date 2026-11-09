// 使用条款 / 隐私政策链接。
// 轻点时在抽屉里打开随 App 一起打包的页面（www/terms.html、www/privacy.html）：离线能看，
// 网站还没发布或打不开时也能看，审核员点付费卡上的链接一定有内容（指南 3.1.2 要求链接可用）。
// 链接本身仍指向公开网址，长按「在浏览器中打开」或抽屉打不开时退回网址。
import { h, sheet } from './kit.js';

export const TERMS_URL = 'https://peytonliubruin.github.io/laiganjue/terms.html';
export const PRIVACY_URL = 'https://peytonliubruin.github.io/laiganjue/privacy.html';

export const LEGAL = {
  terms: { title: '使用条款', url: TERMS_URL, local: 'terms.html' },
  privacy: { title: '隐私政策', url: PRIVACY_URL, local: 'privacy.html' },
};

export function openLegal(kind) {
  const doc = LEGAL[kind];
  if (!doc) return null;
  const frame = h('iframe', { class: 'legal-frame', attrs: { src: doc.local, title: doc.title, loading: 'eager' } });
  const sh = sheet({ title: doc.title, content: h('div', { class: 'legal-sheet' }, frame) });
  sh.el.classList.add('legal');
  sh.open();
  return sh;
}

/** <a> 链接：轻点在 App 内抽屉里打开，href 留着公开网址。 */
export function legalLink(kind, label = LEGAL[kind]?.title) {
  const doc = LEGAL[kind];
  const a = h('a', { attrs: { href: doc.url, target: '_blank', rel: 'noopener' } }, label);
  a.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return; // 电脑上按住修饰键仍按普通链接新开
    e.preventDefault();
    openLegal(kind);
  });
  return a;
}
