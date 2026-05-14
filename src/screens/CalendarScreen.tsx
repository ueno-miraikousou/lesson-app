import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ScheduleFormSheet,
  type ScheduleFormInitialValues,
} from '../components/forms/ScheduleFormSheet';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { signOut } from '../lib/auth';
import {
  addMonths,
  assignMemberColors,
  buildMarkedDates,
  endOfMonth,
  expandSchedules,
  formatDateString,
  formatYearMonth,
  parseDateString,
  startOfMonth,
  type ScheduleOccurrence,
} from '../lib/calendar-utils';
import { queryKeys } from '../lib/query-client';
import {
  createSchedule,
  deleteSchedule,
  fetchMembersAndSchedules,
  truncateScheduleAt,
  type MonthScheduleData,
} from '../lib/schedules';
import { useAuthStore } from '../stores/auth-store';
import { useCalendarViewStore } from '../stores/calendar-view-store';
import { isAuthBypassEnabled } from '../hooks/use-auth-session';
import { WeekTimelineView } from '../lib/calendar';
import type { CalendarEvent, ResolvedEvent } from '../lib/calendar';
import {
  addWeeks,
  endOfWeek,
  startOfWeek,
} from '../lib/calendar/week-utils';
import { colors } from '../theme/colors';
import type { Member, Schedule } from '../types/database';

/**
 * ME-5 2026-05-14 (#34M 対策): AUTH_BYPASS=true 時、Supabase に到達できない環境でも
 * CalendarScreen の見た目を検証できるよう、メンバー 3 名 + 単発予定 2 件 + 繰り返し予定 1 件の
 * mock data を返す。本番ビルドでは EXPO_PUBLIC_AUTH_BYPASS 未設定 → false で参照されない。
 *
 * mock data は社長中間レビュー用 screenshot 取得を目的とする (Phase B Sprint 1 残課題対応)。
 */
