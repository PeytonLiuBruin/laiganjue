// 占位实现：待开发。真正实现请按 docs/MODULE_GUIDE.md 的约定编写 core.js / data.js / view.js。
import { getModuleMeta } from '../list.js';

export default {
  id: 'coin',
  mount(container, ctx) {
    const meta = getModuleMeta('coin');
    container.append(ctx.kit.placeholder(meta.glyph, meta.title + ' · 建设中', meta.subtitle));
    return () => {};
  },
};
