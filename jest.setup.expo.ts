/**
 * L2 コンポーネントテストのグローバルセットアップ。
 *
 * 目的:
 *   - @testing-library/react-native v12+ 内蔵 matcher を有効化
 *   - RN / Expo / Reanimated / Gesture Handler の global mock を install
 *   - AsyncStorage / SecureStore / Linking 等のネイティブ依存を no-op に
 *   - Supabase クライアントは個別テストで spyOn 上書き想定の空 mock
 *   - 各テスト前後のクリーンアップ + MSW server lifecycle
 *
 * 参照:
 *   - 04_テスト/依頼書/L2基盤整備依頼書.md §5
 *   - jest-expo: https://www.npmjs.com/package/jest-expo
 *   - @testing-library/react-native: https://callstack.github.io/react-native-testing-library/
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */

// ---------------------------------------------------------------
// react-native-safe-area-context: SafeAreaView も含む拡張 mock
// 公式 mock は SafeAreaProvider + useSafeAreaInsets のみ → SafeAreaView 不足
// ---------------------------------------------------------------
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  const officialMock = require('react-native-safe-area-context/jest/mock').default;
  const SafeAreaView = ({
    children,
    ...props
  }: {
    children?: React.ReactNode;
    [k: string]: unknown;
  }) => React.createElement(View, props, children);
  return {
    ...officialMock,
    SafeAreaView,
  };
});

// ---------------------------------------------------------------
// Reanimated 3 の標準 mock。SDK 同梱で提供される
// ---------------------------------------------------------------
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  // useNativeDriver 警告を黙らせる
  Reanimated.default.call = () => {};
  return Reanimated;
});

// ---------------------------------------------------------------
// Gesture Handler の標準 mock + ScrollView/View 等の高水準 component
// は RN 標準 component に差し替え (jest 環境では animation 不要)
// ---------------------------------------------------------------
jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native/Libraries/Components/View/View');
  const ScrollView = require('react-native/Libraries/Components/ScrollView/ScrollView');
  return {
    ...require('react-native-gesture-handler/jestSetup'),
    GestureHandlerRootView: View,
    PanGestureHandler: View,
    BaseButton: View,
    RectButton: View,
    BorderlessButton: View,
    ScrollView,
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    Directions: {},
  };
});

// ---------------------------------------------------------------
// AsyncStorage を no-op に
// ---------------------------------------------------------------
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// ---------------------------------------------------------------
// SecureStore (expo-secure-store)
// ---------------------------------------------------------------
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------
// Linking (expo-linking)
// ---------------------------------------------------------------
jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string) => `learnapp://${path}`),
  openURL: jest.fn(() => Promise.resolve()),
  openSettings: jest.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------
// expo-notifications (Phase D Sprint 3 D3-T01)
// scheduler / response-handler の単体テストで上書き可能、既定は no-op
// ---------------------------------------------------------------
jest.mock('expo-notifications', () => ({
  scheduleNotificationAsync: jest.fn(() => Promise.resolve('mock-notif-id')),
  cancelScheduledNotificationAsync: jest.fn(() => Promise.resolve()),
  cancelAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve()),
  getAllScheduledNotificationsAsync: jest.fn(() => Promise.resolve([])),
  getPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted', granted: true, canAskAgain: true }),
  ),
  requestPermissionsAsync: jest.fn(() =>
    Promise.resolve({ status: 'granted', granted: true, canAskAgain: true }),
  ),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  SchedulableTriggerInputTypes: {
    DATE: 'date',
    TIME_INTERVAL: 'timeInterval',
    DAILY: 'daily',
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    YEARLY: 'yearly',
    CALENDAR: 'calendar',
  },
}));

// ---------------------------------------------------------------
// Haptics
// ---------------------------------------------------------------
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: {
    Success: 'success',
    Warning: 'warning',
    Error: 'error',
  },
}));

