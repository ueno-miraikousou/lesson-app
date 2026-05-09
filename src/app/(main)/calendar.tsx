import { View, Text } from 'react-native';

import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { signOut } from '../../lib/auth';

/**
 * CAL-01 メインカレンダー (プレースホルダ)。
 * フェーズC で react-native-calendars + メンバーフィルタ + FAB を実装。
 */
export default function CalendarScreen() {
  return (
    <ScreenContainer>
      <View className="mt-6">
        <Text className="text-h1 text-text-primary">カレンダー</Text>
        <Text className="mt-2 text-body text-text-secondary">
          メイン画面はフェーズCで実装予定
        </Text>
      </View>
      <View className="mt-10">
        <PrimaryButton label="ログアウト" variant="secondary" onPress={() => void signOut()} />
      </View>
    </ScreenContainer>
  );
}
