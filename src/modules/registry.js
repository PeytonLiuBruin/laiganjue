// 模块注册表：id → 实现（{ mount(container, ctx) → cleanup? }）。
// 元数据在 list.js；这里只负责把实现挂上。
import jiaobei from './jiaobei/index.js';
import qian from './qian/index.js';
import liuyao from './liuyao/index.js';
import almanac from './almanac/index.js';
import bazi from './bazi/index.js';
import fengshui from './fengshui/index.js';
import wheel from './wheel/index.js';
import tarot from './tarot/index.js';
import runes from './runes/index.js';
import zodiac from './zodiac/index.js';
import crystal from './crystal/index.js';
import omikuji from './omikuji/index.js';
import coin from './coin/index.js';
import plinko from './plinko/index.js';

export const MODULES = {
  jiaobei,
  qian,
  liuyao,
  almanac,
  bazi,
  fengshui,
  wheel,
  tarot,
  runes,
  zodiac,
  crystal,
  omikuji,
  coin,
  plinko,
};
