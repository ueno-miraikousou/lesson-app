import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { Confetti } from '../../components/ui/Confetti';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { useReduceMotionEnabled } from '../../hooks/use-reduce-motion-enabled';
import { fetchNotificationPreferences } from '../../lib/notification-preferences';
import { playCelebrationSound } from '../../lib/celebration-sound';

/**
 * WIZ-09 完了演出。
 *
 * 演出仕様 (designer v0.3 §WIZ-09):
 *   - 紙吹雪 15〜20 枚 / 800ms / メインカラー 4 色 (Confetti コンポーネント)
 *   - Reduce Motion ON 時は Confetti が自動的に空 View を返す (a11y 必須)
 *   - 達成テキスト + 「カレンダーを見る」ボタンは紙吹雪の有無に関係なく表示
 *   - ハプティクス (軽い1回バイブ): デフォルト ON、Reduce Motion 中は控える
 *     ハプティクスは「視差効果」とは別だが、通常の感覚過敏ユーザー対応として
 *     Reduce Motion ON 時は鳴らさない方針 (Apple HIG 推奨)
 *   - 達成音: notification_preferences.celebration_sound_enabled が ON の
 *     ユーザーのみ再生。デフォルト OFF。iOS Silent モードでは OS が抑止
 *
 * 失敗時の挙動: 設定取得失敗・音再生失敗は握りつぶす (画面表示は続行)
 */
export default function CompleteScreen() {
  const reduceMotion = useReduceMotionEnabled();
  // mode は wizard-store の clearWizard() で reset されるため、processing から
  // route params で渡してもらう (ADR-006 §4.3 完了挙動分岐)
  const params = useLocalSearchParams<{ mode?: 'add' | 'new'; addedCount?: string }>();
  const isAddMode = params.mode === 'add';
  const addedCount = parseInt(params.addedCount ?? '0', 10) || 0;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // ハプティクス (Reduce Motion 時は控える)
      if (!reduceMotion) {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {
          // 端末がハプティクス未対応 → 静かに無視
        }
      }

      // 達成音 (ユーザー設定 ON のときのみ再生)
      try {
        const prefs = await fetchNotificationPreferences();
        if (cancelled) return;
        if (prefs.celebration_sound_enabled) {
          await playCelebrationSound();
        }
      } catch {
        // 設定取得失敗は無視 (達成感演出はコアフローではない)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reduceMotion]);

  function handleSeeCalendar() {
    if (isAddMode) {
      // 追加モード: 通知 ON 案内は不要 (既にウィザード完了済)、カレンダーへ直接戻る
      router.replace('/(main)/calendar');
      return;
    }
    router.replace('/onboarding/notification-permission');
  }

  return (
    <ScreenContainer scrollable={false}>
      <View className="flex-1 items-center justify-center px-4">
        <Text accessibilityElementsHidden importantForAccessibility="no" className="text-display">
          {'🎉'}
        </Text>
        <Text
          className="mt-6 text-center text-h1 text-text-primary"
          testID={isAddMode ? 'wiz-add-mode-complete-title' : 'wiz-complete-title'}
        >
          {isAddMode
            ? addedCount > 0
              ? `${addedCount} 人 追加しました！`
              : '追加しました！'
            : `家族のカレンダーが\n完成しました！`}
        </Text>

        <View className="mt-12 w-full max-w-xs">
          <PrimaryButton label="カレンダーを見る" onPress={handleSeeCalendar} />
        </View>
      </View>

      {/* Confetti は pointerEvents="none"。Reduce Motion ON 時は内部で null を返す */}
      <Confetti active />
    </ScreenContainer>
  );
}
