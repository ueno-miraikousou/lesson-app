import { Stack } from 'expo-router';
import { useEffect } from 'react';

import {
  handleColdStartNotification,
  installNotificationResponseListener,
} from '../../features/notifications/response-handler';
import { reconcileNotifications } from '../../features/notifications/scheduler';
import { useHouseholdRealtime } from '../../features/realtime/useHouseholdRealtime';
import { useAuthStore } from '../../stores/auth-store';

/**
 * メインタブ用レイアウト。
 *
 * Phase D Sprint 2 D2-T02: 認証済 + 世帯あり + wizard 完了の (main) 経路でのみ
 * 世帯単位 Realtime 同期 hook を起動する (architect-5 設計レビュー §2.5)。
 * wizard / login / share 経路では起動させないことで無駄 connection を避ける。
 *
 * Phase D Sprint 3 D3-T01 (ADR-008 §2.5 / §4):
 *   - 通知タップ deeplink listener (installNotificationResponseListener)
 *   - cold start (アプリ killed 状態からの起動) 通知 → CAL-09 遷移
 *   - 起動時 reconcile (既予約 vs DB 最新の整合)
 */
export default function MainLayout() {
  const householdId = useAuthStore((s) => s.householdId);
  useHouseholdRealtime(householdId);

  // 通知タップ listener (foreground / background 共通) + cold start 1 回
  useEffect(() => {
    const unsubscribe = installNotificationResponseListener();
    void handleColdStartNotification();
    return unsubscribe;
  }, []);

  // 起動時 reconcile (既予約 vs DB 最新の整合補正、ADR-008 §2.2 表 「アプリ起動時」)
  useEffect(() => {
    if (!householdId) return;
    void reconcileNotifications(householdId).catch(() => undefined);
  }, [householdId]);

  return <Stack screenOptions={{ headerShown: false }} />;
}
