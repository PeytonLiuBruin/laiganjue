// 器物 id → 3D 场景。没有登记的器物继续使用旧版画布渲染。
import knot from './knot.js';
import thread from './thread.js';
import seal from './seal.js';
import ladder from './ladder.js';
import tree from './tree.js';
import vault from './vault.js';
import compass from './compass.js';
import crystal from './crystal.js';
import pendulum from './pendulum.js';
import sky from './sky.js';
import pillars from './pillars.js';
export const SCENES = {
  'yinyuan.knot': knot,
  'yinyuan.thread': thread,
  'shiye.seal': seal,
  'shiye.ladder': ladder,
  'caiyun.tree': tree,
  'caiyun.vault': vault,
  'fengshui.compass': compass,
  'crystal.ball': crystal,
  'crystal.pendulum': pendulum,
  'zodiac.sky': sky,
  'bazi.pillars': pillars,
};
