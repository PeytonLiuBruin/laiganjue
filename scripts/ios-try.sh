#!/bin/bash
# 来感觉 · 一条命令把 App 装到你的 iPhone 上（在 Mac 上运行）
#
# 用法：打开「终端」，粘贴下面一行回车（地址见 docs/NATIVE_APP.md）：
#   curl -fsSL https://raw.githubusercontent.com/PeytonLiuBruin/laiganjue/claude/ecstatic-allen-lh1flx/scripts/ios-try.sh | bash
# 已经下载了代码的话，在代码目录里运行：bash scripts/ios-try.sh
# 上传到 TestFlight 给别人装：bash ~/laiganjue/scripts/ios-try.sh --testflight（步骤见 docs/NATIVE_APP.md 第四节）
#
# 它会：检查 Xcode → 准备 Node.js（缺了就下载到用户目录，不需要管理员密码）→ 下载或更新代码
#      → 构建 → 找到用数据线连着的 iPhone → 签名、编译、安装并打开 App。
#      --testflight：最后一步改为打包正式版并上传到 App Store Connect（不需要连手机）。
# 可选环境变量：
#   LGJ_DIR       代码放在哪里（默认 ~/laiganjue）
#   LGJ_BRANCH    使用哪个分支（默认见下方 DEFAULT_BRANCH）
#   LGJ_TEAM      Apple 开发者团队 ID（10 位，例如 ABCDE12345；不填会自动识别或询问）
#   LGJ_NO_DEVICE=1  只检查环境并编译，不连手机、不签名不上传（自动化测试用；配合 --testflight 时再试打一次正式版包）
#
# 兼容 macOS 自带的 bash 3.2；整个流程包在 main 里，网络中断导致脚本只下载一半时不会执行半截命令。

REPO_URL="https://github.com/PeytonLiuBruin/laiganjue.git"
DEFAULT_BRANCH="claude/ecstatic-allen-lh1flx"
BUNDLE_ID="io.github.peytonliubruin.laiganjue"
NODE_MAJOR=22
# 没有合适的 Node.js 时下载这个固定版本（官方 SHASUMS256.txt 里的校验值，下载后逐字节核对）
NODE_VERSION="v22.23.3"
NODE_SHA256_ARM64="23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53"
NODE_SHA256_X64="8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8"

main() {
  set -euo pipefail

  if [ -t 1 ]; then B=$'\033[1m'; G=$'\033[32m'; Y=$'\033[33m'; R=$'\033[31m'; D=$'\033[2m'; N=$'\033[0m'; else B=; G=; Y=; R=; D=; N=; fi
  step() { printf '\n%s▶ %s%s\n' "$B" "$1" "$N"; }
  ok() { printf '  %s✓%s %s\n' "$G" "$N" "$1"; }
  note() { printf '  %s\n' "$1"; }
  warn() { printf '  %s!%s %s\n' "$Y" "$N" "$1"; }
  fail() { printf '\n%s✗ %s%s\n' "$R" "$1" "$N" >&2; shift; for line in "$@"; do printf '  %s\n' "$line" >&2; done; printf '\n  解决后重新运行同一条命令即可，已经做完的步骤会自动跳过。\n\n' >&2; exit 1; }
  ask() { # ask "提示" → 读一行到 REPLY（curl | bash 时从键盘读）
    REPLY=
    if [ -r /dev/tty ] && { printf '  %s' "$1" >/dev/tty; } 2>/dev/null; then IFS= read -r REPLY </dev/tty || true; else return 1; fi
  }

  local NO_DEVICE="${LGJ_NO_DEVICE:-}"
  local BRANCH="${LGJ_BRANCH:-$DEFAULT_BRANCH}"
  local MODE=device arg
  for arg in ${1+"$@"}; do
    case "$arg" in
      --testflight) MODE=testflight ;;
      *) fail "不认识的参数：$arg" "可用：--testflight（上传到 TestFlight）" ;;
    esac
  done

  if [ "$MODE" = testflight ]; then
    printf '%s来感觉 · 上传到 TestFlight（给别人装）%s\n' "$B" "$N"
  else
    printf '%s来感觉 · 装到 iPhone 上试用%s\n' "$B" "$N"
  fi
  [ "$(uname -s)" = "Darwin" ] || fail "这个脚本只能在 Mac 上运行。"

  # ---------------------------------------------------------------- Xcode
  step "1/6 检查 Xcode"
  local dev=""
  dev="$(xcode-select -p 2>/dev/null || true)"
  case "$dev" in
    *.app/Contents/Developer) [ -x "$dev/usr/bin/xcodebuild" ] || dev="" ;;
    *) dev="" ;;
  esac
  if [ -z "$dev" ]; then
    local app
    while IFS= read -r app; do
      if [ -n "$app" ] && [ -x "$app/Contents/Developer/usr/bin/xcodebuild" ]; then dev="$app/Contents/Developer"; break; fi
    done <<EOF
