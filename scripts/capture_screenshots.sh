#!/usr/bin/env bash
# scripts/capture_screenshots.sh
# Phase B 動作確認 + screenshot 取得ヘルパー (mobile-engineer-3, 2026-05-12)
#
# 使い方:
#   bash scripts/capture_screenshots.sh init        # adb / emulator / APK パス事前確認
#   bash scripts/capture_screenshots.sh install     # APK install + 起動
#   bash scripts/capture_screenshots.sh shot NAME   # 現状の画面を <NAME>.png として保存
#   bash scripts/capture_screenshots.sh list        # 取得済 screenshot 一覧
#
# 保存先: ./screenshots/
# 端末側一時パス: /sdcard/screen.png
#
# 完全性ガイドライン (社長指示):
#   01_auth.png            … AUTH-04 / 起動初画面
#   02_wizard_celebration  … 紙吹雪エフェクト発火中の瞬間
#   03_lessons_list        … 複数の習い事が登録された一覧 (空 list 回避)
#   04_wizard_reduced (任意) … Reduce Motion ON の比較

set -o pipefail

export ANDROID_HOME="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"
export PATH="$ANDROID_HOME/platform-tools:$PATH"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_ROOT="$(dirname "$SCRIPT_DIR")"
SHOT_DIR="$APP_ROOT/screenshots"
APK_PATH="$APP_ROOT/android/app/build/outputs/apk/release/app-release.apk"
PKG="com.miraikousou.lessonapp"
MAIN_ACT="$PKG/.MainActivity"

mkdir -p "$SHOT_DIR"

cmd="${1:-help}"

case "$cmd" in
  init)
    echo "=== ENV ==="
    echo "ANDROID_HOME: $ANDROID_HOME"
    which adb
    echo
    echo "=== Devices ==="
    adb devices
    echo
    echo "=== APK ==="
    if [[ -f "$APK_PATH" ]]; then
      ls -la "$APK_PATH"
      echo "APK size: $(stat -c '%s' "$APK_PATH" 2>/dev/null || stat -f '%z' "$APK_PATH") bytes"
    else
      echo "APK NOT FOUND at $APK_PATH (build #14 not complete yet?)"
    fi
    echo
    echo "=== Package check ==="
    adb shell pm list packages | grep -i miraikousou || echo "package not installed yet"
    ;;

  install)
    if [[ ! -f "$APK_PATH" ]]; then
      echo "ERROR: APK not found at $APK_PATH" >&2
      exit 1
    fi
    echo "Uninstalling previous version (ignore error if absent)..."
    adb uninstall "$PKG" 2>&1 | tail -1
    echo "Installing $APK_PATH..."
    adb install -r "$APK_PATH"
    EC=$?
    if [[ $EC -ne 0 ]]; then
      echo "ERROR: install failed (exit=$EC)" >&2
      exit $EC
    fi
    echo "Launching $MAIN_ACT..."
    adb shell am start -n "$MAIN_ACT"
    echo "Install + launch done."
    ;;

  shot)
    NAME="${2:-screenshot_$(date +%H%M%S)}"
    OUT="$SHOT_DIR/${NAME}.png"
    OUT_WIN="$(cygpath -w "$OUT" 2>/dev/null || echo "$OUT")"
    echo "Capturing screen → $OUT"
    MSYS_NO_PATHCONV=1 adb shell "screencap -p /sdcard/screen.png" || { echo "screencap failed" >&2; exit 1; }
    MSYS_NO_PATHCONV=1 adb pull /sdcard/screen.png "$OUT_WIN" || { echo "pull failed" >&2; exit 1; }
    MSYS_NO_PATHCONV=1 adb shell "rm /sdcard/screen.png" 2>/dev/null
    ls -la "$OUT"
    ;;

  list)
    echo "=== $SHOT_DIR ==="
    ls -la "$SHOT_DIR" 2>/dev/null || echo "(empty)"
    ;;

  help|*)
    echo "Usage:"
    echo "  bash scripts/capture_screenshots.sh init"
    echo "  bash scripts/capture_screenshots.sh install"
    echo "  bash scripts/capture_screenshots.sh shot <name>"
    echo "  bash scripts/capture_screenshots.sh list"
    ;;
esac
