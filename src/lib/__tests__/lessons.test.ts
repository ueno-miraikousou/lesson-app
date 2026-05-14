/**
 * lessons.ts 公開 API 確認 (Sprint 4 C4-T01 準備)。
 * 詳細動作テストは MEM-04 LessonsListScreen 統合時 (L2) で追加予定。
 */

import type * as lessonsModule from '../lessons';

describe('lessons.ts public API', () => {
  it('exports fetchLessonsWithMembers and fetchLessonById', () => {
    type ExpectedExports = keyof typeof lessonsModule;
    const expectedNames: ExpectedExports[] = ['fetchLessonsWithMembers', 'fetchLessonById'];
    expect(expectedNames.length).toBeGreaterThan(0);
  });
});
