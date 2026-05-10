import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { WizardHeader } from '../../components/wizard/WizardHeader';
import { useWizardStore } from '../../stores/wizard-store';

const QUICK_OPTIONS = [0, 1, 2, 3] as const;
const MIN_COUNT = 0;
const MAX_COUNT = 10;

/**
 * WIZ-01 Step 1: 子供の人数。
 * - ± で増減、クイック選択で 0〜3
 * - 0 人選択時: WIZ-04 にスキップ（子供情報・子供習い事ステップを飛ばす）
 * - 1 人以上: WIZ-02 に進む
 *
 * 参照: 02_設計/画面/WIZ-ウィザード一括設計.md WIZ-01
 */
export default function Step1Screen() {
  const childrenCount = useWizardStore((s) => s.childrenCount);
  const setChildrenCount = useWizardStore((s) => s.setChildrenCount);
  const setStep = useWizardStore((s) => s.setStep);

  function handleNext() {
    if (childrenCount === 0) {
      setStep('step4-self-lesson');
      router.push('/(wizard)/step4');
      return;
    }
    setStep('step2-children-info');
    router.push('/(wizard)/step2');
  }

  function clamp(n: number): number {
    return Math.max(MIN_COUNT, Math.min(MAX_COUNT, n));
  }

  return (
    <ScreenContainer scrollable={false} padded={false}>
      <WizardHeader currentStep={1} onAbort={() => router.replace('/')} />

      <View className="flex-1 px-4 pt-6">
        <Text className="text-h1 text-text-primary">お子さんは何人いますか？</Text>
        <Text className="mt-2 text-caption text-text-secondary">親本人だけの利用もできます</Text>

        <View className="mt-10 flex-row items-center justify-center gap-6">
          <Pressable
            onPress={() => setChildrenCount(clamp(childrenCount - 1))}
            className="h-12 w-12 items-center justify-center rounded-full bg-primary-light active:bg-primary"
            accessibilityRole="button"
            accessibilityLabel="減らす"
          >
            <Text className="text-display text-primary-dark">−</Text>
          </Pressable>
          <Text className="text-display text-text-primary">{childrenCount}</Text>
          <Pressable
            onPress={() => setChildrenCount(clamp(childrenCount + 1))}
            className="h-12 w-12 items-center justify-center rounded-full bg-primary-light active:bg-primary"
            accessibilityRole="button"
            accessibilityLabel="増やす"
          >
            <Text className="text-display text-primary-dark">+</Text>
          </Pressable>
        </View>

        <Text className="mt-8 text-caption text-text-secondary">よく選ばれる選択肢</Text>
        <View className="mt-2 flex-row gap-2">
          {QUICK_OPTIONS.map((n) => {
            const selected = childrenCount === n;
            return (
              <Pressable
                key={n}
                onPress={() => setChildrenCount(n)}
                className={`flex-1 items-center rounded-button border-2 px-3 py-3 ${
                  selected ? 'border-primary bg-primary-light' : 'border-border bg-surface'
                }`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text className={`text-body ${selected ? 'text-primary-dark' : 'text-text-primary'}`}>
                  {n}人
                </Text>
              </Pressable>
            );
          })}
        </View>

        {childrenCount === 0 ? (
          <View className="mt-6 rounded-card bg-primary-light/40 p-3">
            <Text className="text-caption text-text-primary">
              親本人だけの利用ですね。次のステップで親自身の習い事を登録できます。
            </Text>
          </View>
        ) : null}
      </View>

      <View className="border-t border-border bg-surface px-4 py-3">
        <PrimaryButton label="次へ" onPress={handleNext} />
      </View>
    </ScreenContainer>
  );
}
