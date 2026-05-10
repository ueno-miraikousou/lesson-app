import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { LessonFormSheet } from '../../components/forms/LessonFormSheet';
import { MemberFormSheet } from '../../components/forms/MemberFormSheet';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { WizardHeader } from '../../components/wizard/WizardHeader';
import { useWizardStore, type WizardLesson, type WizardMember } from '../../stores/wizard-store';
import { OPERATOR_TEMP_ID } from './step4';

/**
 * WIZ-05 Step 5: 他メンバー追加（任意）。
 * 父親 / 祖父母などを追加し、習い事も付けられる。
 *
 * 仕様: 02_設計/画面/WIZ-ウィザード一括設計.md WIZ-05
 */
export default function Step5Screen() {
  const members = useWizardStore((s) => s.members);
  const lessons = useWizardStore((s) => s.lessons);
  const upsertMember = useWizardStore((s) => s.upsertMember);
  const removeMember = useWizardStore((s) => s.removeMember);
  const upsertLesson = useWizardStore((s) => s.upsertLesson);
  const removeLesson = useWizardStore((s) => s.removeLesson);
  const setStep = useWizardStore((s) => s.setStep);

  // child でも operator でもない他メンバー
  const otherMembers = useMemo(
    () => members.filter((m) => m.role !== 'child' && m.tempId !== OPERATOR_TEMP_ID),
    [members],
  );

  const usedColors = useMemo(() => members.map((m) => m.colorHex), [members]);

  const [showMemberForm, setShowMemberForm] = useState(false);
  const [editingMember, setEditingMember] = useState<WizardMember | null>(null);
  const [lessonForMember, setLessonForMember] = useState<WizardMember | null>(null);
  const [editingLesson, setEditingLesson] = useState<WizardLesson | null>(null);

  function handleSubmitMember(member: WizardMember) {
    upsertMember(member);
    setShowMemberForm(false);
    setEditingMember(null);
  }

  function handleDeleteMember(memberTempId: string) {
    // メンバー削除と紐づく lessons も削除（store の removeMember が両方やる）
    removeMember(memberTempId);
  }

  function handleSubmitLesson(lesson: WizardLesson) {
    upsertLesson(lesson);
    setLessonForMember(null);
    setEditingLesson(null);
  }

  function handleNext() {
    setStep('summary');
    router.push('/(wizard)/summary');
  }

  function handleBack() {
    router.back();
  }

  return (
    <ScreenContainer scrollable={false} padded={false}>
      <WizardHeader currentStep={5} onBack={handleBack} onAbort={() => router.replace('/')} />

      <View className="flex-1 px-4 pt-4">
        <Text className="text-h1 text-text-primary">他の家族メンバー</Text>
        <Text className="mt-1 text-caption text-text-secondary">
          配偶者・祖父母などを登録できます（任意）
        </Text>

        <View className="mt-4 gap-3">
          {otherMembers.map((m) => {
            const memberLessons = lessons.filter((l) => l.memberTempId === m.tempId);
            return (
              <View key={m.tempId} className="rounded-card border border-border bg-surface p-4">
                <View className="flex-row items-center gap-2">
                  <View className="h-4 w-4 rounded-full" style={{ backgroundColor: m.colorHex }} />
                  <Text className="text-h3 text-text-primary">{m.name}</Text>
                </View>
                {memberLessons.length === 0 ? (
                  <Text className="mt-1 text-caption text-text-secondary">
                    まだ習い事はありません
                  </Text>
                ) : (
                  <View className="mt-2 gap-1">
                    {memberLessons.map((l) => (
                      <Text key={l.tempId} className="text-caption text-text-secondary">
                        ・{l.name}
                      </Text>
                    ))}
                  </View>
                )}
                <View className="mt-2 flex-row gap-3">
                  <PrimaryButton
                    label="編集"
                    variant="text"
                    onPress={() => {
                      setEditingMember(m);
                      setShowMemberForm(true);
                    }}
                  />
                  <PrimaryButton
                    label="習い事を追加"
                    variant="text"
                    onPress={() => {
                      setEditingLesson(null);
                      setLessonForMember(m);
                    }}
                  />
                  <PrimaryButton
                    label="削除"
                    variant="text"
                    onPress={() => handleDeleteMember(m.tempId)}
                  />
                </View>
              </View>
            );
          })}

          <Pressable
            onPress={() => {
              setEditingMember(null);
              setShowMemberForm(true);
            }}
            className="items-center rounded-card border-2 border-dashed border-primary bg-surface p-4 active:bg-primary-light/30"
            accessibilityRole="button"
          >
            <Text className="text-h3 text-primary-dark">+ 家族メンバーを追加</Text>
          </Pressable>

          <Text className="mt-2 text-caption text-text-secondary">
            家族の招待はウィザード完了後にできます
          </Text>
        </View>
      </View>

      <View className="border-t border-border bg-surface px-4 py-3">
        <PrimaryButton label="次へ" onPress={handleNext} />
      </View>

      <MemberFormSheet
        visible={showMemberForm}
        mode={editingMember ? 'edit' : 'create-other'}
        initialValues={editingMember ?? undefined}
        usedColors={usedColors}
        onSubmit={handleSubmitMember}
        onClose={() => {
          setShowMemberForm(false);
          setEditingMember(null);
        }}
      />

      {lessonForMember ? (
        <LessonFormSheet
          visible
          mode={editingLesson ? 'edit' : 'create'}
          memberId={lessonForMember.tempId}
          memberName={lessonForMember.name}
          initialValues={editingLesson ?? undefined}
          onSubmit={handleSubmitLesson}
          onClose={() => {
            setLessonForMember(null);
            setEditingLesson(null);
          }}
        />
      ) : null}
    </ScreenContainer>
  );
}
