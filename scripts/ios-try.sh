#!/bin/bash
# 来感觉 · 一条命令把 App 装到你的 iPhone 上（在 Mac 上运行）
#
# 用法：打开「终端」，粘贴下面一行回车（地址见 docs/NATIVE_APP.md）：
#   curl -fsSL https://raw.githubusercontent.com/PeytonLiuBruin/laiganjue/claude/ecstatic-allen-lh1flx/scripts/ios-try.sh | bash
# 已经下载了代码的话，在代码目录里运行：bash scripts/ios-try.sh
#
# 它会：检查 Xcode → 准备 Node.js（缺了就下载到用户目录，不需要管理员密码）→ 下载或更新代码
#      → 构建 → 找到用数据线连着的 iPhone → 签名、编译、安装并打开 App。
# 可选环境变量：
#   LGJ_DIR       代码放在哪里（默认 ~/laiganjue）
#   LGJ_BRANCH    使用哪个分支（默认见下方 DEFAULT_BRANCH）
#   LGJ_TEAM      Apple 开发者团队 ID（10 位，例如 ABCDE12345；不填会自动识别或询问）
#   LGJ_NO_DEVICE=1  只检查环境并编译，不连手机（自动化测试用）
#
# 兼容 macOS 自带的 bash 3.2；整个流程包在 main 里，网络中断导致脚本只下载一半时不会执行半截命令。

REPO_URL="https://github.com/PeytonLiuBruin/laiganjue.git"
DEFAULT_BRANCH="claude/ecstatic-allen-lh1flx"
BUNDLE_ID="io.github.peytonliubruin.laiganjue"
NODE_MAJOR=22

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

  printf '%s来感觉 · 装到 iPhone 上试用%s\n' "$B" "$N"
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
  local xv
  xv="$(xcodebuild -version 2>/dev/null | head -n 1 || true)"
  [ -n "$xv" ] || fail "Xcode 无法运行。" "请先手动打开一次 Xcode（在「应用程序」里），按提示点「同意」，等它装完组件后再试。"
  if ! xcodebuild -license check >/dev/null 2>&1; then
    open -a "${dev%/Contents/Developer}" 2>/dev/null || true
    fail "还没有同意 Xcode 的许可协议。" "已为你打开 Xcode：请在弹出的窗口里点「同意」（Agree），输入电脑密码，等它装完组件。"
  fi
  if ! xcodebuild -checkFirstLaunchStatus >/dev/null 2>&1; then
    open -a "${dev%/Contents/Developer}" 2>/dev/null || true
    fail "Xcode 还需要完成首次安装。" "已为你打开 Xcode：请按提示点「安装」（Install），完成后再试。"
  fi
  ok "${xv}（${dev%/Contents/Developer}）"

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
    local narch
    case "$(uname -m)" in arm64) narch=arm64 ;; x86_64) narch=x64 ;; *) fail "不认识这台 Mac 的处理器：$(uname -m)" ;; esac
    local found=""
    found="$(ls -d "$cache"/node-v"$NODE_MAJOR".*-darwin-"$narch" 2>/dev/null | tail -n 1 || true)"
    if [ -z "$found" ] || [ ! -x "$found/bin/node" ]; then
      note "电脑上没有合适的 Node.js，正在下载到 ${cache}（只给本工具用，不影响系统）…"
      mkdir -p "$cache"
      local base="https://nodejs.org/dist/latest-v$NODE_MAJOR.x"
      local sums file expected
      sums="$(curl -fsSL "$base/SHASUMS256.txt")" || fail "下载 Node.js 失败，请检查网络后重试。"
      file="$(printf '%s\n' "$sums" | awk -v s="-darwin-$narch.tar.gz" '{ if (substr($2, length($2) - length(s) + 1) == s) { print $2; exit } }')"
      expected="$(printf '%s\n' "$sums" | awk -v f="$file" '$2 == f { print $1; exit }')"
      [ -n "$file" ] && [ -n "$expected" ] || fail "找不到适合这台 Mac 的 Node.js 安装包。"
      curl -fL --progress-bar -o "$cache/$file" "$base/$file" || fail "下载 Node.js 失败，请检查网络后重试。"
      [ "$(shasum -a 256 "$cache/$file" | awk '{print $1}')" = "$expected" ] || { rm -f "$cache/$file"; fail "Node.js 安装包校验失败（可能下载不完整），请重试。"; }
      tar -xzf "$cache/$file" -C "$cache"
      rm -f "$cache/$file"
      found="$cache/${file%.tar.gz}"
    fi
    export PATH="$found/bin:$PATH"
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

  if [ -n "$NO_DEVICE" ]; then
    step "5/6 编译检查（LGJ_NO_DEVICE：不签名、不连手机）"
    if ! $xb -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO build >"$log" 2>&1; then
      tail -n 40 "$log" >&2
      fail "编译失败，完整记录在 $log"
    fi
    ok "编译通过"
    devices_json >/dev/null && ok "能读取已连接设备列表"
    printf '\n%s完成（未安装到手机）。%s\n' "$G" "$N"
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

  # ---------------------------------------------------------------- 找 iPhone
  step "6/6 连接 iPhone、安装并打开"
  local info="" waited=0 told=""
  while :; do
    info="$(devices_json | node -e '
      let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
        let list = [];
        try { list = JSON.parse(s).result.devices || []; } catch { }
        const phones = list.filter((d) => (d.hardwareProperties || {}).platform === "iOS");
        const pick = phones.find((d) => (d.connectionProperties || {}).pairingState === "paired" && (d.connectionProperties || {}).transportType === "wired")
          || phones.find((d) => (d.connectionProperties || {}).pairingState === "paired" && (d.connectionProperties || {}).tunnelState === "connected")
          || phones.find((d) => (d.connectionProperties || {}).transportType === "wired");
        if (!pick) return console.log("none");
        const c = pick.connectionProperties || {}, h = pick.hardwareProperties || {}, p = pick.deviceProperties || {};
        console.log([c.pairingState === "paired" ? "paired" : "unpaired", p.developerModeStatus || "unknown", pick.identifier, h.udid || "", (p.name || "iPhone").replace(/\t/g, " ")].join("\t"));
      });')" || info="none"
    local state="${info%%$'\t'*}"
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
  local core_id="${rest%%$'\t'*}"; rest="${rest#*$'\t'}"
  local udid="${rest%%$'\t'*}"; local name="${rest#*$'\t'}"
  ok "找到：$name"

  note "正在签名并编译（第一次大约 2–5 分钟）…"
  if ! $xb -destination "id=${udid:-$core_id}" -allowProvisioningUpdates -allowProvisioningDeviceRegistration build >"$log" 2>&1; then
    explain_build_failure "$log"
  fi
  ok "编译完成"

  local app_path="$root/ios/App/build/Build/Products/Debug-iphoneos/App.app"
  [ -d "$app_path" ] || fail "没找到编译出的 App（${app_path}）。" "完整记录在 $log"
  note "正在安装到 $name …"
  xcrun devicectl device install app --device "$core_id" "$app_path" >>"$log" 2>&1 \
    || fail "安装失败。" "请确认 iPhone 已解锁、仍然连着数据线，然后重试。" "完整记录在 $log"
  ok "已安装"
  if xcrun devicectl device process launch --terminate-existing --device "$core_id" "$BUNDLE_ID" >>"$log" 2>&1; then
    ok "已在 iPhone 上打开「来感觉」"
  else
    warn "已装好，但没能自动打开（iPhone 可能锁屏了）：请在 iPhone 主屏幕上点「来感觉」图标。"
  fi
  printf '\n%s完成！%s以后想装最新版本，再运行同一条命令即可。\n\n' "$G" "$N"
}

