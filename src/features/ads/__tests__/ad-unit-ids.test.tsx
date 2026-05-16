/**
 * ad-unit-ids.ts unit tests (Phase E Sprint 1 E1-T01)。
 *
 * カバー範囲:
 *   - isAdMobTestMode: env var 真偽判定
 *   - getBannerAdUnitId / getInterstitialAdUnitId: TestIds fallback + Platform select
 *   - assertProductionAdUnitsConfigured: production で Test ID 検出時 false
 */

import { Platform } from 'react-native';
import { TestIds } from 'react-native-google-mobile-ads';

import {
  adEnv,
  assertProductionAdUnitsConfigured,
  getBannerAdUnitId,
  getInterstitialAdUnitId,
  isAdMobTestMode,
} from '../ad-unit-ids';

/** jest-expo の Platform.select は OS 依存。OS を defineProperty で書換えても select 内部参照が
 * 反映されない可能性があるため、select を直接 spy + 上書きする helper。 */
function withPlatformOS<T>(os: 'ios' | 'android', fn: () => T): T {
  const originalOS = Platform.OS;
  const originalSelect = Platform.select;
  Object.defineProperty(Platform, 'OS', { configurable: true, get: () => os });
  Platform.select = ((spec: Record<string, unknown>) => {
    if (os in spec) return spec[os];
    if ('default' in spec) return spec.default;
    return undefined;
  }) as typeof Platform.select;
  try {
    return fn();
  } finally {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOS });
    Platform.select = originalSelect;
  }
}

interface EnvFixture {
  testMode?: string;
  bannerAndroid?: string;
  bannerIos?: string;
  interstitialAndroid?: string;
  interstitialIos?: string;
}

function setupAdEnv(fixture: EnvFixture = {}) {
  jest.spyOn(adEnv, 'testMode').mockReturnValue(fixture.testMode);
  jest.spyOn(adEnv, 'bannerAndroid').mockReturnValue(fixture.bannerAndroid);
  jest.spyOn(adEnv, 'bannerIos').mockReturnValue(fixture.bannerIos);
  jest.spyOn(adEnv, 'interstitialAndroid').mockReturnValue(fixture.interstitialAndroid);
  jest.spyOn(adEnv, 'interstitialIos').mockReturnValue(fixture.interstitialIos);
}

describe('ad-unit-ids', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('isAdMobTestMode', () => {
    it("EXPO_PUBLIC_ADMOB_TEST_MODE='true' で true", () => {
      setupAdEnv({ testMode: 'true' });
      expect(isAdMobTestMode()).toBe(true);
    });

    it("'false' で false", () => {
      setupAdEnv({ testMode: 'false' });
      expect(isAdMobTestMode()).toBe(false);
    });

    it('未設定で false (本番安全側)', () => {
      setupAdEnv({});
      expect(isAdMobTestMode()).toBe(false);
    });
  });

  describe('getBannerAdUnitId', () => {
    it('test mode で TestIds.BANNER', () => {
      setupAdEnv({ testMode: 'true' });
      expect(getBannerAdUnitId()).toBe(TestIds.BANNER);
    });

    it('production + Android 値あり → Android 値', () => {
      setupAdEnv({
        testMode: 'false',
        bannerAndroid: 'ca-app-pub-XXXXXXXXXXXXXXXX/1111111111',
        bannerIos: 'ca-app-pub-XXXXXXXXXXXXXXXX/2222222222',
      });
      withPlatformOS('android', () => {
        expect(getBannerAdUnitId()).toBe('ca-app-pub-XXXXXXXXXXXXXXXX/1111111111');
      });
    });

    it('production + 環境変数未設定 → TestIds.BANNER に安全 fallback', () => {
      setupAdEnv({ testMode: 'false' });
      expect(getBannerAdUnitId()).toBe(TestIds.BANNER);
    });
  });

  describe('getInterstitialAdUnitId', () => {
    it('test mode で TestIds.INTERSTITIAL', () => {
      setupAdEnv({ testMode: 'true' });
      expect(getInterstitialAdUnitId()).toBe(TestIds.INTERSTITIAL);
    });

    it('production + iOS 値あり → iOS 値', () => {
      setupAdEnv({
        testMode: 'false',
        interstitialIos: 'ca-app-pub-XXXXXXXXXXXXXXXX/3333333333',
      });
      withPlatformOS('ios', () => {
        expect(getInterstitialAdUnitId()).toBe('ca-app-pub-XXXXXXXXXXXXXXXX/3333333333');
      });
    });
  });

  describe('assertProductionAdUnitsConfigured', () => {
    it('test mode は常に true', () => {
      setupAdEnv({ testMode: 'true' });
      expect(assertProductionAdUnitsConfigured()).toBe(true);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('production + Test ID 紛れ込み → false + console.error', () => {
      setupAdEnv({ testMode: 'false' });
      // env 未設定で TestIds fallback → Test ID が混入
      expect(assertProductionAdUnitsConfigured()).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('production build with TEST AdUnit IDs'),
      );
    });

    it('production + 正規 ID 全 platform → true', () => {
      setupAdEnv({
        testMode: 'false',
        bannerAndroid: 'ca-app-pub-XXXXXXXXXXXXXXXX/4444444444',
        bannerIos: 'ca-app-pub-XXXXXXXXXXXXXXXX/5555555555',
        interstitialAndroid: 'ca-app-pub-XXXXXXXXXXXXXXXX/6666666666',
        interstitialIos: 'ca-app-pub-XXXXXXXXXXXXXXXX/7777777777',
      });
      expect(assertProductionAdUnitsConfigured()).toBe(true);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
