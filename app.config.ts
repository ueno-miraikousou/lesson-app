/**
 * Expo の動的設定。`.env` を読み込み、`extra` 経由でクライアントに公開キーのみ渡す。
 *
 * 設計原則:
 *   - Service Role Key は絶対に extra に入れない (サーバ専用)
 *   - 公開キー (anon key / AdMob App ID / Sentry DSN) のみクライアント配布
 *
 * 参照: 02_設計/mobile-engineer依頼書.md §5.2-3
 *      02_設計/mobile-engineer引継ぎサマリ.md §1.1, §5.5
 */

import 'dotenv/config';
import type { ExpoConfig, ConfigContext } from 'expo/config';

// 暫定: 正式名称確定時に置換
const APP_DISPLAY_NAME = '習い事管理アプリ';
const APP_SLUG = 'lesson-app';
const DEEPLINK_SCHEME = 'learnapp';
const ANDROID_APPLICATION_ID = 'com.miraikousou.lessonapp';
const IOS_BUNDLE_IDENTIFIER = 'com.miraikousou.lessonapp';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_DISPLAY_NAME,
  slug: APP_SLUG,
  scheme: DEEPLINK_SCHEME,
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light', // MVP第1弾はライトモードのみ (デザインシステム §11)
  newArchEnabled: true,        // ADR-001 v0.4 New Architecture 有効化
  jsEngine: 'hermes',
  icon: './assets/icon.png',
  splash: {
    image: './assets/splash.png',
    resizeMode: 'contain',
    backgroundColor: '#FFF8F5', // デザインシステム background
  },
  assetBundlePatterns: ['**/*'],
  android: {
    package: ANDROID_APPLICATION_ID,
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#FFF8F5',
    },
    permissions: [
      'NOTIFICATIONS',
      'POST_NOTIFICATIONS',
      'VIBRATE',
    ],
    blockedPermissions: [
      // 子供データ × プライバシー配慮: 不要な権限はブロックリストで明示
      'ACCESS_FINE_LOCATION',
      'ACCESS_COARSE_LOCATION',
      'CAMERA',
      'READ_CONTACTS',
    ],
  },
  ios: {
    bundleIdentifier: IOS_BUNDLE_IDENTIFIER,
    buildNumber: '1',
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSUserTrackingUsageDescription:
        'パーソナライズされた広告ではなく、お子様向けに配慮した広告を表示するために使用します。',
    },
  },
  plugins: [
    [
      'expo-router',
      {
        root: './src/app',
      },
    ],
    'expo-asset',
    'expo-secure-store',
    [
      'expo-notifications',
      {
        // アイコン・色は assets 準備後に有効化
        // icon: './assets/notification-icon.png',
        color: '#FF8FA3',
      },
    ],
    'expo-tracking-transparency',
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: process.env.ADMOB_ANDROID_APP_ID ?? 'ca-app-pub-3940256099942544~3347511713', // テスト ID
        iosAppId: process.env.ADMOB_IOS_APP_ID ?? 'ca-app-pub-3940256099942544~1458002511',         // テスト ID
        userTrackingUsageDescription:
          'パーソナライズされた広告ではなく、お子様向けに配慮した広告を表示するために使用します。',
        skAdNetworkItems: [
          'cstr6suwn9.skadnetwork',
          '4fzdc2evr5.skadnetwork',
        ],
      },
    ],
  ],
  experiments: {
    typedRoutes: false,
  },
  extra: {
    // クライアントに公開してもよいキーのみ
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    admobAndroidAppId: process.env.ADMOB_ANDROID_APP_ID ?? null,
    admobIosAppId: process.env.ADMOB_IOS_APP_ID ?? null,
    sentryDsn: process.env.SENTRY_DSN ?? null,
    appEnv: (process.env.APP_ENV as 'development' | 'preview' | 'production' | undefined) ?? 'development',
    // EAS 連動 (eas.json で更新)
    eas: {
      projectId: process.env.EAS_PROJECT_ID ?? '',
    },
  },
});
