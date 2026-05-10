import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { LessonFormSheet } from '../../components/forms/LessonFormSheet';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { WizardHeader } from '../../components/wizard/WizardHeader';
import { useWizardStore, type WizardLesson } from '../../stores/wizard-store';

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
 * WIZ-03 Step 3: 各子供の習い事入力。
 * 子供 1人ずつ画面を切り替えて、その子供の習い事を 0〜複数追加できる。
 *
 * 仕様: 02_設計/画面/WIZ-ウィザード一括設計.md WIZ-03
 */
export default function Step3Screen() {
  const members = useWizardStore((s) => s.members);
  const lessons = useWizardStore((s) => s.lessons);
  const upsertLesson = useWizardStore((s) => s.upsertLesson);
  const removeLesson = useWizardStore((s) => s.removeLesson);
  const setStep = useWizardStore((s) => s.setStep);

  const childMembers = useMemo(() => members.filter((m) => m.role === 'child'), [members]);

  const [activeChildIndex, setActiveChildIndex] = useState(0);
  const [editingLesson, setEditingLesson] = useState<WizardLesson | null>(null);
  const [showForm, setShowForm] = useState(false);

  const activeChild = childMembers[activeChildIndex];
  const activeChildLessons = useMemo(
    () => (activeChild ? lessons.filter((l) => l.memberTempId === activeChild.tempId) : []),
    [lessons, activeChild],
  );

  function handleNextChild() {
    if (activeChildIndex < childMembers.length - 1) {
      setActiveChildIndex((i) => i + 1);
      return;
    }
    setStep('step4-self-lesson');
    router.push('/(wizard)/step4');
  }

  function handleBack() {
    if (activeChildIndex > 0) {
      setActiveChildIndex((i) => i - 1);
      return;
    }
    router.back();
  }

  function handleSubmit(lesson: WizardLesson) {
    upsertLesson(lesson);
    setShowForm(false);
    setEditingLesson(null);
  }

  function formatSchedule(l: WizardLesson): string {
    const slot = l.schedules[0];
    if (!slot) return '時間未設定';
    const days = slot.daysOfWeek.map((d) => DAY_LABELS[d] ?? d).join('・');
    return `${days} ${slot.startTime}〜${slot.endTime}`;
  }

  if (!activeChild) {
    // 子供がいない場合はそのまま step4 へ（通常は到達しないが防衛的）
    return (
      <ScreenContainer scrollable={false} padded={false}>
        <WizardHeader currentStep={3} onBack={handleBack} onAbort={() => router.replace('/')} />
        <View className="flex-1 items-center justify-center">
          <PrimaryButton label="次へ" onPress={handleNextChild} />
        </View>
      </ScreenContainer>
    );
  }

  const isLastChild = activeChildIndex === childMembers.length - 1;

  return (
    <ScreenContainer scrollable={false} padded={false}>
      <WizardHeader currentStep={3} onBack={handleBack} onAbort={() => router.replace('/')} />

      <ScrollView className="flex-1 px-4 pt-4">
        <Text className="text-h1 text-text-primary">{activeChild.name}ちゃんの習い事</Text>
        <Text className="mt-1 text-caption text-text-secondary">
          {activeChildIndex + 1}人目 / {childMembers.length}人中
        </Text>

        <View className="mt-4 gap-3">
          {activeChildLessons.map((l) => (
            <Pressable
              key={l.tempId}
              onPress={() => {
                setEditingLesson(l);
                setShowForm(true);
              }}
              className="rounded-card border border-border bg-surface p-4 active:bg-primary-light/30"
              accessibilityRole="button"
            >
              <Text className="text-h3 text-text-primary">{l.name}</Text>
              <Text className="mt-1 text-caption text-text-secondary">{formatSchedule(l)}</Text>
              {l.classroomName ? (
                <Text className="text-caption text-text-secondary">{l.classroomName}</Text>
              ) : null}
              <View className="mt-2 flex-row gap-3">
                <PrimaryButton
                  label="編集"
                  variant="text"
                  onPress={() => {
                    setEditingLesson(l);
                    setShowForm(true);
                  }}
                />
                <PrimaryButton
                  label="削除"
                  variant="text"
                  onPress={() => removeLesson(l.tempId)}
                />
              </View>
            </Pressable>
          ))}

          <Pressable
            onPress={() => {
              setEditingLesson(null);
              setShowForm(true);
            }}
            className="items-center rounded-card border-2 border-dashed border-primary bg-surface p-4 active:bg-primary-light/30"
            accessibilityRole="button"
            accessibilityLabel="習い事を追加"
          >
            <Text className="text-h3 text-primary-dark">+ 習い事を追加</Text>
          </Pressable>

          <Text className="mt-2 text-caption text-text-secondary">
            習い事がない場合はそのまま「次へ」を押してください
          </Text>
        </View>
      </ScrollView>

      <View className="border-t border-border bg-surface px-4 py-3">
        <PrimaryButton
          label={isLastChild ? '次へ' : `次へ: ${activeChildIndex + 2}人目`}
          onPress={handleNextChild}
        />
      </View>

      <LessonFormSheet
        visible={showForm}
        mode={editingLesson ? 'edit' : 'create'}
        memberId={activeChild.tempId}
        memberName={activeChild.name}
        initialValues={editingLesson ?? undefined}
        onSubmit={handleSubmit}
        onClose={() => {
          setShowForm(false);
          setEditingLesson(null);
        }}
      />
    </ScreenContainer>
  );
}
