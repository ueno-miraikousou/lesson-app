import { router } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { WizardHeader } from '../../components/wizard/WizardHeader';
import { useWizardStore } from '../../stores/wizard-store';

const DAY_LABELS: Record<string, string> = {
  SU: '日',
  MO: '月',
  TU: '火',
  WE: '水',
  TH: '木',
  FR: '金',
  SA: '土',
};

/**
 * WIZ-06 サマリ確認画面。
 * 入力内容の一覧 → 「これで登録」で WIZ-07 へ。
 */
export default function SummaryScreen() {
  const members = useWizardStore((s) => s.members);
  const lessons = useWizardStore((s) => s.lessons);
  const setStep = useWizardStore((s) => s.setStep);

  const totalLessons = lessons.length;
  const totalMembers = members.length;

  const grouped = useMemo(
    () =>
      members.map((m) => ({
        member: m,
        lessons: lessons.filter((l) => l.memberTempId === m.tempId),
      })),
    [members, lessons],
  );

  function handleCommit() {
    setStep('processing');
    router.push('/(wizard)/processing');
  }

  return (
    <ScreenContainer scrollable={false} padded={false}>
      <WizardHeader currentStep={6} onBack={() => router.back()} onAbort={() => router.replace('/')} />

      <ScrollView className="flex-1 px-4 pt-4">
        <Text className="text-h1 text-text-primary">この内容で登録しますか？</Text>

        <View className="mt-4 gap-3">
          {grouped.map(({ member, lessons: ls }) => (
            <View key={member.tempId} className="rounded-card border border-border bg-surface p-4">
              <View className="flex-row items-center gap-2">
                <View className="h-4 w-4 rounded-full" style={{ backgroundColor: member.colorHex }} />
                <Text className="text-h3 text-text-primary">
                  {member.name} {roleLabel(member.role)}
                </Text>
              </View>
              {ls.length === 0 ? (
                <Text className="mt-2 text-caption text-text-secondary">習い事なし</Text>
              ) : (
                <View className="mt-2 gap-1">
                  {ls.map((l) => (
                    <Text key={l.tempId} className="text-body text-text-secondary">
                      ・{l.name}
                      {l.schedules[0]
                        ? ` (${l.schedules[0].daysOfWeek.map((d) => DAY_LABELS[d]).join('・')} ${l.schedules[0].startTime}〜${l.schedules[0].endTime})`
                        : ''}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>

        <View className="mt-6 rounded-card bg-primary-light/40 p-3">
          <Text className="text-caption text-text-primary">
            合計: 家族 {totalMembers} 人 / 習い事 {totalLessons} 件
          </Text>
        </View>
      </ScrollView>

      <View className="border-t border-border bg-surface px-4 py-3">
        <PrimaryButton label="これで登録" onPress={handleCommit} />
      </View>
    </ScreenContainer>
  );
}

function roleLabel(role: 'child' | 'parent' | 'other'): string {
  switch (role) {
    case 'child':
      return '(お子さん)';
    case 'parent':
      return '(親)';
    case 'other':
      return '(その他)';
  }
}