// ---------------------------------------------------------------
// expo-av (celebration sound)
// ---------------------------------------------------------------
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
    Sound: {
      createAsync: jest.fn(() =>
        Promise.resolve({
          sound: {
            setPositionAsync: jest.fn(() => Promise.resolve()),
            playAsync: jest.fn(() => Promise.resolve()),
            unloadAsync: jest.fn(() => Promise.resolve()),
          },
        }),
      ),
    },
  },
}));

// ---------------------------------------------------------------
// expo-router の router 関数を mock
// useLocalSearchParams 等は各テストで個別に呼び出し時 mock する
// ---------------------------------------------------------------
jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    dismiss: jest.fn(),
  },
  useRouter: jest.fn(() => ({
    back: jest.fn(),
    push: jest.fn(),
    replace: jest.fn(),
    dismiss: jest.fn(),
  })),
  useSegments: jest.fn(() => []),
  useLocalSearchParams: jest.fn(() => ({})),
  usePathname: jest.fn(() => '/'),
  Link: ({ children }: { children: React.ReactNode }) => children,
  Stack: Object.assign(
    ({ children }: { children?: React.ReactNode }) => children,
    { Screen: ({ children }: { children?: React.ReactNode }) => children },
  ),
}));

// ---------------------------------------------------------------
// Supabase クライアント (lib/supabase.ts)
// 既定は no-op chain。個別テストで spyOn で上書き
// ---------------------------------------------------------------
jest.mock('@/lib/supabase', () => {
  const chainable = (): any => ({
    select: jest.fn(() => chainable()),
    insert: jest.fn(() => chainable()),
    update: jest.fn(() => chainable()),
    upsert: jest.fn(() => chainable()),
    delete: jest.fn(() => chainable()),
    eq: jest.fn(() => chainable()),
    in: jest.fn(() => chainable()),
    is: jest.fn(() => chainable()),
    gt: jest.fn(() => chainable()),
    single: jest.fn(() => Promise.resolve({ data: null, error: null })),
    maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
    then: jest.fn(() => Promise.resolve({ data: [], error: null })),
  });
  return {
    supabase: {
      from: jest.fn(() => chainable()),
      auth: {
        getUser: jest.fn(() =>
          Promise.resolve({ data: { user: { id: 'test-uid' } }, error: null }),
        ),
        getSession: jest.fn(() =>
          Promise.resolve({ data: { session: null }, error: null }),
        ),
        signInWithPassword: jest.fn(() =>
          Promise.resolve({ data: { session: null, user: null }, error: null }),
        ),
        signUp: jest.fn(() =>
          Promise.resolve({ data: { user: null, session: null }, error: null }),
        ),
        signOut: jest.fn(() => Promise.resolve({ error: null })),
        onAuthStateChange: jest.fn(() => ({
          data: { subscription: { unsubscribe: jest.fn() } },
        })),
        resetPasswordForEmail: jest.fn(() => Promise.resolve({ error: null })),
        resend: jest.fn(() => Promise.resolve({ error: null })),
      },
    },
  };
});

// ---------------------------------------------------------------
// __DEV__ を true 固定 (RN ランタイム想定)
// ---------------------------------------------------------------
// @ts-expect-error: globalThis に __DEV__ を強制
globalThis.__DEV__ = true;

// ---------------------------------------------------------------
// 各テスト終了後にすべての mock をリセット
// ---------------------------------------------------------------
afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------
// MSW server start (REST API モック)
//
// L2 基盤導入の初版 (mobile-engineer-4 / 2026-05-13) では MSW v2 の
// transitive ESM dep (rettime, @mswjs/*) を Jest が transform できず
// 起動できなかったため、ここでは無効化。
// サンプル 3 件 (Confetti / LessonFormSheet / MemberFormSheet) は
// jest.mock('@/lib/supabase') の chain mock で完結する設計のため、
// MSW なしでも全 pass する。
//
// 将来 INSERT 戻り値 / 認証フローの統合テストを書くタイミングで:
//   1. `transformIgnorePatterns` に msw transitive deps を追加 (rettime 等)
//   2. `import { server } from './src/msw/server';` を有効化
//   3. beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
// の手順で再有効化する。`src/msw/server.ts` + `handlers.ts` は維持済。
// ---------------------------------------------------------------