/Applications/Xcode.app
$(mdfind "kMDItemCFBundleIdentifier == 'com.apple.dt.Xcode'" 2>/dev/null || true)
EOF
  fi
  if [ -z "$dev" ]; then
    open "macappstore://apps.apple.com/app/id497799835" 2>/dev/null || true
    fail "没有找到 Xcode。" "已为你打开 App Store 的 Xcode 页面，请点「获取」安装（免费，体积较大）。" "装好后先打开一次 Xcode，按提示点「同意」并等它装完组件。"
  fi
  # 不改系统设置（不需要 sudo），只对本次运行生效
  export DEVELOPER_DIR="$dev"
  local xapp="${dev%/Contents/Developer}"
  # 许可协议 / 首次安装组件：都要在 Xcode 窗口里点（需要电脑密码），这里打开 Xcode 后原地等待，完成后自动继续
  local xwait=0 xtold=""
  while :; do
    local clang_out
    clang_out="$(xcrun clang --version 2>&1 || true)"
    if case "$clang_out" in *[Ll]icense*) true ;; *) false ;; esac; then :
    elif ! xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1; then :
    else break; fi
    if [ -z "$xtold" ]; then
      xtold=1
      open -a "$xapp" 2>/dev/null || true
      note "Xcode 还需要你点一下：已为你打开 Xcode，请在弹出的窗口里点「Agree」并输入电脑密码；"
      note "如果提示安装组件（Install / Components），点「Install」并勾选 iOS。完成后这里会自动继续。"
    fi
    sleep 5
    xwait=$((xwait + 5))
    [ "$xwait" -lt 3600 ] || fail "等了一小时 Xcode 仍未完成首次设置。" "请打开 Xcode 按提示完成后，重新运行。"
  done
  local xv xmajor
  xv="$(xcodebuild -version 2>/dev/null | head -n 1 || true)"
  [ -n "$xv" ] || fail "Xcode 无法运行。" "请先手动打开一次 Xcode（在「应用程序」里），按提示完成设置后再试。"
  xmajor="$(printf '%s' "$xv" | sed -n 's/^Xcode \([0-9][0-9]*\).*/\1/p')"
  if [ -n "$xmajor" ] && [ "$xmajor" -lt 26 ]; then
    open "macappstore://apps.apple.com/app/id497799835" 2>/dev/null || true
    fail "Xcode 版本太旧（${xv}），需要 Xcode 26 或更新。" "已为你打开 App Store 的 Xcode 页面，请更新后重新运行。"
  fi
  ok "${xv}（${xapp}）"

  # ---------------------------------------------------------------- Node.js
  step "2/6 准备 Node.js"
  local node_ok=""
  if command -v node >/dev/null 2>&1; then
    local nv
    nv="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
    [ "$nv" -ge "$NODE_MAJOR" ] 2>/dev/null && node_ok=1
  fi
  if [ -z "$node_ok" ]; then
    local cache="$HOME/Library/Caches/laiganjue"
    # 用 sysctl 判断芯片：终端在 Rosetta 下运行时 uname -m 会把 Apple 芯片报成 x86_64
    local narch=x64 nsha="$NODE_SHA256_X64"
    if [ "$(sysctl -n hw.optional.arm64 2>/dev/null || true)" = 1 ]; then narch=arm64; nsha="$NODE_SHA256_ARM64"; fi
    local nname="node-${NODE_VERSION}-darwin-${narch}"
    local found="$cache/$nname"
    if [ ! -x "$found/bin/node" ]; then
      note "电脑上没有合适的 Node.js，正在下载到 ${cache}（只给本工具用，不影响系统）…"
      mkdir -p "$cache"
      local tmpd
      tmpd="$(mktemp -d "$cache/.download.XXXXXX")"
      curl -fL --retry 3 --connect-timeout 20 --progress-bar -o "$tmpd/$nname.tar.gz" "https://nodejs.org/dist/$NODE_VERSION/$nname.tar.gz" \
        || { rm -rf "$tmpd"; fail "下载 Node.js 失败，请检查网络后重试。"; }
      [ "$(shasum -a 256 "$tmpd/$nname.tar.gz" | awk '{print $1}')" = "$nsha" ] \
        || { rm -rf "$tmpd"; fail "Node.js 安装包校验失败（可能下载不完整），请重试。"; }
      tar -xzf "$tmpd/$nname.tar.gz" -C "$tmpd" || { rm -rf "$tmpd"; fail "解压 Node.js 失败，请重试。"; }
      rm -rf "$found"
      mv "$tmpd/$nname" "$found"
      rm -rf "$tmpd"
    fi
    export PATH="$found/bin:$PATH"
    hash -r
  fi
  ok "Node.js $(node -v)"

  # ---------------------------------------------------------------- 代码
  step "3/6 准备代码"
  local here="" root=""
  # 通过 curl | bash 运行时没有脚本文件路径，直接走下载代码的分支
  [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ] && here="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd || true)"
  if [ -n "$here" ] && [ -f "$here/../capacitor.config.json" ] && [ -d "$here/../ios/App" ]; then
    root="$(cd "$here/.." && pwd)"
    ok "使用当前代码目录：$root"
  else
    root="${LGJ_DIR:-$HOME/laiganjue}"
    export GIT_TERMINAL_PROMPT=0
    git --version >/dev/null 2>&1 || fail "git 不可用。" "请先打开一次 Xcode 完成组件安装，然后重试。"
    if [ -d "$root/.git" ]; then
      if [ -n "$(git -C "$root" status --porcelain --untracked-files=no)" ]; then
        warn "$root 里有改动过的文件，这次不更新代码，直接用现有版本。"
      else
        note "正在更新代码…"
        git -C "$root" fetch --quiet origin "$BRANCH" || fail "更新代码失败，请检查网络后重试。"
        git -C "$root" checkout --quiet -B "$BRANCH" "origin/$BRANCH"
      fi
    elif [ -e "$root" ]; then
      fail "$root 已存在但不是本项目的代码目录。" "请换个位置：LGJ_DIR=~/其它目录 再运行，或者把这个文件夹改名。"
    else
      note "正在下载代码到 $root …"
      git clone --quiet --branch "$BRANCH" "$REPO_URL" "$root" || fail "下载代码失败，请检查网络后重试。"
    fi
    ok "代码在 ${root}（$(git -C "$root" log -1 --format='%h %cd' --date=short)）"
  fi
  cd "$root"

  # ---------------------------------------------------------------- 构建网页 + 同步到 iOS 工程
  step "4/6 构建 App 内容"
  note "安装依赖（第一次需要一两分钟）…"
  npm ci --no-audit --no-fund --loglevel=error >/dev/null
  npm run --silent build:app
  npx cap sync ios >/dev/null
  ok "已同步到 ios/ 工程"

  local log="$root/ios/App/build/ios-try.log"
  mkdir -p "$(dirname "$log")"
  local xb="xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -derivedDataPath ios/App/build"

  # Xcode 26 起，即使给真机编译也需要「iOS 平台组件」（约 8–10 GB）；缺了就自动下载（不需要管理员密码）
  local dests
  dests="$(xcodebuild -project ios/App/App.xcodeproj -scheme App -showdestinations 2>&1 || true)"
  if case "$dests" in *"is not installed"*) true ;; *) false ;; esac; then
    note "Xcode 还缺 iOS 组件，正在自动下载（约 8–10 GB，视网速需要十几分钟到一小时，请保持联网）…"
    xcodebuild -downloadPlatform iOS \
      || fail "下载 iOS 组件失败。" "打开 Xcode →「Settings…」→「Components」，点 iOS 旁边的下载按钮，完成后重新运行。"
    ok "iOS 组件已安装"
  fi

  if [ -n "$NO_DEVICE" ]; then
    step "5/6 编译检查（LGJ_NO_DEVICE：不签名、不连手机）"
    if ! $xb -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build >"$log" 2>&1; then
      tail -n 40 "$log" >&2
      fail "编译失败，完整记录在 $log"
    fi
    ok "编译通过"
    ok "已连接设备检测正常（当前：$(pick_device | cut -f 5)）"
    if [ "$MODE" = testflight ]; then
      if ! xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' \
        -archivePath "$root/ios/App/build/testflight/App-check.xcarchive" -derivedDataPath ios/App/build \
        CODE_SIGNING_ALLOWED=NO CURRENT_PROJECT_VERSION="$(date +%Y%m%d%H%M)" archive >"$log" 2>&1; then
        tail -n 40 "$log" >&2
        fail "正式版打包失败，完整记录在 $log"
      fi
      ok "正式版（Release）打包通过"
    fi
    printf '\n%s完成（未签名、未安装、未上传）。%s\n' "$G" "$N"
    return 0
  fi

  # ---------------------------------------------------------------- 团队 ID（签名）
  step "5/6 签名设置"
  local team="${LGJ_TEAM:-}"
  local local_cfg="$root/ios/local.xcconfig"
  if [ -z "$team" ] && [ -f "$local_cfg" ]; then
    team="$(sed -n 's/^DEVELOPMENT_TEAM *= *\([A-Z0-9]\{10\}\).*/\1/p' "$local_cfg" | head -n 1)"
  fi
  if [ -z "$team" ]; then
    team="$(detect_team || true)"
    [ -n "$team" ] && note "自动识别到你的开发者团队：$team"
  fi
  while ! printf '%s' "$team" | grep -Eq '^[A-Z0-9]{10}$'; do
    [ -n "$team" ] && warn "「${team}」不是有效的团队 ID（应为 10 位大写字母和数字）。"
    note "需要你的 Apple 开发者团队 ID：打开 https://developer.apple.com/account ，在「会员资格详细信息」（Membership details）里找到「团队 ID」（Team ID）。"
    ask "请粘贴团队 ID 后回车：" || fail "无法读取输入。" "请这样运行：LGJ_TEAM=你的团队ID bash scripts/ios-try.sh"
    team="$(printf '%s' "$REPLY" | tr -d '[:space:]' | tr '[:lower:]' '[:upper:]')"
  done
  printf '// 本机签名设置（由 scripts/ios-try.sh 生成，不提交到仓库）\nDEVELOPMENT_TEAM = %s\n' "$team" >"$local_cfg"
  ok "团队 ID：${team}（已保存，下次不用再填）"

  if [ "$MODE" = testflight ]; then
    upload_testflight "$root" "$team" "$log"
    return 0
  fi

  # ---------------------------------------------------------------- 找 iPhone
  step "6/6 连接 iPhone、安装并打开"
  local info="" waited=0 told="" paired_try=""
  while :; do
    info="$(pick_device)" || info="none"
    local state="${info%%$'\t'*}"
    if [ "$state" = "unpaired" ] && [ -z "$paired_try" ]; then
      paired_try=1
      local rest0="${info#*$'\t'}"; rest0="${rest0#*$'\t'}"
      # 在后台发起配对：iPhone 上会弹出「要信任此电脑吗？」
      ( xcrun devicectl manage pair --device "${rest0%%$'\t'*}" >/dev/null 2>&1 & ) || true
    fi
    if [ "$state" = "paired" ]; then
      local rest="${info#*$'\t'}"
      local devmode="${rest%%$'\t'*}"
      if [ "$devmode" = "disabled" ]; then
        if [ "$told" != "devmode" ]; then
          told="devmode"
          note "iPhone 需要打开「开发者模式」（只需一次）："
          note "  iPhone「设置」→「隐私与安全性」→ 拉到最下面「开发者模式」→ 打开 → 按提示重启 iPhone"
          note "  重启后解锁，在弹窗里点「打开」并输入锁屏密码。"
          note "正在等待…（按 Control+C 可以退出）"
        fi
      else
        break
      fi
    elif [ "$told" != "connect" ] && [ "$told" != "devmode" ]; then
      told="connect"
      note "请用数据线把 iPhone 连到这台 Mac，并保持 iPhone 解锁。"
      note "iPhone 上如果弹出「要信任此电脑吗？」，点「信任」并输入锁屏密码。"
      note "正在等待…（按 Control+C 可以退出）"
    fi
    sleep 3
    waited=$((waited + 3))
    [ "$waited" -lt 900 ] || fail "15 分钟内没有等到可用的 iPhone。"
  done
  local rest="${info#*$'\t'}"; rest="${rest#*$'\t'}"
  local udid="${rest%%$'\t'*}"; local name="${rest#*$'\t'}"
  ok "找到：$name"

  note "正在签名并编译（第一次大约 2–5 分钟）…"
  note "如果 Mac 弹窗要求输入电脑登录密码（钥匙串），请输入并点「始终允许」（Always Allow）。"
  if ! $xb -destination "id=$udid" -allowProvisioningUpdates -allowProvisioningDeviceRegistration DEVELOPMENT_TEAM="$team" build >"$log" 2>&1; then
    explain_build_failure "$log"
  fi
  ok "编译完成"

  local app_path="$root/ios/App/build/Build/Products/Debug-iphoneos/App.app"
  [ -d "$app_path" ] || fail "没找到编译出的 App（${app_path}）。" "完整记录在 $log"
  note "正在安装到 $name …"
  if ! xcrun devicectl device install app --device "$udid" "$app_path" >>"$log" 2>&1; then
    if grep -Eq '[Dd]eveloper [Mm]ode is disabled|developer disk image' "$log"; then
      fail "安装失败：iPhone 的「开发者模式」还没打开。" "iPhone「设置」→「隐私与安全性」→「开发者模式」→ 打开并重启，然后重新运行。"
    fi
    fail "安装失败。" "请确认 iPhone 已解锁、仍然连着数据线，然后重新运行。" "完整记录在 $log"
  fi
  ok "已安装"
  # 选项都要放在 bundle id 前面；锁屏时打不开，提示解锁后再试几次
  local tries=0 launched=""
  while [ "$tries" -lt 4 ]; do
    if xcrun devicectl device process launch --device "$udid" --terminate-existing "$BUNDLE_ID" >>"$log" 2>&1; then launched=1; break; fi
    tries=$((tries + 1))
    if grep -q 'explicitly trusted' "$log"; then
      warn "iPhone 需要信任这个开发者：「设置」→「通用」→「VPN与设备管理」→ 点你的开发者帐号 →「信任」。"
    else
      warn "iPhone 可能锁屏了，请解锁 iPhone…"
    fi
    [ "$tries" -lt 4 ] && sleep 5
  done
  if [ -n "$launched" ]; then
    ok "已在 iPhone 上打开「来感觉」"
  else
    warn "已装好，但没能自动打开：请在 iPhone 主屏幕上点「来感觉」图标。"
  fi
  printf '\n%s完成！%s以后想装最新版本，再运行同一条命令即可。\n\n' "$G" "$N"
}

