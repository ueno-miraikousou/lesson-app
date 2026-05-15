/**
 * Phase D Sprint 3 D3-T01..T06: 通知スケジューラ本体 (N-01 / N-02 / N-03 / N-04 / N-05)。
 *
 * 設計判断 (ADR-008 §2.1 / §2.2 / §2.5 採用案):
 *
 * 1. ローカル予約優先: `Notifications.scheduleNotificationAsync` で前日 21:00 (または prefs.reminder_day_before_time)
 *    + 当日 N 分前 (または prefs.reminder_same_day_minutes) を端末スケジュール予約。
 *    Push Service は家族編集 → ADR-007 Realtime 経由で他端末ローカル再予約のみ補助 (本層では扱わず別 layer)。
 *
 * 2. event-driven 再予約: §2.2 Trigger Event Matrix を `scheduleNotificationsForOccurrences` /
 *    `rescheduleAllNotifications` / `cancelNotificationsForSchedule` の 3 API で受ける。
 *
 * 3. 未来 14 日分のみスケジュール (R-D8-1 iOS 64 件制限対策):
 *    - 通常 (1 メンバー 3 習い事 × 月 8 回 × 2 通知 = 144 件) で iOS 64 件超過リスク
 *    - 14 日先まで予約 → 1 日あたり子供 3 人 × 3 習い事 = 9 通知 × 2 = 18 通知 × 14 = 252 件...
 *    - 現実的には 1 日 1-2 予定 × 2 通知 = 14-28 件で iOS OK 想定 (Phase D Sprint 1 PoC で実測)
 *    - reconcile 時に「14 日先まで」の閾値で枝刈り (TTL 管理)
 *
 * 4. 全 ✓ 済 skip (N-02 + skip_when_all_items_checked = true):
 *    - 当日通知の予約 build 時に判定 (未 ✓ あれば schedule、全 ✓ なら skip)
 *    - 持ち物 ✓ 状態が変わった場合は再予約 (Realtime hook 経由で trigger)
 *
 * 5. 持ち物統合通知 (N-03): payload-builder.ts に委譲、本層は items + checks fetch + filter のみ
 *
 * 6. 既存資産の活用:
 *    - notification-preferences.ts (fetchNotificationPreferences) → prefs 取得
 *    - recurrence/expand.ts (expandSchedules) → 14 日分の occurrence list
 *    - items.ts (fetchItemsByLesson) → 持ち物 list
 *    - schedule-item-checks.ts (fetchChecks) → 未 ✓ filter 用
 *
 * 参照:
 *   - 02_設計/ADR/ADR-008-通知本体実装方針.md §2 / §4 / §5
 *   - 02_設計/画面/NOTIF-01-通知設定.md
 *   - 01_要件定義/Phase_D_WBS_v0.1.md §2.2 / §4.2 Sprint 3
 *   - src/features/notifications/payload-builder.ts (本層から呼ぶ)
 */

import * as Notifications from 'expo-notifications';

import {
  buildNotificationContent,
  type BuildNotificationContentInput,
  type NotificationContent,
  type NotificationDataPayload,
  type NotificationType,
} from './payload-builder';
import { fetchItemsByLesson } from '../../lib/items';
import { fetchNotificationPreferences } from '../../lib/notification-preferences';
import { fetchChecks } from '../../lib/schedule-item-checks';
import { expandSchedules } from '../../lib/recurrence/expand';
import { supabase } from '../../lib/supabase';
import type {
  Item,
  Lesson,
  Member,
  NotificationPreferences,
  Schedule,
  ScheduleItemCheck,
} from '../../types/database';

/** 未来 14 日分のみ schedule (iOS 64 件制限対策、R-D8-1) */
export const SCHEDULE_HORIZON_DAYS = 14;

/** 1 occurrence ごとに day_before + same_day の 2 通知 */
export interface OccurrenceContext {
  schedule: Schedule & { member_id: string };
  lesson: Pick<Lesson, 'id' | 'name' | 'classroom_name' | 'location' | 'member_id'>;
  member: Pick<Member, 'id' | 'name'>;
  /** YYYY-MM-DD (壁時計表現) */
  occurrenceDate: string;
  /** 壁時計表現の Date */
  startAt: Date;
  /** 既存登録持ち物 (sort_order 昇順) */
  items: readonly Item[];
  /** 当該 occurrence の checked 状態 (未登録の item は ✓ なし扱い) */
  checks: readonly ScheduleItemCheck[];
}

