// 第 67 轮：付费卡出现时机对照 monetization.md 第 4 节。
// 新加付费卡入口时这里会失败，先对照收费方案（首次打开不弹、半屏可关、不制造紧迫感）再更新清单。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const SRC = new URL('../src/', import.meta.url);

async function jsFiles(dir, base = '') {
  const out = [];
  for (const e of await readdir(new URL(base, dir), { withFileTypes: true })) {
    const rel = base + e.name;
    if (e.isDirectory()) { if (e.name !== 'vendor') out.push(...await jsFiles(dir, rel + '/')); }
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

test('付费卡只从已登记的几处打开', async () => {
  const hits = {};
  for (const f of await jsFiles(SRC)) {
    if (f === 'ui/paywall.js') continue;
    const js = await readFile(new URL(f, SRC), 'utf8');
    const n = (js.match(/openPaywall\(platform|openPaywall\(ctx\.platform|await openPaywall\(/g) || []).length;
    if (n) hits[f] = n;
  }
  assert.deepEqual(hits, {
    // 深链 pro（排在首次引导之后）、皮肤抽屉「了解 Pro」、设置页「了解 Pro」、调试钩子
    'ui/app.js': 4,
    // 深度解读额度用完、连续第 3 天结果条提示的「看看」
    'ui/ritual.js': 2,
    // 分享卡「去掉水印」小链接
    'ui/share-card.js': 1,
    // 单买皮肤卡里的「全部皮肤」升级入口
    'ui/skins.js': 1,
  });
});

test('首次打开不自动弹付费卡，深链也排在首次引导之后', async () => {
  const app = await readFile(new URL('ui/app.js', SRC), 'utf8');
  assert.match(app, /if \(r\.paywall\) onboardGate\.run\(\(\) => openPaywall\(platform\)\)/);
  assert.doesNotMatch(app, /wait\(\d+\)\.then\(\(\) => openPaywall/);
});

test('连续天数提示只在 App 内出现，要轻点「看看」才打开，可以关掉', async () => {
  const js = await readFile(new URL('ui/ritual.js', SRC), 'utf8');
  const body = js.slice(js.indexOf('function trialNudge'), js.indexOf('function clearResult'));
  assert.match(body, /if \(!streak \|\| !iap\?\.available\) return;/);
  assert.match(body, /shouldNudge\(\)/);
  assert.match(body, /onClick: \(\) => openPaywall\(ctx\.platform/);
  assert.match(body, /'aria-label': '不再显示'/);
  assert.equal((body.match(/openPaywall\(/g) || []).length, 1, '提示条里只有按钮会打开付费卡');
});

test('每个玩法每天 1 次免费深度解读，付费卡只写已实现的三项权益', async () => {
  const quota = await readFile(new URL('platform/quota.js', SRC), 'utf8');
  assert.match(quota, /export const FREE_PER_DAY = 1;/);
  const pw = await readFile(new URL('ui/paywall.js', SRC), 'utf8');
  const block = pw.slice(pw.indexOf('const BENEFITS'), pw.indexOf('const PLANS'));
  const titles = [...block.matchAll(/\['.', '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(titles, ['无限次深度解读', '全部付费皮肤', '无水印高清分享卡']);
});