# 已连接设备列表（devicectl 的 JSON），失败时输出空对象
devices_json() {
  local tmp
  tmp="$(mktemp -t lgj-devices)"
  if xcrun devicectl list devices --json-output "$tmp" >/dev/null 2>&1; then cat "$tmp"; else echo '{}'; fi
  rm -f "$tmp"
}

# 从 Xcode 已登录的帐户里找付费开发者团队（排除免费的 Personal Team）；找到唯一一个时输出它
detect_team() {
  local raw
  raw="$(defaults export com.apple.dt.Xcode - 2>/dev/null)" || return 1
  printf '%s' "$raw" | plutil -convert json -o - - 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      let ids = new Set();
      try {
        const byAccount = JSON.parse(s).IDEProvisioningTeamByIdentifier || {};
        for (const teams of Object.values(byAccount)) {
          for (const t of teams || []) {
            if (t && /^[A-Z0-9]{10}$/.test(t.teamID || "") && !t.isFreeProvisioningTeam && !/personal/i.test(t.teamType || "")) ids.add(t.teamID);
          }
        }
      } catch { }
      if (ids.size === 1) console.log([...ids][0]); else process.exit(1);
    });'
}

# 编译失败时，按常见原因给出中文提示
explain_build_failure() {
  local log="$1"
  printf '\n' >&2
  grep -E 'error:|requires a development team|No Accounts|No profiles' "$log" | tail -n 8 >&2 || tail -n 30 "$log" >&2
  if grep -Eq 'No Accounts|No account for team|requires a development team|not logged in|Your session has expired' "$log"; then
    open -a "$DEVELOPER_DIR/../.." 2>/dev/null || true
    fail "Xcode 还没有登录你的 Apple 开发者帐号。" "已为你打开 Xcode：菜单「Xcode」→「设置…」（Settings）→「帐户」（Accounts）→ 左下角「+」→ Apple ID，登录你的开发者帐号。" "如果团队 ID 填错了，删除 ios/local.xcconfig 后重新运行。"
  elif grep -Eq 'is not installed|Download .*iOS|platform .* not installed|Unable to find a destination' "$log"; then
    fail "Xcode 缺少 iOS 组件。" "打开 Xcode →「设置…」→「组件」（Components），下载 iOS，然后重试。"
  elif grep -Eq '[Dd]eveloper [Mm]ode' "$log"; then
    fail "iPhone 的「开发者模式」还没打开。" "iPhone「设置」→「隐私与安全性」→「开发者模式」→ 打开并重启。"
  elif grep -Eq 'locked|passcode' "$log"; then
    fail "iPhone 处于锁屏状态。" "请解锁 iPhone，然后重新运行。"
  elif grep -Eq 'resolve package|Could not resolve|unable to access|timed out' "$log"; then
    fail "下载编译所需的组件失败。" "请检查网络（需要能访问 github.com）后重试。"
  fi
  fail "编译失败。" "完整记录在 $log" "可以把这个文件发给开发同事或 Claude 看。"
}

main "$@" </dev/null
