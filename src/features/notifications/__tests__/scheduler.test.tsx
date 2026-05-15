/**
 * L1 unit test: scheduler.ts (Phase D Sprint 3 D3-T06)。
 *
 * 検証 (ADR-008 §2.1 / §2.2):
 *   - computeDayBeforeTriggerAt: prefs.reminder_day_before_time から前日トリガ算出 / 過去は null
 *   - computeSameDayTriggerAt: N 分前トリガ算出 / 過去は null
 *   - filterUncheckedItems: items × checks の集合演算、全 ✓ 判定
 *   - buildContentForOccurrence: location fallback (location → classroom_name → null)
 *   - scheduleNotificationsForOccurrence: prefs ON/OFF + skip_when_all_items_checked
 *   - cancelNotificationsForSchedule: data.scheduleId 一致のみ取消
 */

import * as Notifications from 'expo-notifications';

import {
  __test__,
  cancelNotificationsForSchedule,
  scheduleNotificationsForOccurrence,
  type OccurrenceContext,
} from '../scheduler';
import type {
  Item,
  NotificationPreferences,
  Schedule,
  ScheduleItemCheck,
} from '../../../types/database';

const {
  computeDayBeforeTriggerAt,
  computeSameDayTriggerAt,
  filterUncheckedItems,
  buildContentForOccurrence,
} = __test__;

const DEFAULT_PREFS: NotificationPreferences = {
  id: 'pref-1',
  auth_user_id: 'uid-1',
  reminder_day_before_enabled: true,
  reminder_day_before_time: '21:00:00',
  reminder_same_day_enabled: true,
  reminder_same_day_minutes: 30,
  include_items_in_notification: true,
  skip_when_all_items_checked: false,
  lock_screen_privacy_mode: false,
  sound_enabled: true,
  celebration_sound_enabled: false,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
};

function makeContext(overrides: Partial<OccurrenceContext> = {}): OccurrenceContext {
  const schedule: Schedule & { member_id: string } = {
    id: 'sch-1',
    lesson_id: 'les-1',
    start_at: '2026-06-02T08:00:00Z',
    end_at: '2026-06-02T09:00:00Z',
    note: null,
    recurrence_rule: null,
    recurrence_until: null,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    member_id: 'mem-1',
  } as Schedule & { member_id: string };
  return {
    schedule,
    lesson: {
      id: 'les-1',
      member_id: 'mem-1',
      name: 'スイミング',
      classroom_name: null,
      location: 'ABC スクール',
    },
    member: { id: 'mem-1', name: 'すずちゃん' },
    occurrenceDate: '2026-06-02',
    startAt: new Date(2026, 5, 2, 17, 0, 0),
    items: [],
    checks: [],
    ...overrides,
  };
}

describe('computeDayBeforeTriggerAt', () => {
  it('前日 21:00 (デフォルト) を算出', () => {
    const startAt = new Date(2026, 5, 2, 17, 0, 0);
    const now = new Date(2026, 5, 1, 12, 0, 0);
    const trigger = computeDayBeforeTriggerAt(startAt, DEFAULT_PREFS, now);
    expect(trigger).not.toBeNull();
    expect(trigger!.getDate()).toBe(1);
    expect(trigger!.getHours()).toBe(21);
    expect(trigger!.getMinutes()).toBe(0);
  });

  it('prefs.reminder_day_before_time のカスタム時刻 (08:30)', () => {
    const startAt = new Date(2026, 5, 2, 17, 0, 0);
    const now = new Date(2026, 5, 1, 7, 0, 0);
    const trigger = computeDayBeforeTriggerAt(
      startAt,
      { reminder_day_before_time: '08:30:00' },
      now,
    );
    expect(trigger!.getHours()).toBe(8);
    expect(trigger!.getMinutes()).toBe(30);
  });

  it('過去になる場合は null (スケジュール対象外)', () => {
    const startAt = new Date(2026, 5, 2, 17, 0, 0);
    // now = 6/2 09:00 → 前日 21:00 = 6/1 21:00 は過去
    const now = new Date(2026, 5, 2, 9, 0, 0);
    expect(computeDayBeforeTriggerAt(startAt, DEFAULT_PREFS, now)).toBeNull();
  });
});