/**
 * prefs から day_before 通知のトリガ Date を算出する。
 * 開始時刻の前日 prefs.reminder_day_before_time に変換 (壁時計)。
 * 過去になる場合は null (=スケジュールしない)。
 */
export function computeDayBeforeTriggerAt(
  startAt: Date,
  prefs: Pick<NotificationPreferences, 'reminder_day_before_time'>,
  now: Date,
): Date | null {
  const [hStr = '21', mStr = '00'] = prefs.reminder_day_before_time.split(':');
  const trigger = new Date(
    startAt.getFullYear(),
    startAt.getMonth(),
    startAt.getDate() - 1,
    parseInt(hStr, 10),
    parseInt(mStr, 10),
    0,
    0,
  );
  if (trigger.getTime() <= now.getTime()) return null;
  return trigger;
}

/**
 * prefs から same_day 通知のトリガ Date を算出する。
 * 開始時刻から N 分前 (壁時計)。
 * 過去になる場合は null。
 */
export function computeSameDayTriggerAt(
  startAt: Date,
  prefs: Pick<NotificationPreferences, 'reminder_same_day_minutes'>,
  now: Date,
): Date | null {
  const trigger = new Date(
    startAt.getTime() - prefs.reminder_same_day_minutes * 60_000,
  );
  if (trigger.getTime() <= now.getTime()) return null;
  return trigger;
}

/**
 * 未チェック持ち物の name list を返す。
 * skip_when_all_items_checked を考慮した「通知メッセージ用 list」生成。
 *
 * 戻り値:
 *   - { itemNames, allChecked }: allChecked = true は呼び出し側で skip 判定に使う
 *   - items が空の場合 = { [], false }
 */
export function filterUncheckedItems(
  items: readonly Item[],
  checks: readonly ScheduleItemCheck[],
): { itemNames: string[]; allChecked: boolean } {
  if (items.length === 0) return { itemNames: [], allChecked: false };
  const checkedSet = new Set(
    checks.filter((c) => c.checked).map((c) => c.item_id),
  );
  const unchecked = items.filter((it) => !checkedSet.has(it.id));
  return {
    itemNames: unchecked.map((it) => it.name),
    allChecked: unchecked.length === 0,
  };
}

/**
 * 1 occurrence に対する通知 content を build する (day_before or same_day)。
 * 全 ✓ 済 skip 判定は呼び出し側で行うため、本関数は build のみ。
 */
export function buildContentForOccurrence(
  ctx: OccurrenceContext,
  type: NotificationType,
  prefs: NotificationPreferences,
): NotificationContent {
  const { itemNames } = filterUncheckedItems(ctx.items, ctx.checks);
  const ids: NotificationDataPayload = {
    scheduleId: ctx.schedule.id,
    occurrenceDate: ctx.occurrenceDate,
    notificationType: type,
    memberId: ctx.member.id,
    lessonId: ctx.lesson.id,
    itemIds: ctx.items.map((it) => it.id),
  };
  const input: BuildNotificationContentInput = {
    type,
    startAt: ctx.startAt,
    memberName: ctx.member.name,
    lessonName: ctx.lesson.name,
    location: ctx.lesson.location ?? ctx.lesson.classroom_name ?? null,
    itemNames,
    ids,
    prefs,
  };
  return buildNotificationContent(input);
}

/**
 * 1 occurrence を予約する。返値は (day_before id, same_day id) の組。
 *
 * 仕様 (ADR-008 §2.2):
 *   - prefs.reminder_day_before_enabled = false の場合は day_before skip
 *   - prefs.reminder_same_day_enabled = false の場合は same_day skip
 *   - prefs.skip_when_all_items_checked = true + 全 ✓ 済 → 当日通知 skip
 *   - past 過ぎる trigger Date は OS 側で skip (compute*TriggerAt が null を返す)
 */
