/**
 * Phase E AdMob SDK 統合の barrel export。
 * 内部参照は個別 path を使い、本 barrel は外部 (screens / components) からの利用に限定。
 */

export { useAds } from './use-ads';
export {
  initializeAdsWithConsent,
  reshowConsentForm,
  applyConsentChoice,
  type InitializeAdsResult,
} from './consent-bridge';
export {
  isAdMobTestMode,
  getBannerAdUnitId,
  getInterstitialAdUnitId,
  assertProductionAdUnitsConfigured,
} from './ad-unit-ids';