describe('computeSameDayTriggerAt', () => {
  it('30 分前 (デフォルト) を算出', () => {
    const startAt = new Date(2026, 5, 2, 17, 0, 0);
    const now = new Date(2026, 5, 2, 9, 0, 0);
    const trigger = computeSameDayTriggerAt(startAt, DEFAULT_PREFS, now);
    expect(trigger).not.toBeNull();
    expect(trigger!.getHours()).toBe(16);
    expect(trigger!.getMinutes()).toBe(30);
  });

  it('prefs.reminder_same_day_minutes のカスタム (60 分前)', () => {
    const startAt = new Date(2026, 5, 2, 17, 0, 0);
    const now = new Date(2026, 5, 2, 9, 0, 0);
    const trigger = computeSameDayTriggerAt(
      startAt,
      { reminder_same_day_minutes: 60 },
      now,
    );
    expect(trigger!.getHours()).toBe(16);
    expect(trigger!.getMinutes()).toBe(0);
  });

  it('過去になる場合は null', () => {
    const startAt = new Date(2026, 5, 2, 17, 0, 0);
    const now = new Date(2026, 5, 2, 17, 0, 0); // 開始 = now、30 分前 = 過去
    expect(computeSameDayTriggerAt(startAt, DEFAULT_PREFS, now)).toBeNull();
  });
});

describe('filterUncheckedItems', () => {
  const items: Item[] = [
    { id: 'i1', lesson_id: 'les-1', name: '水着', sort_order: 0, created_at: '', updated_at: '' } as Item,
    { id: 'i2', lesson_id: 'les-1', name: 'タオル', sort_order: 1, created_at: '', updated_at: '' } as Item,
  ];

  it('items 0 件 → 空配列 + allChecked false', () => {
    expect(filterUncheckedItems([], [])).toEqual({ itemNames: [], allChecked: false });
  });

  it('checks 0 件 → 全 item が未 ✓', () => {
    const r = filterUncheckedItems(items, []);
    expect(r.itemNames).toEqual(['水着', 'タオル']);
    expect(r.allChecked).toBe(false);
  });

  it('一部 ✓ 済 → 未 ✓ のみ表示', () => {
    const checks: ScheduleItemCheck[] = [
      {
        id: 'c1',
        schedule_id: 'sch-1',
        item_id: 'i1',
        occurrence_date: '2026-06-02',
        checked: true,
        checked_at: null,
        checked_by_member: null,
        created_at: '',
        updated_at: '',
      } as ScheduleItemCheck,
    ];
    const r = filterUncheckedItems(items, checks);
    expect(r.itemNames).toEqual(['タオル']);
    expect(r.allChecked).toBe(false);
  });

  it('全 ✓ 済 → 空配列 + allChecked true', () => {
    const checks: ScheduleItemCheck[] = items.map((it) => ({
      id: `c-${it.id}`,
      schedule_id: 'sch-1',
      item_id: it.id,
      occurrence_date: '2026-06-02',
      checked: true,
      checked_at: null,
      checked_by_member: null,
      created_at: '',
      updated_at: '',
    })) as ScheduleItemCheck[];
    const r = filterUncheckedItems(items, checks);
    expect(r.itemNames).toEqual([]);
    expect(r.allChecked).toBe(true);
  });

  it('checked = false は未 ✓ 扱い', () => {
    const checks: ScheduleItemCheck[] = [
      {
        id: 'c1',
        schedule_id: 'sch-1',
        item_id: 'i1',
        occurrence_date: '2026-06-02',
        checked: false,
        checked_at: null,
        checked_by_member: null,
        created_at: '',
        updated_at: '',
      } as ScheduleItemCheck,
    ];
    const r = filterUncheckedItems(items, checks);
    expect(r.itemNames).toEqual(['水着', 'タオル']);
    expect(r.allChecked).toBe(false);
  });
});

describe('buildContentForOccurrence (location fallback)', () => {
  it('lesson.location 優先', () => {
    const ctx = makeContext();
    const c = buildContentForOccurrence(ctx, 'same_day', DEFAULT_PREFS);
    expect(c.body).toContain('場所：ABC スクール');
  });

  it('location なしなら classroom_name にフォールバック', () => {
    const ctx = makeContext({
      lesson: {
        id: 'les-1',
        member_id: 'mem-1',
        name: 'スイミング',
        classroom_name: '青葉教室',
        location: null,
      },
    });
    const c = buildContentForOccurrence(ctx, 'same_day', DEFAULT_PREFS);
    expect(c.body).toContain('場所：青葉教室');
  });

  it('両方なしなら場所セクション省略', () => {
    const ctx = makeContext({
      lesson: {
        id: 'les-1',
        member_id: 'mem-1',
        name: 'スイミング',
        classroom_name: null,
        location: null,
      },
    });
    const c = buildContentForOccurrence(ctx, 'same_day', DEFAULT_PREFS);
    expect(c.body).not.toContain('場所');
  });
});

