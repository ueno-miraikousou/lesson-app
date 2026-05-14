import {
  addMonths,
  assignMemberColors,
  buildMarkedDates,
  endOfMonth,
  expandSchedules,
  formatDateString,
  formatYearMonth,
  isSameDay,
  parseDateString,
  startOfMonth,
  type ScheduleWithMember,
} from '../calendar-utils';
import type { Member } from '../../types/database';

function member(overrides: Partial<Member> & { id: string }): Member {
  return {
    id: overrides.id,
    household_id: overrides.household_id ?? 'h1',
    name: overrides.name ?? 'M',
    birth_date: overrides.birth_date ?? null,
    gender: overrides.gender ?? null,
    role: overrides.role ?? 'child',
    color_hex: overrides.color_hex ?? '',
    notifications_muted: overrides.notifications_muted ?? false,
    sort_order: overrides.sort_order ?? 0,
    created_at: overrides.created_at ?? new Date().toISOString(),
    updated_at: overrides.updated_at ?? new Date().toISOString(),
  };
}

function schedule(
  overrides: Partial<ScheduleWithMember> & { id: string; lesson_id: string; start_at: string; end_at: string; member_id: string },
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

describe('formatYearMonth / formatDateString / parseDateString', () => {
  it('formats year-month with zero padding', () => {
    expect(formatYearMonth(new Date(2026, 0, 1))).toBe('2026-01');
    expect(formatYearMonth(new Date(2026, 11, 31))).toBe('2026-12');
  });

  it('round-trips date strings', () => {
    const d = new Date(2026, 4, 14);
    const s = formatDateString(d);
    expect(s).toBe('2026-05-14');
    const back = parseDateString(s);
    expect(back.getFullYear()).toBe(2026);
    expect(back.getMonth()).toBe(4);
    expect(back.getDate()).toBe(14);
  });
});

describe('month boundaries', () => {
  it('startOfMonth and endOfMonth produce correct bounds', () => {
    const ref = new Date(2026, 4, 14, 10, 30);
    const s = startOfMonth(ref);
    const e = endOfMonth(ref);
    expect(s.getDate()).toBe(1);
    expect(s.getHours()).toBe(0);
    expect(e.getMonth()).toBe(4);
    expect(e.getDate()).toBe(31);
    expect(e.getHours()).toBe(23);
  });

  it('addMonths handles year wrap', () => {
    const ref = new Date(2026, 11, 1);
    expect(addMonths(ref, 1).getFullYear()).toBe(2027);
    expect(addMonths(ref, 1).getMonth()).toBe(0);
    expect(addMonths(ref, -12).getFullYear()).toBe(2025);
  });

  it('isSameDay ignores time-of-day', () => {
    const a = new Date(2026, 4, 14, 9);
    const b = new Date(2026, 4, 14, 21);
    const c = new Date(2026, 4, 15, 9);
    expect(isSameDay(a, b)).toBe(true);
    expect(isSameDay(a, c)).toBe(false);
  });
});

describe('assignMemberColors', () => {
  it('returns empty array for empty input', () => {
    expect(assignMemberColors([])).toEqual([]);
  });

  it('respects existing valid color_hex', () => {
    const m = member({ id: '1', color_hex: '#123456' });
    const result = assignMemberColors([m]);
    expect(result[0]?.colorHex).toBe('#123456');
  });

  it('assigns palette colors when color_hex is empty', () => {
    const m1 = member({ id: '1', sort_order: 1 });
    const m2 = member({ id: '2', sort_order: 2 });
    const result = assignMemberColors([m1, m2]);
    expect(result).toHaveLength(2);
    expect(result[0]?.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(result[1]?.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(result[0]?.colorHex).not.toBe(result[1]?.colorHex);
  });

  it('avoids adjacent collision when palette would repeat', () => {
    const members = Array.from({ length: 9 }, (_, i) =>
      member({ id: `m${i + 1}`, sort_order: i + 1 }),
    );
    const result = assignMemberColors(members);
    for (let i = 1; i < result.length; i += 1) {
      const prev = result[i - 1]?.colorHex.toLowerCase();
      const cur = result[i]?.colorHex.toLowerCase();
      expect(cur).not.toBe(prev);
    }
  });

  it('sorts by sort_order then id', () => {
    const m1 = member({ id: 'a', sort_order: 2 });
    const m2 = member({ id: 'b', sort_order: 1 });
    const m3 = member({ id: 'c', sort_order: 1 });
    const result = assignMemberColors([m1, m2, m3]);
    expect(result.map((r) => r.memberId)).toEqual(['b', 'c', 'a']);
  });

  it('ignores invalid color_hex (non-6-hex) and assigns palette', () => {
    const m = member({ id: '1', color_hex: 'rose-pink' });
    const result = assignMemberColors([m]);
    expect(result[0]?.colorHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

describe('expandSchedules', () => {
  it('returns single occurrence for non-recurring schedule within range', () => {
    const s = schedule({
      id: 's1',
      lesson_id: 'l1',
      member_id: 'm1',
      start_at: new Date(2026, 4, 14, 17, 0).toISOString(),
      end_at: new Date(2026, 4, 14, 18, 0).toISOString(),
    });
    const occ = expandSchedules([s], startOfMonth(new Date(2026, 4, 1)), endOfMonth(new Date(2026, 4, 1)));
    expect(occ).toHaveLength(1);
    expect(occ[0]?.occurrenceDate).toBe('2026-05-14');
  });

  it('excludes schedule outside the range', () => {
    const s = schedule({
      id: 's1',
      lesson_id: 'l1',
      member_id: 'm1',
      start_at: new Date(2026, 3, 14).toISOString(),
      end_at: new Date(2026, 3, 14, 1).toISOString(),
    });
    const occ = expandSchedules([s], startOfMonth(new Date(2026, 4, 1)), endOfMonth(new Date(2026, 4, 1)));
    expect(occ).toHaveLength(0);
  });

  it('expands weekly Monday recurrence within month', () => {
    const start = new Date(2026, 4, 4, 17, 0); // 5/4 = Monday
    const s = schedule({
      id: 's1',
      lesson_id: 'l1',
      member_id: 'm1',
      start_at: start.toISOString(),
      end_at: new Date(2026, 4, 4, 18, 0).toISOString(),
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
    });
    const occ = expandSchedules([s], startOfMonth(start), endOfMonth(start));
    expect(occ.length).toBeGreaterThanOrEqual(4);
    for (const o of occ) {
      expect(new Date(o.startAt).getDay()).toBe(1);
    }
  });

  it('respects recurrence_until cutoff', () => {
    const start = new Date(2026, 4, 4, 17, 0);
    const until = new Date(2026, 4, 12);
    const s = schedule({
      id: 's1',
      lesson_id: 'l1',
      member_id: 'm1',
      start_at: start.toISOString(),
      end_at: new Date(2026, 4, 4, 18, 0).toISOString(),
      recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
      recurrence_until: until.toISOString(),
    });
    const occ = expandSchedules([s], startOfMonth(start), endOfMonth(start));
    expect(occ.length).toBeLessThanOrEqual(2);
  });

  it('handles malformed RRULE gracefully (skips schedule)', () => {
    const s = schedule({
      id: 's1',
      lesson_id: 'l1',
      member_id: 'm1',
      start_at: new Date(2026, 4, 4).toISOString(),
      end_at: new Date(2026, 4, 4, 1).toISOString(),
      recurrence_rule: 'NOT_A_VALID_RRULE',
    });
    expect(() =>
      expandSchedules([s], startOfMonth(new Date(2026, 4, 1)), endOfMonth(new Date(2026, 4, 1))),
    ).not.toThrow();
  });
});

describe('buildMarkedDates', () => {
  function makeOcc(scheduleId: string, lessonId: string, memberId: string, dateString: string) {
    const d = parseDateString(dateString);
    return {
      schedule: schedule({
        id: scheduleId,
        lesson_id: lessonId,
        member_id: memberId,
        start_at: d.toISOString(),
        end_at: new Date(d.getTime() + 60 * 60 * 1000).toISOString(),
      }),
      occurrenceDate: dateString,
      startAt: d,
      endAt: new Date(d.getTime() + 60 * 60 * 1000),
    };
  }

  it('returns empty record when no occurrences and no selection', () => {
    const result = buildMarkedDates([], new Map(), null);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('produces one dot per occurrence with the member color', () => {
    const occ = [makeOcc('s1', 'l1', 'm1', '2026-05-14')];
    const colors = new Map([['l1', '#FF0000']]);
    const result = buildMarkedDates(occ, colors, null);
    expect(result['2026-05-14']?.dots).toHaveLength(1);
    expect(result['2026-05-14']?.dots[0]?.color).toBe('#FF0000');
  });

  it('caps dots at maxDots', () => {
    const occ = [
      makeOcc('s1', 'l1', 'm1', '2026-05-14'),
      makeOcc('s2', 'l1', 'm1', '2026-05-14'),
      makeOcc('s3', 'l1', 'm1', '2026-05-14'),
      makeOcc('s4', 'l1', 'm1', '2026-05-14'),
    ];
    const colors = new Map([['l1', '#FF0000']]);
    const result = buildMarkedDates(occ, colors, null, { maxDots: 3 });
    expect(result['2026-05-14']?.dots).toHaveLength(3);
  });

  it('marks selected date with selected flag and color', () => {
    const result = buildMarkedDates([], new Map(), '2026-05-14', { selectedColor: '#ABCDEF' });
    expect(result['2026-05-14']?.selected).toBe(true);
    expect(result['2026-05-14']?.selectedColor).toBe('#ABCDEF');
  });

  it('preserves dots when also selected', () => {
    const occ = [makeOcc('s1', 'l1', 'm1', '2026-05-14')];
    const colors = new Map([['l1', '#FF0000']]);
    const result = buildMarkedDates(occ, colors, '2026-05-14');
    expect(result['2026-05-14']?.dots).toHaveLength(1);
    expect(result['2026-05-14']?.selected).toBe(true);
  });

  it('falls back to gray when member color is missing', () => {
    const occ = [makeOcc('s1', 'l-unknown', 'm1', '2026-05-14')];
    const result = buildMarkedDates(occ, new Map(), null);
    expect(result['2026-05-14']?.dots[0]?.color).toBe('#999999');
  });
});
