<#
.SYNOPSIS
    Windows 開発環境変数セットアップスクリプト（PowerShell）

.DESCRIPTION
    JAVA_HOME / ANDROID_HOME / PATH を 3 系統で設定:
      1. 現プロセス内（即時反映、Claude Code の非対話 PowerShell 用）
      2. User scope（次回起動時から永続）
      3. 検証出力（ビルド前のヘルスチェック用）

    学習事項 #7 への対応:
        Claude Code から起動する PowerShell 非対話プロセスは User/Machine スコープの
        永続環境変数を継承しないことがある。そのため毎回プロセス先頭でこのスクリプトを
        dot-source する運用が必要。

    使い方:
        # 当該セッションに反映（dot-source）
        . .\scripts\setup_env.ps1

        # 永続化なし（現プロセスだけ）
        . .\scripts\setup_env.ps1 -SkipPersist

        # 詳細ログ
        . .\scripts\setup_env.ps1 -Verbose

        # ビルド呼び出しと一体化（例）
        . .\scripts\setup_env.ps1 ; npx expo run:android --variant release

.PARAMETER SkipPersist
    User scope への永続化をスキップし、現プロセスへの設定のみ行う。

.PARAMETER Verbose
    詳細ログを出力する。

.NOTES
    関連: 02_設計/Windows ビルド設定の永続化方針.md v0.2
    関連: docs/environment_setup.md
    対象 OS: Windows 10/11
#>
[CmdletBinding()]
param(
    [switch]$SkipPersist
)

$ErrorActionPreference = 'Stop'

# -------------------------------------------------------------------------
# 1. JDK (JBR) の検出
# -------------------------------------------------------------------------
# Android Studio 同梱の JBR (OpenJDK 21) を優先。社内事情で別 JDK を使う場合は
# 環境変数 JAVA_HOME を事前にセットしておけばこの検出をスキップする。
$candidates = @(
    $env:JAVA_HOME,                                                                 # 既存設定があれば最優先
    'C:\Program Files\Android\Android Studio\jbr',                                  # Android Studio Stable
    'C:\Program Files\Android\Android Studio Preview\jbr',                          # Android Studio Preview
    "$env:LOCALAPPDATA\Android\Sdk\jbr",                                            # ユーザーローカル設置
    'C:\Program Files\Java\jdk-21',                                                 # 手動インストール JDK 21
    'C:\Program Files\Eclipse Adoptium\jdk-21.0.0.0-hotspot'                        # Adoptium
)

$javaHome = $null
foreach ($cand in $candidates) {
    if ([string]::IsNullOrWhiteSpace($cand)) { continue }
    if (Test-Path "$cand\bin\java.exe") {
        $javaHome = $cand
        break
    }
}

if (-not $javaHome) {
    Write-Error "JDK (JBR) not found. Install Android Studio or set JAVA_HOME manually."
    exit 1
}

# -------------------------------------------------------------------------
# 2. Android SDK の検出
# -------------------------------------------------------------------------
$sdkCandidates = @(
    $env:ANDROID_HOME,
    $env:ANDROID_SDK_ROOT,
    "$env:LOCALAPPDATA\Android\Sdk"
)

$androidHome = $null
foreach ($cand in $sdkCandidates) {
    if ([string]::IsNullOrWhiteSpace($cand)) { continue }
    if (Test-Path "$cand\platform-tools\adb.exe") {
        $androidHome = $cand
        break
    }
}

if (-not $androidHome) {
    Write-Error "Android SDK not found. Install Android Studio or set ANDROID_HOME manually."
    exit 1
}

# -------------------------------------------------------------------------
# 3. 現プロセスへの設定（即時反映）
# -------------------------------------------------------------------------
$env:JAVA_HOME = $javaHome
$env:ANDROID_HOME = $androidHome
$env:ANDROID_SDK_ROOT = $androidHome  # 新しい慣習に合わせて両方セット

# PATH 先頭に JDK と platform-tools を追加（重複追加を避ける）
$pathPrefix = "$javaHome\bin;$androidHome\platform-tools;$androidHome\emulator;$androidHome\cmdline-tools\latest\bin"
if ($env:PATH -notlike "*$javaHome\bin*") {
    $env:PATH = "$pathPrefix;$env:PATH"
}

# -------------------------------------------------------------------------
# 4. User scope への永続化（次回シェル起動時から有効）
# -------------------------------------------------------------------------
if (-not $SkipPersist) {
    try {
        [Environment]::SetEnvironmentVariable('JAVA_HOME', $javaHome, 'User')
        [Environment]::SetEnvironmentVariable('ANDROID_HOME', $androidHome, 'User')
        [Environment]::SetEnvironmentVariable('ANDROID_SDK_ROOT', $androidHome, 'User')

        # User scope の PATH に追加（重複防止）
        $userPath = [Environment]::GetEnvironmentVariable('PATH', 'User')
        $needed = @("$javaHome\bin", "$androidHome\platform-tools", "$androidHome\emulator")
        foreach ($entry in $needed) {
            if ($userPath -notlike "*$entry*") {
                $userPath = "$entry;$userPath"
            }
        }
        [Environment]::SetEnvironmentVariable('PATH', $userPath, 'User')
        Write-Verbose "Persisted to User scope."
    } catch {
        Write-Warning "Failed to persist to User scope: $_"
        # 永続化失敗はビルド継続に影響しないので致命的扱いしない
    }
}

# -------------------------------------------------------------------------
# 5. 検証出力
# -------------------------------------------------------------------------
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " Environment ready (architect setup_env.ps1)" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host " JAVA_HOME          = $env:JAVA_HOME"
Write-Host " ANDROID_HOME       = $env:ANDROID_HOME"
Write-Host " ANDROID_SDK_ROOT   = $env:ANDROID_SDK_ROOT"
if ($SkipPersist) {
    Write-Host " Persisted          = (skipped)"
} else {
    Write-Host " Persisted          = User scope"
}
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# -------------------------------------------------------------------------
# 6. ヘルスチェック（戻り値 = $true/$false）
# -------------------------------------------------------------------------
$javaOk = (Test-Path "$javaHome\bin\java.exe")
$adbOk = (Test-Path "$androidHome\platform-tools\adb.exe")

if (-not $javaOk) {
    Write-Warning "java.exe not found under $javaHome\bin"
}
if (-not $adbOk) {
    Write-Warning "adb.exe not found under $androidHome\platform-tools"
}

return ($javaOk -and $adbOk)
