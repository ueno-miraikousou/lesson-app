/**
 * L1 unit test: useHouseholdRealtime の内部ヘルパ (Phase D Sprint 2 D2-T06)。
 *
 * 検証 (architect-5 設計レビュー §2.1-§2.4 反映後):
 *   - shouldToast: UPDATE/DELETE のみ true、INSERT は false
 *   - applyCheckPatchToCache: 既存配列に対する update / append、未 hydrate / 別キャッシュ非干渉
 *   - applyCheckDeleteToCache: 配列から該当 item_id を削除、未 hydrate 非破壊
 *   - invalidateAll: schedules + schedule-detail + schedule-item-checks + members + profile を網羅
 */

import { QueryClient } from '@tanstack/react-query';

import { __test__ } from '../useHouseholdRealtime';
import { queryKeys } from '../../../lib/query-client';
import type { ScheduleItemCheck } from '../../../types/database';

jest.mock('../../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../../stores/realtime-toast-store', () => ({
  REALTIME_TOAST_DURATION_MS: 4000,
  useRealtimeToastStore: () => ({ notify: jest.fn(), dismiss: jest.fn() }),
}));

const { applyCheckPatchToCache, applyCheckDeleteToCache, invalidateAll, shouldToast } = __test__;

describe('shouldToast', () => {
  it('UPDATE で true', () => {
    expect(shouldToast('UPDATE')).toBe(true);
  });
  it('DELETE で true', () => {
    expect(shouldToast('DELETE')).toBe(true);
  });
  it('INSERT で false (自然追加扱いで Toast 不要)', () => {
    expect(shouldToast('INSERT')).toBe(false);
  });
  it('未知 event は false', () => {
    expect(shouldToast('PURGE')).toBe(false);
    expect(shouldToast('')).toBe(false);
  });
});

describe('invalidateAll (catch-up)', () => {
  let client: QueryClient;
  let spy: jest.SpyInstance;

  beforeEach(() => {
    client = new QueryClient();
    spy = jest.spyOn(client, 'invalidateQueries');
  });
  afterEach(() => {
    client.clear();
    spy.mockRestore();
  });

  it('Sprint 2 対象 3 テーブル prefix を網羅 invalidate', () => {
    invalidateAll(client, 'hh-1');
    const roots = new Set(
      spy.mock.calls.map((c) => (c[0] as { queryKey: readonly string[] }).queryKey[0]),
    );
    expect(roots.has('schedules')).toBe(true);
    expect(roots.has('schedule-detail')).toBe(true);
    expect(roots.has('schedule-item-checks')).toBe(true);
    expect(roots.has('profile')).toBe(true);
    // queryKeys.household.members(householdId) は ['household', '<id>', 'members'] 形式
    expect(roots.has('household')).toBe(true);
  });

  it('members の queryKey は queryKeys 定数と整合 (queryKeys.household.members)', () => {
    invalidateAll(client, 'hh-XYZ');
    const memberKeys = spy.mock.calls
      .map((c) => (c[0] as { queryKey: readonly string[] }).queryKey)
      .filter((k) => k[0] === 'household');
    expect(memberKeys.length).toBeGreaterThan(0);
    expect(memberKeys[0]).toEqual(queryKeys.household.members('hh-XYZ'));
  });
});