# 打包正式版（Release）并上传到 App Store Connect，用的是 Xcode 里已登录的 Apple 帐号（不需要密钥 / 证书文件）
upload_testflight() {
  local root="$1" team="$2" log="$3"
  local dir="$root/ios/App/build/testflight"
  local build_no
  build_no="$(date +%Y%m%d%H%M)"   # 构建号必须越来越大：用「年月日时分」
  local archive="$dir/App-$build_no.xcarchive" opts="$dir/ExportOptions.plist"
  mkdir -p "$dir"
  cat >"$opts" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>upload</string>
  <key>teamID</key><string>$team</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
</dict>
</plist>
PLIST

  step "6/6 打包正式版并上传到 App Store Connect"
  note "正在打包正式版（构建号 ${build_no}，大约 3–8 分钟）…"
  note "如果 Mac 弹窗要求输入电脑登录密码（钥匙串），请输入并点「始终允许」（Always Allow）。"
  if ! xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' \
    -archivePath "$archive" -derivedDataPath ios/App/build -allowProvisioningUpdates \
    DEVELOPMENT_TEAM="$team" CURRENT_PROJECT_VERSION="$build_no" archive >"$log" 2>&1; then
    explain_build_failure "$log"
  fi
  ok "打包完成"

  note "正在上传（视网速 1–5 分钟）…"
  if ! xcodebuild -exportArchive -archivePath "$archive" -exportOptionsPlist "$opts" -exportPath "$dir/export-$build_no" \
    -allowProvisioningUpdates >>"$log" 2>&1; then
    explain_upload_failure "$log" "$archive"
  fi
  ok "已上传到 App Store Connect（构建号 ${build_no}）"
  printf '\n%s上传完成！%s接下来：\n' "$G" "$N"
  note "1. 等 10–30 分钟，Apple 处理完会给你发邮件（标题含 has completed processing）。"
  note "2. 打开 https://appstoreconnect.apple.com → App →「来感觉」→ TestFlight，就能看到这个构建版本。"
  note "3. 按 docs/NATIVE_APP.md 第四节添加测试员或生成公开链接，发给别人即可。"
  note "以后改了内容想更新给大家，再运行一次同样的命令。"
  printf '\n'
}

