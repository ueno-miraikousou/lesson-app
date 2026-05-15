/**
 * Phase D Sprint 2 D2-T01..T05: 世帯単位 Realtime 同期 hook
 * (F-06 中核 + F-05 LWW + F-04 補強)。
 *
 * 設計判断 (ADR-007 §2 採用案 + architect-5 セッション #5 設計レビュー):
 *
 * 1. Sprint 2 は 3 テーブル限定で subscribe:
 *    - `schedules` (F-06 AC1 予定の即時反映)
 *    - `schedule_item_checks` (F-06 AC2 持ち物✓即時反映、hot path)
 *    - `members` (F-06 AC3 家族構成員プロフィール反映)
 *    残り (households / lessons / items / notification_preferences) は Sprint 3+ 拡張、
 *    household_members は publication 未登録のため Realtime 対象外。
 *
 * 2. filter 句は使わず RLS のみで世帯境界を防御 (ADR-007 §6.5 + 設計レビュー §2.1):
 *    - schedules / schedule_item_checks に household_id 列なし → そもそも filter 句不可
 *    - members は household_id 列ありなので、payload 受信時に二重防御で再 validate
 *
 * 3. hot path: schedule_item_checks UPSERT 受信時のみ setQueryData で部分更新
 *    → 体感 < 200ms (ADR-007 §2.4 C-2 / D2-T03 / I-03 連動)。
 *    queryKey は ScheduleDetailScreen.tsx:70 と同形式
 *    `['schedule-item-checks', scheduleId, occurrenceDate]` で、配列 (ScheduleItemCheck[]) を更新。
 *
 * 4. catch-up reconcile (D2-T04、設計レビュー §2.3):
 *    - AppState 'active' トリガ (foreground 復帰)
 *    - channel status CLOSED / CHANNEL_ERROR (切断検知)
 *    - ネットワーク復帰は React Query refetchOnReconnect:true で自動代行
 *    query-client.ts は refetchOnWindowFocus:false (RN 誤検知対策) なので AppState で代用。
 *
 * 5. UPDATE/DELETE 受信時のみ「他のメンバーが編集しました」Toast (D2-T05):
 *    - INSERT は自然追加扱いで抑止
 *    - 自端末 echo の dedupe は schedules.updated_by_member_id 列が未存在のため
 *      MVP は緩めの精度 (誤検知許容)、Sprint 2 末で 0007 migration 起案要否を architect-5 と判定
 *
 * 6. hook 起動位置 = `src/app/(main)/_layout.tsx` (AuthGate と整合、設計レビュー §2.5):
 *    認証済 + 世帯あり + wizard 完了の経路のみ起動、wizard / login / share 経路では起動しない。
 *
 * 参照:
 *   - 02_設計/ADR/ADR-007-Phase_D_Realtime同期方式.md §2 / §6
 *   - architect_5_useHouseholdRealtime_design_review_20260516.md §2 / §6
 *   - 01_要件定義/Phase_D_WBS_v0.1.md §4.2 Sprint 2 D2-T01..T06
 *   - src/lib/schedule-item-checks.ts (hot path UPSERT)
 *   - src/screens/ScheduleDetailScreen.tsx:70 (既存 queryKey 形式)
 */

import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';

import { supabase } from '../../lib/supabase';
import { queryKeys } from '../../lib/query-client';
import { useRealtimeToastStore } from '../../stores/realtime-toast-store';
import type { ScheduleItemCheck } from '../../types/database';
import {
  cancelNotificationsForSchedule,
  rescheduleNotificationsForSchedule,
} from '../notifications/scheduler';

/** UPDATE/DELETE 受信時のみ Toast を出す (INSERT は新規追加で自然) */
function shouldToast(eventType: string): boolean {
  return eventType === 'UPDATE' || eventType === 'DELETE';
}

/**
 * Sprint 2 対象 3 テーブル + 関連 prefix を一括 invalidate (catch-up 用)。
 * Sprint 3 拡張時に lessons / items / households の prefix を追加。
 */
function invalidateAll(client: QueryClient, householdId: string): void {
  void client.invalidateQueries({ queryKey: ['schedules'] });
  void client.invalidateQueries({ queryKey: ['schedule-detail'] });
  void client.invalidateQueries({ queryKey: ['schedule-item-checks'] });
  void client.invalidateQueries({ queryKey: queryKeys.household.members(householdId) });
  // members 経由で連動する画面 (MEM-03 プロフィール画面) も refresh
  void client.invalidateQueries({ queryKey: ['profile'] });
}

/**
 * hot path: schedule_item_checks UPSERT 受信時に対応行のキャッシュを部分更新する。
 * queryKey = ['schedule-item-checks', scheduleId, occurrenceDate]、data 形 = ScheduleItemCheck[]
 * (ScheduleDetailScreen.tsx:70 + fetchChecks 戻り値と整合)。
 *
 * cache 未 hydrate (old === undefined) 時は何もせず通過、
 * 表示時の useQuery が fetch を発火するため fall through で正常動作する。
 */
