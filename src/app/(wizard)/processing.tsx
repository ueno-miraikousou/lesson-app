import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { commitWizardData } from '../../features/wizard/commit-wizard';
import { commitWizardAddMode } from '../../features/wizard/commit-wizard-add-mode';
import { useAuthStore } from '../../stores/auth-store';
import { useWizardStore } from '../../stores/wizard-store';

/**
 * WIZ-07 登録処理中（ローディング演出）。
 * useEffect で commitWizardData / commitWizardAddMode を呼び、成功で WIZ-09、失敗でリトライ画面。
 *
 * Sprint 6 (W-10): mode='add' のとき `commitWizardAddMode` を呼び (ADR-006 案 B)、
 * 既存データを保持したまま新規分のみ INSERT する。完了後はカレンダーへ戻る。
 */
export default function ProcessingScreen() {
  const householdId = useAuthStore((s) => s.householdId);
  const setWizardCompleted = useAuthStore((s) => s.setWizardCompleted);
  const mode = useWizardStore((s) => s.mode);
  const members = useWizardStore((s) => s.members);
  const lessons = useWizardStore((s) => s.lessons);
  const clearWizard = useWizardStore((s) => s.clear);
  const setStep = useWizardStore((s) => s.setStep);
  const queryClient = useQueryClient();

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!householdId) {
        setErrorMessage('世帯情報が確認できません。再ログインしてください');
        return;
      }
      try {
        if (mode === 'add') {
          const addedCount = members.length;
          await commitWizardAddMode({
            householdId,
            newMembers: members,
            newLessons: lessons,
          });
          if (cancelled) return;
          // 追加モード: wizardCompleted は既に true、wizard state をクリアして
          // 完了演出 → カレンダーへ戻り、関連 query を invalidate して新規分を反映
          clearWizard();
          // ADR-006 §4.4 / 設計 §6.4: 既存世帯データのキャッシュも無効化
          await queryClient.invalidateQueries({ queryKey: ['wizard', 'existing-household'] });
          await queryClient.invalidateQueries({ queryKey: ['schedules'] });
          await queryClient.invalidateQueries({ queryKey: ['members'] });
          setStep('complete');
          router.replace({
            pathname: '/(wizard)/complete',
            params: { mode: 'add', addedCount: String(addedCount) },
          });
          return;
        }

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
  }, [
    householdId,
    mode,
    members,
    lessons,
    setWizardCompleted,
    clearWizard,
    setStep,
    queryClient,
  ]);

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
        <Text className="mt-6 text-h1 text-text-primary">
          {mode === 'add' ? '追加しています...' : 'カレンダーを準備しています...'}
        </Text>
        <Text className="mt-2 text-body text-text-secondary">
          {mode === 'add' ? '既存のデータはそのまま、新しい家族を登録中' : '家族の予定を整えています'}
        </Text>
        <View className="mt-6">
          <ActivityIndicator size="large" color="#E76A85" />
        </View>
      </View>
    </ScreenContainer>
  );
}
