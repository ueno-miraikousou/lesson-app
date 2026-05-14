import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';

import { AddModeBadge } from '../../components/wizard/AddModeBadge';
import { LessonFormSheet } from '../../components/forms/LessonFormSheet';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { WizardHeader } from '../../components/wizard/WizardHeader';
import { lookupLessonEmoji } from '../../features/wizard/lesson-presets';
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
  const mode = useWizardStore((s) => s.mode);
  const members = useWizardStore((s) => s.members);
  const lessons = useWizardStore((s) => s.lessons);
  const upsertLesson = useWizardStore((s) => s.upsertLesson);
  const removeLesson = useWizardStore((s) => s.removeLesson);
  const setStep = useWizardStore((s) => s.setStep);

  const childMembers = useMemo(() => members.filter((m) => m.role === 'child'), [members]);

  const [activeChildIndex, setActiveChildIndex] = useState(0);
  // null = blank create form. A full WizardLesson = edit existing record.
  // A Partial = "add another time" prefill (carries name/classroom/location
  // from the source lesson but no tempId so LessonFormSheet treats it as a
  // new record — matches designer v0.3 "separate row per time" contract).
  const [editingLesson, setEditingLesson] = useState<Partial<WizardLesson> | null>(null);
  const [showForm, setShowForm] = useState(false);

  const activeChild = childMembers[activeChildIndex];
  // Lessons for the active child are sorted so that records sharing the same
  // name (i.e. the same activity at a different time) appear next to each
  // other. This is the visual grouping required by designer v0.3 §WIZ-03 #3,
  // and uses a stable key (insertion order) as a tiebreaker so edits don't
  // shuffle the list around.
  const activeChildLessons = useMemo(() => {
    if (!activeChild) return [] as WizardLesson[];
    const ownLessons = lessons.filter((l) => l.memberTempId === activeChild.tempId);
    const firstIndexByName = new Map<string, number>();
    ownLessons.forEach((l, idx) => {
      if (!firstIndexByName.has(l.name)) firstIndexByName.set(l.name, idx);
    });
    return [...ownLessons].sort((a, b) => {
      const ai = firstIndexByName.get(a.name) ?? 0;
      const bi = firstIndexByName.get(b.name) ?? 0;
      return ai - bi;
    });
  }, [lessons, activeChild]);

  function handleNextChild() {
    if (activeChildIndex < childMembers.length - 1) {
      setActiveChildIndex((i) => i + 1);
      return;
    }
    // ADR-006 / designer §4.2: mode=add では WIZ-04 を自動スキップ
    if (mode === 'add') {
      setStep('step5-other-members');
      router.push('/(wizard)/step5');
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

  /**
   * "Add another time" — open the form prefilled with this lesson's name,
   * classroom, and location, but with an empty schedule. The submitted record
   * becomes a separate WizardLesson row (different tempId), matching the
   * designer v0.3 contract: "same activity at a different time = separate row".
   */
  function handleAddAnotherTime(source: WizardLesson) {
    // Intentionally omit tempId so LessonFormSheet treats this as a new record.
    setEditingLesson({
      memberTempId: source.memberTempId,
      name: source.name,
      classroomName: source.classroomName,
      location: source.location,
      schedules: [],
    });
    setShowForm(true);
  }

  function formatSchedule(l: WizardLesson): string {
    const slot = l.schedules[0];
    if (!slot) return '時間未設定';
    const days = slot.daysOfWeek.map((d) => DAY_LABELS[d] ?? d).join('・');
    return `${days} ${slot.startTime}〜${slot.endTime}`;
  }

  /**
   * Detect identical schedules (same days + same start time) already saved for
   * the active child. The form sheet uses this to block duplicate inserts —
   * e.g. trying to add a second "Piano on MO 17:00" when one already exists.
   */
  function isDuplicateSchedule(candidate: WizardLesson): boolean {
    const slot = candidate.schedules[0];
    if (!slot) return false;
    return activeChildLessons.some((l) => {
      if (l.tempId === candidate.tempId) return false; // editing the same record
      if (l.name !== candidate.name) return false;
      const other = l.schedules[0];
      if (!other) return false;
      if (other.startTime !== slot.startTime) return false;
      // Same name + same start time + overlapping day set = duplicate
      return slot.daysOfWeek.some((d) => other.daysOfWeek.includes(d));
    });
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
        {mode === 'add' ? (
          <View className="mb-2" testID="wiz-add-mode-banner-step3">
            <AddModeBadge />
          </View>
        ) : null}
        <Text className="text-h1 text-text-primary">{activeChild.name}ちゃんの習い事</Text>
        <Text className="mt-1 text-caption text-text-secondary">
          {activeChildIndex + 1}人目 / {childMembers.length}人中
        </Text>

        <View className="mt-4 gap-3">
          {activeChildLessons.map((l, idx) => {
            const next = activeChildLessons[idx + 1];
            const isLastOfGroup = !next || next.name !== l.name;
            const emoji = lookupLessonEmoji(l.name);
            return (
              <View key={l.tempId}>
                <Pressable
                  onPress={() => {
                    setEditingLesson(l);
                    setShowForm(true);
                  }}
                  className="rounded-card border border-border bg-surface p-4 active:bg-primary-light/30"
                  accessibilityRole="button"
                  accessibilityLabel={`${l.name}、${formatSchedule(l)}`}
                >
                  <View className="flex-row items-center">
                    {emoji ? (
                      <Text
                        accessibilityElementsHidden
                        importantForAccessibility="no"
                        className="mr-2 text-h3"
                      >
                        {emoji}
                      </Text>
                    ) : null}
                    <Text className="flex-1 text-h3 text-text-primary">{l.name}</Text>
                  </View>
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
                {isLastOfGroup ? (
                  <Pressable
                    onPress={() => handleAddAnotherTime(l)}
                    className="mt-1 self-start rounded-button border border-dashed border-primary px-3 py-2 active:bg-primary-light/30"
                    accessibilityRole="button"
                    accessibilityLabel={`${l.name}を別の時間で追加`}
                  >
                    <Text className="text-caption text-primary-dark">+ {l.name}を別の時間で追加</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}

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
        // edit mode only when we are reusing an existing tempId. The
        // "add another time" prefill carries name/classroom/location only and
        // intentionally has no tempId, so it stays in create mode.
        mode={editingLesson?.tempId ? 'edit' : 'create'}
        memberId={activeChild.tempId}
        memberName={activeChild.name}
        initialValues={editingLesson ?? undefined}
        isDuplicate={isDuplicateSchedule}
        onSubmit={handleSubmit}
        onClose={() => {
          setShowForm(false);
          setEditingLesson(null);
        }}
      />
    </ScreenContainer>
  );
}
