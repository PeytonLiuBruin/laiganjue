// 上架前的 iOS 工程检查（第 52 轮）：只上 iPhone、arm64、出口合规（隐私清单见 legal.test.mjs）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

test('所有目标只面向 iPhone（TARGETED_DEVICE_FAMILY = 1），免得审核要 iPad 截图并按 iPad 布局审', () => {
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
  const fams = [...pbx.matchAll(/TARGETED_DEVICE_FAMILY = ([^;]+);/g)].map((m) => m[1].trim());
  assert.ok(fams.length >= 2, '至少 App 的 Debug 与 Release 两处');
  for (const f of fams) assert.equal(f, '1');
});

test('Info.plist：设备能力 arm64、不再有 armv7 与 iPad 方向，出口合规为否', () => {
  const plist = read('ios/App/App/Info.plist');
  assert.match(plist, /<key>UIRequiredDeviceCapabilities<\/key>\s*<array>\s*<string>arm64<\/string>\s*<\/array>/);
  assert.doesNotMatch(plist, /armv7/);
  assert.doesNotMatch(plist, /UISupportedInterfaceOrientations~ipad/);
  assert.match(plist, /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/);
});

// 第 65 轮：小组件扩展的版本号必须和主 App 一致，否则上传时报 ITMS-90473（CFBundleShortVersionString / CFBundleVersion 不一致）。
// 以后发 1.1 时在 Xcode 里只改了 App 目标、忘了改小组件，这里会先失败提醒。ios-try.sh 用命令行覆盖构建号，对两个目标同时生效。
test('App 与小组件的 MARKETING_VERSION、CURRENT_PROJECT_VERSION、最低系统版本全部一致', () => {
  // 只看会随 App 一起上传的目标，UI 测试目标（.uitests，最低 16.4）不进安装包，不参与比较
  const pbx = read('ios/App/App.xcodeproj/project.pbxproj')
    .split('isa = XCBuildConfiguration;')
    .slice(1)
    .filter((block) => !/PRODUCT_BUNDLE_IDENTIFIER = [^;]*\.uitests;/.test(block))
    .join('\n');
  for (const key of ['MARKETING_VERSION', 'CURRENT_PROJECT_VERSION', 'IPHONEOS_DEPLOYMENT_TARGET']) {
    const vals = [...pbx.matchAll(new RegExp(`${key} = ([^;]+);`, 'g'))].map((m) => m[1].trim());
    assert.ok(vals.length >= 4, `${key} 至少出现在 App 与小组件的 Debug、Release 四处`);
    assert.equal(new Set(vals).size, 1, `${key} 有不同取值：${[...new Set(vals)].join('、')}`);
  }
  for (const p of ['ios/App/App/Info.plist', 'ios/App/LaiganjueWidget/Info.plist']) {
    const plist = read(p);
    assert.match(plist, /<key>CFBundleShortVersionString<\/key>\s*<string>\$\(MARKETING_VERSION\)<\/string>/, `${p} 版本号要引用 MARKETING_VERSION`);
    assert.match(plist, /<key>CFBundleVersion<\/key>\s*<string>\$\(CURRENT_PROJECT_VERSION\)<\/string>/, `${p} 构建号要引用 CURRENT_PROJECT_VERSION`);
  }
});
