import { fromFloatingJST, toFloatingJST, toICalDate } from '../tz';

describe('toFloatingJST', () => {
  it('converts UTC ISO to JST wall-clock Date', () => {
    const utcIso = '2026-05-14T08:00:00.000Z'; // = 17:00 JST
    const floating = toFloatingJST(utcIso);
    expect(floating.getFullYear()).toBe(2026);
    expect(floating.getMonth()).toBe(4);
    expect(floating.getDate()).toBe(14);
    expect(floating.getHours()).toBe(17);
    expect(floating.getMinutes()).toBe(0);
  });

  it('handles date boundary (UTC 15:00 → JST next day 00:00)', () => {
    const utcIso = '2026-05-14T15:00:00.000Z';
    const floating = toFloatingJST(utcIso);
    expect(floating.getDate()).toBe(15);
    expect(floating.getHours()).toBe(0);
  });
});

describe('fromFloatingJST', () => {
  it('round-trips with toFloatingJST', () => {
    const utcIso = '2026-05-14T08:00:00.000Z';
    const floating = toFloatingJST(utcIso);
    const back = fromFloatingJST(floating);
    expect(back).toBe(utcIso);
  });
});

describe('toICalDate', () => {
  it('formats Date in UTC iCal stamp', () => {
    const d = new Date('2026-05-14T08:00:00.000Z');
    expect(toICalDate(d)).toBe('20260514T080000Z');
  });
});
