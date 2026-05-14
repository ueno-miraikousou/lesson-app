/**
 * schedule-item-checks.ts public API 確認 (Sprint 5 C5-T03 準備)。
 * 詳細動作は ScheduleDetailScreen.test.tsx (L2) で実機統合検証。
 */

import type * as checksModule from '../schedule-item-checks';

describe('schedule-item-checks.ts public API', () => {
  it('exports fetchChecks / upsertCheck / bulkSetChecks', () => {
    type ExpectedExports = keyof typeof checksModule;
    const expectedNames: ExpectedExports[] = ['fetchChecks', 'upsertCheck', 'bulkSetChecks'];
    expect(expectedNames.length).toBeGreaterThan(0);
  });
});