# 上传失败时，按常见原因给出中文提示；都不对时提示用 Xcode 自带的上传窗口
explain_upload_failure() {
  local log="$1" archive="$2"
  printf '\n' >&2
  grep -Ei 'error|ITMS-' "$log" | tail -n 8 >&2 || tail -n 30 "$log" >&2
  if grep -Eiq 'No suitable application records' "$log"; then
    open "https://appstoreconnect.apple.com/apps" 2>/dev/null || true
    fail "App Store Connect 里还没有这个 App 的记录。" "已为你打开 App Store Connect：点「App」→ 左上角「+」→「新建 App」，套装 ID 选结尾是 ${BUNDLE_ID} 的那个，创建后重新运行。"
  elif grep -Eiq 'Failed to Use Accounts|No Accounts|session has expired|Unable to log in' "$log"; then
    open -a "${DEVELOPER_DIR%/Contents/Developer}" 2>/dev/null || true
    fail "Xcode 里的 Apple 帐号需要重新登录。" "已为你打开 Xcode：菜单栏「Xcode」→「Settings…」→「Accounts」，选中帐号重新输入密码（没有就点「+」登录），然后重新运行。"
  elif grep -Eiq 'PLA Update|License Agreement' "$log"; then
    open "https://appstoreconnect.apple.com/business" 2>/dev/null || true
    fail "有新的开发者协议需要同意。" "已为你打开 App Store Connect 的「商务」（Business）页：按提示同意所有协议，然后重新运行。"
  elif grep -Eiq 'ITMS-90189|Redundant Binary' "$log"; then
    fail "这个构建号已经上传过了。" "等一分钟后重新运行即可（每次会自动用新的构建号）。"
  elif grep -Eiq 'ITMS-90186|ITMS-90062|closed for new build' "$log"; then
    fail "1.0 版本已经提交 / 上架，需要先把版本号调高（例如 1.1）才能继续上传。" "请把这个信息告诉开发同事或 Claude。"
  fi
  open "$archive" 2>/dev/null || true
  fail "上传没有成功，完整记录在 $log" \
    "也可以用 Xcode 自带的上传窗口：已为你在 Xcode 的 Organizer 里打开刚打好的包，点「Distribute App」→「TestFlight & App Store」→「Distribute」。" \
    "仍不行的话，把记录文件发给开发同事或 Claude 看。"
}