describe('scheduleNotificationsForOccurrence', () => {
  const scheduleMock = Notifications.scheduleNotificationAsync as jest.Mock;

  beforeEach(() => {
    scheduleMock.mockClear();
    scheduleMock.mockResolvedValue('mock-id');
  });

  it('両方 enabled + 未来 → 2 通知予約', async () => {
    const ctx = makeContext();
    const now = new Date(2026, 5, 1, 12, 0, 0);
    const result = await scheduleNotificationsForOccurrence(ctx, DEFAULT_PREFS, now);
    expect(result.dayBeforeId).toBe('mock-id');
    expect(result.sameDayId).toBe('mock-id');
    expect(scheduleMock).toHaveBeenCalledTimes(2);
  });

  it('reminder_day_before_enabled = false で day_before skip', async () => {
    const ctx = makeContext();
    const now = new Date(2026, 5, 1, 12, 0, 0);
    const result = await scheduleNotificationsForOccurrence(
      ctx,
      { ...DEFAULT_PREFS, reminder_day_before_enabled: false },
      now,
    );
    expect(result.dayBeforeId).toBeNull();
    expect(result.sameDayId).toBe('mock-id');
    expect(scheduleMock).toHaveBeenCalledTimes(1);
  });

  it('reminder_same_day_enabled = false で same_day skip', async () => {
    const ctx = makeContext();
    const now = new Date(2026, 5, 1, 12, 0, 0);
    const result = await scheduleNotificationsForOccurrence(
      ctx,
      { ...DEFAULT_PREFS, reminder_same_day_enabled: false },
      now,
    );
    expect(result.dayBeforeId).toBe('mock-id');
    expect(result.sameDayId).toBeNull();
  });

  it('skip_when_all_items_checked + 全 ✓ 済 → same_day skip (day_before は予約)', async () => {
    const items: Item[] = [
      { id: 'i1', lesson_id: 'les-1', name: '水着', sort_order: 0, created_at: '', updated_at: '' } as Item,
    ];
    const checks: ScheduleItemCheck[] = [
      {
        id: 'c1',
        schedule_id: 'sch-1',
        item_id: 'i1',
        occurrence_date: '2026-06-02',
        checked: true,
        checked_at: null,
        checked_by_member: null,
        created_at: '',
        updated_at: '',
      } as ScheduleItemCheck,
    ];
    const ctx = makeContext({ items, checks });
    const now = new Date(2026, 5, 1, 12, 0, 0);
    const result = await scheduleNotificationsForOccurrence(
      ctx,
      { ...DEFAULT_PREFS, skip_when_all_items_checked: true },
      now,
    );
    expect(result.dayBeforeId).toBe('mock-id');
    expect(result.sameDayId).toBeNull();
  });

  it('過去 trigger は両方 skip', async () => {
    const ctx = makeContext({ startAt: new Date(2026, 5, 1, 9, 0, 0) });
    const now = new Date(2026, 5, 1, 12, 0, 0);
    const result = await scheduleNotificationsForOccurrence(ctx, DEFAULT_PREFS, now);
    expect(result.dayBeforeId).toBeNull();
    expect(result.sameDayId).toBeNull();
    expect(scheduleMock).not.toHaveBeenCalled();
  });
});

describe('cancelNotificationsForSchedule', () => {
  const getAllMock = Notifications.getAllScheduledNotificationsAsync as jest.Mock;
  const cancelMock = Notifications.cancelScheduledNotificationAsync as jest.Mock;

  beforeEach(() => {
    getAllMock.mockClear();
    cancelMock.mockClear();
  });

  it('該当 scheduleId のみ cancel、他 schedule は保持', async () => {
    getAllMock.mockResolvedValue([
      {
        identifier: 'n1',
        content: { data: { scheduleId: 'sch-1', notificationType: 'day_before' } },
      },
      {
        identifier: 'n2',
        content: { data: { scheduleId: 'sch-2', notificationType: 'day_before' } },
      },
      {
        identifier: 'n3',
        content: { data: { scheduleId: 'sch-1', notificationType: 'same_day' } },
      },
    ]);
    const count = await cancelNotificationsForSchedule('sch-1');
    expect(count).toBe(2);
    expect(cancelMock).toHaveBeenCalledWith('n1');
    expect(cancelMock).toHaveBeenCalledWith('n3');
    expect(cancelMock).not.toHaveBeenCalledWith('n2');
  });

  it('該当なしで count = 0', async () => {
    getAllMock.mockResolvedValue([]);
    const count = await cancelNotificationsForSchedule('sch-1');
    expect(count).toBe(0);
    expect(cancelMock).not.toHaveBeenCalled();
  });

  it('data 不在の予約は無視 (二重防御)', async () => {
    getAllMock.mockResolvedValue([
      { identifier: 'n1', content: {} },
      { identifier: 'n2', content: { data: { scheduleId: 'sch-1' } } },
    ]);
    const count = await cancelNotificationsForSchedule('sch-1');
    expect(count).toBe(1);
  });
});
