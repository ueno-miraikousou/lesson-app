/**
 * SHARE-03: 招待コード入力 (F-03 AC1, AC5)。
 *
 * - 6 桁数字の入力 UI (number-pad、autoCapitalize=none)
 * - 形式検証 + 「次へ」で SHARE-04 参加確認 (`/share/accept`) に遷移
 * - ディープリンク (`learnapp://invite/<codeLong>`) からの遷移時は code 自動入力
 *
 * 参照:
 *   - 02_設計/画面/SHARE-02-配偶者招待.md §8.1
 *   - 01_要件定義/Phase_D_WBS_v0.1.md §2.1 F-03 AC1 / AC5
 */

import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { PrimaryButton } from '../components/ui/PrimaryButton';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { TextField } from '../components/ui/TextField';
import { isCodeShort } from '../features/invitation/generate-codes';

export function InviteCodeEntryScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | undefined>();

  // ディープリンク (params.code) で 6 桁数字が渡ってきたらプリフィル
  useEffect(() => {
    const incoming = typeof params.code === 'string' ? params.code : '';
    if (incoming && isCodeShort(incoming)) {
      setCode(incoming);
    }
  }, [params.code]);

  function handleNext() {
    setError(undefined);
    const trimmed = code.trim();
    if (!isCodeShort(trimmed)) {
      setError('6 桁の数字で入力してください');
      return;
    }
    router.push({ pathname: '/share/accept', params: { code: trimmed } });
  }

  return (
    <ScreenContainer>
      <View
        className="flex-row items-center justify-between border-b border-border bg-surface px-4 py-3"
        testID="share-input-header"
      >
        <Pressable
          onPress={() => router.back()}
          className="min-h-tap min-w-tap items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="戻る"
          testID="share-input-back"
        >
          <Text className="text-h3 text-text-primary">‹ 戻る</Text>
        </Pressable>
        <Text className="text-h3 text-text-primary">招待コードを入力</Text>
        <View className="min-w-tap" />
      </View>

      <View className="mt-6">
        <Text className="text-body text-text-secondary">
          家族から受け取った 6 桁の招待コードを入力してください。
        </Text>
      </View>

      <View className="mt-4">
        <TextField
          label="招待コード (6 桁)"
          value={code}
          onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          maxLength={6}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="123456"
          errorText={error}
          accessibilityLabel="招待コードを 6 桁で入力"
          testID="share-input-code"
        />
        <Text className="-mt-2 text-caption text-text-secondary">
          数字のみ、半角で入力
        </Text>
      </View>

      <View className="mt-6">
        <PrimaryButton
          label="次へ"
          onPress={handleNext}
          disabled={code.length !== 6}
          testID="share-input-next"
        />
      </View>
    </ScreenContainer>
  );
}
