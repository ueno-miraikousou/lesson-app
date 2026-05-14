import DateTimePicker from '@react-native-community/datetimepicker';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, Switch, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '../ui/PrimaryButton';
import { TextField } from '../ui/TextField';
import {
  createSchedule,
  splitScheduleAt,
  updateSchedule,
  type CreateScheduleInput,
} from '../../lib/schedules';
import {
  describeRRuleJa,
  parseRRule,
  serializeRRule,
  toFloatingJST,
  WEEKDAY_ORDER,
  WEEKDAYS_JA,
  type RecurrenceWeekday,
} from '../../lib/recurrence';
import type { Schedule } from '../../types/database';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface ScheduleFormLessonOption {
  id: string;
  memberId: string;
  memberName: string;
  name: string;
}

export type ScheduleFormEditScope = 'all' | 'thisAndFuture';

export interface ScheduleFormInitialValues {
  schedule: Schedule;
  /** S-09 「今後すべて」モード時、分割境界 (この日以降を新 schedule に切り出す) */
  splitFrom?: Date;
  /** どちらのモードで起動するかの宣言。'thisAndFuture' は splitFrom を要求 */
  editScope: ScheduleFormEditScope;
}

export type ScheduleFormSheetProps =
  | {
      mode?: 'create';
      visible: boolean;
      defaultDate: Date;
      lessons: readonly ScheduleFormLessonOption[];
      onClose: () => void;
      onCreated: () => void;
      onUpdated?: never;
      initialValues?: never;
    }
  | {
      mode: 'edit';
      visible: boolean;
      defaultDate: Date;
      lessons: readonly ScheduleFormLessonOption[];
      onClose: () => void;
      onCreated?: never;
      onUpdated: () => void;
      initialValues: ScheduleFormInitialValues;
    };

