// 舞台画廊：在空白页里直接挂载器物舞台，供 scripts/stage-gallery.mjs 截图检查。
import { builtInModel, MODEL_IDS } from '../src/ui/models/index.js';
const style = document.createElement('style');
style.textContent = `body{margin:0;background:#888;display:flex;flex-wrap:wrap;gap:6px;padding:6px;font-family:sans-serif}
.cell{position:relative;width:var(--w);height:var(--h);border-radius:20px;overflow:hidden;background:#000}
.cell .model-canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.stage-fps{position:absolute;top:10px;right:10px;font:600 10px monospace;color:#fff;background:rgba(0,0,0,.35);padding:2px 6px;border-radius:9px}
.tag{position:absolute;left:10px;top:10px;font:600 11px sans-serif;color:#fff;background:rgba(0,0,0,.35);padding:2px 6px;border-radius:9px;z-index:2}`;
document.head.append(style);
window.MODEL_IDS = MODEL_IDS;
window.mount = (id, { theme = 'paper', w = 360, h = 360, label = '' } = {}) => {
  document.documentElement.dataset.theme = theme;
  const cell = document.createElement('div'); cell.className = 'cell'; cell.style.setProperty('--w', w + 'px'); cell.style.setProperty('--h', h + 'px');
  const el = document.createElement('div'); el.className = 'model-slot has-model'; el.style.cssText = 'position:absolute;inset:0';
  const tag = document.createElement('div'); tag.className = 'tag'; tag.textContent = label || id;
  cell.append(el, tag); document.body.append(cell);
  const cleanups = [];
  const ctx = { platform: { prefersReducedMotion: false, simpleMotion: false }, addCleanup: (f) => cleanups.push(f), onTheme() {}, motion: null };
  const impl = builtInModel(id)(el, ctx);
  return { impl, el };
};
