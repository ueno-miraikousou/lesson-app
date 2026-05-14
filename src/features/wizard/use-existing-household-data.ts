/**
 * ADR-006 §4.4 既存世帯データ取得 hook (WIZ-10 追加モード専用)。
 *
 * 追加モードのウィザード再実行時に、既存メンバー / 習い事の数と詳細を取得し、
 * 「現在 N 人登録済 / 追加で何人?」表示と「既存メンバー名重複警告」「既使用色グレーアウト」の
 * UI ソースとして使う。
 *
 * 設計:
 *   - mode='add' のときのみ enabled、mode='new' なら空データを即時返す
 *   - React Query で重複取得を抑制 (intro / step1 / step2 / step5 が同 hook を読む)
 *   - AUTH_BYPASS 時は mock data で代替 (Calendar と同じ household id を使用)
 *
 * 参照: ADR-006 §4.4
 */

import { useQuery } from '@tanstack/react-query';

import { supabase } from '../../lib/supabase';
import { isAuthBypassEnabled } from '../../hooks/use-auth-session';
import type { Member } from '../../types/database';

export interface ExistingHouseholdData {
  /** 既存メンバー全件 (sort_order 昇順) */
  members: readonly Member[];
  /** 既存メンバーの色 (lowercase) — UI で重複回避用 */
  usedColors: readonly string[];
  /** 既存メンバー名 (trim 済 lowercase) — UI で重複警告用 */
  usedNames: readonly string[];
  /** 子供メンバー数 */
  childCount: number;
  /** 親メンバー数 */
  parentCount: number;
  /** その他メンバー数 */
  otherCount: number;
  /** 既存 lessons 数 */
  lessonCount: number;
}

const EMPTY_DATA: ExistingHouseholdData = {
  members: [],
  usedColors: [],
  usedNames: [],
  childCount: 0,
  parentCount: 0,
  otherCount: 0,
  lessonCount: 0,
};

function buildMockExistingData(): ExistingHouseholdData {
  // AUTH_BYPASS 時の mock data。CalendarScreen buildMockMonthData と整合 (3 メンバー)。
  const now = new Date().toISOString();
  const members: Member[] = [
    {
      id: '10000000-0000-4000-8000-000000000001',
      household_id: '00000000-0000-4000-8000-000000000002',
      name: 'すずちゃん',
      birth_date: null,
      gender: 'female',
      role: 'child',
      color_hex: '#FF6B7A',
      notifications_muted: false,
      sort_order: 1,
      created_at: now,
      updated_at: now,
    },
    {
      id: '10000000-0000-4000-8000-000000000002',
      household_id: '00000000-0000-4000-8000-000000000002',
      name: 'パパ',
      birth_date: null,
      gender: 'male',
      role: 'parent',
      color_hex: '#5DADE2',
      notifications_muted: false,
      sort_order: 2,
      created_at: now,
      updated_at: now,
    },
    {
      id: '10000000-0000-4000-8000-000000000003',
      household_id: '00000000-0000-4000-8000-000000000002',
      name: 'ママ',
      birth_date: null,
      gender: 'female',
      role: 'parent',
      color_hex: '#48C9B0',
      notifications_muted: false,
      sort_order: 3,
      created_at: now,
      updated_at: now,
    },
  ];
  return summarize(members, 3);
}

function summarize(members: readonly Member[], lessonCount: number): ExistingHouseholdData {
  const usedColors = members
    .map((m) => m.color_hex.toLowerCase())
    .filter((c, i, arr) => arr.indexOf(c) === i);
  const usedNames = members
    .map((m) => m.name.trim().toLowerCase())
    .filter((n, i, arr) => arr.indexOf(n) === i);
  return {
    members,
    usedColors,
    usedNames,
    childCount: members.filter((m) => m.role === 'child').length,
    parentCount: members.filter((m) => m.role === 'parent').length,
    otherCount: members.filter((m) => m.role === 'other').length,
    lessonCount,
  };
}

/**
 * 既存世帯データを取得する hook。
 *
 * @param householdId 世帯 ID (auth-store から渡す、null なら disabled)
 * @param enabled mode='add' のときのみ true。false なら空データを即時返す
 */
export function useExistingHouseholdData(
  householdId: string | null,
  enabled: boolean,
): {
  data: ExistingHouseholdData;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery<ExistingHouseholdData>({
    queryKey: ['wizard', 'existing-household', householdId ?? 'none'],
    queryFn: async () => {
      if (!householdId) return EMPTY_DATA;
      if (isAuthBypassEnabled()) return buildMockExistingData();

      const { data: membersData, error: membersError } = await supabase
        .from('members')
        .select(
          'id, household_id, name, birth_date, gender, role, color_hex, notifications_muted, sort_order, created_at, updated_at',
        )
        .eq('household_id', householdId)
        .order('sort_order', { ascending: true });
      if (membersError) throw membersError;

      const { count: lessonCount } = await supabase
        .from('lessons')
        .select('id', { count: 'exact', head: true })
        .in(
          'member_id',
          (membersData ?? []).map((m) => m.id),
        );

      return summarize(membersData ?? [], lessonCount ?? 0);
    },
    enabled: enabled && !!householdId,
    staleTime: 30 * 1000,
  });

  return {
    data: query.data ?? EMPTY_DATA,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