export async function scheduleNotificationsForOccurrence(
  ctx: OccurrenceContext,
  prefs: NotificationPreferences,
  now: Date,
): Promise<{ dayBeforeId: string | null; sameDayId: string | null }> {
  let dayBeforeId: string | null = null;
  let sameDayId: string | null = null;

  if (prefs.reminder_day_before_enabled) {
    const trigger = computeDayBeforeTriggerAt(ctx.startAt, prefs, now);
    if (trigger) {
      const content = buildContentForOccurrence(ctx, 'day_before', prefs);
      dayBeforeId = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: trigger,
        },
      });
    }
  }

  if (prefs.reminder_same_day_enabled) {
    const { allChecked } = filterUncheckedItems(ctx.items, ctx.checks);
    const shouldSkip = prefs.skip_when_all_items_checked && allChecked;
    const trigger = shouldSkip
      ? null
      : computeSameDayTriggerAt(ctx.startAt, prefs, now);
    if (trigger) {
      const content = buildContentForOccurrence(ctx, 'same_day', prefs);
      sameDayId = await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: trigger,
        },
      });
    }
  }

  return { dayBeforeId, sameDayId };
}

/**
 * 既存全予約をキャンセルする (NOTIF-01 マスタートグル / member-mute / lesson-mute / prefs 変更時)。
 * Notifications API は全件 cancel しか提供しないので本層では全 cancel + 再予約戦略。
 */
export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * 特定 scheduleId に紐付く既予約だけ cancel する。
 * scheduleNotificationAsync 戻り値の id を覚えていないため、
 * `getAllScheduledNotificationsAsync()` で list 取得 → data.scheduleId 一致を cancel。
 */
export async function cancelNotificationsForSchedule(
  scheduleId: string,
): Promise<number> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  let count = 0;
  for (const req of all) {
    const data = req.content.data as Partial<NotificationDataPayload> | undefined;
    if (data?.scheduleId === scheduleId) {
      await Notifications.cancelScheduledNotificationAsync(req.identifier);
      count += 1;
    }
  }
  return count;
}

/**
 * 14 日先までの全 occurrence を組み立てる (世帯 = households / lessons / schedules / members / items 横串)。
 * scheduler の入口関数で呼ばれる。
 *
 * 戻り値: 各 occurrence + items + checks のセット
 *
 * MVP 実装:
 *   - 100 schedule × 14 日 = 1400 occurrence 上限想定
 *   - items / checks fetch は lesson_id / (schedule_id + occurrence_date) 単位でループ
 *   - 並列度は控えめ (5 並列以下) で Supabase rate-limit 警戒
 */
export async function collectFutureOccurrences(
  householdId: string,
  now: Date,
): Promise<OccurrenceContext[]> {
  const horizonEnd = new Date(now);
  horizonEnd.setDate(horizonEnd.getDate() + SCHEDULE_HORIZON_DAYS);

  const { data: members, error: mErr } = await supabase
    .from('members')
    .select('id, name')
    .eq('household_id', householdId);
  if (mErr) throw mErr;
  if (!members || members.length === 0) return [];
  const memberById = new Map(members.map((m) => [m.id, m]));

  const memberIds = members.map((m) => m.id);
  const { data: lessons, error: lErr } = await supabase
    .from('lessons')
    .select('id, member_id, name, classroom_name, location, notifications_muted')
    .in('member_id', memberIds);
  if (lErr) throw lErr;
  if (!lessons || lessons.length === 0) return [];

  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const lessonIds = lessons.map((l) => l.id);
  const { data: schedules, error: sErr } = await supabase
    .from('schedules')
    .select('*')
    .in('lesson_id', lessonIds);
  if (sErr) throw sErr;
  if (!schedules || schedules.length === 0) return [];

  // member_id を schedule に inject (expandSchedules が要求する形)
  const schedulesWithMember = schedules
    .map((s) => {
      const lesson = lessonById.get(s.lesson_id);
      if (!lesson) return null;
      return { ...s, member_id: lesson.member_id };
    })
    .filter((s): s is Schedule & { member_id: string } => s !== null);

  const occurrences = expandSchedules(schedulesWithMember, now, horizonEnd);
  if (occurrences.length === 0) return [];

  // items / checks fetch (lesson_id / schedule_id ごと)
  const uniqueLessonIds = Array.from(
    new Set(occurrences.map((o) => o.schedule.lesson_id)),
  );
  const itemsByLesson = new Map<string, Item[]>();
  for (const lessonId of uniqueLessonIds) {
    const items = await fetchItemsByLesson(lessonId);
    itemsByLesson.set(lessonId, items);
  }

  const results: OccurrenceContext[] = [];
  for (const occ of occurrences) {
    const lesson = lessonById.get(occ.schedule.lesson_id);
    if (!lesson) continue;
    if (lesson.notifications_muted) continue;
    const member = memberById.get(lesson.member_id);
    if (!member) continue;
    const items = itemsByLesson.get(lesson.id) ?? [];
    const checks = await fetchChecks({
      scheduleId: occ.schedule.id,
      occurrenceDate: occ.occurrenceDate,
    });
    results.push({
      schedule: occ.schedule,
      lesson,
      member,
      occurrenceDate: occ.occurrenceDate,
      startAt: occ.startAt,
      items,
      checks,
    });
  }
  return results;
}

