import { Text, View } from 'react-native';

import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';

/**
 * WIZ-00 価値訴求 + ウィザード開始 (プレースホルダ)。
 * 本実装はフェーズB で designer の WIZ-ウィザード一括設計.md v0.2 に従って組む。
 */
export default function WizardIntroScreen() {
  return (
    <ScreenContainer>
      <View className="mt-10 items-center">
        <Text className="text-display text-primary-dark">習い事管理アプリ</Text>
        <Text className="mt-3 text-body text-text-secondary">
          ウィザードはフェーズBで実装予定
        </Text>
      </View>

      <View className="mt-10">
        <PrimaryButton label="はじめる (未実装)" disabled />
      </View>
    </ScreenContainer>
  );
}
