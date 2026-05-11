/**
 * Jest 設定 (純関数ユニットテスト最小構成)。
 *
 * 設計判断:
 *   - React Native コンポーネントのレンダリングテストは jest-expo + react-native
 *     プリセットが必要だが、本リポジトリのテスト目的は今は「純関数の検証」のみ。
 *     ts-jest + node 環境だけでロジック層 (features/wizard/recurrence,
 *     lesson-presets 等) を検証できる
 *   - 将来コンポーネントテストを足す際は `projects` 設定で本構成を残しつつ
 *     jest-expo 用のプロジェクトを追加する想定
 *   - `passWithNoTests: false` で「テストファイルが見つからない」を失敗扱いに
 *     する。テストを書いたつもりが拾われていない事故を防ぐ
 *
 * 探索:
 *   - `src/**\/__tests__/**\/*.test.ts` のみ拾う (`*.test.tsx` は将来用)
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  passWithNoTests: false,
  // RN ネイティブモジュールに依存するファイルが import チェーンに混ざらないよう、
  // テスト対象は意図的に「純関数モジュール」のみに絞る運用。
  // (react-native や expo-av 等を import するファイルはテストしない)
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        // TS 設定はプロジェクト本体と同じものを使う
        tsconfig: '<rootDir>/tsconfig.json',
        // 個別テストファイル内で `as const` などをトラブルなく動かす
        isolatedModules: true,
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js'],
  clearMocks: true,
};