# 从已连接设备里挑一台真机（排除 Xcode 26 起也会列出的模拟器），优先用数据线连着的。
# 输出：配对状态<TAB>开发者模式<TAB>UDID<TAB>名称；没有则输出 none
pick_device() {
  devices_json | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      let list = [];
      try { list = JSON.parse(s).result.devices || []; } catch { }
      const rows = [];
      for (const x of list) {
        const P = x.properties || {}, ph = P.hardware || {}, pc = P.connection || {}, ps = P.state || {};
        const hp = x.hardwareProperties || {}, cp = x.connectionProperties || {}, dp = x.deviceProperties || {};
        const reality = hp.reality || ph.reality || "";
        const transport = cp.transportType || pc.transportType || "";
        if (reality === "simulated" || x.visibilityClass === "simulators" || transport === "sameMachine") continue;
        const platform = hp.platform || ph.platform || "", type = hp.deviceType || ph.deviceType || "";
        if (platform !== "iOS" && !["iPhone", "iPad", "iPod"].includes(type)) continue;
        const udid = hp.udid || ph.udid || "";
        if (!udid) continue;
        let dev = dp.developerModeStatus || ps.developerModeStatus || "";
        if (dev && typeof dev === "object") dev = Object.keys(dev)[0] || "";
        rows.push({ udid, transport, pairing: cp.pairingState || pc.pairingState || "", dev: String(dev), name: String(dp.name || ps.name || ph.marketingName || "iPhone"), type });
      }
      const rank = (r) => (r.transport === "wired" ? 0 : 2) + (r.type === "iPhone" ? 0 : 1);
      rows.sort((a, b) => rank(a) - rank(b));
      const r = rows[0];
      if (!r) return console.log("none");
      console.log([r.pairing === "paired" ? "paired" : "unpaired", r.dev || "unknown", r.udid, r.name.replace(/\s+/g, " ")].join("\t"));
    });'
}

