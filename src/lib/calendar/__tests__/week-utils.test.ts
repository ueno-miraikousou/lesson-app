import {
  addWeeks,
  endOfWeek,
  formatDateString,
  groupByDate,
  isSameWeek,
  resolveOverlaps,
  startOfWeek,
} from '../week-utils';
import type { CalendarEvent } from '../types';

function evt(overrides: Partial<CalendarEvent> & { id: string; startAt: string; endAt: string }): CalendarEvent {
  return {
    id: overrides.id,
    title: overrides.title ?? 'Event',
    startAt: overrides.startAt,
    endAt: overrides.endAt,
    memberColor: overrides.memberColor ?? '#FF0000',
    memberName: overrides.memberName,
    lessonName: overrides.lessonName,
    location: overrides.location,
    occurrenceDate: overrides.occurrenceDate,
  };
}

describe('startOfWeek / endOfWeek', () => {
  it('returns Sunday 00:00 for a Thursday', () => {
    const thu = new Date(2026, 4, 14);
    const s = startOfWeek(thu);
    expect(s.getDay()).toBe(0);
    expect(s.getHours()).toBe(0);
  });

  it('endOfWeek returns Saturday 23:59:59', () => {
    const e = endOfWeek(new Date(2026, 4, 14));
    expect(e.getDay()).toBe(6);
    expect(e.getHours()).toBe(23);
  });

  it('firstDay=1 → returns Monday', () => {
    const tue = new Date(2026, 4, 12);
    expect(startOfWeek(tue, 1).getDay()).toBe(1);
  });
});

describe('addWeeks / isSameWeek', () => {
  it('addWeeks shifts by 7 days', () => {
    const a = new Date(2026, 4, 14);
    expect(addWeeks(a, 1).getDate()).toBe(21);
    expect(addWeeks(a, -1).getDate()).toBe(7);
  });

  it('isSameWeek for two days in the same week', () => {
    expect(isSameWeek(new Date(2026, 4, 13), new Date(2026, 4, 16))).toBe(true);
    expect(isSameWeek(new Date(2026, 4, 13), new Date(2026, 4, 17))).toBe(false);
  });
});

describe('formatDateString', () => {
  it('zero-pads month and day', () => {
    expect(formatDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('resolveOverlaps', () => {
  function ev(id: string, startH: number, endH: number, day = 14): CalendarEvent {
    return evt({
      id,
      startAt: new Date(2026, 4, day, startH, 0).toISOString(),
      endAt: new Date(2026, 4, day, endH, 0).toISOString(),
    });
  }

  it('non-overlapping events all get column 0', () => {
    const result = resolveOverlaps([ev('a', 9, 10), ev('b', 10, 11), ev('c', 11, 12)]);
    expect(result).toHaveLength(3);
    expect(result.every((r) => r.column === 0)).toBe(true);
  });

  it('two overlapping events get column 0 and 1', () => {
    const result = resolveOverlaps([ev('a', 9, 11), ev('b', 10, 12)]);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.column).sort()).toEqual([0, 1]);
  });

  it('three overlapping events spread to columns 0/1/2', () => {
    const result = resolveOverlaps([ev('a', 9, 11), ev('b', 10, 12), ev('c', 10, 11)]);
    expect(result).toHaveLength(3);
    expect(new Set(result.map((r) => r.column))).toEqual(new Set([0, 1, 2]));
  });

  it('four overlapping events: the 4th becomes overflow', () => {
    const result = resolveOverlaps([
      ev('a', 9, 11),
      ev('b', 9, 11),
      ev('c', 9, 11),
      ev('d', 9, 11),
    ]);
    const overflow = result.find((r) => r.overflowCount);
    expect(overflow).toBeDefined();
    expect(overflow?.overflowCount).toBe(1);
  });

  it('five overlapping events: overflow contains 2', () => {
    const result = resolveOverlaps([
      ev('a', 9, 11),
      ev('b', 9, 11),
      ev('c', 9, 11),
      ev('d', 9, 11),
      ev('e', 9, 11),
    ]);
    const overflow = result.find((r) => r.overflowCount);
    expect(overflow?.overflowCount).toBe(2);
    expect(overflow?.title).toContain('他 2 件');
  });
});

describe('groupByDate', () => {
  it('groups events by occurrenceDate if present', () => {
    const events = [
      evt({
        id: 'a',
        startAt: new Date(2026, 4, 14, 10).toISOString(),
        endAt: new Date(2026, 4, 14, 11).toISOString(),
        occurrenceDate: '2026-05-14',
      }),
      evt({
        id: 'b',
        startAt: new Date(2026, 4, 15, 10).toISOString(),
        endAt: new Date(2026, 4, 15, 11).toISOString(),
        occurrenceDate: '2026-05-15',
      }),
    ];
    const grouped = groupByDate(events);
    expect(Object.keys(grouped)).toEqual(['2026-05-14', '2026-05-15']);
  });

  it('falls back to startAt date when occurrenceDate is missing', () => {
    const events = [
      evt({
        id: 'a',
        startAt: new Date(2026, 4, 14, 10).toISOString(),
        endAt: new Date(2026, 4, 14, 11).toISOString(),
      }),
    ];
    expect(Object.keys(groupByDate(events))).toEqual(['2026-05-14']);
  });
});
