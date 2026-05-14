import { router } from 'expo-router';
import { useMemo } from 'react';
import { Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { AddModeBadge } from '../../components/wizard/AddModeBadge';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { WizardHeader } from '../../components/wizard/WizardHeader';
import { useExistingHouseholdData } from '../../features/wizard/use-existing-household-data';
import { useAuthStore } from '../../stores/auth-store';
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
 *
 * Sprint 6 (W-10) 追加モード: 「追加するメンバー」と「既存メンバー（変更なし）」を分離表示。
 * 参照: 02_設計/画面/WIZ-10-後からウィザード.md §3.4
 */
export default function SummaryScreen() {
  const mode = useWizardStore((s) => s.mode);
  const members = useWizardStore((s) => s.members);
  const lessons = useWizardStore((s) => s.lessons);
  const setStep = useWizardStore((s) => s.setStep);
  const householdId = useAuthStore((s) => s.householdId);
  const existing = useExistingHouseholdData(householdId, mode === 'add');

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
        {mode === 'add' ? (
          <View className="mb-2" testID="wiz-add-mode-banner-summary">
            <AddModeBadge />
          </View>
        ) : null}
        <Text className="text-h1 text-text-primary">
          {mode === 'add' ? 'この内容で追加しますか？' : 'この内容で登録しますか？'}
        </Text>

        {mode === 'add' ? (
          <Text className="mt-3 text-caption text-text-secondary">追加するメンバー</Text>
        ) : null}

        <View className="mt-4 gap-3" testID="summary-new-members">
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

        {mode === 'add' && existing.data.members.length > 0 ? (
          <View className="mt-6" testID="summary-existing-members">
            <Text className="text-caption text-text-secondary">既存メンバー（変更なし）</Text>
            <View className="mt-2 gap-2">
              {existing.data.members.map((m) => (
                <View
                  key={m.id}
                  className="rounded-card border border-border bg-background p-3 opacity-70"
                >
                  <View className="flex-row items-center gap-2">
                    <View className="h-3 w-3 rounded-full" style={{ backgroundColor: m.color_hex }} />
                    <Text className="text-body text-text-primary">{m.name}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View className="mt-6 rounded-card bg-primary-light/40 p-3">
          <Text className="text-caption text-text-primary">
            {mode === 'add'
              ? `追加: 家族 ${totalMembers} 人 / 習い事 ${totalLessons} 件 ・ 既存 ${existing.data.members.length} 人`
              : `合計: 家族 ${totalMembers} 人 / 習い事 ${totalLessons} 件`}
          </Text>
        </View>
      </ScrollView>

      <View className="border-t border-border bg-surface px-4 py-3">
        <PrimaryButton
          label={mode === 'add' ? '追加する' : 'これで登録'}
          onPress={handleCommit}
          testID="wiz-summary-commit"
        />
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