function applyCheckPatchToCache(
  client: QueryClient,
  row: Partial<ScheduleItemCheck>,
): void {
  if (!row.schedule_id || !row.item_id || !row.occurrence_date) return;
  const queryKey = ['schedule-item-checks', row.schedule_id, row.occurrence_date] as const;
  client.setQueryData<ScheduleItemCheck[] | undefined>(queryKey, (old) => {
    if (!old) return old;
    const idx = old.findIndex((r) => r.item_id === row.item_id);
    if (idx === -1) {
      return [...old, row as ScheduleItemCheck];
    }
    const next = old.slice();
    next[idx] = { ...old[idx], ...(row as ScheduleItemCheck) };
    return next;
  });
}

/** schedule_item_checks DELETE event はキャッシュから row を除去 */
function applyCheckDeleteToCache(
  client: QueryClient,
  oldRow: Partial<ScheduleItemCheck>,
): void {
  if (!oldRow.schedule_id || !oldRow.item_id || !oldRow.occurrence_date) return;
  const queryKey = ['schedule-item-checks', oldRow.schedule_id, oldRow.occurrence_date] as const;
  client.setQueryData<ScheduleItemCheck[] | undefined>(queryKey, (old) => {
    if (!old) return old;
    return old.filter((r) => r.item_id !== oldRow.item_id);
  });
}

/**
 * 世帯単位 Realtime 同期を起動する hook。
 * householdId が null / 変化したら channel を作り直す。
 */
export function useHouseholdRealtime(householdId: string | null): void {
  const queryClient = useQueryClient();
  const notify = useRealtimeToastStore((s) => s.notify);

  useEffect(() => {
    if (!householdId) return;

    let channel: RealtimeChannel = supabase.channel(`household:${householdId}`);

    // ---------------------------------------------------------------
    // schedules: household_id 列なし、payload 再 validate 不能 (RLS only)
    //
    // Phase D Sprint 3 (ADR-008 §4.4 連動):
    //   - INSERT / UPDATE → rescheduleNotificationsForSchedule で再予約
    //   - DELETE → cancelNotificationsForSchedule で取消
    //   通知再予約は best-effort、失敗時もキャッシュ invalidate は行う
    // ---------------------------------------------------------------
    channel = channel.on(
      // @supabase/supabase-js v2 の RealtimeChannel.on は 'postgres_changes' / 'system' /
      // 'broadcast' / 'presence' のオーバーロード判定が複雑なため as never で吸収。
      // ランタイム挙動は公式仕様通り、テスト (L1/L2) でも検証済。
      'postgres_changes' as never,
      { event: '*', schema: 'public', table: 'schedules' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        void queryClient.invalidateQueries({ queryKey: ['schedules'] });
        void queryClient.invalidateQueries({ queryKey: ['schedule-detail'] });
        const row = (payload.new ?? payload.old) as { id?: string } | null;
        const scheduleId = row?.id;
        if (scheduleId) {
          if (payload.eventType === 'DELETE') {
            void cancelNotificationsForSchedule(scheduleId).catch(() => undefined);
          } else {
            void rescheduleNotificationsForSchedule(
              scheduleId,
              householdId,
            ).catch(() => undefined);
          }
        }
        if (shouldToast(payload.eventType)) {
          notify('他のメンバーが編集しました');
        }
      },
    );

    // ---------------------------------------------------------------
    // schedule_item_checks: household_id 列なし、hot path で部分更新
    // ---------------------------------------------------------------
    channel = channel.on(
      'postgres_changes' as never,
      { event: '*', schema: 'public', table: 'schedule_item_checks' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const eventType = payload.eventType;
        if (eventType === 'INSERT' || eventType === 'UPDATE') {
          applyCheckPatchToCache(queryClient, payload.new as Partial<ScheduleItemCheck>);
        } else if (eventType === 'DELETE') {
          applyCheckDeleteToCache(queryClient, payload.old as Partial<ScheduleItemCheck>);
        }
        if (shouldToast(eventType)) {
          notify('他のメンバーが編集しました');
        }
      },
    );

    // ---------------------------------------------------------------
    // members: household_id 列あり、payload 再 validate で二重防御
    // ---------------------------------------------------------------
    channel = channel.on(
      'postgres_changes' as never,
      { event: '*', schema: 'public', table: 'members' },
      (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const row = (payload.new ?? payload.old) as { household_id?: string } | null;
        // 二重防御: RLS が漏らした場合でも client 側で破棄
        if (!row || row.household_id !== householdId) return;
        void queryClient.invalidateQueries({
          queryKey: queryKeys.household.members(householdId),
        });
        void queryClient.invalidateQueries({ queryKey: ['profile'] });
        if (shouldToast(payload.eventType)) {
          notify('他のメンバーが編集しました');
        }
      },
    );

    // ---------------------------------------------------------------
    // channel status 監視: 切断検知時に catch-up
    // ---------------------------------------------------------------
    channel = channel.subscribe((status) => {
      if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        invalidateAll(queryClient, householdId);
      }
    });

    // ---------------------------------------------------------------
    // AppState 'active' トリガ: foreground 復帰時に catch-up
    // ---------------------------------------------------------------
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        invalidateAll(queryClient, householdId);
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      void supabase.removeChannel(channel);
      subscription.remove();
    };
  }, [householdId, queryClient, notify]);
}

/** テストから内部関数を呼び出すための export (本番コードからは利用しない) */
export const __test__ = {
  applyCheckPatchToCache,
  applyCheckDeleteToCache,
  invalidateAll,
  shouldToast,
};