# 已连接设备列表（devicectl 的 JSON），失败时输出空对象
devices_json() {
  local tmp
  tmp="$(mktemp "${TMPDIR:-/tmp}/lgj-devices.XXXXXX")"
  if xcrun devicectl list devices --json-output "$tmp" >/dev/null 2>&1; then cat "$tmp"; else echo '{}'; fi
  rm -f "$tmp"
}

# 从 Xcode 已登录的帐户里找付费开发者团队（排除免费的 Personal Team）；找到唯一一个时输出它
detect_team() {
  local tmp key json=""
  tmp="$(mktemp "${TMPDIR:-/tmp}/lgj-xcode.XXXXXX")"
  if defaults export com.apple.dt.Xcode "$tmp" 2>/dev/null; then
    # 只取团队这一段转成 JSON（整份偏好里有日期等类型，整体转 JSON 会失败）
    local part
    for key in IDEProvisioningTeamByIdentifier IDEProvisioningTeams; do
      part="$(plutil -extract "$key" json -o - "$tmp" 2>/dev/null || true)"
      [ -n "$part" ] && json="${json}${part}"$'\n'
    done
  fi
  rm -f "$tmp"
  [ -n "$json" ] || return 1
  printf '%s' "$json" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const ids = new Set();
      for (const line of s.split("\n")) {
        try {
          for (const teams of Object.values(JSON.parse(line) || {})) {
            for (const t of [].concat(teams || [])) {
              const free = t && (t.isFreeProvisioningTeam === true || t.isFreeProvisioningTeam === 1 || /personal team/i.test((t.teamName || "") + " " + (t.teamType || "")));
              if (t && /^[A-Z0-9]{10}$/.test(t.teamID || "") && !free) ids.add(t.teamID);
            }
          }
        } catch { }
      }
      if (ids.size === 1) console.log([...ids][0]); else process.exit(1);
    });'
}

