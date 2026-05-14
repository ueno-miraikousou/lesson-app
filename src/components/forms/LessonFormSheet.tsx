import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '../ui/PrimaryButton';
import { TextField } from '../ui/TextField';
import { LESSON_PRESETS } from '../../features/wizard/lesson-presets';
import { tempId } from '../../lib/id';
import type { WizardLesson, WizardScheduleSlot } from '../../stores/wizard-store';

export interface LessonFormSheetProps {
  visible: boolean;
  mode: 'create' | 'edit';
  memberId: string; // memberTempId
  memberName: string;
  initialValues?: Partial<WizardLesson>;
  /**
   * Called before commit to check whether the candidate lesson collides with
   * an existing one (same name + same day(s) + same start time on the same
   * member). When the callback returns true the form rejects the submit and
   * shows an inline error, so the user must either tweak the schedule or
   * delete the conflicting entry.
   */
  isDuplicate?: (candidate: WizardLesson) => boolean;
  onSubmit: (lesson: WizardLesson) => void;
  onClose: () => void;
}

type DayOfWeek = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';

const DAYS: readonly { value: DayOfWeek; label: string }[] = [
  { value: 'SU', label: '日' },
  { value: 'MO', label: '月' },
  { value: 'TU', label: '火' },
  { value: 'WE', label: '水' },
  { value: 'TH', label: '木' },
  { value: 'FR', label: '金' },
  { value: 'SA', label: '土' },
];

// Suggestion list lives in `features/wizard/lesson-presets` (single source of truth).
// Using the imported LESSON_PRESETS here keeps the chip labels and the
// downstream emoji-by-name lookup in sync.

/**
 * LessonFormSheet — 習い事入力フォーム。
 *
 * 仕様: 02_設計/画面/共通フォームコンポーネント仕様.md §2
 *      02_設計/画面/WIZ-ウィザード一括設計.md WIZ-03
 *
 * MVP では「1習い事 = 1時間帯（曜日複数 OK）」の制約。複数時間帯は別習い事として登録。
 */
