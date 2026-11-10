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
