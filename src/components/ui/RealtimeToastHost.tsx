/**
 * Realtime 経由で他端末の編集を受信した際に「他のメンバーが編集しました」を
 * 画面上に表示する Toast ホスト (Phase D Sprint 2 D2-T05、F-05 AC4 / F-06)。
 *
 * 設計:
 *   - root layout (`_layout.tsx`) の最上位で 1 つだけマウント
 *   - useRealtimeToastStore.message を購読、4 秒後に自動消失
 *   - useHouseholdRealtime hook が `setShouldToast` 経由で発火
 *   - aria-live="polite" 相当の RN accessibilityLiveRegion で読み上げ対応
 *   - CalendarScreen の UndoToast と視覚的に揃えるが、こちらは情報通知のみ
 *     (アクションボタンなし、ADR-007 §2.3 「軽い通知」方針)
 *
 * 参照:
 *   - 02_設計/ADR/ADR-007-Phase_D_Realtime同期方式.md §2.3 LWW + Toast
 *   - src/stores/realtime-toast-store.ts
 *   - src/screens/CalendarScreen.tsx (UndoToast 視覚パターン)
 */

import { useEffect } from 'react';
import { Text, View } from 'react-native';

import { colors } from '../../theme/colors';
import {
  REALTIME_TOAST_DURATION_MS,
  useRealtimeToastStore,
} from '../../stores/realtime-toast-store';

export function RealtimeToastHost() {
  const message = useRealtimeToastStore((s) => s.message);
  const messageKey = useRealtimeToastStore((s) => s.key);
  const dismiss = useRealtimeToastStore((s) => s.dismiss);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      dismiss();
    }, REALTIME_TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [message, messageKey, dismiss]);

  if (!message) return null;

  return (
    <View
      className="absolute inset-x-4 bottom-24 rounded-button bg-text-primary px-4 py-3"
      style={{ backgroundColor: colors.textPrimary }}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
      testID="realtime-toast"
    >
      <Text className="text-body" style={{ color: '#FFFFFF' }} testID="realtime-toast-message">
        {message}
      </Text>
    </View>
  );
}
