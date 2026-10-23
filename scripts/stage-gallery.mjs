// 用法：node scripts/stage-gallery.mjs [--only yinyuan.knot,shiye.seal] [--themes paper,ink] [--out dist/stage-shots]
// 每个器物截三张：静止、动作中、揭晓后；输出到 dist/stage-shots/<id>-<theme>.png
// --motion 改截动作弹性四张：静止、预备压扁（0.12 秒）、过冲拉长（0.28 秒）、揭晓放大与金星（0.2 秒），输出 <id>-<theme>-motion.png
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const out = path.resolve(root, opt('--out', 'dist/stage-shots'));
const themes = opt('--themes', 'paper').split(',');
await mkdir(out, { recursive: true });
const js = await build({ entryPoints: [path.join(root, 'scripts/stage-gallery-entry.js')], bundle: true, format: 'iife', write: false, logLevel: 'error', target: ['es2020'] });
await writeFile(path.join(out, 'gallery.js'), js.outputFiles[0].text);
await writeFile(path.join(out, 'gallery.html'), '<!doctype html><meta charset="utf-8"><body><script src="gallery.js"></script>');

// 各器物三个阶段的状态
const STATES = {
  'yinyuan.knot': [[{}, 0], [{ active: true }, .5], [{ active: false, revealed: true }, 1.2]],
  'yinyuan.thread': [[{}, 0], [{ active: true }, .9], [{ active: false, revealed: true }, 1.4]],
  'shiye.seal': [[{}, 0], [{ active: true }, .62], [{ active: false, revealed: true, level: '上' }, 1.2]],
  'shiye.ladder': [[{}, 0], [{ active: true }, .9], [{ active: false, revealed: true }, 1.4]],
  'caiyun.tree': [[{}, 0], [{ active: true }, .8], [{ active: false, revealed: true, level: '上' }, 1.4]],
  'caiyun.vault': [[{}, 0], [{ active: true }, 1.0], [{ active: false, revealed: true }, 1.4]],
  'fengshui.compass': [[{ angle: 0 }, .3], [{ angle: -40 }, .3], [{ angle: -135 }, .3]],
  'crystal.ball': [[{ progress: 0 }, .3], [{ progress: .7, glow: true, active: true }, .8], [{ progress: 1, revealed: true, active: false }, 1.4]],
  'crystal.pendulum': [[{ x: 0, y: 0 }, .3], [{ x: .6, y: -.3, active: true }, .5], [{ x: 0, y: .7, glow: true, result: 'yes', active: false }, .8]],
  'zodiac.sky': [[{ kind: 'western', stars: [{ x: 30, y: 40, r: 1.6 }, { x: 45, y: 30, r: 1.2 }, { x: 60, y: 45, r: 1.4 }, { x: 70, y: 60, r: 1 }], lines: [[0, 1], [1, 2], [2, 3]], glyph: '♈' }, .3], [{ active: true }, .8], [{ kind: 'animal', stars: [], lines: [], glyph: '午', active: false }, .6]],
  'bazi.pillars': [[{ pillars: [] }, .2], [{ pillars: [{ label: '年柱', gan: '乙', zhi: '亥', ganElement: '木', zhiElement: '水', shiShen: '正财' }, { label: '月柱', gan: '壬', zhi: '午', ganElement: '水', zhiElement: '火', shiShen: '食神' }, { label: '日柱', gan: '庚', zhi: '辰', ganElement: '金', zhiElement: '土', shiShen: '日主' }], active: true, duration: 2.4 }, 1.0], [{ active: false }, 2.0]],
};

const motion = args.includes('--motion');
const LABELS = motion ? ['静止', '预备压扁', '过冲拉长', '揭晓 + 金星'] : ['静止', '动作中', '揭晓'];
const phasesFor = (id) => {
  const p = STATES[id];
  if (!motion) return p;
  const last = p[p.length - 1][0];
  return [p[0], [{ active: true }, .12], [{ active: true }, .28], [{ ...last, active: false, revealed: true }, .2]];
};
const browser = await launchBrowser();
const only = opt('--only', '');
const page = await browser.newPage({ viewport: { width: motion ? 1500 : 1140, height: 400 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('file://' + path.join(out, 'gallery.html'));
const ids = (only ? only.split(',') : await page.evaluate(() => window.MODEL_IDS)).filter((id) => STATES[id]);
for (const theme of themes) {
  for (const id of ids) {
    await page.evaluate(() => { document.body.innerHTML = ''; });
    const info = await page.evaluate(({ id, theme, phases, labels }) => {
      const res = [];
      for (const [i, [state, t]] of phases.entries()) {
        const { impl } = window.mount(id, { theme, label: labels[i] });
        let acc = {};
        for (const [s] of phases.slice(0, i + 1)) acc = { ...acc, ...s };
        if (i > 0) impl.set(phases[i - 1][0]);
        impl.set(state);
        impl.advance ? impl.advance(t) : null;
        impl.freeze?.();
        res.push(impl.renderer || 'canvas');
      }
      return res;
    }, { id, theme, phases: phasesFor(id), labels: LABELS });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(out, `${id}-${theme}${motion ? '-motion' : ''}.png`) });
    console.log('shot', id, theme, info.join(','));
  }
}
await browser.close();
if (errors.length) { console.log('errors:\n' + [...new Set(errors)].join('\n')); process.exitCode = 1; }
