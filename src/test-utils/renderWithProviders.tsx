import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode, ReactElement } from 'react';

/**
 * テスト用にコンポーネントを必要な Provider で wrap してレンダリング。
 *
 * 設計判断:
 *   - QueryClient はテストごとに新しいインスタンス (キャッシュリーク防止)
 *   - retry: false (テストは決定的に動く)
 *   - 将来 Auth Provider や Navigation Provider が増えたらここに追加
 */
export function renderWithProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return render(ui, { wrapper: Wrapper });
}
