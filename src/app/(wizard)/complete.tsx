import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';

/**
 * WIZ-09 完了演出。
 * カレンダーを見るボタン → ONBD-01 通知許可 → メイン (ガード経由)。
 *
 * フェーズB+ で「カレンダーが埋まる」アニメーションを追加予定。
 */
export default function CompleteScreen() {
  function handleSeeCalendar() {
    router.replace('/onboarding/notification-permission');
  }

  return (
    <ScreenContainer scrollable={false}>
      <View className="flex-1 items-center justify-center px-4">
        <Text className="text-display">🎉</Text>
        <Text className="mt-6 text-center text-h1 text-text-primary">
          家族のカレンダーが{'\n'}完成しました！
        </Text>

        <View className="mt-12 w-full max-w-xs">
          <PrimaryButton label="カレンダーを見る" onPress={handleSeeCalendar} />
        </View>
      </View>
    </ScreenContainer>
  );
}
