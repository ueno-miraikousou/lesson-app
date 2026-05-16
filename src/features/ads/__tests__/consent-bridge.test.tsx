/**
 * consent-bridge.ts integration tests (Phase E Sprint 1 E1-T02/T03/T05)。
 *
 * カバー範囲:
 *   - initializeAdsWithConsent: NOT_REQUIRED / REQUIRED→OBTAINED / failure 系
 *   - 子供向け 4 項目 setRequestConfiguration が呼ばれる
 *   - AsyncStorage への片方向 sync (UMP 結果 → AdConsentState)
 *   - reshowConsentForm: form 表示 + AsyncStorage 反映
 *   - applyConsentChoice: 'no-ads' で SDK 呼び出しスキップ
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import mobileAds, {
  AdsConsent,
  MaxAdContentRating,
} from 'react-native-google-mobile-ads';

import {
  applyConsentChoice,
  initializeAdsWithConsent,
  reshowConsentForm,
} from '../consent-bridge';

describe('consent-bridge', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  describe('initializeAdsWithConsent', () => {
    it('NOT_REQUIRED 経路で SDK 初期化 + AsyncStorage = non-personalized', async () => {
      (AdsConsent.requestInfoUpdate as jest.Mock).mockResolvedValueOnce({
        status: 'NOT_REQUIRED',
        isConsentFormAvailable: false,
      });

      const result = await initializeAdsWithConsent();

      expect(result.initialized).toBe(true);
      expect(result.consentStatus).toBe('NOT_REQUIRED');
      expect(result.personalizedAds).toBe(false);
      expect(result.storedState).toBe('non-personalized');
      expect(mobileAds().initialize).toHaveBeenCalled();
      expect(mobileAds().setRequestConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({
          maxAdContentRating: MaxAdContentRating.G,
          tagForChildDirectedTreatment: false,
          tagForUnderAgeOfConsent: true,
        }),
      );
      const stored = await AsyncStorage.getItem('ad_consent_state');
      expect(stored).toBe('non-personalized');
    });

    it('REQUIRED → OBTAINED で form 表示し、preferred=personalized なら personalized 維持', async () => {
      await AsyncStorage.setItem('ad_consent_state', 'personalized');
      (AdsConsent.requestInfoUpdate as jest.Mock).mockResolvedValueOnce({
        status: 'REQUIRED',
        isConsentFormAvailable: true,
      });
      (AdsConsent.loadAndShowConsentFormIfRequired as jest.Mock).mockResolvedValueOnce({
        status: 'OBTAINED',
      });

      const result = await initializeAdsWithConsent();

      expect(result.consentStatus).toBe('OBTAINED');
      expect(result.personalizedAds).toBe(true);
      expect(result.storedState).toBe('personalized');
      expect(AdsConsent.loadAndShowConsentFormIfRequired).toHaveBeenCalled();
    });

    it('UMP 失敗時も SDK 初期化を続行 (例外を握りつぶす)', async () => {
      (AdsConsent.requestInfoUpdate as jest.Mock).mockRejectedValueOnce(new Error('network'));

      const result = await initializeAdsWithConsent();

      expect(result.initialized).toBe(true);
      expect(result.consentStatus).toBe('UNKNOWN');
      expect(result.storedState).toBe('non-personalized');
    });

    it('SDK 初期化失敗時も例外を投げず result.initialized=false', async () => {
      (mobileAds().initialize as jest.Mock).mockRejectedValueOnce(new Error('init failed'));

      const result = await initializeAdsWithConsent();

      expect(result.initialized).toBe(false);
    });

    it("preferred='no-ads' は OBTAINED でも保護される (UMP 経由でも no-ads 維持)", async () => {
      await AsyncStorage.setItem('ad_consent_state', 'no-ads');
      (AdsConsent.requestInfoUpdate as jest.Mock).mockResolvedValueOnce({
        status: 'OBTAINED',
        isConsentFormAvailable: false,
      });

      const result = await initializeAdsWithConsent();

      expect(result.storedState).toBe('no-ads');
      expect(result.personalizedAds).toBe(false);
    });

    it('iOS の場合は ATT permission を要求 (Android では skip)', async () => {
      const original = Platform.OS;
      Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
      try {
        await initializeAdsWithConsent();
        expect(requestTrackingPermissionsAsync).toHaveBeenCalled();
      } finally {
        Object.defineProperty(Platform, 'OS', { configurable: true, get: () => original });
      }
    });
  });

  describe('reshowConsentForm', () => {
    it('showPrivacyOptionsForm 呼出 + getConsentInfo で AsyncStorage 反映', async () => {
      (AdsConsent.getConsentInfo as jest.Mock).mockResolvedValueOnce({
        status: 'OBTAINED',
      });
      await AsyncStorage.setItem('ad_consent_state', 'non-personalized');

      const result = await reshowConsentForm();

      expect(AdsConsent.showPrivacyOptionsForm).toHaveBeenCalled();
      expect(AdsConsent.getConsentInfo).toHaveBeenCalled();
      // preferred=non-personalized なので OBTAINED でも non-personalized 維持
      expect(result).toBe('non-personalized');
    });

    it('preferred 未設定 + OBTAINED → personalized 既定', async () => {
      (AdsConsent.getConsentInfo as jest.Mock).mockResolvedValueOnce({
        status: 'OBTAINED',
      });

      const result = await reshowConsentForm();

      expect(result).toBe('personalized');
    });
  });

  describe('applyConsentChoice', () => {
    it("'no-ads' は AsyncStorage 保存のみ、setRequestConfiguration は呼ばない", async () => {
      await applyConsentChoice('no-ads');

      const stored = await AsyncStorage.getItem('ad_consent_state');
      expect(stored).toBe('no-ads');
      expect(mobileAds().setRequestConfiguration).not.toHaveBeenCalled();
    });

    it("'non-personalized' は SDK 設定も適用", async () => {
      await applyConsentChoice('non-personalized');

      const stored = await AsyncStorage.getItem('ad_consent_state');
      expect(stored).toBe('non-personalized');
      expect(mobileAds().setRequestConfiguration).toHaveBeenCalledWith(
        expect.objectContaining({
          tagForUnderAgeOfConsent: true,
          maxAdContentRating: MaxAdContentRating.G,
        }),
      );
    });
  });
});