export function LessonFormSheet({
  visible,
  mode,
  memberId,
  memberName,
  initialValues,
  isDuplicate,
  onSubmit,
  onClose,
}: LessonFormSheetProps) {
  const initialSlot: WizardScheduleSlot = initialValues?.schedules?.[0] ?? {
    tempId: tempId('schedule'),
    daysOfWeek: [],
    startTime: '17:00',
    endTime: '18:00',
    recurrenceUntil: null,
  };

  const [name, setName] = useState(initialValues?.name ?? '');
  const [classroomName, setClassroomName] = useState(initialValues?.classroomName ?? '');
  const [location, setLocation] = useState(initialValues?.location ?? '');
  const [days, setDays] = useState<readonly DayOfWeek[]>(initialSlot.daysOfWeek);
  const [startTime, setStartTime] = useState(initialSlot.startTime);
  const [endTime, setEndTime] = useState(initialSlot.endTime);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [error, setError] = useState<string | undefined>();

  function toggleDay(d: DayOfWeek) {
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  }

  function applyPresetName(presetName: string) {
    // Only the user-visible name is stored. The emoji is recomputed at render
    // time via lookupLessonEmoji(name), so the saved record stays portable.
    setName(presetName);
  }

  function parseTimeToDate(t: string): Date {
    const [h = 0, m = 0] = t.split(':').map((n) => parseInt(n, 10));
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  }

  function formatTime(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function handleSubmit() {
    setError(undefined);
    if (!name.trim()) {
      setError('習い事の名前を入力してください');
      return;
    }
    if (days.length === 0) {
      setError('曜日を1つ以上選択してください');
      return;
    }
    if (startTime >= endTime) {
      setError('終了時刻は開始時刻より後にしてください');
      return;
    }

    const slot: WizardScheduleSlot = {
      tempId: initialSlot.tempId,
      daysOfWeek: days,
      startTime,
      endTime,
      recurrenceUntil: initialSlot.recurrenceUntil ?? null,
    };

    const lesson: WizardLesson = {
      tempId: initialValues?.tempId ?? tempId('lesson'),
      memberTempId: memberId,
      name: name.trim(),
      classroomName: classroomName.trim() || null,
      location: location.trim() || null,
      schedules: [slot],
    };

    if (isDuplicate?.(lesson)) {
      setError('同じ習い事を同じ曜日・同じ開始時刻ですでに登録しています');
      return;
    }

    onSubmit(lesson);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
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
            {mode === 'edit' ? '習い事を編集' : '習い事を追加'}
          </Text>
          <View className="min-w-tap" />
        </View>

        <View className="border-b border-border bg-primary-light/40 px-4 py-2">
          <Text className="text-caption text-text-secondary">{memberName}の習い事</Text>
        </View>

        <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
          <TextField
            label="何の習い事？"
            value={name}
            onChangeText={setName}
            placeholder="例: スイミング"
            autoCapitalize="none"
            maxLength={30}
          />

          <Text className="mb-2 text-caption text-text-secondary">よく選ばれる習い事</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mb-4 -mx-1"
            accessibilityRole="list"
          >
            {LESSON_PRESETS.map((preset) => (
              <Pressable
                key={preset.name}
                onPress={() => applyPresetName(preset.name)}
                className="mx-1 flex-row items-center rounded-button border border-border bg-surface px-3 py-2 active:bg-primary-light"
                accessibilityRole="button"
                accessibilityLabel={preset.name}
                accessibilityHint="このサジェストを名前欄に適用します"
              >
                {/* Emoji is decorative — hide from screen readers so they read
                    only the meaningful name ("スイミング", not "🏊 スイミング"). */}
                <Text accessibilityElementsHidden importantForAccessibility="no" className="text-body">
                  {preset.emoji}
                </Text>
                <Text className="ml-1 text-body text-text-primary">{preset.name}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <TextField
            label="教室名（任意）"
            value={classroomName}
            onChangeText={setClassroomName}
            placeholder="例: ABCスイミングスクール"
            maxLength={50}
          />

          <View className="mb-4">
            <Text className="mb-2 text-caption text-text-primary">曜日</Text>
            <View className="flex-row gap-1">
              {DAYS.map((d) => {
                const selected = days.includes(d.value);
                return (
                  <Pressable
                    key={d.value}
                    onPress={() => toggleDay(d.value)}
                    className={`flex-1 items-center rounded-button border-2 py-2 ${
                      selected ? 'border-primary bg-primary-light' : 'border-border bg-surface'
                    }`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                  >
                    <Text className={`text-body ${selected ? 'text-primary-dark' : 'text-text-primary'}`}>
                      {d.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="mb-4 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-caption text-text-primary">開始時間</Text>
              <Pressable
                onPress={() => setShowStartPicker(true)}
                className="min-h-tap items-start justify-center rounded-button border border-border bg-surface px-3 py-3"
                accessibilityRole="button"
              >
                <Text className="text-body text-text-primary">{startTime}</Text>
              </Pressable>
              {showStartPicker ? (
                <DateTimePicker
                  value={parseTimeToDate(startTime)}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  is24Hour
                  onChange={(_event, selected) => {
                    if (Platform.OS !== 'ios') setShowStartPicker(false);
                    if (selected) setStartTime(formatTime(selected));
                  }}
                />
              ) : null}
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-caption text-text-primary">終了時間</Text>
              <Pressable
                onPress={() => setShowEndPicker(true)}
                className="min-h-tap items-start justify-center rounded-button border border-border bg-surface px-3 py-3"
                accessibilityRole="button"
              >
                <Text className="text-body text-text-primary">{endTime}</Text>
              </Pressable>
              {showEndPicker ? (
                <DateTimePicker
                  value={parseTimeToDate(endTime)}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  is24Hour
                  onChange={(_event, selected) => {
                    if (Platform.OS !== 'ios') setShowEndPicker(false);
                    if (selected) setEndTime(formatTime(selected));
                  }}
                />
              ) : null}
            </View>
          </View>

          <TextField
            label="場所（任意）"
            value={location}
            onChangeText={setLocation}
            placeholder="例: 〇〇市民プール"
            maxLength={50}
          />

          {error ? (
            <Text className="mt-2 text-caption text-error" accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </ScrollView>

        <View className="border-t border-border bg-surface px-4 py-3">
          <PrimaryButton label={mode === 'edit' ? '保存' : '追加'} onPress={handleSubmit} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