# 编译失败时，按常见原因给出中文提示
explain_build_failure() {
  local log="$1"
  local xcode_app="${DEVELOPER_DIR%/Contents/Developer}"
  local accounts="Xcode 菜单栏「Xcode」→「Settings…」→「Accounts」（新版叫「Apple Accounts」）"
  printf '\n' >&2
  grep -Ei 'error:|requires a development team|no accounts?|no profiles' "$log" | tail -n 8 >&2 || tail -n 30 "$log" >&2
  if grep -Eiq 'No Accounts|No Account for Team' "$log"; then
    open -a "$xcode_app" 2>/dev/null || true
    fail "Xcode 里没有登录能用这个团队的 Apple 帐号。" "已为你打开 Xcode：${accounts} → 左下角「+」→「Apple ID」，登录你的付费开发者帐号。" "如果团队 ID 填错了：删除 ~/laiganjue/ios/local.xcconfig 后重新运行，会重新询问。"
  elif grep -Eiq 'requires a development team' "$log"; then
    fail "没有拿到团队 ID。" "删除 ~/laiganjue/ios/local.xcconfig 后重新运行，按提示粘贴团队 ID。"
  elif grep -Eiq 'Unable to log in|session has expired|login details' "$log"; then
    open -a "$xcode_app" 2>/dev/null || true
    fail "Xcode 里的 Apple 帐号登录已过期。" "已为你打开 Xcode：${accounts} → 选中你的帐号重新输入密码，然后重新运行。"
  elif grep -Eiq 'PLA Update|License Agreement' "$log"; then
    open "https://developer.apple.com/account" 2>/dev/null || true
    fail "Apple 开发者网站上有新的协议需要同意。" "已为你打开 developer.apple.com/account：登录后按页面顶部的提示同意协议，然后重新运行。"
  elif grep -Eiq 'cannot be registered to your development team' "$log"; then
    fail "App 的包名（${BUNDLE_ID}）被其他团队占用了。" "请把这个信息告诉开发同事或 Claude，需要换一个包名。"
  elif grep -Eiq 'no devices from which|not registered' "$log"; then
    fail "这台 iPhone 还没加到你的开发者帐号里。" "请保持 iPhone 解锁并连着数据线，然后重新运行（脚本会自动登记设备）。"
  elif grep -Eiq 'is not installed|Download .*iOS|platform .* not installed|Unable to find a destination' "$log"; then
    open -a "$xcode_app" 2>/dev/null || true
    fail "Xcode 缺少 iOS 组件，或不认识这台 iPhone 的系统版本。" "已为你打开 Xcode：「Settings…」→「Components」里下载 iOS；如果 iPhone 系统比 Xcode 新，请在 App Store 更新 Xcode。"
  elif grep -Eiq 'developer mode' "$log"; then
    fail "iPhone 的「开发者模式」还没打开。" "iPhone「设置」→「隐私与安全性」→「开发者模式」→ 打开并重启，然后重新运行。"
  elif grep -Eiq 'locked|passcode' "$log"; then
    fail "iPhone 处于锁屏状态。" "请解锁 iPhone，然后重新运行。"
  elif grep -Eiq 'resolve package|Could not resolve|unable to access|timed out' "$log"; then
    fail "下载编译所需的组件失败。" "请检查网络（需要能访问 github.com）后重试。"
  fi
  fail "编译失败。" "完整记录在 $log" "可以把这个文件发给开发同事或 Claude 看。"
}

# LGJ_SOURCE_ONLY=1 时只加载函数（测试用）
[ "${LGJ_SOURCE_ONLY:-}" = 1 ] || main "$@" </dev/null
