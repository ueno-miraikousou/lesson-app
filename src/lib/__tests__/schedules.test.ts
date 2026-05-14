/**
 * schedules.ts CRUD helper の export 確認 (Sprint 2 C2-T03/T04 準備)
 *
 * 詳細な動作テストは:
 *   - ScheduleFormSheet.test.tsx で createSchedule の mock 経由検証済 (jest-expo 環境)
 *   - 編集削除 UI 統合時に追加 (Sprint 2 残工程)
 *
 * 本ファイルでは Sprint 1 で既存の createSchedule に加えて、
 * Sprint 2 で追加した updateSchedule / deleteSchedule / splitScheduleAt / truncateScheduleAt
 * が公開 API として正しく export されていることを確証する。
 *
 * 注意: 本テストは L2 (jest-expo) ではなく L1 (ts-jest + node) で動かすため、
 * `import * as schedules from '../schedules'` で型 + module 解決のみ検証し、
 * 実 Supabase chain は呼び出さない (typecheck の補強位置付け)。
 */

import type * as schedulesModule from '../schedules';

describe('schedules.ts public API', () => {
  it('exports CRUD functions for Sprint 2 編集削除', () => {
    type ExpectedExports = keyof typeof schedulesModule;
    const expectedNames: ExpectedExports[] = [
      'fetchMembersAndSchedules',
      'createSchedule',
      'updateSchedule',
      'deleteSchedule',
      'splitScheduleAt',
      'truncateScheduleAt',
    ];
    // この test は typecheck で expectedNames が `keyof typeof schedulesModule` に
    // 含まれることを確証する。動作テストは ScheduleFormSheet.test.tsx (L2) で実施。
    expect(expectedNames.length).toBeGreaterThan(0);
  });
});
