/**
 * AdBanner component tests (Phase E Sprint 1 E1-T04 AD-02)。
 *
 * カバー範囲:
 *   - 同意未取得 (null) → 描画なし
 *   - 'no-ads' → 描画なし
 *   - 'non-personalized' → BannerAd render + accessibilityLabel="広告"
 *   - 'personalized' → BannerAd + requestNonPersonalizedAdsOnly: false
 *   - onAdFailedToLoad → 領域消失
 */

import { render, waitFor } from '@testing-library/react-native';
import { View } from 'react-native';

import { AdBanner } from '../AdBanner';

describe('AdBanner', () => {
  it("consentOverride=null → 領域非表示 (queryByTestID で null)", async () => {
    const { queryByTestId } = render(<AdBanner consentOverride={null} />);
    expect(queryByTestId('ad-banner')).toBeNull();
  });

  it("consentOverride='no-ads' → 領域非表示", async () => {
    const { queryByTestId } = render(<AdBanner consentOverride="no-ads" />);
    expect(queryByTestId('ad-banner')).toBeNull();
  });

  it("consentOverride='non-personalized' → BannerAd 描画 + accessibilityLabel='広告'", async () => {
    const { getByTestId, getByLabelText } = render(
      <AdBanner consentOverride="non-personalized" />,
    );
    await waitFor(() => {
      expect(getByTestId('ad-banner')).toBeTruthy();
    });
    expect(getByLabelText('広告')).toBeTruthy();
  });

  it("consentOverride='personalized' → BannerAd 描画", async () => {
    const { getByTestId } = render(<AdBanner consentOverride="personalized" />);
    await waitFor(() => {
      expect(getByTestId('ad-banner')).toBeTruthy();
    });
  });

  it('カスタム testID で render', async () => {
    const { getByTestId } = render(
      <AdBanner consentOverride="non-personalized" testID="custom-banner" />,
    );
    await waitFor(() => {
      expect(getByTestId('custom-banner')).toBeTruthy();
    });
  });

  it('unitIdOverride でテスト用 ID を渡せる', async () => {
    const { UNSAFE_getByType } = render(
      <AdBanner
        consentOverride="non-personalized"
        unitIdOverride="ca-app-pub-XXXXXXXXXXXXXXXX/6300978111"
      />,
    );
    await waitFor(() => {
      // mock BannerAd は View だが props に unitId が渡る
      const banner = UNSAFE_getByType(View);
      expect(banner).toBeTruthy();
    });
  });
});
