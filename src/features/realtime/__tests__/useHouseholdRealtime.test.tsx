/**
 * L2 integration test: useHouseholdRealtime hook (Phase D Sprint 2 D2-T06)。
 *
 * 検証 (architect-5 設計レビュー §2-§4 反映後):
 *   - householdId が null の時は channel を張らない
 *   - householdId 確定で `household:<id>` channel が作成され、3 テーブル分の
 *     postgres_changes リスナーが登録される (Sprint 2 = schedules / schedule_item_checks / members)
 *   - schedules UPDATE 受信 → schedules / schedule-detail を invalidate + Toast 発火
 *   - schedules INSERT 受信 → invalidate するが Toast 抑止
 *   - schedule_item_checks INSERT 受信 → setQueryData で部分更新 + Toast 抑止
 *   - schedule_item_checks UPDATE 受信 → setQueryData + Toast 発火
 *   - schedule_item_checks DELETE 受信 → キャッシュから除去 + Toast 発火
 *   - members UPDATE 受信 (自世帯 payload) → invalidate + Toast 発火
 *   - members UPDATE 受信 (他世帯 payload) → 二重防御で破棄、invalidate も Toast も発火しない
 *   - channel status CLOSED / CHANNEL_ERROR → catch-up invalidate
 *   - AppState 'active' → catch-up invalidate
 *   - householdId 変化で旧 channel + AppState subscription が掃除される
 */

import { renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState } from 'react-native';
import { type ReactNode } from 'react';

import { useHouseholdRealtime } from '../useHouseholdRealtime';
import * as scheduler from '../../notifications/scheduler';
import { supabase } from '../../../lib/supabase';
import { useRealtimeToastStore } from '../../../stores/realtime-toast-store';
import type { ScheduleItemCheck } from '../../../types/database';

jest.mock('../../notifications/scheduler', () => ({
  cancelNotificationsForSchedule: jest.fn(() => Promise.resolve(0)),
  rescheduleNotificationsForSchedule: jest.fn(() => Promise.resolve({ cancelled: 0, scheduled: 0 })),
}));

type Handler = (payload: { eventType: string; new?: unknown; old?: unknown }) => void;

interface ChannelMock {
  on: jest.Mock;
  subscribe: jest.Mock;
  __handlers: Record<string, Handler>;
  __subscribeCallback: ((status: string) => void) | null;
  __name: string;
}

function createChannelMock(name: string): ChannelMock {
  const handlers: Record<string, Handler> = {};
  let subscribeCallback: ((status: string) => void) | null = null;
  const mock: Partial<ChannelMock> = {
    __handlers: handlers,
    __name: name,
    get __subscribeCallback() {
      return subscribeCallback;
    },
    set __subscribeCallback(cb: ((s: string) => void) | null) {
      subscribeCallback = cb;
    },
  };
  mock.on = jest.fn((_eventName: string, cfg: { table: string }, cb: Handler) => {
    handlers[cfg.table] = cb;
    return mock;
  });
  mock.subscribe = jest.fn((cb?: (status: string) => void) => {
    if (cb) subscribeCallback = cb;
    return mock;
  });
  return mock as ChannelMock;
}

