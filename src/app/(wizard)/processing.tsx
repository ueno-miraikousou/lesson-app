import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { commitWizardData } from '../../features/wizard/commit-wizard';
import { useAuthStore } from '../../stores/auth-store';
import { useWizardStore } from '../../stores/wizard-store';

/**
 * WIZ-07 登録処理中（ローディング演出）。
 * useEffect で commitWizardData を呼び、成功で WIZ-09、失敗でリトライ画面。
 */
export default function ProcessingScreen() {
  const householdId = useAuthStore((s) => s.householdId);
  const setWizardCompleted = useAuthStore((s) => s.setWizardCompleted);
  const members = useWizardStore((s) => s.members);
  const lessons = useWizardStore((s) => s.lessons);
  const clearWizard = useWizardStore((s) => s.clear);
  const setStep = useWizardStore((s) => s.setStep);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!householdId) {
        setErrorMessage('世帯情報が確認できません。再ログインしてください');
        return;
      }
      try {
        await commitWizardData({ householdId, members, lessons });
        if (cancelled) return;
        setWizardCompleted(true);
        clearWizard();
        setStep('complete');
        router.replace('/(wizard)/complete');
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : '不明なエラー';
        setErrorMessage(`登録に失敗しました: ${msg}`);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [householdId, members, lessons, setWizardCompleted, clearWizard, setStep]);

  if (errorMessage) {
    return (
      <ScreenContainer>
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-h2 text-error">エラー</Text>
          <Text className="mt-2 text-center text-body text-text-secondary">{errorMessage}</Text>
          <View className="mt-6 w-full max-w-xs gap-2">
            <PrimaryButton label="もう一度試す" onPress={() => router.replace('/(wizard)/summary')} />
            <PrimaryButton label="戻る" variant="text" onPress={() => router.back()} />
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false}>
      <View className="flex-1 items-center justify-center">
        <Text className="text-display">📅</Text>
        <Text className="mt-6 text-h1 text-text-primary">カレンダーを準備しています...</Text>
        <Text className="mt-2 text-body text-text-secondary">家族の予定を整えています</Text>
        <View className="mt-6">
          <ActivityIndicator size="large" color="#E76A85" />
        </View>
      </View>
    </ScreenContainer>
  );
}
