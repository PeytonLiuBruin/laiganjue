// 用法：node scripts/stage-frame.mjs [--only crystal.pendulum] [--json]
// 检查 11 件 3D 器物在正方形舞台里，从静止、动作（预备压扁 → 过冲拉长 → 回弹）到揭晓放大的全过程中，
// 主角投影到画面的最大范围（归一化设备坐标）。visual-direction.md 第 2 节「动效」要求过冲时最高点 ndc.y < 0.9。
// tests/e2e/stage-frame.e2e.mjs 调用 measureFrames 做断言。
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 每件器物：静止状态、动作状态、揭晓状态（与 stage-gallery.mjs 的三阶段一致）
export const FRAME_STATES = {
  'yinyuan.knot': [{}, { active: true }, { active: false, revealed: true }],
  'yinyuan.thread': [{}, { active: true }, { active: false, revealed: true }],
  'shiye.seal': [{}, { active: true }, { active: false, revealed: true, level: '上' }],
  'shiye.ladder': [{}, { active: true }, { active: false, revealed: true }],
  'caiyun.tree': [{}, { active: true }, { active: false, revealed: true, level: '上' }],
  'caiyun.vault': [{}, { active: true }, { active: false, revealed: true }],
  'fengshui.compass': [{ angle: 0 }, { angle: -40, active: true }, { angle: -135, active: false, revealed: true }],
  'crystal.ball': [{ progress: 0 }, { progress: .7, glow: true, active: true }, { progress: 1, revealed: true, active: false }],
  'crystal.pendulum': [{ x: 0, y: 0 }, { x: .6, y: -.3, active: true }, { x: 0, y: .7, glow: true, result: 'yes', active: false }],
  'zodiac.sky': [{ kind: 'western', stars: [{ x: 30, y: 40, r: 1.6 }, { x: 45, y: 30, r: 1.2 }, { x: 60, y: 45, r: 1.4 }], lines: [[0, 1], [1, 2]], glyph: '♈' }, { active: true }, { kind: 'animal', stars: [], lines: [], glyph: '午', active: false, revealed: true }],
  'bazi.pillars': [{ pillars: [] }, { pillars: [{ label: '年柱', gan: '乙', zhi: '亥', ganElement: '木', zhiElement: '水', shiShen: '正财' }, { label: '月柱', gan: '壬', zhi: '午', ganElement: '水', zhiElement: '火', shiShen: '食神' }, { label: '日柱', gan: '庚', zhi: '辰', ganElement: '金', zhiElement: '土', shiShen: '日主' }], active: true, duration: 2.4 }, { active: false, revealed: true }],
};

/** 返回 { id: { idle, action, reveal } }，每项是该阶段内主角范围的并集 { minX, maxX, minY, maxY }。 */
export async function measureFrames({ only = null, theme = 'paper' } = {}) {
  const out = path.join(root, 'dist/stage-frame');
  await mkdir(out, { recursive: true });
  const js = await build({ entryPoints: [path.join(root, 'scripts/stage-gallery-entry.js')], bundle: true, format: 'iife', write: false, logLevel: 'error', target: ['es2020'] });
  await writeFile(path.join(out, 'gallery.js'), js.outputFiles[0].text);
  await writeFile(path.join(out, 'gallery.html'), '<!doctype html><meta charset="utf-8"><body><script src="gallery.js"></script>');
  const browser = await launchBrowser();
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + path.join(out, 'gallery.html'));
    const ids = (only || await page.evaluate(() => window.MODEL_IDS)).filter((id) => FRAME_STATES[id]);
    const result = {};
    for (const id of ids) {
      result[id] = await page.evaluate(({ id, theme, states }) => {
        document.body.innerHTML = '';
        const { impl } = window.mount(id, { theme, w: 360, h: 360 });
        const union = (a, b) => (!a ? b : !b ? a : { minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minY: Math.min(a.minY, b.minY), maxY: Math.max(a.maxY, b.maxY) });
        const run = (seconds) => { let box = null; for (let t = 0; t < seconds; t += 1 / 30) { impl.advance(1 / 30); box = union(box, impl.frame()); } return box; };
        impl.set(states[0]); const idle = run(.5);
        impl.set(states[1]); const action = run(1.4);
        impl.set(states[2]); const reveal = run(1.4);
        impl.freeze(); impl.dispose?.();
        return { idle, action, reveal };
      }, { id, theme, states: FRAME_STATES[id] });
    }
    if (errors.length) throw new Error('页面报错：' + [...new Set(errors)].join('；'));
    return result;
  } finally { await browser.close(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--only');
  const res = await measureFrames({ only: i >= 0 ? args[i + 1].split(',') : null });
  if (args.includes('--json')) console.log(JSON.stringify(res, null, 1));
  else for (const [id, r] of Object.entries(res)) {
    const all = [r.idle, r.action, r.reveal].filter(Boolean);
    const f = (k, fn) => fn(...all.map((b) => b[k])).toFixed(3);
    console.log(id.padEnd(18), 'top', f('maxY', Math.max), 'bottom', f('minY', Math.min), 'left', f('minX', Math.min), 'right', f('maxX', Math.max), '| 动作顶', r.action?.maxY.toFixed(3), '揭晓顶', r.reveal?.maxY.toFixed(3));
  }
}
