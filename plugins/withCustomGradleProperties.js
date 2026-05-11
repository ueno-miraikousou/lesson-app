/**
 * withCustomGradleProperties
 *
 * Windows ビルド固有の Gradle プロパティを android/gradle.properties に冪等注入する Expo config plugin。
 * `npx expo prebuild --clean` で android/ が再生成されるたびに自動再適用される。
 *
 * 設定キー（注入対象）:
 *   - android.overridePathCheck=true
 *       上位フォルダに非 ASCII 文字（例: アプリ開発）が残っている場合の AGP 警告を抑止。
 *       現状の C:\dev\learnapp\ パスでは不要だが、別マシン（C:\Users\xxx\Desktop\アプリ開発 等）への
 *       移植時の保険として有効化。Windows 限定で発火、macOS/Linux では無害。
 *
 *   - reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64
 *       フル ABI を既定値に。開発時の短縮は環境変数 ORG_GRADLE_PROJECT_reactNativeArchitectures で上書き。
 *       expo-build-properties の buildArchs は GitHub Issue #38225 で「効かない」既知バグのため不使用。
 *
 *   - org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=512m
 *       Gradle JVM のヒープを 4GB に拡張。MVP 規模では 2GB でも動くが、prefab/CMake/Hermes 同時実行で
 *       OOM が散発するため 4GB を既定値に。
 *
 *   - org.gradle.workers.max=1
 *       Gradle ワーカーをシングルスレッド化。
 *       学習事項 #1 (jest-worker クラッシュ) / 学習事項 #9 (Windows DLL ロード問題) への二重防御。
 *       Metro の maxWorkers=1 (metro.config.js) と整合。
 *       trade-off: ビルド時間 +30〜60 秒。MVP では安定性優先。
 *
 *   - org.gradle.daemon=false
 *       Gradle daemon を無効化。
 *       学習事項 #4 STATUS_DLL_INIT_FAILED (gradle.exe 3221225794) の根本対処。
 *       daemon 起動時の Windows DLL ロード問題を構造的に回避。
 *       trade-off: ビルド起動 +5〜10 秒、累積で +20〜30 秒。安定性優先。
 *
 * 設計根拠: 02_設計/Windows ビルド設定の永続化方針.md v0.2 §2 案 α + §4 リスクマトリクス
 */
const { withGradleProperties } = require('@expo/config-plugins');

const DEFAULT_ABIS = 'armeabi-v7a,arm64-v8a,x86,x86_64';

const PROPERTIES = [
  { key: 'android.overridePathCheck', value: 'true' },
  { key: 'reactNativeArchitectures', value: DEFAULT_ABIS },
  { key: 'org.gradle.jvmargs', value: '-Xmx4g -XX:MaxMetaspaceSize=512m' },
  { key: 'org.gradle.workers.max', value: '1' },
  { key: 'org.gradle.daemon', value: 'false' },
];

/**
 * 既存プロパティがあれば値を更新、無ければ追加（冪等性確保）。
 * Expo SDK の gradle.properties は org.gradle.jvmargs 等を既に持っているため、
 * 単純 push だと重複行になる。findIndex で既存検出 → 値だけ上書き。
 */
const upsertProperty = (config, key, value) => {
  const idx = config.modResults.findIndex(
    (item) => item.type === 'property' && item.key === key,
  );
  if (idx >= 0) {
    config.modResults[idx].value = value;
  } else {
    config.modResults.push({ type: 'property', key, value });
  }
  return config;
};

module.exports = function withCustomGradleProperties(config) {
  return withGradleProperties(config, (cfg) => {
    for (const { key, value } of PROPERTIES) {
      upsertProperty(cfg, key, value);
    }
    return cfg;
  });
};