describe('useHouseholdRealtime (L2 integration)', () => {
  let queryClient: QueryClient;
  let channelMock: ChannelMock;
  let supabaseMock: { channel: jest.Mock; removeChannel: jest.Mock };
  let appStateAddSpy: jest.SpyInstance;
  let appStateSubscriptionRemove: jest.Mock;

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  function getAppStateHandler(): (s: string) => void {
    // jest.spyOn の最新 call の第 2 引数 (listener) を取り出す
    const calls = appStateAddSpy.mock.calls;
    const last = calls[calls.length - 1];
    return last[1] as (s: string) => void;
  }

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    channelMock = createChannelMock('household:hh-1');
    supabaseMock = {
      channel: jest.fn(() => channelMock),
      removeChannel: jest.fn(),
    };
    (supabase as unknown as { channel: jest.Mock }).channel = supabaseMock.channel;
    (supabase as unknown as { removeChannel: jest.Mock }).removeChannel = supabaseMock.removeChannel;

    appStateSubscriptionRemove = jest.fn();
    appStateAddSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove: appStateSubscriptionRemove } as ReturnType<
        typeof AppState.addEventListener
      >);

    useRealtimeToastStore.setState({ message: null, key: 0 });
  });

  afterEach(() => {
    queryClient.clear();
    appStateAddSpy.mockRestore();
  });

  it('householdId が null の時は channel を張らない', () => {
    renderHook(() => useHouseholdRealtime(null), { wrapper });
    expect(supabaseMock.channel).not.toHaveBeenCalled();
    expect(appStateAddSpy).not.toHaveBeenCalled();
  });

  it('Sprint 2 = 3 テーブル subscribe (schedules / schedule_item_checks / members)', () => {
    renderHook(() => useHouseholdRealtime('hh-1'), { wrapper });
    expect(supabaseMock.channel).toHaveBeenCalledWith('household:hh-1');
    expect(channelMock.on).toHaveBeenCalledTimes(3);
    const tables = (channelMock.on.mock.calls as [string, { table: string }, Handler][]).map(
      ([, cfg]) => cfg.table,
    );
    expect(tables).toEqual(
      expect.arrayContaining(['schedules', 'schedule_item_checks', 'members']),
    );
    // filter 句は使わない (architect-5 §2.1)
    for (const [, cfg] of channelMock.on.mock.calls as [string, Record<string, unknown>, Handler][]) {
      expect(cfg.filter).toBeUndefined();
    }
  });

  it('schedules UPDATE 受信で schedules / schedule-detail を invalidate + Toast 発火', () => {
    renderHook(() => useHouseholdRealtime('hh-1'), { wrapper });
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    spy.mockClear();

    channelMock.__handlers.schedules({
      eventType: 'UPDATE',
      new: { id: 'sch-1' },
    });

    const calls = spy.mock.calls.map((c) => (c[0] as { queryKey: readonly string[] }).queryKey[0]);
    expect(calls).toContain('schedules');
    expect(calls).toContain('schedule-detail');
    expect(useRealtimeToastStore.getState().message).toBe('他のメンバーが編集しました');
  });

  it('schedules INSERT 受信で invalidate するが Toast は抑止', () => {
    renderHook(() => useHouseholdRealtime('hh-1'), { wrapper });
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    spy.mockClear();

    channelMock.__handlers.schedules({ eventType: 'INSERT', new: { id: 'sch-2' } });

    expect(spy).toHaveBeenCalled();
    expect(useRealtimeToastStore.getState().message).toBeNull();
  });

  it('schedule_item_checks INSERT 受信で setQueryData により部分更新 + Toast 抑止', () => {
    queryClient.setQueryData(
      ['schedule-item-checks', 'sch-1', '2026-05-16'],
      [{ schedule_id: 'sch-1', item_id: 'i-a', occurrence_date: '2026-05-16', checked: false }] as ScheduleItemCheck[],
    );

    renderHook(() => useHouseholdRealtime('hh-1'), { wrapper });

    channelMock.__handlers.schedule_item_checks({
      eventType: 'INSERT',
      new: {
        schedule_id: 'sch-1',
        item_id: 'i-b',
        occurrence_date: '2026-05-16',
        checked: true,
      },
    });

    const cache = queryClient.getQueryData<ScheduleItemCheck[]>([
      'schedule-item-checks',
      'sch-1',
      '2026-05-16',
    ]);
    expect(cache?.length).toBe(2);
    expect(cache?.find((r) => r.item_id === 'i-b')?.checked).toBe(true);
    expect(useRealtimeToastStore.getState().message).toBeNull();
  });

  it('schedule_item_checks UPDATE 受信で setQueryData 部分更新 + Toast 発火', () => {
    queryClient.setQueryData(
      ['schedule-item-checks', 'sch-1', '2026-05-16'],
      [{ schedule_id: 'sch-1', item_id: 'i-a', occurrence_date: '2026-05-16', checked: false }] as ScheduleItemCheck[],
    );

    renderHook(() => useHouseholdRealtime('hh-1'), { wrapper });

    channelMock.__handlers.schedule_item_checks({
      eventType: 'UPDATE',
      new: {
        schedule_id: 'sch-1',
        item_id: 'i-a',
        occurrence_date: '2026-05-16',
        checked: true,
      },
    });

    const cache = queryClient.getQueryData<ScheduleItemCheck[]>([
      'schedule-item-checks',
      'sch-1',
      '2026-05-16',
    ]);
    expect(cache?.[0]?.checked).toBe(true);
    expect(useRealtimeToastStore.getState().message).toBe('他のメンバーが編集しました');
  });

  it('schedule_item_checks DELETE 受信でキャッシュから row を除去 + Toast 発火', () => {
    queryClient.setQueryData(
      ['schedule-item-checks', 'sch-1', '2026-05-16'],
      [
        { schedule_id: 'sch-1', item_id: 'i-a', occurrence_date: '2026-05-16', checked: true },
        { schedule_id: 'sch-1', item_id: 'i-b', occurrence_date: '2026-05-16', checked: false },
      ] as ScheduleItemCheck[],
    );

    renderHook(() => useHouseholdRealtime('hh-1'), { wrapper });

    channelMock.__handlers.schedule_item_checks({
      eventType: 'DELETE',
      old: {
        schedule_id: 'sch-1',
        item_id: 'i-a',
        occurrence_date: '2026-05-16',
      },
    });

    const cache = queryClient.getQueryData<ScheduleItemCheck[]>([
      'schedule-item-checks',
      'sch-1',
      '2026-05-16',
    ]);
    expect(cache?.length).toBe(1);
    expect(cache?.[0]?.item_id).toBe('i-b');
    expect(useRealtimeToastStore.getState().message).toBe('他のメンバーが編集しました');
  });

  it('members UPDATE (自世帯 household_id 一致) で members / profile invalidate + Toast 発火', () => {
    renderHook(() => useHouseholdRealtime('hh-1'), { wrapper });
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    spy.mockClear();

    channelMock.__handlers.members({
      eventType: 'UPDATE',
      new: { id: 'mem-1', household_id: 'hh-1' },
    });

    const roots = new Set(
      spy.mock.calls.map((c) => (c[0] as { queryKey: readonly string[] }).queryKey[0]),
    );
    expect(roots.has('household')).toBe(true); // queryKeys.household.members
    expect(roots.has('profile')).toBe(true);
    expect(useRealtimeToastStore.getState().message).toBe('他のメンバーが編集しました');
  });

  it('members UPDATE (他世帯 household_id 不一致) は二重防御で破棄、invalidate も Toast もなし', () => {
    renderHook(() => useHouseholdRealtime('hh-1'), { wrapper });
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    spy.mockClear();

    channelMock.__handlers.members({
      eventType: 'UPDATE',
      new: { id: 'mem-X', household_id: 'OTHER-HH' },
    });

    expect(spy).not.toHaveBeenCalled();
    expect(useRealtimeToastStore.getState().message).toBeNull();
  });

  it('channel status CLOSED で catch-up invalidateAll 発火', () => {
    renderHook(() => useHouseholdRealtime('hh-1'), { wrapper });
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    spy.mockClear();

    expect(channelMock.__subscribeCallback).not.toBeNull();
    channelMock.__subscribeCallback?.('CLOSED');

    const roots = new Set(
      spy.mock.calls.map((c) => (c[0] as { queryKey: readonly string[] }).queryKey[0]),
    );
    expect(roots.has('schedules')).toBe(true);
    expect(roots.has('schedule-detail')).toBe(true);
    expect(roots.has('schedule-item-checks')).toBe(true);
    expect(roots.has('household')).toBe(true);
    expect(roots.has('profile')).toBe(true);
  });

  it('channel status CHANNEL_ERROR で catch-up invalidateAll 発火', () => {
    renderHook(() => useHouseholdRealtime('hh-1'), { wrapper });
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    spy.mockClear();

    channelMock.__subscribeCallback?.('CHANNEL_ERROR');
    expect(spy).toHaveBeenCalled();
  });

  it('AppState active 復帰で catch-up invalidateAll 発火', () => {
    renderHook(() => useHouseholdRealtime('hh-1'), { wrapper });
    expect(appStateAddSpy).toHaveBeenCalledWith('change', expect.any(Function));

    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    spy.mockClear();

    const handler = getAppStateHandler();
    handler('active');

    const roots = new Set(
      spy.mock.calls.map((c) => (c[0] as { queryKey: readonly string[] }).queryKey[0]),
    );
    expect(roots.has('schedules')).toBe(true);
    expect(roots.has('schedule-item-checks')).toBe(true);
    expect(roots.has('household')).toBe(true);
  });

  it('AppState inactive / background では invalidate しない', () => {
    renderHook(() => useHouseholdRealtime('hh-1'), { wrapper });
    const spy = jest.spyOn(queryClient, 'invalidateQueries');
    spy.mockClear();

    const handler = getAppStateHandler();
    handler('inactive');
    handler('background');
    expect(spy).not.toHaveBeenCalled();
  });

  it('unmount で removeChannel + AppState subscription.remove が呼ばれる', () => {
    const { unmount } = renderHook(() => useHouseholdRealtime('hh-1'), { wrapper });
    unmount();
    expect(supabaseMock.removeChannel).toHaveBeenCalledWith(channelMock);
    expect(appStateSubscriptionRemove).toHaveBeenCalled();
  });

  describe('schedules イベント → scheduler 再予約 (Phase D Sprint 3 D3-T01)', () => {
    const rescheduleMock = scheduler.rescheduleNotificationsForSchedule as jest.Mock;
    const cancelMock = scheduler.cancelNotificationsForSchedule as jest.Mock;

    beforeEach(() => {
      rescheduleMock.mockClear();
      cancelMock.mockClear();
    });

    it('schedules INSERT 受信 → rescheduleNotificationsForSchedule(scheduleId, householdId)', () => {
      renderHook(() => useHouseholdRealtime('hh-1'), { wrapper });
      channelMock.__handlers.schedules({
        eventType: 'INSERT',
        new: { id: 'sch-new' },
      });
      expect(rescheduleMock).toHaveBeenCalledWith('sch-new', 'hh-1');
      expect(cancelMock).not.toHaveBeenCalled();
    });

    it('schedules UPDATE 受信 → reschedule 呼出', () => {
      renderHook(() => useHouseholdRealtime('hh-1'), { wrapper });
      channelMock.__handlers.schedules({
        eventType: 'UPDATE',
        new: { id: 'sch-upd' },
      });
      expect(rescheduleMock).toHaveBeenCalledWith('sch-upd', 'hh-1');
    });

    it('schedules DELETE 受信 → cancelNotificationsForSchedule のみ呼出', () => {
      renderHook(() => useHouseholdRealtime('hh-1'), { wrapper });
      channelMock.__handlers.schedules({
        eventType: 'DELETE',
        old: { id: 'sch-del' },
      });
      expect(cancelMock).toHaveBeenCalledWith('sch-del');
      expect(rescheduleMock).not.toHaveBeenCalled();
    });

    it('payload に id がない異常データは reschedule/cancel 呼ばず', () => {
      renderHook(() => useHouseholdRealtime('hh-1'), { wrapper });
      channelMock.__handlers.schedules({ eventType: 'UPDATE', new: {} });
      expect(rescheduleMock).not.toHaveBeenCalled();
      expect(cancelMock).not.toHaveBeenCalled();
    });
  });

  it('householdId 変化で旧 channel が removeChannel され、新 channel が作成される', () => {
    const { rerender } = renderHook(({ id }: { id: string | null }) => useHouseholdRealtime(id), {
      initialProps: { id: 'hh-1' as string | null },
      wrapper,
    });
    expect(supabaseMock.channel).toHaveBeenCalledWith('household:hh-1');
    const firstChannel = channelMock;

    channelMock = createChannelMock('household:hh-2');
    supabaseMock.channel.mockReturnValueOnce(channelMock);

    rerender({ id: 'hh-2' });
    expect(supabaseMock.removeChannel).toHaveBeenCalledWith(firstChannel);
    expect(supabaseMock.channel).toHaveBeenLastCalledWith('household:hh-2');
  });
});
