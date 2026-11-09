// App Store 商店截图尺寸：输出像素必须是 App Store Connect 接受的尺寸，机身画面不能超出外框
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SIZES, SCENES, frameHtml } from '../scripts/store-shots.mjs';

const ACCEPTED = { '6.9in': [1290, 2796], '6.5in': [1242, 2688], ipad13: [2064, 2752] };

test('三种尺寸都有，输出像素与 App Store Connect 要求一致', () => {
  for (const [prefix, [w, h]] of Object.entries(ACCEPTED)) {
    const z = SIZES.find((s) => s.name.startsWith(prefix));
    assert.ok(z, `${prefix} 存在`);
    assert.equal(z.frame.width * z.scale, w, `${prefix} 宽`);
    assert.equal(z.frame.height * z.scale, h, `${prefix} 高`);
    assert.ok(z.name.endsWith(`${w}x${h}`), `${z.name} 文件名带像素`);
  }
});

test('机身画面放得下：不超出外框底边与左右', () => {
  for (const z of SIZES) {
    const shotH = Math.round(z.shotW * z.app.height / z.app.width);
    assert.ok(z.titleH + shotH + 2 * z.pad <= z.frame.height - 8, `${z.name} 竖向放得下（${z.titleH}+${shotH}+${2 * z.pad}）`);
    assert.ok(z.shotW + 2 * z.pad <= z.frame.width - 32, `${z.name} 横向留边`);
  }
});

test('iPad 截图按 iPad 视口截，不是把 iPhone 画面放大', () => {
  const ipad = SIZES.find((s) => s.name.startsWith('ipad13'));
  assert.ok(ipad.app.width >= 1024);
  const html = frameHtml(SCENES[0], ipad, 'data:image/png;base64,');
  assert.match(html, new RegExp(`font-size:${Math.round(31 * ipad.fs)}px`));
});

test('App 支持 iPad 时一定生成 iPad 截图（改成只支持 iPhone 时再删掉 iPad 尺寸）', () => {
  const pbx = readFileSync(new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url), 'utf8');
  if (/TARGETED_DEVICE_FAMILY = "1,2"/.test(pbx)) assert.ok(SIZES.some((s) => s.name.startsWith('ipad13')));
});