describe('applyCheckPatchToCache (hot path 部分更新)', () => {
  let client: QueryClient;
  const queryKey = (scheduleId: string, occDate: string) =>
    ['schedule-item-checks', scheduleId, occDate] as const;

  beforeEach(() => {
    client = new QueryClient();
  });
  afterEach(() => client.clear());

  function seed(scheduleId: string, occDate: string, rows: Partial<ScheduleItemCheck>[]) {
    client.setQueryData(queryKey(scheduleId, occDate), rows as ScheduleItemCheck[]);
  }

  it('既存 item の checked を差し替える', () => {
    seed('sch-1', '2026-05-16', [
      { schedule_id: 'sch-1', item_id: 'i-a', occurrence_date: '2026-05-16', checked: false },
      { schedule_id: 'sch-1', item_id: 'i-b', occurrence_date: '2026-05-16', checked: false },
    ]);
    applyCheckPatchToCache(client, {
      schedule_id: 'sch-1',
      item_id: 'i-a',
      occurrence_date: '2026-05-16',
      checked: true,
    });

    const cache = client.getQueryData<ScheduleItemCheck[]>(queryKey('sch-1', '2026-05-16'));
    expect(cache?.find((r) => r.item_id === 'i-a')?.checked).toBe(true);
    expect(cache?.find((r) => r.item_id === 'i-b')?.checked).toBe(false);
    expect(cache?.length).toBe(2);
  });

  it('未知 item は新規追加 (append)', () => {
    seed('sch-1', '2026-05-16', [
      { schedule_id: 'sch-1', item_id: 'i-a', occurrence_date: '2026-05-16', checked: false },
    ]);
    applyCheckPatchToCache(client, {
      schedule_id: 'sch-1',
      item_id: 'i-new',
      occurrence_date: '2026-05-16',
      checked: true,
    });
    const cache = client.getQueryData<ScheduleItemCheck[]>(queryKey('sch-1', '2026-05-16'));
    expect(cache?.length).toBe(2);
    expect(cache?.find((r) => r.item_id === 'i-new')?.checked).toBe(true);
  });

  it('キャッシュ未生成のクエリには副作用なし (undefined のまま)', () => {
    applyCheckPatchToCache(client, {
      schedule_id: 'sch-missing',
      item_id: 'i-a',
      occurrence_date: '2026-05-16',
      checked: true,
    });
    expect(
      client.getQueryData<ScheduleItemCheck[]>(queryKey('sch-missing', '2026-05-16')),
    ).toBeUndefined();
  });

  it('違う occurrence_date のキャッシュは触らない', () => {
    seed('sch-1', '2026-05-16', [
      { schedule_id: 'sch-1', item_id: 'i-a', occurrence_date: '2026-05-16', checked: false },
    ]);
    seed('sch-1', '2026-05-23', [
      { schedule_id: 'sch-1', item_id: 'i-a', occurrence_date: '2026-05-23', checked: false },
    ]);
    applyCheckPatchToCache(client, {
      schedule_id: 'sch-1',
      item_id: 'i-a',
      occurrence_date: '2026-05-16',
      checked: true,
    });
    expect(
      client.getQueryData<ScheduleItemCheck[]>(queryKey('sch-1', '2026-05-23'))?.[0]?.checked,
    ).toBe(false);
    expect(
      client.getQueryData<ScheduleItemCheck[]>(queryKey('sch-1', '2026-05-16'))?.[0]?.checked,
    ).toBe(true);
  });

  it('schedule_id / item_id / occurrence_date 欠落時は何もしない', () => {
    seed('sch-1', '2026-05-16', [
      { schedule_id: 'sch-1', item_id: 'i-a', occurrence_date: '2026-05-16', checked: false },
    ]);
    // schedule_id 欠落
    applyCheckPatchToCache(client, { item_id: 'i-a', occurrence_date: '2026-05-16', checked: true });
    // item_id 欠落
    applyCheckPatchToCache(client, {
      schedule_id: 'sch-1',
      occurrence_date: '2026-05-16',
      checked: true,
    });
    const cache = client.getQueryData<ScheduleItemCheck[]>(queryKey('sch-1', '2026-05-16'));
    expect(cache?.[0]?.checked).toBe(false);
  });
});

describe('applyCheckDeleteToCache (DELETE 経路)', () => {
  let client: QueryClient;
  const queryKey = (scheduleId: string, occDate: string) =>
    ['schedule-item-checks', scheduleId, occDate] as const;

  beforeEach(() => {
    client = new QueryClient();
  });
  afterEach(() => client.clear());

  it('該当 item_id の row を配列から除去する', () => {
    client.setQueryData(queryKey('sch-1', '2026-05-16'), [
      { schedule_id: 'sch-1', item_id: 'i-a', occurrence_date: '2026-05-16', checked: true },
      { schedule_id: 'sch-1', item_id: 'i-b', occurrence_date: '2026-05-16', checked: false },
    ] as ScheduleItemCheck[]);

    applyCheckDeleteToCache(client, {
      schedule_id: 'sch-1',
      item_id: 'i-a',
      occurrence_date: '2026-05-16',
    });

    const cache = client.getQueryData<ScheduleItemCheck[]>(queryKey('sch-1', '2026-05-16'));
    expect(cache?.length).toBe(1);
    expect(cache?.[0]?.item_id).toBe('i-b');
  });

  it('未 hydrate キャッシュは破壊しない', () => {
    applyCheckDeleteToCache(client, {
      schedule_id: 'sch-X',
      item_id: 'i-a',
      occurrence_date: '2026-05-16',
    });
    expect(
      client.getQueryData<ScheduleItemCheck[]>(queryKey('sch-X', '2026-05-16')),
    ).toBeUndefined();
  });

  it('schedule_id / item_id / occurrence_date 欠落時は何もしない', () => {
    client.setQueryData(queryKey('sch-1', '2026-05-16'), [
      { schedule_id: 'sch-1', item_id: 'i-a', occurrence_date: '2026-05-16', checked: true },
    ] as ScheduleItemCheck[]);

    applyCheckDeleteToCache(client, { item_id: 'i-a', occurrence_date: '2026-05-16' });
    expect(
      client.getQueryData<ScheduleItemCheck[]>(queryKey('sch-1', '2026-05-16'))?.length,
    ).toBe(1);
  });
});
