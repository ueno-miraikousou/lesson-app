import { describeRRuleJa } from '../describe.ja';

describe('describeRRuleJa', () => {
  it('describes weekly single day', () => {
    const dt = new Date(2026, 4, 4, 17, 0); // 5/4 17:00 JST
    expect(describeRRuleJa('FREQ=WEEKLY;BYDAY=MO', dt)).toBe(
      '毎週月曜日、17:00 から',
    );
  });

  it('describes weekly multi-day with dot separator', () => {
    const dt = new Date(2026, 4, 4, 17, 30);
    expect(describeRRuleJa('FREQ=WEEKLY;BYDAY=MO,TH', dt)).toBe(
      '毎週月・木曜日、17:30 から',
    );
  });

  it('describes monthly day-of-month', () => {
    const dt = new Date(2026, 4, 15, 10, 0);
    expect(describeRRuleJa('FREQ=MONTHLY;BYMONTHDAY=15', dt)).toBe(
      '毎月15日、10:00 から',
    );
  });

  it('describes monthly Nth weekday (2SU = 第2日曜)', () => {
    const dt = new Date(2026, 4, 10, 9, 0);
    expect(describeRRuleJa('FREQ=MONTHLY;BYDAY=2SU', dt)).toBe(
      '毎月第2日曜日、9:00 から'.replace('9:00', '09:00'),
    );
  });

  it('appends until suffix when present', () => {
    const dt = new Date(2026, 4, 4, 17, 0);
    const text = describeRRuleJa('FREQ=WEEKLY;BYDAY=MO;UNTIL=20260701T000000Z', dt);
    expect(text).toContain('毎週月曜日、17:00 から');
    expect(text).toContain('2026/07/01 まで');
  });
});
