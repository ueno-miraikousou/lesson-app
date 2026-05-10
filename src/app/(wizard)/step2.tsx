import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { MemberFormSheet } from '../../components/forms/MemberFormSheet';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { WizardHeader } from '../../components/wizard/WizardHeader';
import { useWizardStore, type WizardMember } from '../../stores/wizard-store';

/**
 * WIZ-02 Step 2: 各子供の情報入力（人数分繰り返し）。
 * 1人ずつ MemberFormSheet を立ち上げて、入力 → 次の子供 → ... を回す。
 *
 * 仕様: 02_設計/画面/WIZ-ウィザード一括設計.md WIZ-02
 */
export default function Step2Screen() {
  const childrenCount = useWizardStore((s) => s.childrenCount);
  const members = useWizardStore((s) => s.members);
  const upsertMember = useWizardStore((s) => s.upsertMember);
  const removeMember = useWizardStore((s) => s.removeMember);
  const setStep = useWizardStore((s) => s.setStep);

  const childMembers = useMemo(() => members.filter((m) => m.role === 'child'), [members]);

  const [editingIndex, setEditingIndex] = useState<number | null>(
    childMembers.length < childrenCount ? childMembers.length : null,
  );

  // 既存より子供を減らした場合の整合（store の余剰 child を切り捨て）
  useEffect(() => {
    if (childMembers.length > childrenCount) {
      const extras = childMembers.slice(childrenCount);
      extras.forEach((m) => removeMember(m.tempId));
    }
  }, [childMembers, childrenCount, removeMember]);

  const usedColors = useMemo(() => members.map((m) => m.colorHex), [members]);

  function handleSubmit(member: WizardMember) {
    upsertMember({ ...member, role: 'child' });
    if (editingIndex == null) return;
    const nextIndex = editingIndex + 1;
    if (nextIndex < childrenCount) {
      setEditingIndex(nextIndex);
    } else {
      setEditingIndex(null);
    }
  }

  function handleNext() {
    if (childMembers.length < childrenCount) {
      setEditingIndex(childMembers.length);
      return;
    }
    setStep('step3-children-lessons');
    router.push('/(wizard)/step3');
  }

  function handleBack() {
    router.back();
  }

  const editingMember =
    editingIndex != null && editingIndex < childMembers.length ? childMembers[editingIndex] : undefined;

  return (
    <ScreenContainer scrollable={false} padded={false}>
      <WizardHeader currentStep={2} onBack={handleBack} onAbort={() => router.replace('/')} />

      <View className="flex-1 px-4 pt-4">
        <Text className="text-h1 text-text-primary">お子さんの情報</Text>
        <Text className="mt-1 text-caption text-text-secondary">
          {childrenCount}人分の情報を入力してください
        </Text>

        <View className="mt-4 gap-3">
          {Array.from({ length: childrenCount }).map((_, i) => {
            const m = childMembers[i];
            const filled = !!m;
            return (
              <Pressable
                key={i}
                onPress={() => setEditingIndex(i)}
                className={`rounded-card border-2 p-4 ${
                  filled ? 'border-primary bg-surface' : 'border-dashed border-border bg-surface'
                }`}
                accessibilityRole="button"
                accessibilityLabel={filled ? `${m?.name ?? ''} を編集` : `${i + 1}人目を入力`}
              >
                <Text className="text-caption text-text-secondary">{i + 1}人目</Text>
                {filled && m ? (
                  <View className="mt-1 flex-row items-center gap-2">
                    <View
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: m.colorHex }}
                    />
                    <Text className="text-h3 text-text-primary">{m.name}</Text>
                  </View>
                ) : (
                  <Text className="mt-1 text-body text-text-secondary">タップして入力</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="border-t border-border bg-surface px-4 py-3">
        <PrimaryButton
          label={childMembers.length < childrenCount ? '続けて入力する' : '次へ'}
          onPress={handleNext}
        />
      </View>

      <MemberFormSheet
        visible={editingIndex != null}
        mode={editingMember ? 'edit' : 'create-child'}
        initialValues={editingMember}
        usedColors={usedColors}
        wizardContext={{
          currentIndex: editingIndex ?? 0,
          totalCount: childrenCount,
        }}
        onSubmit={handleSubmit}
        onClose={() => setEditingIndex(null)}
      />
    </ScreenContainer>
  );
}
