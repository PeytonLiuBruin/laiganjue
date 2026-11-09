// 上架合规文件：隐私清单、隐私政策与使用条款
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('PrivacyInfo.xcprivacy 声明不追踪、不收集，并列出 Required Reason API', () => {
  const x = read('ios/App/App/PrivacyInfo.xcprivacy');
  assert.match(x, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(x, /<key>NSPrivacyCollectedDataTypes<\/key>\s*<array\/>/);
  assert.match(x, /NSPrivacyAccessedAPICategoryUserDefaults[\s\S]*?CA92\.1/);
});

test('隐私清单已加入 Xcode 工程的资源阶段', () => {
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  assert.match(pbx, /PrivacyInfo\.xcprivacy in Resources \*\/,/);
  assert.match(pbx, /path = PrivacyInfo\.xcprivacy;/);
});

test('隐私政策写明购买由 Apple 处理，使用条款含自动续期说明', () => {
  assert.match(read('src/privacy.html'), /App 内购买/);
  const t = read('src/terms.html');
  assert.match(t, /自动续期/);
  assert.match(t, /24 小时/);
  assert.match(t, /stdeula/);
});

test('构建脚本会复制 terms.html 与 privacy.html，付费卡、皮肤卡与设置页都链接到条款', () => {
  const build = read('scripts/build.mjs');
  assert.match(build, /src\/terms\.html/);
  assert.match(build, /src\/privacy\.html/);
  assert.match(read('src/ui/legal.js'), /TERMS_URL = '.*terms\.html'/);
  for (const f of ['src/ui/paywall.js', 'src/ui/skins.js', 'src/ui/app.js']) {
    const src = read(f);
    assert.match(src, /legalLink\('terms'/, `${f} 缺少使用条款链接`);
    assert.match(src, /legalLink\('privacy'/, `${f} 缺少隐私政策链接`);
  }
});

test('帮助与反馈页随网页发布，写明联系方式、恢复购买与取消订阅，设置页可打开（指南 1.5 技术支持网址）', () => {
  assert.match(read('scripts/build.mjs'), /src\/support\.html/);
  const s = read('src/support.html');
  assert.match(s, /联系我们/);
  assert.match(s, /恢复购买/);
  assert.match(s, /取消订阅/);
  assert.match(read('src/ui/legal.js'), /local: 'support\.html'/);
  assert.match(read('src/ui/app.js'), /legalLink\('support'/);
});

test('条款与隐私政策在 App 内打开随包附带的页面（网站没发布或离线时也能看，指南 3.1.2 要求链接可用）', () => {
  const legal = read('src/ui/legal.js');
  assert.match(legal, /local: 'terms\.html'/);
  assert.match(legal, /local: 'privacy\.html'/);
  assert.match(legal, /preventDefault\(\)[\s\S]*openLegal/);
});
