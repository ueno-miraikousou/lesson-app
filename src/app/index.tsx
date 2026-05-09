import { Text, View } from 'react-native';

import { APP_DISPLAY_NAME } from '../config/app';

/**
 * AUTH-01 スプラッシュ相当のプレースホルダ。
 * 認証ガードを実装するまでの仮置き画面。フェーズ A-6 で AUTH 系画面に置き換える。
 */
export default function IndexScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-background px-4">
      <Text className="text-display text-primary-dark">{APP_DISPLAY_NAME}</Text>
      <Text className="mt-2 text-body text-text-secondary">
        フェーズ A 基盤構築中
      </Text>
    </View>
  );
}
