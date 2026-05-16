/**
 * AdConsent UI (Phase D Sprint 4 完成) と UMP SDK / ATT の橋渡し。
 *
 * ADR-009 §2.2-2.5:
 *   - UMP SDK = 真の同意ソース、AsyncStorage = UI 用キャッシュ (片方向 sync)
 *   - 起動順序: UMP form → (iOS) ATT → SDK 初期化 → ad 配信開始
 *   - 子供向け 4 項目: tagForChildDirectedTreatment / tagForUnderAgeOfConsent / maxAdContentRating / requestNonPersonalizedAdsOnly
 */

import { Platform } from 'react-native';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import mobileAds, {
  AdsConsent,
  AdsConsentDebugGeography,
  AdsConsentStatus,
  MaxAdContentRating,
} from 'react-native-google-mobile-ads';

import {
  loadAdConsentState,
  saveAdConsentState,
  type AdConsentState,
} from '../../screens/AdConsentScreen';
import { assertProductionAdUnitsConfigured } from './ad-unit-ids';

export interface InitializeAdsResult {
  /** SDK 初期化が完了したか (UMP 拒否時も完了扱い、非個人化のみ) */
  initialized: boolean;
  /** UMP form 表示後の最終 consent status (string enum) */
  consentStatus: AdsConsentStatus;
  /** 個人化広告を許可するか (false = 非個人化のみ) */
  personalizedAds: boolean;
  /** iOS ATT permission (Android では常に 'not-applicable') */
  trackingStatus: 'granted' | 'denied' | 'restricted' | 'undetermined' | 'not-applicable';
  /** AsyncStorage に書き込んだ AdConsentState (UMP 結果 sync) */
  storedState: AdConsentState;
}

/** UMP の同意状態を AdConsentState に変換 (ADR-009 §2.2 片方向 sync)。 */
function umpStatusToConsentState(
  status: AdsConsentStatus,
  preferred: AdConsentState | null,
): AdConsentState {
  // 'no-ads' は Phase E 未対応 (disabled UI)、UMP からは到達しない想定だが保護
  if (preferred === 'no-ads') return 'no-ads';
  if (status === AdsConsentStatus.OBTAINED) {
    return preferred ?? 'personalized';
  }
  return 'non-personalized';
}

/** iOS 14+ で ATT permission を取得。Android では skip。 */
async function requestTrackingPermissionIfNeeded(): Promise<
  InitializeAdsResult['trackingStatus']
> {
  if (Platform.OS !== 'ios') return 'not-applicable';
  try {
    const { status } = await requestTrackingPermissionsAsync();
    return status as InitializeAdsResult['trackingStatus'];
  } catch (error) {
    console.warn('[ads.consent-bridge] ATT request failed', error);
    return 'undetermined';
  }
}

/** 子供向け配慮 4 項目を AdMob SDK に適用 (ADR-009 §2.5)。 */
async function applyChildSafeConfiguration(): Promise<void> {
  await mobileAds().setRequestConfiguration({
    maxAdContentRating: MaxAdContentRating.G,
    tagForChildDirectedTreatment: false,
    tagForUnderAgeOfConsent: true,
    testDeviceIdentifiers: [],
  });
}

/**
 * アプリ起動時に 1 回呼び出し。UMP → (iOS) ATT → SDK 初期化の順で実行。
 *
 * AdConsent UI の AsyncStorage 値を 'preferred' として読み込み、UMP 結果と合成して再保存。
 * 同意未取得 (`status=REQUIRED`) なら form を自動表示。
 *
 * SDK 初期化失敗時も例外は投げず、result.initialized=false でアプリ続行 (ADR-009 AD9-R2)。
 */
export async function initializeAdsWithConsent(): Promise<InitializeAdsResult> {
  const preferred = await loadAdConsentState();

  let consentStatus: AdsConsentStatus = AdsConsentStatus.UNKNOWN;
  try {
    const info = await AdsConsent.requestInfoUpdate({
      debugGeography: __DEV__
        ? AdsConsentDebugGeography.EEA
        : AdsConsentDebugGeography.DISABLED,
      tagForUnderAgeOfConsent: true,
      testDeviceIdentifiers: [],
    });
    consentStatus = info.status;

    if (info.status === AdsConsentStatus.REQUIRED) {
      const formResult = await AdsConsent.loadAndShowConsentFormIfRequired();
      consentStatus = formResult.status;
    }
  } catch (error) {
    console.warn('[ads.consent-bridge] UMP requestInfoUpdate failed', error);
  }

  const trackingStatus = await requestTrackingPermissionIfNeeded();

  // 子供向け 4 項目を初期化前に適用
  let initialized = false;
  try {
    await applyChildSafeConfiguration();
    await mobileAds().initialize();
    initialized = true;
  } catch (error) {
    console.error('[ads.consent-bridge] SDK initialization failed', error);
  }

  assertProductionAdUnitsConfigured();

  const storedState = umpStatusToConsentState(consentStatus, preferred);
  if (storedState !== preferred) {
    await saveAdConsentState(storedState);
  }

  const personalizedAds =
    consentStatus === AdsConsentStatus.OBTAINED && storedState === 'personalized';

  return {
    initialized,
    consentStatus,
    personalizedAds,
    trackingStatus,
    storedState,
  };
}

/**
 * 設定画面 (SET-01) や AdConsentScreen から呼び出す UMP form 再表示。
 * 結果を AsyncStorage に反映。
 */
export async function reshowConsentForm(): Promise<AdConsentState> {
  try {
    await AdsConsent.showPrivacyOptionsForm();
  } catch (error) {
    console.warn('[ads.consent-bridge] showPrivacyOptionsForm failed', error);
  }
  const { status } = await AdsConsent.getConsentInfo();
  const preferred = await loadAdConsentState();
  const next = umpStatusToConsentState(status, preferred);
  await saveAdConsentState(next);
  return next;
}

/**
 * 「広告を表示しない」(no-ads) 選択は Phase E では disabled UI のため UMP に反映する経路はないが、
 * 将来的な subscription 経由の non-ad 切替で使う helper を export しておく。
 */
export async function applyConsentChoice(state: AdConsentState): Promise<void> {
  await saveAdConsentState(state);
  if (state === 'no-ads') {
    // ad 配信を全停止 (将来 RevenueCat 連動で再判断)。SDK は無効化できないため
    // バナー / インタースティシャル component 側で hide する。
    return;
  }
  // SDK に non-personalized 強制設定 (cookie 設定の即時反映)
  try {
    await mobileAds().setRequestConfiguration({
      maxAdContentRating: MaxAdContentRating.G,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: true,
    });
  } catch (error) {
    console.warn('[ads.consent-bridge] applyConsentChoice failed', error);
  }
}
