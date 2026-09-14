import { coinMesh, axisAngle } from '../../core/solids.js';
import { createSolidScene } from '../../ui/solid-scene.js';
import { COIN } from './core.js';
import { UI } from './data.js';

export const COIN_VIEW = { ground: .78, worldWidth: 260 };
export function coinFaces(values) {
  if (values.length !== 3 || values.some(v => v !== COIN.ZI && v !== COIN.HUA)) throw new Error('需要三枚铜钱的字面或花面');
  return values.map(v => v === COIN.ZI ? 'heads' : 'tails');
}
export function coinLayout() {
  const mesh = coinMesh();
  return [[-72, -22], [0, 62], [72, -22]].map(([x, y], i) => ({
    kind: 'coin', mesh, size: 39, x, y,
    q: axisAngle([1, 0, 0], i === 1 ? Math.PI : 0), inscription: UI.coinFront,
  }));
}

export function createLiuyaoCoins(canvas, ctx) {
  const scene = createSolidScene(canvas, ctx, COIN_VIEW);
  function reset() {
    scene.set(coinLayout());
    delete canvas.dataset.coins; delete canvas.dataset.values;
    canvas.dataset.phase = 'idle';
    canvas.setAttribute('aria-label', '三枚铜钱，向上滑动投掷');
  }
  reset();
  return {
    reset, dispose: scene.dispose,
    async toss(values, intensity) {
      delete canvas.dataset.coins;
      canvas.setAttribute('aria-label', '三枚铜钱正在翻滚');
      const completed = await scene.throwTo(coinFaces(values), intensity, { duration: ctx.platform.simpleMotion ? 1600 : 3300 });
      if (completed) {
        canvas.dataset.coins = values.join(',');
        canvas.setAttribute('aria-label', `三枚铜钱落定：${values.map(v => v === COIN.ZI ? '字面' : '花面').join('、')}`);
      }
      return completed;
    },
  };
}
