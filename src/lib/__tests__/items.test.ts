/**
 * items.ts 公開 API 確認 (Sprint 4 C4-T03 準備)。
 *
 * 詳細な動作テストは Sprint 4 で ItemsScreen と統合時 (L2 環境) で追加予定。
 * 本ファイルは L1 (ts-jest + node) で export と型の存在のみ検証する。
 */

import type * as itemsModule from '../items';

describe('items.ts public API', () => {
  it('exports CRUD functions for Sprint 4 持ち物登録', () => {
    type ExpectedExports = keyof typeof itemsModule;
    const expectedNames: ExpectedExports[] = [
      'fetchItemsByLesson',
      'createItem',
      'updateItem',
      'deleteItem',
      'reorderItems',
    ];
    expect(expectedNames.length).toBeGreaterThan(0);
  });
});
