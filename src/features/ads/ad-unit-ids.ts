/**
 * AdMob App ID / Ad Unit ID の解決ロジック。
 *
 * ADR-009 §2.6 採用方針:
 *   - `EXPO_PUBLIC_ADMOB_TEST_MODE=true` (dev/CI) → SDK 内蔵 TestIds を使用
 *   - `false` (本番) → 環境変数の正規 ID を Platform 別に解決
 *   - 正規 ID 未設定の場合は TestIds に安全 fallback (本番では `assertProductionAdUnitsConfigured()` で起動時 fail)
 *
 * 学習事項 #18A: 機密 grep `ca-app-pub-` パターンで commit 前確認。
 * TestIds (`ca-app-pub-3940256099942544/...`) は Google 公開仕様で誤検出として除外。
 */

import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

/** Expo babel preset は `process.env.EXPO_PUBLIC_*` を inline 展開するため、
 * テストで env を差し替え可能にする目的で indirection 関数を export する。 */
export const adEnv = {
  testMode(): string | undefined {
    return process.env['EXPO_PUBLIC_ADMOB_TEST_MODE'];
  },
  bannerAndroid(): string | undefined {
    return process.env['EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_ANDROID'];
  },
  bannerIos(): string | undefined {
    return process.env['EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_IOS'];
  },
  interstitialAndroid(): string | undefined {
    return process.env['EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT_ID_ANDROID'];
  },
  interstitialIos(): string | undefined {
    return process.env['EXPO_PUBLIC_ADMOB_INTERSTITIAL_UNIT_ID_IOS'];
  },
};

/** EXPO_PUBLIC_ADMOB_TEST_MODE === 'true' なら Test ID 利用。本番ビルドでは明示的に 'false' を指定すること。 */
export function isAdMobTestMode(): boolean {
  return adEnv.testMode() === 'true';
}

function selectPlatformId(android: string | undefined, ios: string | undefined): string | undefined {
  return Platform.select({ android, ios });
}

export function getBannerAdUnitId(): string {
  if (isAdMobTestMode()) return TestIds.BANNER;
  const id = selectPlatformId(adEnv.bannerAndroid(), adEnv.bannerIos());
  return id ?? TestIds.BANNER;
}

export function getInterstitialAdUnitId(): string {
  if (isAdMobTestMode()) return TestIds.INTERSTITIAL;
  const id = selectPlatformId(adEnv.interstitialAndroid(), adEnv.interstitialIos());
  return id ?? TestIds.INTERSTITIAL;
}

/**
 * production ビルドで Test ID が紛れ込まないか起動時検査。
 * ADR-009 AD9-R6 リスク対策。検査結果は console.error にとどめ、アプリ起動は妨げない。
 */
export function assertProductionAdUnitsConfigured(): boolean {
  if (isAdMobTestMode()) return true; // dev/CI は常に OK
  const bannerId = getBannerAdUnitId();
  const interstitialId = getInterstitialAdUnitId();
  const isTest = (id: string) => id.includes('3940256099942544');
  if (isTest(bannerId) || isTest(interstitialId)) {
    console.error(
      '[AdMob] production build with TEST AdUnit IDs detected. ' +
        'Set EXPO_PUBLIC_ADMOB_BANNER_UNIT_ID_* env vars before EAS build.',
    );
    return false;
  }
  return true;
}