function buildMockMonthData(householdId: string): MonthScheduleData {
  const now = new Date();
  const baseY = now.getFullYear();
  const baseM = now.getMonth();
  const baseD = now.getDate();
  const members: Member[] = [
    {
      id: '10000000-0000-4000-8000-000000000001',
      household_id: householdId,
      name: 'すずちゃん',
      birth_date: null,
      gender: 'female',
      role: 'child',
      color_hex: '#FF6B7A',
      notifications_muted: false,
      sort_order: 1,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      household_id: householdId,
      name: 'パパ',
      birth_date: null,
      gender: 'male',
      role: 'parent',
      color_hex: '#5DADE2',
      notifications_muted: false,
      sort_order: 2,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
    {
      id: '10000000-0000-4000-8000-000000000003',
      household_id: householdId,
      name: 'ママ',
      birth_date: null,
      gender: 'female',
      role: 'parent',
      color_hex: '#48C9B0',
      notifications_muted: false,
      sort_order: 3,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
  ];

  const lessons = [
    {
      id: '20000000-0000-4000-8000-000000000001',
      member_id: members[0]!.id,
      name: 'スイミング',
      classroom_name: 'ABC スイミングスクール',
      location: '○○市民プール',
    },
    {
      id: '20000000-0000-4000-8000-000000000002',
      member_id: members[1]!.id,
      name: 'ヨガ',
      classroom_name: null,
      location: 'コミュニティセンター',
    },
    {
      id: '20000000-0000-4000-8000-000000000003',
      member_id: members[2]!.id,
      name: 'ピアノ',
      classroom_name: 'ハーモニー音楽教室',
      location: null,
    },
  ];

  const firstMonday = new Date(baseY, baseM, 1);
  while (firstMonday.getDay() !== 1) {
    firstMonday.setDate(firstMonday.getDate() + 1);
  }

  function jstWallClockIso(y: number, m: number, d: number, hh: number, mm: number): string {
    return new Date(Date.UTC(y, m, d, hh - 9, mm, 0)).toISOString();
  }

  const schedules = [
    {
      id: '30000000-0000-4000-8000-000000000001',
      lesson_id: lessons[0]!.id,
      start_at: jstWallClockIso(baseY, baseM, baseD, 17, 0),
      end_at: jstWallClockIso(baseY, baseM, baseD, 18, 0),
      recurrence_rule: null,
      recurrence_until: null,
      note: '水着 + タオル',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      lesson: lessons[0]!,
    },
    {
      id: '30000000-0000-4000-8000-000000000002',
      lesson_id: lessons[1]!.id,
      start_at: jstWallClockIso(baseY, baseM, baseD + 1, 19, 0),
      end_at: jstWallClockIso(baseY, baseM, baseD + 1, 20, 0),
      recurrence_rule: null,
      recurrence_until: null,
      note: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      lesson: lessons[1]!,
    },
    {
      id: '30000000-0000-4000-8000-000000000003',
      lesson_id: lessons[2]!.id,
      start_at: jstWallClockIso(
        firstMonday.getFullYear(),
        firstMonday.getMonth(),
        firstMonday.getDate(),
        16,
        0,
      ),
      end_at: jstWallClockIso(
        firstMonday.getFullYear(),
        firstMonday.getMonth(),
        firstMonday.getDate(),
        17,
        0,
      ),
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO,TH',
      recurrence_until: null,
      note: '楽譜を忘れない',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      lesson: lessons[2]!,
    },
  ];

  return { members, schedules };
}

const UNDO_TIMEOUT_MS = 10000;

LocaleConfig.locales['ja'] = {
  monthNames: [
    '1月', '2月', '3月', '4月', '5月', '6月',
    '7月', '8月', '9月', '10月', '11月', '12月',
  ],
  monthNamesShort: [
    '1月', '2月', '3月', '4月', '5月', '6月',
    '7月', '8月', '9月', '10月', '11月', '12月',
  ],
  dayNames: ['日曜日', '月曜日', '火曜日', '水曜日', '木曜日', '金曜日', '土曜日'],
  dayNamesShort: ['日', '月', '火', '水', '木', '金', '土'],
  today: '今日',
};
LocaleConfig.defaultLocale = 'ja';

function todayString(): string {
  return formatDateString(new Date());
}

/**
 * CAL-01 メインカレンダー。
 *
 * Phase C Sprint 1-5 で完成済 (S-01..10 + I-02/I-03)。
 * Sprint 6 で下部の「プロフィール / 家族を追加 / ログアウト」3 ボタンを追加。
 * 「家族を追加」が WIZ-10 追加モード (router.push mode=add) を起動する。
 */
interface ActionTargetState {
  schedule: Schedule;
  occurrenceDate: string;
  startAt: Date;
  isRecurring: boolean;
}

interface UndoToastState {
  schedule: Schedule;
  message: string;
}

export function CalendarScreen() {
  const householdId = useAuthStore((s) => s.householdId);
  const viewMode = useCalendarViewStore((s) => s.mode);
  const setViewMode = useCalendarViewStore((s) => s.setMode);
  const hiddenMemberIds = useCalendarViewStore((s) => s.hiddenMemberIds);
  const toggleMember = useCalendarViewStore((s) => s.toggleMember);
  const showAllMembers = useCalendarViewStore((s) => s.showAll);
  const hideAllMembers = useCalendarViewStore((s) => s.hideAll);
  const hydrateView = useCalendarViewStore((s) => s.hydrate);

  const [visibleMonth, setVisibleMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [visibleWeek, setVisibleWeek] = useState<Date>(() => startOfWeek(new Date()));
  const [selectedDate, setSelectedDate] = useState<string>(() => todayString());
  const [formVisible, setFormVisible] = useState(false);
  const [actionTarget, setActionTarget] = useState<ActionTargetState | null>(null);
  const [editValues, setEditValues] = useState<ScheduleFormInitialValues | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ActionTargetState | null>(null);
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null);
  const [filterVisible, setFilterVisible] = useState(false);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void hydrateView();
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, [hydrateView]);

  const monthKey = formatYearMonth(visibleMonth);
  const dataQuery = useQuery({
    queryKey: queryKeys.schedules.byMonth(householdId ?? 'none', monthKey),
    queryFn: () => {
      if (!householdId) throw new Error('householdId is missing');
      if (isAuthBypassEnabled()) {
        return Promise.resolve(buildMockMonthData(householdId));
      }
      return fetchMembersAndSchedules(householdId);
    },
    enabled: !!householdId,
  });

  const memberColors = useMemo(() => {
    const list = assignMemberColors(dataQuery.data?.members ?? []);
    return new Map(list.map((a) => [a.memberId, a.colorHex]));
  }, [dataQuery.data?.members]);

  const memberNamesById = useMemo(() => {
    return new Map((dataQuery.data?.members ?? []).map((m) => [m.id, m.name]));
  }, [dataQuery.data?.members]);

  const lessonColorByLessonId = useMemo(() => {
    const out = new Map<string, string>();
    for (const s of dataQuery.data?.schedules ?? []) {
      const memberId = s.lesson.member_id;
      const color = memberColors.get(memberId);
      if (color) out.set(s.lesson_id, color);
    }
    return out;
  }, [dataQuery.data?.schedules, memberColors]);

  type ScheduleExtra = { lessonName: string };
  const rawOccurrences = useMemo<ScheduleOccurrence<ScheduleExtra>[]>(() => {
    if (!dataQuery.data) return [];
    const schedules = dataQuery.data.schedules.map((s) => ({
      ...s,
      member_id: s.lesson.member_id,
      extra: { lessonName: s.lesson.name },
    }));
    const rangeStart =
      viewMode === 'month' ? startOfMonth(visibleMonth) : startOfWeek(visibleWeek);
    const rangeEnd =
      viewMode === 'month' ? endOfMonth(visibleMonth) : endOfWeek(visibleWeek);
    return expandSchedules<ScheduleExtra>(schedules, rangeStart, rangeEnd);
  }, [dataQuery.data, viewMode, visibleMonth, visibleWeek]);

  const occurrences = useMemo<ScheduleOccurrence<ScheduleExtra>[]>(() => {
    if (hiddenMemberIds.size === 0) return rawOccurrences;
    return rawOccurrences.filter((o) => !hiddenMemberIds.has(o.schedule.member_id));
  }, [rawOccurrences, hiddenMemberIds]);

  const markedDates = useMemo(
    () => buildMarkedDates(occurrences, lessonColorByLessonId, selectedDate, {
      selectedColor: colors.primary,
    }),
    [occurrences, lessonColorByLessonId, selectedDate],
  );

  const weekEvents = useMemo<CalendarEvent[]>(() => {
    if (viewMode !== 'week') return [];
    return occurrences.map((occ) => {
      const memberId = occ.schedule.member_id;
      const memberColor = memberColors.get(memberId) ?? colors.primary;
      const lessonName = occ.schedule.extra?.lessonName ?? '';
      return {
        id: `${occ.schedule.id}-${occ.occurrenceDate}`,
        title: lessonName,
        startAt: occ.startAt.toISOString(),
        endAt: occ.endAt.toISOString(),
        memberColor,
        memberName: memberNamesById.get(memberId) ?? '',
        lessonName,
        occurrenceDate: occ.occurrenceDate,
      };
    });
  }, [viewMode, occurrences, memberColors, memberNamesById]);

  const lessonsForForm = useMemo(() => {
    return (dataQuery.data?.schedules ?? [])
      .map((s) => ({
        id: s.lesson.id,
        memberId: s.lesson.member_id,
        memberName: memberNamesById.get(s.lesson.member_id) ?? '',
        name: s.lesson.name,
      }))
      .filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i);
  }, [dataQuery.data?.schedules, memberNamesById]);

  const occurrencesOnSelectedDate = useMemo(
    () => occurrences
      .filter((o) => o.occurrenceDate === selectedDate)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime()),
    [occurrences, selectedDate],
  );

  function handleMonthChange(month: { year: number; month: number }) {
    setVisibleMonth(new Date(month.year, month.month - 1, 1));
  }

  function handleDayPress(day: { dateString: string }) {
    setSelectedDate(day.dateString);
  }

  function handleGoToToday() {
    const today = new Date();
    setVisibleMonth(startOfMonth(today));
    setVisibleWeek(startOfWeek(today));
    setSelectedDate(formatDateString(today));
  }

  function handleWeekNav(delta: number) {
    setVisibleWeek((w) => addWeeks(w, delta));
  }

  function handleViewModeToggle() {
    setViewMode(viewMode === 'month' ? 'week' : 'month');
  }

  function handleWeekEventPress(event: ResolvedEvent) {
    if (event.overflowCount) return;
    const schedule = dataQuery.data?.schedules.find(
      (s) => s.id === event.id.split('-')[0],
    );
    if (!schedule) return;
    setActionTarget({
      schedule,
      occurrenceDate: event.occurrenceDate ?? '',
      startAt: new Date(event.startAt),
      isRecurring: !!schedule.recurrence_rule,
    });
  }

  const filterableMembers = dataQuery.data?.members ?? [];

  function handleFormClose() {
    setFormVisible(false);
    setEditValues(null);
  }

  function handleFormCreated() {
    setFormVisible(false);
    void dataQuery.refetch();
  }

  function handleFormUpdated() {
    setFormVisible(false);
    setEditValues(null);
    void dataQuery.refetch();
  }

  function openActionSheet(occ: ScheduleOccurrence) {
    setActionTarget({
      schedule: occ.schedule,
      occurrenceDate: occ.occurrenceDate,
      startAt: occ.startAt,
      isRecurring: !!occ.schedule.recurrence_rule,
    });
  }

  function openDetail() {
    if (!actionTarget) return;
    const scheduleId = actionTarget.schedule.id;
    const occurrenceDate = actionTarget.occurrenceDate;
    setActionTarget(null);
    router.push({
      pathname: '/(main)/schedule/[scheduleId]',
      params: { scheduleId, occurrenceDate },
    });
  }

  function startEdit(scope: 'all' | 'thisAndFuture') {
    if (!actionTarget) return;
    setEditValues({
      schedule: actionTarget.schedule,
      splitFrom: scope === 'thisAndFuture' ? actionTarget.startAt : undefined,
      editScope: scope,
    });
    setActionTarget(null);
    setFormVisible(true);
  }

  function startDeleteConfirm() {
    if (!actionTarget) return;
    setDeleteConfirm(actionTarget);
    setActionTarget(null);
  }

  async function confirmDelete(scope: 'all' | 'thisAndFuture') {
    if (!deleteConfirm) return;
    const target = deleteConfirm;
    setDeleteConfirm(null);
    try {
      if (scope === 'all') {
        await deleteSchedule(target.schedule.id);
        showUndoToast({ schedule: target.schedule, message: '予定を削除しました' });
      } else {
        await truncateScheduleAt(target.schedule.id, target.startAt);
        showUndoToast({
          schedule: target.schedule,
          message: '今後の予定を削除しました',
        });
      }
      void dataQuery.refetch();
    } catch {
      // 失敗時は何もしない (toast UI を実装する場合はここ)
    }
  }

  function showUndoToast(state: UndoToastState) {
    setUndoToast(state);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setUndoToast(null);
      undoTimerRef.current = null;
    }, UNDO_TIMEOUT_MS);
  }

  async function handleUndoDelete() {
    if (!undoToast) return;
    const s = undoToast.schedule;
    setUndoToast(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    try {
      await createSchedule({
        lessonId: s.lesson_id,
        startAt: new Date(s.start_at),
        endAt: new Date(s.end_at),
        note: s.note,
        recurrenceRule: s.recurrence_rule,
        recurrenceUntil: s.recurrence_until ? new Date(s.recurrence_until) : null,
      });
      void dataQuery.refetch();
    } catch {
      // 復元失敗時は無視
    }
  }

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['top', 'left', 'right']}
    >
      <View
        className="flex-row items-center justify-between border-b border-border bg-surface px-4 py-3"
        testID="calendar-header"
      >
        <Text className="text-h2 text-text-primary">
          {viewMode === 'month'
            ? `${visibleMonth.getFullYear()}年 ${visibleMonth.getMonth() + 1}月`
            : `${visibleWeek.getMonth() + 1}/${visibleWeek.getDate()} の週`}
        </Text>
        <View className="flex-row gap-2">
          <Pressable
            onPress={handleViewModeToggle}
            className="min-h-tap items-center justify-center rounded-button border border-border bg-surface px-3"
            accessibilityRole="button"
            accessibilityLabel={viewMode === 'month' ? '週表示に切替' : '月表示に切替'}
            testID="calendar-view-toggle"
          >
            <Text className="text-body text-text-primary">
              {viewMode === 'month' ? '週' : '月'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setFilterVisible(true)}
            className="min-h-tap items-center justify-center rounded-button border border-border bg-surface px-3"
            accessibilityRole="button"
            accessibilityLabel="メンバーフィルタを開く"
            testID="calendar-filter-open"
          >
            <Text className="text-body text-text-primary">
              {hiddenMemberIds.size === 0
                ? '全員'
                : `${filterableMembers.length - hiddenMemberIds.size}/${filterableMembers.length}`}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleGoToToday}
            className="min-h-tap items-center justify-center rounded-button border border-border bg-surface px-3"
            accessibilityRole="button"
            accessibilityLabel="今日に戻る"
            testID="calendar-go-today"
          >
            <Text className="text-body text-text-primary">今日</Text>
          </Pressable>
        </View>
      </View>

      {viewMode === 'month' ? (
        <Calendar
          key={monthKey}
          current={formatDateString(visibleMonth)}
          markingType="multi-dot"
          markedDates={markedDates}
          onDayPress={handleDayPress}
          onMonthChange={handleMonthChange}
          firstDay={0}
          enableSwipeMonths
          theme={{
            calendarBackground: colors.background,
            textSectionTitleColor: colors.textSecondary,
            dayTextColor: colors.textPrimary,
            monthTextColor: colors.textPrimary,
            arrowColor: colors.primary,
            todayTextColor: colors.primaryDark,
            selectedDayBackgroundColor: colors.primary,
            selectedDayTextColor: '#FFFFFF',
          }}
          testID="calendar-grid"
        />
      ) : (
        <View
          className="flex-row items-center justify-between border-b border-border bg-surface px-2 py-1"
          testID="week-nav"
        >
          <Pressable
            onPress={() => handleWeekNav(-1)}
            className="min-h-tap min-w-tap items-center justify-center px-2"
            accessibilityRole="button"
            accessibilityLabel="前の週"
            testID="week-nav-prev"
          >
            <Text className="text-body text-primary">前週</Text>
          </Pressable>
          <Text className="text-body text-text-primary">
            {visibleWeek.getMonth() + 1}/{visibleWeek.getDate()}〜
          </Text>
          <Pressable
            onPress={() => handleWeekNav(1)}
            className="min-h-tap min-w-tap items-center justify-center px-2"
            accessibilityRole="button"
            accessibilityLabel="次の週"
            testID="week-nav-next"
          >
            <Text className="text-body text-primary">翌週</Text>
          </Pressable>
        </View>
      )}

      {viewMode === 'week' ? (
        <View className="flex-1" testID="calendar-week-body">
          <WeekTimelineView
            weekStart={visibleWeek}
            events={weekEvents}
            onEventPress={handleWeekEventPress}
          />
        </View>
      ) : null}

      {viewMode === 'month' ? (
      <View className="flex-1 px-4 pt-4" testID="calendar-agenda">
        <Text className="mb-2 text-caption text-text-secondary">
          {formatAgendaHeader(selectedDate)}
        </Text>
        {dataQuery.isLoading ? (
          <View className="flex-1 items-center justify-center" testID="calendar-loading">
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : dataQuery.isError ? (
          <View className="flex-1 items-center justify-center" testID="calendar-error">
            <Text className="text-body text-error">予定を読み込めませんでした</Text>
            <Pressable onPress={() => void dataQuery.refetch()} className="mt-2">
              <Text className="text-body text-primary">再試行</Text>
            </Pressable>
          </View>
        ) : occurrences.length === 0 ? (
          <View className="flex-1 items-center justify-center px-2" testID="calendar-empty-month">
            <Text className="mb-2 text-body text-text-secondary">
              今月はまだ予定がありません
            </Text>
            <Text className="text-caption text-text-secondary">
              右下の＋から最初の予定を追加できます
            </Text>
          </View>
        ) : occurrencesOnSelectedDate.length === 0 ? (
          <View className="flex-1 items-center justify-center" testID="calendar-empty-day">
            <Text className="text-body text-text-secondary">この日は予定がありません</Text>
          </View>
        ) : (
          <View className="gap-2" testID="calendar-agenda-list">
            {occurrencesOnSelectedDate.map((occ) => {
              const memberName = memberNamesById.get(occ.schedule.member_id) ?? '';
              const color = lessonColorByLessonId.get(occ.schedule.lesson_id) ?? colors.primary;
              return (
                <Pressable
                  key={`${occ.schedule.id}-${occ.occurrenceDate}`}
                  onPress={() => openActionSheet(occ)}
                  className="flex-row items-center rounded-button border border-border bg-surface px-3 py-3"
                  testID={`agenda-item-${occ.schedule.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatTimeRange(occ.startAt, occ.endAt)} ${memberName} ${occ.schedule.extra?.lessonName ?? ''}`}
                >
                  <View
                    className="mr-3 h-3 w-3 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  <View className="flex-1">
                    <Text className="text-body text-text-primary">
                      {formatTimeRange(occ.startAt, occ.endAt)}
                    </Text>
                    <Text className="text-caption text-text-secondary">
                      {memberName} ・ {occ.schedule.extra?.lessonName ?? ''}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
      ) : null}

      <Pressable
        onPress={() => setFormVisible(true)}
        className="absolute bottom-6 right-6 h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg"
        style={{ backgroundColor: colors.primary }}
        accessibilityRole="button"
        accessibilityLabel="予定を追加"
        testID="calendar-fab"
      >
        <Text className="text-h1 text-white" style={{ color: '#FFFFFF' }}>＋</Text>
      </Pressable>

      <View
        className="border-t border-border bg-surface px-4 py-3"
        testID="calendar-bottom-actions"
      >
        <View className="flex-row gap-2">
          <View className="flex-1">
            <PrimaryButton
              label="プロフィール"
              variant="text"
              onPress={() => router.push('/(main)/profile')}
              testID="calendar-action-profile"
            />
          </View>
          <View className="flex-1">
            <PrimaryButton
              label="家族を追加"
              variant="text"
              onPress={() =>
                router.push({ pathname: '/(wizard)/intro', params: { mode: 'add' } })
              }
              testID="calendar-action-wizard-add"
            />
          </View>
          <View className="flex-1">
            <PrimaryButton
              label="ログアウト"
              variant="text"
              onPress={() => void signOut()}
              testID="calendar-action-logout"
            />
          </View>
        </View>
      </View>

      {editValues ? (
        <ScheduleFormSheet
          mode="edit"
          visible={formVisible}
          defaultDate={parseDateString(selectedDate)}
          lessons={lessonsForForm}
          initialValues={editValues}
          onClose={handleFormClose}
          onUpdated={handleFormUpdated}
        />
      ) : (
        <ScheduleFormSheet
          visible={formVisible}
          defaultDate={parseDateString(selectedDate)}
          lessons={lessonsForForm}
          onClose={handleFormClose}
          onCreated={handleFormCreated}
        />
      )}

      <Modal
        visible={actionTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setActionTarget(null)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/40"
          onPress={() => setActionTarget(null)}
        >
          <View
            className="m-4 w-full max-w-md rounded-2xl bg-surface p-4"
            testID="schedule-action-sheet"
          >
            <Text className="mb-3 text-h3 text-text-primary">予定の操作</Text>
            <Pressable
              onPress={() => openDetail()}
              className="min-h-tap items-start justify-center rounded-button px-3 py-3"
              accessibilityRole="button"
              testID="schedule-action-detail"
            >
              <Text className="text-body text-primary">詳細を見る / 持ち物チェック</Text>
            </Pressable>
            <Pressable
              onPress={() => startEdit('all')}
              className="min-h-tap items-start justify-center rounded-button px-3 py-3"
              accessibilityRole="button"
              testID="schedule-action-edit-all"
            >
              <Text className="text-body text-text-primary">予定をすべて編集</Text>
            </Pressable>
            {actionTarget?.isRecurring ? (
              <Pressable
                onPress={() => startEdit('thisAndFuture')}
                className="min-h-tap items-start justify-center rounded-button px-3 py-3"
                accessibilityRole="button"
                testID="schedule-action-edit-future"
              >
                <Text className="text-body text-text-primary">今後すべての予定を編集</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => startDeleteConfirm()}
              className="min-h-tap items-start justify-center rounded-button px-3 py-3"
              accessibilityRole="button"
              testID="schedule-action-delete"
            >
              <Text className="text-body text-error">予定を削除</Text>
            </Pressable>
            <Pressable
              onPress={() => setActionTarget(null)}
              className="min-h-tap items-center justify-center rounded-button px-3 py-3"
              accessibilityRole="button"
              testID="schedule-action-cancel"
            >
              <Text className="text-body text-text-secondary">キャンセル</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Modal
        visible={deleteConfirm !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteConfirm(null)}
      >
        <View className="flex-1 items-center justify-center bg-black/40">
          <View
            className="m-4 w-full max-w-md rounded-2xl bg-surface p-4"
            testID="schedule-delete-confirm"
          >
            <Text className="mb-2 text-h3 text-text-primary">予定を削除しますか？</Text>
            <Text className="mb-4 text-caption text-text-secondary">
              {deleteConfirm?.isRecurring
                ? '繰り返し予定です。範囲を選んでください。'
                : 'この操作は取り消せます (10 秒間)。'}
            </Text>
            {deleteConfirm?.isRecurring ? (
              <>
                <Pressable
                  onPress={() => void confirmDelete('all')}
                  className="min-h-tap items-start justify-center rounded-button px-3 py-3"
                  accessibilityRole="button"
                  testID="schedule-delete-confirm-all"
                >
                  <Text className="text-body text-error">すべて削除</Text>
                </Pressable>
                <Pressable
                  onPress={() => void confirmDelete('thisAndFuture')}
                  className="min-h-tap items-start justify-center rounded-button px-3 py-3"
                  accessibilityRole="button"
                  testID="schedule-delete-confirm-future"
                >
                  <Text className="text-body text-error">今後すべて削除</Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => void confirmDelete('all')}
                className="min-h-tap items-start justify-center rounded-button px-3 py-3"
                accessibilityRole="button"
                testID="schedule-delete-confirm-all"
              >
                <Text className="text-body text-error">削除する</Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => setDeleteConfirm(null)}
              className="min-h-tap items-center justify-center rounded-button px-3 py-3"
              accessibilityRole="button"
              testID="schedule-delete-confirm-cancel"
            >
              <Text className="text-body text-text-secondary">キャンセル</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={filterVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterVisible(false)}
      >
        <Pressable
          className="flex-1 items-center justify-end bg-black/40"
          onPress={() => setFilterVisible(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="w-full rounded-t-2xl bg-surface p-4"
            testID="member-filter-sheet"
          >
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="text-h3 text-text-primary">フィルタ</Text>
              <Pressable
                onPress={() => setFilterVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="閉じる"
                testID="member-filter-close"
              >
                <Text className="text-h2 text-text-primary">×</Text>
              </Pressable>
            </View>
            <View className="mb-3 flex-row gap-2">
              <Pressable
                onPress={showAllMembers}
                className="rounded-button border border-border bg-surface px-3 py-2"
                accessibilityRole="button"
                testID="member-filter-show-all"
              >
                <Text className="text-body text-text-primary">全員</Text>
              </Pressable>
              <Pressable
                onPress={() => hideAllMembers(filterableMembers.map((m) => m.id))}
                className="rounded-button border border-border bg-surface px-3 py-2"
                accessibilityRole="button"
                testID="member-filter-hide-all"
              >
                <Text className="text-body text-text-primary">全員解除</Text>
              </Pressable>
            </View>
            <View className="gap-2">
              {filterableMembers.map((m) => {
                const hidden = hiddenMemberIds.has(m.id);
                const color = memberColors.get(m.id) ?? colors.primary;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => toggleMember(m.id)}
                    className={`flex-row items-center rounded-button border-2 px-3 py-3 ${
                      hidden ? 'border-border bg-background' : 'border-primary bg-primary-light'
                    }`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: !hidden }}
                    accessibilityLabel={`${m.name}${hidden ? ' 非表示' : ' 表示中'}`}
                    testID={`member-filter-chip-${m.id}`}
                  >
                    <View
                      className="mr-3 h-3 w-3 rounded-full"
                      style={{ backgroundColor: hidden ? colors.border : color }}
                    />
                    <Text
                      className="flex-1 text-body"
                      style={{ color: hidden ? colors.textSecondary : colors.textPrimary }}
                    >
                      {m.name}
                    </Text>
                    <Text
                      className="text-caption"
                      style={{ color: hidden ? colors.textSecondary : colors.primaryDark }}
                    >
                      {hidden ? '非表示' : '表示中'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {hiddenMemberIds.size === filterableMembers.length && filterableMembers.length > 0 ? (
              <Text className="mt-3 text-caption text-warning">
                すべて非表示です。「全員」で戻せます
              </Text>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {undoToast ? (
        <View
          className="absolute inset-x-4 bottom-24 flex-row items-center justify-between rounded-button bg-text-primary px-4 py-3"
          style={{ backgroundColor: colors.textPrimary }}
          accessibilityLiveRegion="polite"
          testID="undo-toast"
        >
          <Text className="text-body" style={{ color: '#FFFFFF' }}>
            {undoToast.message}
          </Text>
          <Pressable
            onPress={() => void handleUndoDelete()}
            accessibilityRole="button"
            testID="undo-toast-action"
          >
            <Text className="text-body" style={{ color: colors.primaryLight }}>
              元に戻す
            </Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function formatAgendaHeader(dateString: string): string {
  const d = parseDateString(dateString);
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()} (${dow}) の予定`;
}

function formatTimeRange(start: Date, end: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

// Keep month/today helpers available for unit testing without instantiating the screen.
export { addMonths };