function combineDateTime(date: Date, hours: number, minutes: number): Date {
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatTimeLabel(hours: number, minutes: number): string {
  return `${pad(hours)}:${pad(minutes)}`;
}

function formatDateLabel(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * CAL-05 予定フォーム (Sprint 1 単発 + Sprint 2 繰り返し + 編集)。
 *
 * mode='create' (default): FAB から新規追加 (S-07 + S-08)
 * mode='edit' + editScope='all': 既存 schedule を直接 UPDATE (S-09 「すべて変更」)
 * mode='edit' + editScope='thisAndFuture': splitScheduleAt 経由で分割 (S-09 「今後すべて変更」)
 */
export function ScheduleFormSheet(props: ScheduleFormSheetProps) {
  const { visible, lessons, onClose, defaultDate } = props;
  const isEdit = props.mode === 'edit';
  const initialValues = isEdit ? props.initialValues : undefined;

  const computeInitialState = useMemo(() => {
    if (!initialValues) {
      return {
        lessonId: lessons[0]?.id ?? '',
        date: defaultDate,
        startH: 17,
        startM: 0,
        endH: 18,
        endM: 0,
        note: '',
        recurrenceOn: false,
        recurrenceDays: [] as readonly RecurrenceWeekday[],
        recurrenceUntil: null as Date | null,
      };
    }
    const s = initialValues.schedule;
    const startFloating = toFloatingJST(s.start_at);
    const endFloating = toFloatingJST(s.end_at);
    const baseDate = initialValues.splitFrom ?? startFloating;
    const rule = s.recurrence_rule ? parseRRule(s.recurrence_rule) : null;
    return {
      lessonId: s.lesson_id,
      date: baseDate,
      startH: startFloating.getHours(),
      startM: startFloating.getMinutes(),
      endH: endFloating.getHours(),
      endM: endFloating.getMinutes(),
      note: s.note ?? '',
      recurrenceOn: !!rule,
      recurrenceDays: (rule?.byday ?? []) as readonly RecurrenceWeekday[],
      recurrenceUntil: s.recurrence_until ? toFloatingJST(s.recurrence_until) : null,
    };
  }, [initialValues, lessons, defaultDate]);

  const [selectedLessonId, setSelectedLessonId] = useState<string>(computeInitialState.lessonId);
  const [date, setDate] = useState<Date>(computeInitialState.date);
  const [startHour, setStartHour] = useState(computeInitialState.startH);
  const [startMinute, setStartMinute] = useState(computeInitialState.startM);
  const [endHour, setEndHour] = useState(computeInitialState.endH);
  const [endMinute, setEndMinute] = useState(computeInitialState.endM);
  const [note, setNote] = useState(computeInitialState.note);
  const [recurrenceOn, setRecurrenceOn] = useState(computeInitialState.recurrenceOn);
  const [recurrenceDays, setRecurrenceDays] = useState<readonly RecurrenceWeekday[]>(
    computeInitialState.recurrenceDays,
  );
  const [recurrenceUntil, setRecurrenceUntil] = useState<Date | null>(
    computeInitialState.recurrenceUntil,
  );

  useEffect(() => {
    if (!visible) return;
    setSelectedLessonId(computeInitialState.lessonId);
    setDate(computeInitialState.date);
    setStartHour(computeInitialState.startH);
    setStartMinute(computeInitialState.startM);
    setEndHour(computeInitialState.endH);
    setEndMinute(computeInitialState.endM);
    setNote(computeInitialState.note);
    setRecurrenceOn(computeInitialState.recurrenceOn);
    setRecurrenceDays(computeInitialState.recurrenceDays);
    setRecurrenceUntil(computeInitialState.recurrenceUntil);
  }, [visible, computeInitialState]);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showUntilPicker, setShowUntilPicker] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [longDurationConfirmed, setLongDurationConfirmed] = useState(false);

  const recurrenceRule = useMemo(() => {
    if (!recurrenceOn || recurrenceDays.length === 0) return null;
    return serializeRRule({
      freq: 'WEEKLY',
      byday: [...recurrenceDays],
      until: recurrenceUntil ?? undefined,
    });
  }, [recurrenceOn, recurrenceDays, recurrenceUntil]);

  const recurrenceDescription = useMemo(() => {
    if (!recurrenceRule) return null;
    const startAt = combineDateTime(date, startHour, startMinute);
    return describeRRuleJa(recurrenceRule, startAt);
  }, [recurrenceRule, date, startHour, startMinute]);

  function toggleRecurrenceDay(day: RecurrenceWeekday) {
    setRecurrenceDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  async function handleSubmit() {
    setError(undefined);
    if (!selectedLessonId) {
      setError('習い事を選択してください');
      return;
    }
    const startAt = combineDateTime(date, startHour, startMinute);
    const endAt = combineDateTime(date, endHour, endMinute);
    if (endAt <= startAt) {
      setError('終了は開始より後にしてください');
      return;
    }
    if (endAt.getTime() - startAt.getTime() > ONE_DAY_MS && !longDurationConfirmed) {
      setError('24時間以上の予定です。もう一度「保存」で続行します');
      setLongDurationConfirmed(true);
      return;
    }
    if (recurrenceOn && recurrenceDays.length === 0) {
      setError('繰り返し曜日を 1 つ以上選択してください');
      return;
    }
    if (recurrenceUntil && recurrenceUntil <= startAt) {
      setError('繰り返しの終了日は開始日より後にしてください');
      return;
    }

    setSubmitting(true);
    try {
      const baseInput = {
        lessonId: selectedLessonId,
        startAt,
        endAt,
        note: note.trim() || null,
        recurrenceRule,
        recurrenceUntil: recurrenceOn ? recurrenceUntil : null,
      } satisfies CreateScheduleInput;

      if (isEdit && initialValues) {
        if (initialValues.editScope === 'all') {
          await updateSchedule({
            id: initialValues.schedule.id,
            lessonId: selectedLessonId,
            startAt,
            endAt,
            note: note.trim() || null,
            recurrenceRule,
            recurrenceUntil: recurrenceOn ? recurrenceUntil : null,
          });
        } else {
          const splitFrom = initialValues.splitFrom ?? startAt;
          await splitScheduleAt({
            source: initialValues.schedule,
            splitFrom,
            newSchedule: baseInput,
          });
        }
        props.onUpdated?.();
      } else {
        await createSchedule(baseInput);
        props.onCreated?.();
      }
      resetForm();
    } catch {
      setError('保存に失敗しました。再試行してください');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    if (!isEdit) {
      setNote('');
      setRecurrenceOn(false);
      setRecurrenceDays([]);
      setRecurrenceUntil(null);
    }
    setError(undefined);
    setLongDurationConfirmed(false);
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  const selectedLesson = lessons.find((l) => l.id === selectedLessonId);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
        <View
          className="flex-row items-center justify-between border-b border-border px-4 py-3"
          testID="schedule-form-header"
        >
          <Pressable
            onPress={handleClose}
            className="min-h-tap min-w-tap items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="閉じる"
            testID="schedule-form-close"
          >
            <Text className="text-h2 text-text-primary">×</Text>
          </Pressable>
          <Text className="text-h3 text-text-primary">
            {isEdit
              ? initialValues?.editScope === 'thisAndFuture'
                ? '今後すべての予定を編集'
                : '予定を編集'
              : '予定を追加'}
          </Text>
          <View className="min-w-tap" />
        </View>

        <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
          <View className="mb-4">
            <Text className="mb-2 text-caption text-text-primary">習い事</Text>
            {lessons.length === 0 ? (
              <Text className="text-body text-text-secondary" testID="schedule-form-no-lessons">
                先に習い事を登録してください
              </Text>
            ) : (
              <View className="gap-2" testID="schedule-form-lesson-list">
                {lessons.map((l) => {
                  const selected = l.id === selectedLessonId;
                  return (
                    <Pressable
                      key={l.id}
                      onPress={() => setSelectedLessonId(l.id)}
                      className={`rounded-button border-2 px-3 py-3 ${
                        selected ? 'border-primary bg-primary-light' : 'border-border bg-surface'
                      }`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      testID={`schedule-form-lesson-${l.id}`}
                    >
                      <Text className="text-body text-text-primary">
                        {l.memberName} ・ {l.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          <View className="mb-4">
            <Text className="mb-1 text-caption text-text-primary">日付</Text>
            <Pressable
              onPress={() => setShowDatePicker(true)}
              className="min-h-tap items-start justify-center rounded-button border border-border bg-surface px-3 py-3"
              accessibilityRole="button"
              testID="schedule-form-date"
            >
              <Text className="text-body text-text-primary">{formatDateLabel(date)}</Text>
            </Pressable>
            {showDatePicker ? (
              <DateTimePicker
                value={date}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_event, selected) => {
                  if (Platform.OS !== 'ios') setShowDatePicker(false);
                  if (selected) setDate(selected);
                }}
              />
            ) : null}
          </View>

          <View className="mb-4 flex-row gap-3">
            <View className="flex-1">
              <Text className="mb-1 text-caption text-text-primary">開始</Text>
              <Pressable
                onPress={() => setShowStartPicker(true)}
                className="min-h-tap items-start justify-center rounded-button border border-border bg-surface px-3 py-3"
                accessibilityRole="button"
                testID="schedule-form-start"
              >
                <Text className="text-body text-text-primary">
                  {formatTimeLabel(startHour, startMinute)}
                </Text>
              </Pressable>
              {showStartPicker ? (
                <DateTimePicker
                  value={combineDateTime(date, startHour, startMinute)}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  is24Hour
                  onChange={(_event, selected) => {
                    if (Platform.OS !== 'ios') setShowStartPicker(false);
                    if (selected) {
                      setStartHour(selected.getHours());
                      setStartMinute(selected.getMinutes());
                    }
                  }}
                />
              ) : null}
            </View>
            <View className="flex-1">
              <Text className="mb-1 text-caption text-text-primary">終了</Text>
              <Pressable
                onPress={() => setShowEndPicker(true)}
                className="min-h-tap items-start justify-center rounded-button border border-border bg-surface px-3 py-3"
                accessibilityRole="button"
                testID="schedule-form-end"
              >
                <Text className="text-body text-text-primary">
                  {formatTimeLabel(endHour, endMinute)}
                </Text>
              </Pressable>
              {showEndPicker ? (
                <DateTimePicker
                  value={combineDateTime(date, endHour, endMinute)}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  is24Hour
                  onChange={(_event, selected) => {
                    if (Platform.OS !== 'ios') setShowEndPicker(false);
                    if (selected) {
                      setEndHour(selected.getHours());
                      setEndMinute(selected.getMinutes());
                    }
                  }}
                />
              ) : null}
            </View>
          </View>

          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-body text-text-primary">繰り返し</Text>
            <Switch
              value={recurrenceOn}
              onValueChange={setRecurrenceOn}
              accessibilityLabel="繰り返し設定"
              testID="schedule-form-recurrence-switch"
            />
          </View>

          {recurrenceOn ? (
            <View className="mb-4" testID="schedule-form-recurrence-panel">
              <Text className="mb-2 text-caption text-text-primary">曜日</Text>
              <View className="mb-3 flex-row gap-1">
                {WEEKDAY_ORDER.map((d) => {
                  const selected = recurrenceDays.includes(d);
                  return (
                    <Pressable
                      key={d}
                      onPress={() => toggleRecurrenceDay(d)}
                      className={`flex-1 items-center rounded-button border-2 py-2 ${
                        selected ? 'border-primary bg-primary-light' : 'border-border bg-surface'
                      }`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`${WEEKDAYS_JA[d]}曜日`}
                      testID={`schedule-form-recurrence-day-${d}`}
                    >
                      <Text
                        className={`text-body ${selected ? 'text-primary-dark' : 'text-text-primary'}`}
                      >
                        {WEEKDAYS_JA[d]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text className="mb-1 text-caption text-text-primary">終了日 (任意)</Text>
              <Pressable
                onPress={() => setShowUntilPicker(true)}
                className="min-h-tap items-start justify-center rounded-button border border-border bg-surface px-3 py-3"
                accessibilityRole="button"
                accessibilityLabel="繰り返しの終了日を選択"
                testID="schedule-form-recurrence-until"
              >
                <Text className="text-body text-text-primary">
                  {recurrenceUntil ? formatDateLabel(recurrenceUntil) : '指定なし (無期限)'}
                </Text>
              </Pressable>
              {recurrenceUntil ? (
                <Pressable
                  onPress={() => setRecurrenceUntil(null)}
                  className="mt-1"
                  accessibilityRole="button"
                  testID="schedule-form-recurrence-until-clear"
                >
                  <Text className="text-caption text-primary">終了日を削除</Text>
                </Pressable>
              ) : null}
              {showUntilPicker ? (
                <DateTimePicker
                  value={recurrenceUntil ?? new Date(date.getFullYear() + 1, date.getMonth(), date.getDate())}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_event, selected) => {
                    if (Platform.OS !== 'ios') setShowUntilPicker(false);
                    if (selected) setRecurrenceUntil(selected);
                  }}
                />
              ) : null}

              {recurrenceDescription ? (
                <Text
                  className="mt-3 text-caption text-text-secondary"
                  testID="schedule-form-recurrence-description"
                >
                  {recurrenceDescription}
                </Text>
              ) : (
                <Text className="mt-3 text-caption text-warning">
                  曜日を 1 つ以上選択してください
                </Text>
              )}
            </View>
          ) : null}

          <TextField
            label="メモ（任意）"
            value={note}
            onChangeText={setNote}
            placeholder="例: 持ち物 水着、タオル"
            maxLength={200}
            testID="schedule-form-note"
          />

          {error ? (
            <Text
              className="mt-2 text-caption text-error"
              accessibilityLiveRegion="polite"
              testID="schedule-form-error"
            >
              {error}
            </Text>
          ) : null}

          {selectedLesson ? (
            <Text className="mt-4 text-caption text-text-secondary">
              {selectedLesson.memberName} の {selectedLesson.name} に追加します
            </Text>
          ) : null}
        </ScrollView>

        <View className="border-t border-border bg-surface px-4 py-3">
          <PrimaryButton
            label={submitting ? '保存中…' : isEdit ? '変更を保存' : '保存'}
            onPress={() => void handleSubmit()}
            disabled={submitting || lessons.length === 0}
            testID="schedule-form-submit"
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
