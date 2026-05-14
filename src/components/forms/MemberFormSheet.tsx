import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '../ui/PrimaryButton';
import { TextField } from '../ui/TextField';
import { memberPalette } from '../../theme/colors';
import { tempId } from '../../lib/id';
import type { MemberGender, MemberRole } from '../../types/database';
import type { WizardMember } from '../../stores/wizard-store';

export type MemberFormMode = 'create-child' | 'create-other' | 'edit';

export interface MemberFormSheetProps {
  visible: boolean;
  mode: MemberFormMode;
  initialValues?: Partial<WizardMember>;
  /** すでに使用中の色（重複回避のための表示用、任意） */
  usedColors?: readonly string[];
  /** ウィザードで使う場合の表示文脈 */
  wizardContext?: {
    currentIndex: number;
    totalCount: number;
    onPrevious?: () => void;
  };
  onSubmit: (member: WizardMember) => void;
  onClose: () => void;
}

const DEFAULT_BIRTH_DATE = new Date(2018, 0, 1);

/**
 * MemberFormSheet — メンバー（子供/親/その他）入力フォーム。
 *
 * 仕様: 02_設計/画面/共通フォームコンポーネント仕様.md §1
 *      02_設計/画面/WIZ-ウィザード一括設計.md WIZ-02
 *
 * 注意: BottomSheet ではなく FullScreen Modal で実装している。理由は WIZ-02 が
 * 「1画面1質問」のフルスクリーン体験で、BottomSheet 越しの背景は不要なため。
 * MEM-01 から呼び出す場合も Modal で問題なし。
 */
export function MemberFormSheet({
  visible,
  mode,
  initialValues,
  usedColors,
  wizardContext,
  onSubmit,
  onClose,
}: MemberFormSheetProps) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [birthDate, setBirthDate] = useState<Date | null>(
    initialValues?.birthDate ? new Date(initialValues.birthDate) : null,
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [gender, setGender] = useState<MemberGender | null>(initialValues?.gender ?? null);
  const [role, setRole] = useState<MemberRole>(
    initialValues?.role ?? (mode === 'create-child' ? 'child' : 'parent'),
  );
  const [colorHex, setColorHex] = useState<string>(
    initialValues?.colorHex ?? pickInitialColor(usedColors ?? []),
  );
  const [nameError, setNameError] = useState<string | undefined>();

  function pickInitialColor(used: readonly string[]): string {
    const available = memberPalette.find((c) => !used.includes(c));
    return available ?? memberPalette[0];
  }

  function validate(): boolean {
    setNameError(undefined);
    if (!name.trim()) {
      setNameError('お名前を入力してください');
      return false;
    }
    if (name.length > 30) {
      setNameError('30文字以内で入力してください');
      return false;
    }
    return true;
  }

  function handleSubmit() {
    if (!validate()) return;
    const result: WizardMember = {
      tempId: initialValues?.tempId ?? tempId('member'),
      name: name.trim(),
      birthDate: birthDate ? formatDate(birthDate) : null,
      gender,
      role,
      colorHex,
    };
    onSubmit(result);
  }

  function formatDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function birthDateLabel(): string {
    if (!birthDate) return '選択してください';
    return `${birthDate.getFullYear()}年 ${birthDate.getMonth() + 1}月 ${birthDate.getDate()}日`;
  }

  const showRolePicker = mode !== 'create-child';
  const submitLabel =
    mode === 'edit' ? '保存' : wizardContext ? wizardContext.currentIndex < wizardContext.totalCount - 1 ? `次へ: ${wizardContext.currentIndex + 2}人目` : '次へ' : '追加';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
        {/* ヘッダー */}
        <View className="flex-row items-center justify-between border-b border-border px-4 py-3">
          <Pressable
            onPress={onClose}
            className="min-h-tap min-w-tap items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="閉じる"
          >
            <Text className="text-h2 text-text-primary">×</Text>
          </Pressable>
          <Text className="text-h3 text-text-primary">
            {mode === 'edit' ? 'メンバー編集' : 'メンバーを追加'}
          </Text>
          <View className="min-w-tap" />
        </View>

        {wizardContext ? (
          <View className="border-b border-border bg-primary-light/40 px-4 py-2">
            <Text className="text-caption text-text-secondary">
              お子さん {wizardContext.currentIndex + 1}人目 ({wizardContext.totalCount}人中)
            </Text>
          </View>
        ) : null}

        <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
          {showRolePicker ? (
            <View className="mb-4">
              <Text className="mb-2 text-caption text-text-primary">どなたですか？</Text>
              <View className="flex-row gap-2">
                {(['parent', 'other'] as MemberRole[]).map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => setRole(r)}
                    className={`flex-1 items-center rounded-button border-2 px-3 py-3 ${
                      role === r ? 'border-primary bg-primary-light' : 'border-border bg-surface'
                    }`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: role === r }}
                  >
                    <Text className={`text-body ${role === r ? 'text-primary-dark' : 'text-text-primary'}`}>
                      {r === 'parent' ? '👩 親' : '👤 その他'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          <TextField
            label="お名前"
            value={name}
            onChangeText={setName}
            placeholder="ニックネームでもOK"
            autoCapitalize="none"
            maxLength={30}
            errorText={nameError}
          />

          <View className="mb-4">
            <Text className="mb-1 text-caption text-text-primary">生年月日（任意）</Text>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              className="min-h-tap items-start justify-center rounded-button border border-border bg-surface px-3 py-3"
              accessibilityRole="button"
            >
              <Text className={birthDate ? 'text-body text-text-primary' : 'text-body text-text-secondary'}>
                {birthDateLabel()}
              </Text>
            </Pressable>
            {showDatePicker ? (
              <DateTimePicker
                value={birthDate ?? DEFAULT_BIRTH_DATE}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                maximumDate={new Date()}
                minimumDate={new Date(1905, 0, 1)}
                onChange={(_event, selected) => {
                  if (Platform.OS !== 'ios') {
                    setShowDatePicker(false);
                  }
                  if (selected) {
                    setBirthDate(selected);
                  }
                }}
              />
            ) : null}
          </View>

          <View className="mb-4">
            <Text className="mb-2 text-caption text-text-primary">性別（任意）</Text>
            <View className="flex-row gap-2">
              {(
                [
                  ['female', '女の子'],
                  ['male', '男の子'],
                  ['unspecified', '答えない'],
                ] as readonly [MemberGender, string][]
              ).map(([value, label]) => {
                const selected = gender === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setGender(selected ? null : value)}
                    className={`flex-1 items-center rounded-button border-2 px-2 py-2 ${
                      selected ? 'border-primary bg-primary-light' : 'border-border bg-surface'
                    }`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <Text className={`text-body ${selected ? 'text-primary-dark' : 'text-text-primary'}`}>
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="mb-6">
            <Text className="mb-2 text-caption text-text-primary">カレンダーの色</Text>
            <View className="flex-row flex-wrap gap-2">
              {memberPalette.map((c) => {
                const selected = colorHex === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setColorHex(c)}
                    className={`h-10 w-10 items-center justify-center rounded-full border-2 ${
                      selected ? 'border-primary-dark' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`色 ${c}`}
                  >
                    {selected ? <Text className="text-white">✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        </ScrollView>

        {/* フッター */}
        <View className="border-t border-border bg-surface px-4 py-3">
          {wizardContext?.onPrevious ? (
            <View className="mb-2">
              <PrimaryButton label="< 戻る" variant="text" onPress={wizardContext.onPrevious} />
            </View>
          ) : null}
          <PrimaryButton label={submitLabel} onPress={handleSubmit} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
