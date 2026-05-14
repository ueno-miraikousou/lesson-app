import { expandSchedules, type ScheduleWithMember } from '../expand';

function schedule(
  overrides: Partial<ScheduleWithMember> & {
    id: string;
    lesson_id: string;
    start_at: string;
    end_at: string;
    member_id: string;
  },
): ScheduleWithMember {
  return {
    id: overrides.id,
    lesson_id: overrides.lesson_id,
    start_at: overrides.start_at,
    end_at: overrides.end_at,
    recurrence_rule: overrides.recurrence_rule ?? null,
    recurrence_until: overrides.recurrence_until ?? null,
    note: overrides.note ?? null,
    created_at: overrides.created_at ?? new Date().toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
    member_id: overrides.member_id,
  };
}

function jstWallClock(y: number, m: number, d: number, hh = 0, mm = 0): string {
  // JST wall clock を UTC ISO に直して保存値として扱う
  return new Date(Date.UTC(y, m - 1, d, hh - 9, mm, 0)).toISOString();
}

describe('expandSchedules (JST floating-time)', () => {
  it('returns single occurrence for non-recurring schedule within range', () => {
    const s = schedule({
      id: 's1',
      lesson_id: 'l1',
      member_id: 'm1',
      start_at: jstWallClock(2026, 5, 14, 17, 0),
      end_at: jstWallClock(2026, 5, 14, 18, 0),
    });
    const rangeStart = new Date(2026, 4, 1, 0, 0);
    const rangeEnd = new Date(2026, 4, 31, 23, 59);
    const occ = expandSchedules([s], rangeStart, rangeEnd);
    expect(occ).toHaveLength(1);
    expect(occ[0]?.occurrenceDate).toBe('2026-05-14');
    expect(occ[0]?.startAt.getHours()).toBe(17);
  });

  it('weekly Monday recurrence: getDay() === 1 for all occurrences', () => {
    const s = schedule({
      id: 's1',
      lesson_id: 'l1',
      member_id: 'm1',
      start_at: jstWallClock(2026, 5, 4, 17, 0),
      end_at: jstWallClock(2026, 5, 4, 18, 0),
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
    });
    const occ = expandSchedules(
      [s],
      new Date(2026, 4, 1, 0, 0),
      new Date(2026, 4, 31, 23, 59),
    );
    expect(occ.length).toBeGreaterThanOrEqual(4);
    for (const o of occ) {
      expect(o.startAt.getDay()).toBe(1);
    }
  });

  it('weekly MO+TH recurrence: returns 8 occurrences in May 2026', () => {
    const s = schedule({
      id: 's1',
      lesson_id: 'l1',
      member_id: 'm1',
      start_at: jstWallClock(2026, 5, 4, 17, 0),
      end_at: jstWallClock(2026, 5, 4, 18, 0),
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO,TH',
    });
    const occ = expandSchedules(
      [s],
      new Date(2026, 4, 1, 0, 0),
      new Date(2026, 4, 31, 23, 59),
    );
    expect(occ.length).toBe(8);
    const dows = occ.map((o) => o.startAt.getDay());
    expect(new Set(dows)).toEqual(new Set([1, 4]));
  });

  it('monthly BYMONTHDAY=15 returns May 15', () => {
    const s = schedule({
      id: 's1',
      lesson_id: 'l1',
      member_id: 'm1',
      start_at: jstWallClock(2026, 5, 15, 10, 0),
      end_at: jstWallClock(2026, 5, 15, 11, 0),
      recurrence_rule: 'FREQ=MONTHLY;BYMONTHDAY=15',
    });
    const occ = expandSchedules(
      [s],
      new Date(2026, 4, 1, 0, 0),
      new Date(2026, 4, 31, 23, 59),
    );
    expect(occ.length).toBeGreaterThanOrEqual(1);
    expect(occ[0]?.occurrenceDate).toBe('2026-05-15');
  });

  it('UNTIL cuts off recurrence', () => {
    const s = schedule({
      id: 's1',
      lesson_id: 'l1',
      member_id: 'm1',
      start_at: jstWallClock(2026, 5, 4, 17, 0),
      end_at: jstWallClock(2026, 5, 4, 18, 0),
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
      recurrence_until: jstWallClock(2026, 5, 12, 0, 0),
    });
    const occ = expandSchedules(
      [s],
      new Date(2026, 4, 1, 0, 0),
      new Date(2026, 4, 31, 23, 59),
    );
    expect(occ.length).toBeLessThanOrEqual(2);
  });

  it('handles malformed RRULE gracefully (skips schedule)', () => {
    const s = schedule({
      id: 's1',
      lesson_id: 'l1',
      member_id: 'm1',
      start_at: jstWallClock(2026, 5, 4, 17, 0),
      end_at: jstWallClock(2026, 5, 4, 18, 0),
      recurrence_rule: 'NOT_A_VALID_RRULE',
    });
    expect(() =>
      expandSchedules([s], new Date(2026, 4, 1, 0, 0), new Date(2026, 4, 31, 23, 59)),
    ).not.toThrow();
  });
});
