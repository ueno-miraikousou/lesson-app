import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';

/**
 * ONBD-01 通知許可リクエスト 事前説明画面。
 *
 * 価値を体験した直後（WIZ-09 完了直後）に表示することで許可率を最大化。
 *
 * 仕様: 02_設計/画面/WIZ-ウィザード一括設計.md ONBD-01
 *      02_設計/通知設計-暫定意見.md §6.1
 */
export default function NotificationPermissionScreen() {
  const [requesting, setRequesting] = useState(false);

  async function handleAllow() {
    setRequesting(true);
    try {
      await Notifications.requestPermissionsAsync();
    } catch {
      // 失敗しても次の画面へ進む（OS 設定で後から許可可能）
    } finally {
      setRequesting(false);
      // ガードがウィザード完了 + 世帯ありの状態で /(main)/calendar に飛ばす
      router.replace('/');
    }
  }

  function handleSkip() {
    router.replace('/');
  }

  return (
    <ScreenContainer>
      <View className="mt-12">
        <Text className="text-display">🔔</Text>
        <Text className="mt-6 text-h1 text-text-primary">
          忘れ物ゼロのために、{'\n'}通知をお知らせします
        </Text>

        <View className="mt-6 rounded-card bg-primary-light/40 p-4">
          <Text className="text-body text-text-primary">通知を許可すると:</Text>
          <Text className="mt-2 text-body text-text-secondary">• 予定の前日と当日にお知らせ</Text>
          <Text className="text-body text-text-secondary">• 持ち物リストも一緒に表示</Text>
          <Text className="text-body text-text-secondary">• 設定でいつでもオフにできます</Text>
        </View>
      </View>

      <View className="mt-10">
        <PrimaryButton label="通知を許可する" onPress={handleAllow} loading={requesting} />
        <View className="mt-2">
          <PrimaryButton label="後で設定する" variant="text" onPress={handleSkip} />
        </View>
      </View>
    </ScreenContainer>
  );
}
