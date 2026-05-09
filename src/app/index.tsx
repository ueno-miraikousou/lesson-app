import { ActivityIndicator, Text, View } from 'react-native';

import { APP_DISPLAY_NAME } from '../config/app';

/**
 * AUTH-01 スプラッシュ相当。
 * ルートレイアウトの AuthGate が遷移を担当するため、ここはローディング表示のみ。
 * 認証状態の判定が終わると即座に (auth) / (wizard) / (main) のいずれかへリダイレクトされる。
 */
export default function IndexScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background px-4">
      <Text className="text-display text-primary-dark">{APP_DISPLAY_NAME}</Text>
      <View className="mt-8">
        <ActivityIndicator size="small" color="#E76A85" />
      </View>
    </View>
  );
}
