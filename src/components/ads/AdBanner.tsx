/**
 * バナー広告コンポーネント (ADR-009 §2.4 AD-02)。
 *
 * 仕様:
 *   - `ANCHORED_ADAPTIVE_BANNER` (Google 公式推奨、画面幅で自動サイズ調整)
 *   - 同意未取得 / 'no-ads' 選択時は領域ごと描画しない (高さ 0)
 *   - 読込失敗時はサイレントフェイル (UI 表示なし、コンソールログのみ)
 *   - accessibility: accessibilityLabel="広告" + accessibilityRole="image"
 *   - 非個人化広告を強制 (requestNonPersonalizedAdsOnly: true、ADR-009 §2.5)
 */

import { useEffect, useState } from 'react';
import { View } from 'react-native';

import {
  BannerAd,
  BannerAdSize,
  type BannerAdProps,
} from 'react-native-google-mobile-ads';

import { loadAdConsentState, type AdConsentState } from '../../screens/AdConsentScreen';
import { getBannerAdUnitId } from '../../features/ads/ad-unit-ids';

export interface AdBannerProps {
  /** SafeArea 下端の余白を含めて占有するか (画面 footer 用、default false) */
  withSafeAreaPadding?: boolean;
  /** unit ID を上書き (テスト用) */
  unitIdOverride?: string;
  /** AdConsentState を上書き (テスト用)。null = AsyncStorage 経由 */
  consentOverride?: AdConsentState | null;
  testID?: string;
}

export function AdBanner({
  withSafeAreaPadding = false,
  unitIdOverride,
  consentOverride,
  testID = 'ad-banner',
}: AdBannerProps = {}) {
  const [consent, setConsent] = useState<AdConsentState | null>(consentOverride ?? null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (consentOverride !== undefined) {
      setConsent(consentOverride);
      return;
    }
    let cancelled = false;
    void loadAdConsentState().then((stored) => {
      if (!cancelled) setConsent(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [consentOverride]);

  if (consent === null) {
    // 同意未取得 → 領域非表示
    return null;
  }
  if (consent === 'no-ads') {
    // 「広告を表示しない」(Phase E は disabled UI、互換のため hide)
    return null;
  }
  if (failed) {
    return null;
  }

  const unitId = unitIdOverride ?? getBannerAdUnitId();

  const requestOptions: BannerAdProps['requestOptions'] = {
    requestNonPersonalizedAdsOnly: consent === 'non-personalized',
    keywords: [],
  };

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel="広告"
      style={{
        alignItems: 'center',
        paddingBottom: withSafeAreaPadding ? 8 : 0,
      }}
    >
      <BannerAd
        unitId={unitId}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        requestOptions={requestOptions}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={(error) => {
          console.warn('[AdBanner] failed to load', error);
          setFailed(true);
        }}
      />
      {/* loaded 状態は将来の analytics 用、現状は不可視 */}
      {loaded ? null : null}
    </View>
  );
}

export default AdBanner;
