import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';

/**
 * SHARE-03 招待コード入力 (プレースホルダ)。
 * 本実装はフェーズD-1 で行う。現状は UI スケルトンのみ。
 *
 * 参照: 02_設計/画面リスト.md §6 / 02_設計/画面/SHARE-02-配偶者招待.md §8
 */
export default function InviteCodeScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const prefilled = typeof params.code === 'string' ? params.code : '';

  return (
    <ScreenContainer>
      <View className="mt-6">
        <Text className="text-h1 text-text-primary">招待コードを入力</Text>
        <Text className="mt-2 text-body text-text-secondary">
          家族から共有された 6桁の数字、または QR / リンクで受け取った招待コードを入力してください。
        </Text>
        {prefilled ? (
          <Text className="mt-3 text-body text-primary-dark">
            ディープリンクから受け取ったコード: {prefilled}
          </Text>
        ) : null}
      </View>

      <View className="mt-6 rounded-card border border-warning bg-surface p-4">
        <Text className="text-caption text-text-secondary">
          フェーズ D-1 で本実装予定。現在は UI スケルトンのみ表示しています。
        </Text>
      </View>

      <View className="mt-8">
        <PrimaryButton
          label="戻る"
          variant="secondary"
          onPress={() => router.replace('/(auth)/household-select')}
        />
      </View>
    </ScreenContainer>
  );
}
