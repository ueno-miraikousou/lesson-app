import {
  buildRecurrenceRule,
  combineDateTime,
  nextOccurrenceStart,
} from '../recurrence';
import type { WizardScheduleSlot } from '../../../stores/wizard-store';

function slot(
  daysOfWeek: WizardScheduleSlot['daysOfWeek'],
  startTime = '17:00',
  endTime = '18:00',
): WizardScheduleSlot {
  return {
    tempId: 'slot-test',
    daysOfWeek,
    startTime,
    endTime,
    recurrenceUntil: null,
  };
}

describe('buildRecurrenceRule', () => {
  it('returns null when no days are selected (single-occurrence)', () => {
    expect(buildRecurrenceRule(slot([]))).toBeNull();
  });

  it('handles a single day', () => {
    expect(buildRecurrenceRule(slot(['MO']))).toBe('FREQ=WEEKLY;BYDAY=MO');
  });

  it('handles multiple days comma-separated, preserving order', () => {
    expect(buildRecurrenceRule(slot(['MO', 'TH']))).toBe('FREQ=WEEKLY;BYDAY=MO,TH');
    expect(buildRecurrenceRule(slot(['MO', 'WE', 'FR']))).toBe(
      'FREQ=WEEKLY;BYDAY=MO,WE,FR',
    );
  });

  it('dedupes accidental duplicates (UI bug guard)', () => {
    expect(buildRecurrenceRule(slot(['MO', 'MO', 'TH']))).toBe(
      'FREQ=WEEKLY;BYDAY=MO,TH',
    );
  });

  it('handles all 7 days (edge case: every-day lesson)', () => {
    expect(
      buildRecurrenceRule(slot(['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'])),
    ).toBe('FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA');
  });
});

describe('nextOccurrenceStart', () => {
  function on(year: number, month1to12: number, day: number, hh: number, mm: number): Date {
    return new Date(year, month1to12 - 1, day, hh, mm, 0, 0);
  }

  it('returns same day when today is the target and start time is in the future', () => {
    // 2026-05-11 is a Monday. 09:00 < 17:00, so today 17:00.
    const now = on(2026, 5, 11, 9, 0);
    const result = nextOccurrenceStart(slot(['MO'], '17:00'), now);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth() + 1).toBe(5);
    expect(result.getDate()).toBe(11);
    expect(result.getHours()).toBe(17);
    expect(result.getMinutes()).toBe(0);
  });

  it('rolls to next week when today is the target but start time has passed', () => {
    // 2026-05-11 18:00 (after 17:00 target on a Monday) → next Monday 2026-05-18
    const now = on(2026, 5, 11, 18, 0);
    const result = nextOccurrenceStart(slot(['MO'], '17:00'), now);
    expect(result.getDate()).toBe(18);
    expect(result.getHours()).toBe(17);
  });

  it('picks the nearest of multiple days', () => {
    // 2026-05-11 (Mon) 09:00, lesson on MO+TH 17:00 → today 17:00 (Mon)
    const now = on(2026, 5, 11, 9, 0);
    const result = nextOccurrenceStart(slot(['MO', 'TH'], '17:00'), now);
    expect(result.getDate()).toBe(11);
  });

  it('crosses week boundaries correctly', () => {
    // 2026-05-15 (Fri) 12:00, lesson on MO+TH → next Mon 2026-05-18 17:00
    const now = on(2026, 5, 15, 12, 0);
    const result = nextOccurrenceStart(slot(['MO', 'TH'], '17:00'), now);
    expect(result.getDate()).toBe(18);
    expect(result.getDay()).toBe(1); // Monday
  });

  it('falls back to now when no days are selected', () => {
    const now = on(2026, 5, 11, 9, 0);
    const result = nextOccurrenceStart(slot([], '17:00'), now);
    expect(result.getTime()).toBe(now.getTime());
  });

  it('handles Sunday (SU) as day 0 correctly', () => {
    // 2026-05-11 (Mon), lesson on SU only → next Sun 2026-05-17 17:00
    const now = on(2026, 5, 11, 9, 0);
    const result = nextOccurrenceStart(slot(['SU'], '17:00'), now);
    expect(result.getDate()).toBe(17);
    expect(result.getDay()).toBe(0);
  });

  it('parses HH:mm correctly for non-zero minutes', () => {
    const now = on(2026, 5, 11, 9, 0);
    const result = nextOccurrenceStart(slot(['MO'], '17:30'), now);
    expect(result.getHours()).toBe(17);
    expect(result.getMinutes()).toBe(30);
  });
});

describe('combineDateTime', () => {
  it('overlays HH:mm onto a base date', () => {
    const base = new Date(2026, 4, 11, 9, 0, 0, 0);
    const result = combineDateTime(base, '18:30');
    expect(result.getDate()).toBe(11);
    expect(result.getHours()).toBe(18);
    expect(result.getMinutes()).toBe(30);
  });

  it('handles 00:00 (midnight)', () => {
    const base = new Date(2026, 4, 11, 9, 0, 0, 0);
    const result = combineDateTime(base, '00:00');
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  it('does not mutate the input', () => {
    const base = new Date(2026, 4, 11, 9, 0, 0, 0);
    const baseClone = new Date(base.getTime());
    combineDateTime(base, '18:30');
    expect(base.getTime()).toBe(baseClone.getTime());
  });
});
