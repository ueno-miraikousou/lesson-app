/**
 * Phase D Sprint 3 D3-T01: 通知タップ deeplink ハンドラ。
 *
 * 設計判断 (ADR-008 §2.3 末尾):
 *
 * 1. 通知タップ → アプリ起動 → CAL-09 (ScheduleDetailScreen) へ遷移。
 * 2. アプリ killed 時 (cold start) の path も `getLastNotificationResponseAsync` で再現。
 * 3. expo-router の URL 形式: `/schedule/[scheduleId]?occurrenceDate=YYYY-MM-DD`
 *    (実体 = `src/app/(main)/schedule/[scheduleId].tsx` → `ScheduleDetailScreen.tsx:36`)
 *
 * 既存資産:
 *   - `src/screens/ScheduleDetailScreen.tsx:36` で useLocalSearchParams を読む
 *   - expo-router の `router.push({ pathname, params })` で navigate
 *
 * 参照:
 *   - 02_設計/ADR/ADR-008 §2.3 末尾 deeplink listener
 *   - src/features/notifications/payload-builder.ts (NotificationDataPayload)
 *   - src/screens/ScheduleDetailScreen.tsx (受け先)
 */

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import type { NotificationDataPayload } from './payload-builder';

/** 通知 data が型仕様を満たすか runtime 検証 */
export function isNotificationDataPayload(
  data: unknown,
): data is NotificationDataPayload {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.scheduleId === 'string' &&
    typeof d.occurrenceDate === 'string' &&
    (d.notificationType === 'day_before' || d.notificationType === 'same_day') &&
    typeof d.memberId === 'string' &&
    typeof d.lessonId === 'string' &&
    Array.isArray(d.itemIds)
  );
}

/**
 * data を CAL-09 deeplink に変換して遷移する。
 * 不正な payload (data shape mismatch) は無視。
 */
export function navigateToScheduleDetail(data: unknown): boolean {
  if (!isNotificationDataPayload(data)) return false;
  router.push({
    pathname: '/schedule/[scheduleId]',
    params: { scheduleId: data.scheduleId, occurrenceDate: data.occurrenceDate },
  });
  return true;
}

/**
 * 通知タップ listener を install する。
 * 戻り値 = unsubscribe 関数。useEffect cleanup から呼ぶ想定。
 */
export function installNotificationResponseListener(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    navigateToScheduleDetail(response.notification.request.content.data);
  });
  return () => sub.remove();
}

/**
 * アプリ killed 状態からの cold start 時に呼ぶ。
 * 起動契機が通知タップだった場合のみ deeplink を発火する。
 */
export async function handleColdStartNotification(): Promise<boolean> {
  const response = await Notifications.getLastNotificationResponseAsync();
  if (!response) return false;
  return navigateToScheduleDetail(response.notification.request.content.data);
}
