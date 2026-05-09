/**
 * React Query の QueryClient シングルトン + デフォルト設定。
 *
 * 設計:
 *   - サーバ状態 (Supabase クエリ結果) は React Query が一元管理
 *   - Realtime 通知時は `queryClient.invalidateQueries` で再取得をトリガー
 *   - キャッシュ永続化は MVP では未実装 (オフライン閲覧は P1)
 *
 * 参照:
 *   - 02_設計/アーキテクチャ.md §4 (主要シーケンス)
 *   - 02_設計/画面/CAL-09-予定詳細と持ち物チェックリスト.md §11 (実装申し送り)
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 5分は新鮮、10分でガベージコレクト
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 2,
      // RN ではフォーカス追跡が誤検知しやすい
      refetchOnWindowFocus: false,
      // ネットワーク復帰時は自動再取得
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});

/** クエリキー定数 (タイポ防止) */
export const queryKeys = {
  household: {
    self: ['household', 'self'] as const,
    members: (householdId: string) => ['household', householdId, 'members'] as const,
  },
  lessons: {
    byMember: (memberId: string) => ['lessons', 'by-member', memberId] as const,
  },
  schedules: {
    byMonth: (householdId: string, yearMonth: string) =>
      ['schedules', householdId, yearMonth] as const,
    detail: (scheduleId: string, occurrenceDate: string) =>
      ['schedules', 'detail', scheduleId, occurrenceDate] as const,
  },
  items: {
    byLesson: (lessonId: string) => ['items', 'by-lesson', lessonId] as const,
  },
  invitations: {
    activeByHousehold: (householdId: string) =>
      ['invitations', 'active', householdId] as const,
  },
  notifications: {
    preferences: (authUserId: string) =>
      ['notification-preferences', authUserId] as const,
  },
} as const;
