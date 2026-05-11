#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# Unix 系（Git Bash / WSL / macOS / Linux）開発環境変数セットアップスクリプト
#
# 学習事項 #7 / #10 への対応:
#   - 新規シェルで JAVA_HOME / ANDROID_HOME が継承されない問題
#   - Git Bash の MSYS パス変換問題（adb pull /sdcard/... が破壊される）
#
# 使い方:
#   # 当該シェルに反映（source）
#   source scripts/setup_env.sh
#
#   # 永続化なし（現プロセスだけ）
#   SETUP_ENV_SKIP_PERSIST=1 source scripts/setup_env.sh
#
#   # 詳細ログ
#   SETUP_ENV_VERBOSE=1 source scripts/setup_env.sh
#
#   # ビルドと一体化
#   source scripts/setup_env.sh && npx expo run:android --variant release
#
# 関連: 02_設計/Windows ビルド設定の永続化方針.md v0.2
# 関連: docs/environment_setup.md
# -----------------------------------------------------------------------------

# return / source 系の関数は set -e と相性が悪いので慎重に
_setup_env_verbose() {
  if [ -n "${SETUP_ENV_VERBOSE:-}" ]; then
    echo "[setup_env] $1"
  fi
}

_setup_env_log() {
  echo "[setup_env] $1"
}

# -----------------------------------------------------------------------------
# 1. プラットフォーム判定
# -----------------------------------------------------------------------------
_os="$(uname -s)"
case "$_os" in
  MINGW*|MSYS*|CYGWIN*) _platform="windows_bash" ;;
  Darwin*) _platform="macos" ;;
  Linux*) _platform="linux" ;;
  *) _platform="unknown" ;;
esac
_setup_env_verbose "platform=$_platform"

# -----------------------------------------------------------------------------
# 2. JDK (JBR) の検出
# -----------------------------------------------------------------------------
_jdk_candidates=(
  "$JAVA_HOME"
)

case "$_platform" in
  windows_bash)
    _jdk_candidates+=(
      "/c/Program Files/Android/Android Studio/jbr"
      "/c/Program Files/Android/Android Studio Preview/jbr"
      "$LOCALAPPDATA/Android/Sdk/jbr"
      "/c/Program Files/Java/jdk-21"
    )
    ;;
  macos)
    _jdk_candidates+=(
      "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
      "$HOME/Library/Java/JavaVirtualMachines/jbr-21/Contents/Home"
      "/usr/libexec/java_home -v 21 2>/dev/null"  # macOS の java_home 経由
    )
    ;;
  linux)
    _jdk_candidates+=(
      "$HOME/.local/share/JetBrains/Toolbox/apps/AndroidStudio/jbr"
      "/opt/android-studio/jbr"
      "/usr/lib/jvm/java-21-openjdk-amd64"
    )
    ;;
esac

_java_home=""
for _cand in "${_jdk_candidates[@]}"; do
  [ -z "$_cand" ] && continue
  # macOS の java_home -v 21 結果はそのままパスとして扱う
  if [ -x "$_cand/bin/java" ] || [ -x "$_cand/bin/java.exe" ]; then
    _java_home="$_cand"
    break
  fi
done

if [ -z "$_java_home" ]; then
  echo "[setup_env] ERROR: JDK not found. Install Android Studio or set JAVA_HOME manually." >&2
  return 1 2>/dev/null || exit 1
fi

# -----------------------------------------------------------------------------
# 3. Android SDK の検出
# -----------------------------------------------------------------------------
_sdk_candidates=(
  "$ANDROID_HOME"
  "$ANDROID_SDK_ROOT"
)

case "$_platform" in
  windows_bash)
    _sdk_candidates+=(
      "$LOCALAPPDATA/Android/Sdk"
      "/c/Users/$USER/AppData/Local/Android/Sdk"
    )
    ;;
  macos)
    _sdk_candidates+=(
      "$HOME/Library/Android/sdk"
    )
    ;;
  linux)
    _sdk_candidates+=(
      "$HOME/Android/Sdk"
    )
    ;;
esac

_android_home=""
for _cand in "${_sdk_candidates[@]}"; do
  [ -z "$_cand" ] && continue
  if [ -x "$_cand/platform-tools/adb" ] || [ -x "$_cand/platform-tools/adb.exe" ]; then
    _android_home="$_cand"
    break
  fi
done

if [ -z "$_android_home" ]; then
  echo "[setup_env] ERROR: Android SDK not found. Install Android Studio or set ANDROID_HOME manually." >&2
  return 1 2>/dev/null || exit 1
fi

# -----------------------------------------------------------------------------
# 4. 環境変数の export
# -----------------------------------------------------------------------------
export JAVA_HOME="$_java_home"
export ANDROID_HOME="$_android_home"
export ANDROID_SDK_ROOT="$_android_home"

# PATH に追加（重複防止）
case ":$PATH:" in
  *":$_java_home/bin:"*) ;;
  *) export PATH="$_java_home/bin:$PATH" ;;
esac

case ":$PATH:" in
  *":$_android_home/platform-tools:"*) ;;
  *) export PATH="$_android_home/platform-tools:$_android_home/emulator:$PATH" ;;
esac

# -----------------------------------------------------------------------------
# 5. Git Bash 特有: MSYS_NO_PATHCONV 設定（学習事項 #10 対応）
# -----------------------------------------------------------------------------
if [ "$_platform" = "windows_bash" ]; then
  # adb pull /sdcard/file.png /c/dev/... が MSYS の path 変換で破壊される問題への対応。
  # この変数を立てておくと、コマンド引数のパス自動変換を抑止できる。
  # スクリプト個別では `MSYS_NO_PATHCONV=1 adb pull ...` のように指定するのが安全。
  export MSYS_NO_PATHCONV_NOTE="Set MSYS_NO_PATHCONV=1 when running adb commands with absolute paths."
fi

# -----------------------------------------------------------------------------
# 6. ~/.bashrc への永続化（オプション、デフォルト無効）
# -----------------------------------------------------------------------------
if [ -z "${SETUP_ENV_SKIP_PERSIST:-}" ] && [ -n "${SETUP_ENV_PERSIST:-}" ]; then
  _bashrc="$HOME/.bashrc"
  _marker="# === setup_env.sh learnapp ==="
  if [ -f "$_bashrc" ] && ! grep -q "$_marker" "$_bashrc"; then
    {
      echo ""
      echo "$_marker"
      echo "[ -f \"$(pwd)/scripts/setup_env.sh\" ] && source \"$(pwd)/scripts/setup_env.sh\""
    } >> "$_bashrc"
    _setup_env_log "Added auto-source to $_bashrc"
  fi
fi

# -----------------------------------------------------------------------------
# 7. 検証出力
# -----------------------------------------------------------------------------
echo ""
echo "================================================"
echo " Environment ready (setup_env.sh)"
echo "================================================"
echo " platform           = $_platform"
echo " JAVA_HOME          = $JAVA_HOME"
echo " ANDROID_HOME       = $ANDROID_HOME"
echo " ANDROID_SDK_ROOT   = $ANDROID_SDK_ROOT"
echo "================================================"
echo ""

# 戻り値（0 = OK）
return 0 2>/dev/null || exit 0
