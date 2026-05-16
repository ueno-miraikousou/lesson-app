/**
 * Root layout から呼び出す ads 初期化 hook。
 *
 * 仕様:
 *   - cold start 後 1 回だけ initializeAdsWithConsent を呼ぶ
 *   - AUTH_BYPASS 中 / __DEV__ かつ ADMOB_TEST_MODE 未設定 ではスキップ可能 (configurable)
 *   - 結果を返さず内部状態は useAdsStore に保存 (将来拡張用、現状は no-store)
 */

import { useEffect, useRef } from 'react';

import { initializeAdsWithConsent } from './consent-bridge';

export interface UseAdsOptions {
  /** false にすると初期化スキップ (AUTH_BYPASS の screenshot 経路用) */
  enabled?: boolean;
}

export function useAds({ enabled = true }: UseAdsOptions = {}): void {
  const ran = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (ran.current) return;
    ran.current = true;
    void initializeAdsWithConsent().catch((error) => {
      console.warn('[ads.useAds] initialize failed', error);
    });
  }, [enabled]);
}
