import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { LessonFormSheet } from '../../components/forms/LessonFormSheet';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { WizardHeader } from '../../components/wizard/WizardHeader';
import { useAuthStore } from '../../stores/auth-store';
import { memberPalette } from '../../theme/colors';
import { useWizardStore, type WizardLesson, type WizardMember } from '../../stores/wizard-store';

const OPERATOR_TEMP_ID = 'operator';

/**
 * WIZ-04 Step 4: 操作者（妻）自身の習い事。
 *
 * **B案実装（社長 Q5 確定 / designer v0.2 §WIZ-04 訂正版）**:
 *   - 「あり/なし」を問わず、操作者の members レコードを `role='parent'` で必ず作成
 *   - 操作者用の tempId は固定値 'operator' を使い、再実行時の重複作成を防ぐ（冪等性）
 *   - WIZ-10 でウィザード再実行された場合も同じ tempId が使われるため、上書きされる
 *
 * 参照: 02_設計/画面/WIZ-ウィザード一括設計.md WIZ-04 (B案)
 *      02_設計/mobile-engineer引継ぎサマリ.md §5.6
 */
export default function Step4Screen() {
  const session = useAuthStore((s) => s.session);
  const members = useWizardStore((s) => s.members);
  const lessons = useWizardStore((s) => s.lessons);
  const upsertMember = useWizardStore((s) => s.upsertMember);
  const upsertLesson = useWizardStore((s) => s.upsertLesson);
  const removeLesson = useWizardStore((s) => s.removeLesson);
  const hasSelfLesson = useWizardStore((s) => s.hasSelfLesson);
  const setHasSelfLesson = useWizardStore((s) => s.setHasSelfLesson);
  const setStep = useWizardStore((s) => s.setStep);

  const operator = useMemo(() => members.find((m) => m.tempId === OPERATOR_TEMP_ID), [members]);
  const operatorLessons = useMemo(
    () => lessons.filter((l) => l.memberTempId === OPERATOR_TEMP_ID),
    [lessons],
  );
  const usedColors = useMemo(() => members.map((m) => m.colorHex), [members]);

  const [showForm, setShowForm] = useState(false);
  const [editingLesson, setEditingLesson] = useState<WizardLesson | null>(null);

  // 画面表示時に operator メンバーを冪等に作成（B案: hasSelfLesson の選択前から作っておく）
  useEffect(() => {
    if (operator) return;
    const displayName =
      session?.user?.user_metadata?.['display_name'] ??
      session?.user?.email?.split('@')[0] ??
      'あなた';
    const usedColor = usedColors.includes(memberPalette[0]) ? memberPalette[1] : memberPalette[0];
    const newOperator: WizardMember = {
      tempId: OPERATOR_TEMP_ID,
      name: typeof displayName === 'string' ? displayName : 'あなた',
      birthDate: null,
      gender: null,
      role: 'parent',
      colorHex: usedColor,
    };
    upsertMember(newOperator);
  }, [operator, session, upsertMember, usedColors]);

  function handleNext() {
    setStep('step5-other-members');
    router.push('/(wizard)/step5');
  }

  function handleBack() {
    router.back();
  }

  function handleAddLesson(lesson: WizardLesson) {
    upsertLesson({ ...lesson, memberTempId: OPERATOR_TEMP_ID });
    setShowForm(false);
    setEditingLesson(null);
    setHasSelfLesson(true);
  }

  function handleNoSelfLesson() {
    setHasSelfLesson(false);
    handleNext();
  }

  // 「あり/なし」未選択時の初期表示
  if (hasSelfLesson === null && operatorLessons.length === 0) {
    return (
      <ScreenContainer scrollable={false} padded={false}>
        <WizardHeader currentStep={4} onBack={handleBack} onAbort={() => router.replace('/')} />

        <View className="flex-1 px-4 pt-6">
          <Text className="text-h1 text-text-primary">あなた自身の習い事は{'\n'}ありますか？</Text>
          <Text className="mt-2 text-caption text-text-secondary">
            家族の予定と一緒に管理できます
          </Text>

          <View className="mt-8 gap-3">
            <Pressable
              onPress={() => {
                setHasSelfLesson(true);
                setShowForm(true);
              }}
              className="rounded-card border-2 border-primary bg-primary-light/40 p-5 active:bg-primary-light"
              accessibilityRole="button"
            >
              <Text className="text-h3 text-primary-dark">✅ あり、登録する</Text>
            </Pressable>
            <Pressable
              onPress={handleNoSelfLesson}
              className="rounded-card border-2 border-border bg-surface p-5 active:bg-primary-light/30"
              accessibilityRole="button"
            >
              <Text className="text-h3 text-text-primary">⏭ なし、または後で</Text>
            </Pressable>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable={false} padded={false}>
      <WizardHeader currentStep={4} onBack={handleBack} onAbort={() => router.replace('/')} />

      <View className="flex-1 px-4 pt-4">
        <Text className="text-h1 text-text-primary">あなたの習い事</Text>
        <Text className="mt-1 text-caption text-text-secondary">
          複数の習い事を追加できます
        </Text>

        <View className="mt-4 gap-3">
          {operatorLessons.map((l) => (
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
              <View className="mt-2 flex-row gap-3">
                <PrimaryButton
                  label="編集"
                  variant="text"
                  onPress={() => {
                    setEditingLesson(l);
                    setShowForm(true);
                  }}
                />
                <PrimaryButton label="削除" variant="text" onPress={() => removeLesson(l.tempId)} />
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
          >
            <Text className="text-h3 text-primary-dark">+ 習い事を追加</Text>
          </Pressable>
        </View>
      </View>

      <View className="border-t border-border bg-surface px-4 py-3">
        <PrimaryButton label="次へ" onPress={handleNext} />
      </View>

      <LessonFormSheet
        visible={showForm}
        mode={editingLesson ? 'edit' : 'create'}
        memberId={OPERATOR_TEMP_ID}
        memberName={operator?.name ?? 'あなた'}
        initialValues={editingLesson ?? undefined}
        onSubmit={handleAddLesson}
        onClose={() => {
          setShowForm(false);
          setEditingLesson(null);
        }}
      />
    </ScreenContainer>
  );
}

// 操作者用の固定 tempId（他モジュールから参照される可能性に備えてエクスポート）
export { OPERATOR_TEMP_ID };
