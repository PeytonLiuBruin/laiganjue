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

test('构建脚本会复制 terms.html，付费卡与设置页链接到条款', () => {
  assert.match(read('scripts/build.mjs'), /src\/terms\.html/);
  assert.match(read('src/ui/paywall.js'), /TERMS_URL = '.*terms\.html'/);
  assert.match(read('src/ui/app.js'), /TERMS_URL[\s\S]*PRIVACY_URL/);
});
