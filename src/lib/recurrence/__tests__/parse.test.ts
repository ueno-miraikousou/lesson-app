import { parseRRule, serializeRRule } from '../parse';

describe('parseRRule', () => {
  it('parses FREQ=WEEKLY;BYDAY=MO', () => {
    const r = parseRRule('FREQ=WEEKLY;BYDAY=MO');
    expect(r.freq).toBe('WEEKLY');
    expect(r.byday).toEqual(['MO']);
  });

  it('parses FREQ=WEEKLY;BYDAY=MO,TH', () => {
    const r = parseRRule('FREQ=WEEKLY;BYDAY=MO,TH');
    expect(r.byday).toEqual(['MO', 'TH']);
  });

  it('parses FREQ=MONTHLY;BYMONTHDAY=15', () => {
    const r = parseRRule('FREQ=MONTHLY;BYMONTHDAY=15');
    expect(r.freq).toBe('MONTHLY');
    expect(r.bymonthday).toBe(15);
  });

  it('parses BYDAY=2SU as bysetpos + byday', () => {
    const r = parseRRule('FREQ=MONTHLY;BYDAY=2SU');
    expect(r.byday).toEqual(['SU']);
    expect(r.bysetpos).toBe(2);
  });

  it('parses UNTIL', () => {
    const r = parseRRule('FREQ=WEEKLY;BYDAY=MO;UNTIL=20260701T000000Z');
    expect(r.until).toBeTruthy();
    expect(r.until?.getUTCFullYear()).toBe(2026);
    expect(r.until?.getUTCMonth()).toBe(6);
  });

  it('strips RRULE: prefix', () => {
    const r = parseRRule('RRULE:FREQ=WEEKLY;BYDAY=MO');
    expect(r.freq).toBe('WEEKLY');
    expect(r.byday).toEqual(['MO']);
  });
});

describe('serializeRRule', () => {
  it('serializes WEEKLY + BYDAY', () => {
    expect(serializeRRule({ freq: 'WEEKLY', byday: ['MO', 'TH'] })).toBe(
      'FREQ=WEEKLY;BYDAY=MO,TH',
    );
  });

  it('serializes MONTHLY + BYMONTHDAY', () => {
    expect(serializeRRule({ freq: 'MONTHLY', bymonthday: 15 })).toBe(
      'FREQ=MONTHLY;BYMONTHDAY=15',
    );
  });

  it('serializes MONTHLY + BYSETPOS + single BYDAY', () => {
    expect(serializeRRule({ freq: 'MONTHLY', byday: ['SU'], bysetpos: 2 })).toBe(
      'FREQ=MONTHLY;BYDAY=2SU',
    );
  });

  it('serializes UNTIL', () => {
    const until = new Date(Date.UTC(2026, 6, 1, 0, 0, 0));
    expect(serializeRRule({ freq: 'WEEKLY', byday: ['MO'], until })).toBe(
      'FREQ=WEEKLY;BYDAY=MO;UNTIL=20260701T000000Z',
    );
  });

  it('round-trips parse → serialize', () => {
    const original = 'FREQ=WEEKLY;BYDAY=MO,TH';
    expect(serializeRRule(parseRRule(original))).toBe(original);
  });
});
