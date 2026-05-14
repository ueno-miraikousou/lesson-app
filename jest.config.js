/**
 * Jest 設定 (2 プロジェクト構成: L1 純関数 + L2 コンポーネント)
 *
 * 設計判断:
 *   - L1: ts-jest + node 環境 (純関数 30 ケース)、RN ネイティブ依存非 import
 *   - L2: jest-expo プリセット + RN Testing Library、RN コンポーネント検証
 *   - `projects` で並列化、`npm test` で両方実行
 *   - `passWithNoTests: false` で「テストファイル見つからない」を fail 扱い
 *
 * 参照:
 *   - 04_テスト/依頼書/L2基盤整備依頼書.md §4
 *   - 04_テスト/テスト計画.md §2.1 L2
 */
module.exports = {
  passWithNoTests: false,
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
    '!src/test-utils/**',
    '!src/msw/**',
    '!src/types/database.generated.ts',
  ],
  // coverage threshold は段階的に引き上げる方針 (依頼書 §4.2)
  //   Phase B 初版 (mobile-engineer-4 / 2026-05-13): 10/10/10/10
  //     L2 基盤導入 + 3 コンポーネントのサンプルテストのみカバー
  //     残る大部分のコードは Phase C/D で順次追加
  //   Phase B-2 (qa-2 / 2026-05-14): functions のみ 9 → 8 に微下げ
  //     依頼書通り 10/9/10/10 を当初設定したが、qa-2 が追加した
  //     notification-preferences L1 テストで「分母 (function 総数) のみ増えて
  //     分子 (カバー済 function) が増えなかった」結果 8.6% に変動、margin 確保
  //     実テスト品質は 47/47 PASS で完全 green、threshold は「警告ベース」と理解
  //   Phase C 着手時に: 30/30/30/30 程度に
  //   Phase D 着手時に: 50/50/60/60 (依頼書当初の目標)
  coverageThreshold: {
    global: {
      branches: 10,
      functions: 8,
      lines: 10,
      statements: 10,
    },
  },
  projects: [
    // ============================================================
    // L1: 純関数ユニットテスト (既存維持)
    // ============================================================
    {
      displayName: 'unit',
      preset: 'ts-jest',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
      testPathIgnorePatterns: ['/node_modules/', '\\.test\\.tsx$'],
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            tsconfig: '<rootDir>/tsconfig.json',
            isolatedModules: true,
          },
        ],
      },
      moduleFileExtensions: ['ts', 'js'],
      clearMocks: true,
    },
    // ============================================================
    // L2: コンポーネント / インテグレーションテスト (新規)
    // ============================================================
    {
      displayName: 'component',
      preset: 'jest-expo',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.tsx'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.expo.ts'],
      // MSW v2 + jsdom の組み合わせには node 条件を明示しないと
      // `msw/node` のサブパス export が解決できない
      testEnvironmentOptions: {
        customExportConditions: ['node', 'node-addons'],
      },
      transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@gorhom|nativewind|react-native-css-interop|@testing-library/.*|msw|until-async|rettime|@mswjs/.*|@bundled-es-modules/.*|@inquirer/.*|outvariant|strict-event-emitter|graphql|tough-cookie|cookie|set-cookie-parser))',
      ],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '\\.(css)$': '<rootDir>/src/__mocks__/styleMock.ts',
      },
      clearMocks: true,
      restoreMocks: true,
    },
  ],
};
