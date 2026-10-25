#!/bin/bash
# 在 iOS 模拟器里跑 AppUITests，自动截付费卡与皮肤单买卡（价格来自 Products.storekit 的本地化字符串）。
# 用法：bash scripts/paywall-shot.sh            默认 iPhone 17 与 iPhone 18 Pro Max 两台模拟器
#       SIMS="iPhone Air" bash scripts/paywall-shot.sh
# 截图输出到 docs/claude-plan/screenshots/ios-<机型>-<paywall|skin-offer>.png。
# 不连 App Store、不需要沙盒账号或开发者账号（模拟器构建本地签名）。
set -euo pipefail
cd "$(dirname "$0")/.."

SIMS=${SIMS:-"iPhone 17|iPhone 18 Pro Max"}
OUT_DIR=docs/claude-plan/screenshots
DD=${DD:-$HOME/Library/Caches/lgj-uitest-dd}   # 编译缓存，第二次起只需 1 到 2 分钟
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# 首次完整编译加模拟器要几个 GB，磁盘快满时 xcodebuild 失败后还会收集模拟器诊断继续写盘
FREE_GB=$(df -g "$HOME" | awk 'NR==2 {print $4}')
if [ "${FREE_GB:-0}" -lt 6 ]; then echo "磁盘只剩 ${FREE_GB}GB，至少要 6GB，先清理再跑" >&2; exit 1; fi

npm run --silent app:sync >/dev/null
mkdir -p "$OUT_DIR"

IFS='|' read -r -a DEVICES <<< "$SIMS"
for DEV in "${DEVICES[@]}"; do
  SLUG=$(echo "$DEV" | tr 'A-Z ' 'a-z-')
  RES="$WORK/$SLUG.xcresult"
  echo "▶ $DEV"
  xcodebuild test -quiet \
    -project ios/App/App.xcodeproj -scheme App \
    -destination "platform=iOS Simulator,name=$DEV" \
    -only-testing:${ONLY:-AppUITests} \
    -resultBundlePath "$RES" \
    -collect-test-diagnostics never \
    -derivedDataPath "$DD" > "$WORK/$SLUG.log" 2>&1 || true
  # 失败原因（断言消息）从结果包里读，xcodebuild 的 -quiet 输出不含这些
  xcrun xcresulttool get test-results tests --path "$RES" 2>/dev/null | python3 -c '
import json, sys
def walk(n, d=0):
    r = n.get("result", "")
    if n.get("nodeType") in ("Test Case", "Failure Message"):
        print("  " + "  " * d + ("✓ " if r == "Passed" else "✗ " if r == "Failed" else "") + n.get("name", ""))
    for c in n.get("children", []): walk(c, d + (n.get("nodeType") == "Test Case"))
for n in json.load(sys.stdin).get("testNodes", []): walk(n)
' || tail -20 "$WORK/$SLUG.log"
  mkdir -p "$WORK/$SLUG"
  xcrun xcresulttool export attachments --path "$RES" --output-path "$WORK/$SLUG" >/dev/null
  # manifest.json 里每个附件有 suggestedHumanReadableName（以测试里 XCTAttachment.name 开头）
  python3 - "$WORK/$SLUG" "$OUT_DIR" "$SLUG" <<'PY'
import json, os, re, shutil, sys
src, out, slug = sys.argv[1:4]
n = 0
for test in json.load(open(os.path.join(src, 'manifest.json'))):
    for a in test.get('attachments', []):
        name = a.get('suggestedHumanReadableName', '')
        key = re.split(r'_\d|\.', name)[0]
        if key in ('paywall', 'skin-offer'):
            shutil.copy(os.path.join(src, a['exportedFileName']), os.path.join(out, f'ios-{slug}-{key}.png'))
            n += 1
        elif key.endswith('-debug') or key.endswith('-tree'):  # 失败时的现场，放到临时目录方便排查
            os.makedirs('/tmp/lgj-uitest-debug', exist_ok=True)
            shutil.copy(os.path.join(src, a['exportedFileName']), os.path.join('/tmp/lgj-uitest-debug', name))
print(f'  导出 {n} 张截图')
if n == 0: sys.exit('  没有截图，测试失败了')
PY
done