/**
 * 全予約再構築 (グローバル cancel + 再予約)。
 * 用途:
 *   - NOTIF-01 トグル変更 (前日 / 当日 / 持ち物統合 / privacy / 通知音 / マスター)
 *   - notification_preferences のタイミング変更 (時刻 / 分前)
 *   - アプリ起動時 reconcile (既予約 vs 最新 occurrence の整合)
 *
 * R-D8-7 対策: バックグラウンドキューでの非同期実行は呼び出し側に委譲、本関数は直列順次。
 */
export async function rescheduleAllNotifications(
  householdId: string,
  now: Date = new Date(),
): Promise<{ scheduled: number; skipped: number }> {
  const prefs = await fetchNotificationPreferences();
  await cancelAllScheduledNotifications();

  // マスター OFF: day_before + same_day 両方 OFF
  if (!prefs.reminder_day_before_enabled && !prefs.reminder_same_day_enabled) {
    return { scheduled: 0, skipped: 0 };
  }

  const occurrences = await collectFutureOccurrences(householdId, now);
  let scheduled = 0;
  let skipped = 0;
  for (const ctx of occurrences) {
    const { dayBeforeId, sameDayId } = await scheduleNotificationsForOccurrence(
      ctx,
      prefs,
      now,
    );
    if (dayBeforeId) scheduled += 1;
    else skipped += 1;
    if (sameDayId) scheduled += 1;
    else skipped += 1;
  }
  return { scheduled, skipped };
}

/**
 * アプリ起動時 reconcile (cold start / foreground 復帰時の整合補正)。
 * `rescheduleAllNotifications` と同じ動作だが、別 API として呼び出し側を明示。
 *
 * 用途:
 *   - (main)/_layout.tsx の useEffect 初期化
 *   - useHouseholdRealtime の AppState 'active' catch-up
 *   - OS 通知許可 OFF → ON 復帰時の再構築
 */
export async function reconcileNotifications(
  householdId: string,
  now: Date = new Date(),
): Promise<{ scheduled: number; skipped: number }> {
  return rescheduleAllNotifications(householdId, now);
}

/**
 * 特定 schedule (INSERT / UPDATE / DELETE) を受けた際の差分再予約。
 * useHouseholdRealtime 経由で呼ばれる想定。
 *
 * MVP 実装: 「該当 schedule の既予約 cancel + 該当 occurrence のみ再予約」。
 * 全再予約より軽量だが、items / checks 側の変化はカバーしない (それは別 trigger)。
 */
export async function rescheduleNotificationsForSchedule(
  scheduleId: string,
  householdId: string,
  now: Date = new Date(),
): Promise<{ cancelled: number; scheduled: number }> {
  const cancelled = await cancelNotificationsForSchedule(scheduleId);
  const prefs = await fetchNotificationPreferences();
  if (!prefs.reminder_day_before_enabled && !prefs.reminder_same_day_enabled) {
    return { cancelled, scheduled: 0 };
  }
  const allOccurrences = await collectFutureOccurrences(householdId, now);
  const target = allOccurrences.filter((o) => o.schedule.id === scheduleId);
  let scheduled = 0;
  for (const ctx of target) {
    const { dayBeforeId, sameDayId } = await scheduleNotificationsForOccurrence(
      ctx,
      prefs,
      now,
    );
    if (dayBeforeId) scheduled += 1;
    if (sameDayId) scheduled += 1;
  }
  return { cancelled, scheduled };
}

/** OS 通知許可状態を返す。NOTIF-01 警告表示用。 */
export async function getPermissionStatus(): Promise<Notifications.NotificationPermissionsStatus> {
  return await Notifications.getPermissionsAsync();
}

/** テストから呼ぶための export (本番コードからは利用しない) */
export const __test__ = {
  computeDayBeforeTriggerAt,
  computeSameDayTriggerAt,
  filterUncheckedItems,
  buildContentForOccurrence,
};
