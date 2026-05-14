import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '../components/ui/PrimaryButton';
import { fetchItemsByLesson } from '../lib/items';
import { fetchLessonById } from '../lib/lessons';
import {
  bulkSetChecks,
  fetchChecks,
  upsertCheck,
} from '../lib/schedule-item-checks';
import { toFloatingJST } from '../lib/recurrence';
import { fetchMembersAndSchedules } from '../lib/schedules';
import { useAuthStore } from '../stores/auth-store';
import { colors } from '../theme/colors';
import type { Item } from '../types/database';

/**
 * CAL-09 統合詳細画面 (Sprint 5 C5-T01/T02)。
 *
 * 役割 (CAL-09 §1):
 *   1. 予定の詳細表示 (タイトル / メンバー / 時刻 / 場所 / メモ)
 *   2. 持ち物セクション (items + schedule_item_checks)
 *   3. チェックリスト機能 (タップで UPSERT、楽観的更新)
 *   4. 一括操作 (全部チェック / 全部解除)
 *   5. 「持ち物リスト編集」CTA → ITEM-01 へ
 *
 * MVP 境界: Realtime 同期は Phase D、本画面は Pull のみ。
 * URL params: scheduleId + occurrenceDate (YYYY-MM-DD)
 */
export function ScheduleDetailScreen() {
  const params = useLocalSearchParams<{ scheduleId: string; occurrenceDate?: string }>();
  const scheduleId = params.scheduleId ?? '';
  const occurrenceDate = params.occurrenceDate ?? '';
  const queryClient = useQueryClient();
  const householdId = useAuthStore((s) => s.householdId);

  const scheduleData = useQuery({
    queryKey: ['schedule-detail', scheduleId, householdId],
    queryFn: async () => {
      if (!householdId) throw new Error('householdId is missing');
      const data = await fetchMembersAndSchedules(householdId);
      const schedule = data.schedules.find((s) => s.id === scheduleId);
      if (!schedule) return null;
      const member = data.members.find((m) => m.id === schedule.lesson.member_id) ?? null;
      return { schedule, member };
    },
    enabled: !!scheduleId && !!householdId,
  });

  const lessonId = scheduleData.data?.schedule.lesson_id ?? '';

  const lessonQuery = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: () => fetchLessonById(lessonId),
    enabled: !!lessonId,
  });

  const itemsQuery = useQuery({
    queryKey: ['items', lessonId],
    queryFn: () => fetchItemsByLesson(lessonId),
    enabled: !!lessonId,
  });

  const checksQuery = useQuery({
    queryKey: ['schedule-item-checks', scheduleId, occurrenceDate],
    queryFn: () => fetchChecks({ scheduleId, occurrenceDate }),
    enabled: !!scheduleId && !!occurrenceDate,
  });

  const [localChecks, setLocalChecks] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    if (!checksQuery.data) return;
    const map = new Map<string, boolean>();
    for (const c of checksQuery.data) {
      map.set(c.item_id, c.checked);
    }
    setLocalChecks(map);
  }, [checksQuery.data]);

  const schedule = scheduleData.data?.schedule;
  const member = scheduleData.data?.member;
  const lesson = lessonQuery.data;

  const timeRange = useMemo(() => {
    if (!schedule) return '';
    const start = toFloatingJST(schedule.start_at);
    const end = toFloatingJST(schedule.end_at);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(end.getMinutes())}`;
  }, [schedule]);

  async function handleToggle(item: Item) {
    const current = localChecks.get(item.id) ?? false;
    const next = !current;
    const newMap = new Map(localChecks);
    newMap.set(item.id, next);
    setLocalChecks(newMap);
    try {
      await upsertCheck({
        scheduleId,
        itemId: item.id,
        occurrenceDate,
        checked: next,
      });
    } catch {
      const rollback = new Map(localChecks);
      rollback.set(item.id, current);
      setLocalChecks(rollback);
    }
  }

  async function handleBulkSet(checked: boolean) {
    const items = itemsQuery.data ?? [];
    if (items.length === 0) return;
    const previous = new Map(localChecks);
    const next = new Map(localChecks);
    for (const i of items) next.set(i.id, checked);
    setLocalChecks(next);
    try {
      await bulkSetChecks({
        scheduleId,
        itemIds: items.map((i) => i.id),
        occurrenceDate,
        checked,
      });
      void queryClient.invalidateQueries({
        queryKey: ['schedule-item-checks', scheduleId, occurrenceDate],
      });
    } catch {
      setLocalChecks(previous);
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
        testID="schedule-detail-header"
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="戻る"
          className="min-h-tap min-w-tap items-center justify-center"
          testID="schedule-detail-back"
        >
          <Text className="text-body text-primary">＜ 戻る</Text>
        </Pressable>
        <Text className="text-h3 text-text-primary">予定詳細</Text>
        <View className="min-w-tap" />
      </View>

      {scheduleData.isLoading ? (
        <View className="flex-1 items-center justify-center" testID="schedule-detail-loading">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : scheduleData.isError || !schedule ? (
        <View className="flex-1 items-center justify-center px-4" testID="schedule-detail-error">
          <Text className="text-body text-error">予定が見つかりませんでした</Text>
          <Pressable onPress={() => router.back()} className="mt-2">
            <Text className="text-body text-primary">戻る</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4 py-4"
          testID="schedule-detail-body"
          contentContainerStyle={{ paddingBottom: 32 }}
        >
          <View className="mb-3 flex-row items-center">
            <View
              className="mr-3 h-4 w-4 rounded-full"
              style={{ backgroundColor: member?.color_hex ?? colors.primary }}
            />
            <Text className="text-caption text-text-secondary">
              {member?.name ?? '不明'} の予定
            </Text>
          </View>

          <Text className="mb-4 text-h1 text-text-primary" testID="schedule-detail-title">
            {schedule.lesson.name}
          </Text>

          <View className="mb-3">
            <Text className="text-caption text-text-secondary">時間</Text>
            <Text className="text-body text-text-primary">{timeRange}</Text>
          </View>

          {schedule.lesson.location ? (
            <View className="mb-3">
              <Text className="text-caption text-text-secondary">場所</Text>
              <Text className="text-body text-text-primary">{schedule.lesson.location}</Text>
            </View>
          ) : null}

          {schedule.note ? (
            <View className="mb-3">
              <Text className="text-caption text-text-secondary">メモ</Text>
              <Text className="text-body text-text-primary">{schedule.note}</Text>
            </View>
          ) : null}

          <View className="my-4 border-t border-border" />

          <Text className="mb-2 text-h3 text-text-primary">持ち物</Text>

          {itemsQuery.isLoading ? (
            <View className="items-center py-4" testID="schedule-detail-items-loading">
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (itemsQuery.data ?? []).length === 0 ? (
            <View className="rounded-button border border-border bg-surface px-3 py-4" testID="schedule-detail-items-empty">
              <Text className="text-body text-text-secondary">
                持ち物がまだ登録されていません
              </Text>
              {lesson ? (
                <PrimaryButton
                  label="持ち物を登録する"
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: '/(main)/lessons/[lessonId]/items',
                      params: { lessonId: lesson.id },
                    })
                  }
                  testID="schedule-detail-items-register"
                />
              ) : null}
            </View>
          ) : (
            <>
              <View className="mb-2 flex-row gap-2" testID="schedule-detail-bulk">
                <Pressable
                  onPress={() => void handleBulkSet(true)}
                  className="rounded-button border border-border bg-surface px-3 py-2"
                  accessibilityRole="button"
                  testID="schedule-detail-check-all"
                >
                  <Text className="text-body text-text-primary">全部チェック</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleBulkSet(false)}
                  className="rounded-button border border-border bg-surface px-3 py-2"
                  accessibilityRole="button"
                  testID="schedule-detail-uncheck-all"
                >
                  <Text className="text-body text-text-primary">全部解除</Text>
                </Pressable>
              </View>

              <View className="gap-2" testID="schedule-detail-items-list">
                {(itemsQuery.data ?? []).map((item) => {
                  const checked = localChecks.get(item.id) ?? false;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => void handleToggle(item)}
                      className={`flex-row items-center rounded-button border px-3 py-3 ${
                        checked ? 'border-primary bg-primary-light' : 'border-border bg-surface'
                      }`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={`${item.name} ${checked ? 'チェック済' : '未チェック'}`}
                      testID={`schedule-detail-check-${item.id}`}
                    >
                      <Text
                        className={`mr-3 text-h3 ${checked ? 'text-primary-dark' : 'text-text-secondary'}`}
                      >
                        {checked ? '☑' : '☐'}
                      </Text>
                      <Text
                        className="flex-1 text-body"
                        style={{
                          color: checked ? colors.textSecondary : colors.textPrimary,
                          textDecorationLine: checked ? 'line-through' : 'none',
                        }}
                      >
                        {item.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {lesson ? (
                <View className="mt-4">
                  <PrimaryButton
                    label="持ち物リストを編集"
                    variant="secondary"
                    onPress={() =>
                      router.push({
                        pathname: '/(main)/lessons/[lessonId]/items',
                        params: { lessonId: lesson.id },
                      })
                    }
                    testID="schedule-detail-edit-items"
                  />
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
