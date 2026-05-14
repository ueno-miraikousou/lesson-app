import '../../global.css';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { useAuthSession } from '../hooks/use-auth-session';
import { queryClient } from '../lib/query-client';
import { resolveAuthRoute, useAuthStore } from '../stores/auth-store';

// Phase B QA bypass: ウィザード完了画面 (WIZ-09 紙吹雪 + 達成音) の screenshot 取得用。
// 本番ビルドには影響しない (環境変数 OFF が default)。
// 有効化: EXPO_PUBLIC_WIZARD_BYPASS=complete (要 EXPO_PUBLIC_AUTH_BYPASS=true 併用)
// AuthGate が wizard ルート判定時に /(wizard)/intro ではなく /(wizard)/complete に飛ばす。
// 参照: team_lead_request_me4_20260513.md §3.3 (a)
const WIZARD_BYPASS_TARGET = process.env.EXPO_PUBLIC_WIZARD_BYPASS;

/**
 * Auth Guard: 4 段階の優先順位 (AUTH-07 §9)。
 * - 未認証 → /(auth)/login
 * - 認証済 + 世帯なし → /(auth)/household-select
 * - 認証済 + 世帯あり + ウィザード未完了 → /(wizard)/intro
 * - 認証済 + 世帯あり + ウィザード完了 → /(main)/calendar
 */
function AuthGate() {
  const router = useRouter();
  const segments = useSegments();
  // Inline selector returns a stable primitive (string), avoiding the infinite render loop
  // that resolveAuthRoute caused by returning a fresh { kind } object on every call.
  const routeKind = useAuthStore((s) => {
    if (!s.session) return 'login' as const;
    if (!s.householdId) return 'household-select' as const;
    if (!s.wizardCompleted) return 'wizard' as const;
    return 'main' as const;
  });
  const isHydrating = useAuthStore((s) => s.isHydrating);
  // useSegments returns a fresh array per call; collapse to a stable string for deps.
  const topSegment = segments[0] ?? '';

  useEffect(() => {
    if (isHydrating) return;
    const inAuthGroup = topSegment === '(auth)';
    const inWizardGroup = topSegment === '(wizard)';
    const inMainGroup = topSegment === '(main)';
    const inShareGroup = topSegment === 'share';
    const inOnboardingGroup = topSegment === 'onboarding';

    switch (routeKind) {
      case 'login':
        if (!inAuthGroup) router.replace('/(auth)/login');
        break;
      case 'household-select':
        // share/invite-code は招待参加フローなので滞在許可
        if (!inAuthGroup && !inShareGroup) router.replace('/(auth)/household-select');
        break;
      case 'wizard':
        // onboarding/notification-permission は wizard 完了直後の許可フローなので滞在許可
        if (!inWizardGroup && !inOnboardingGroup) {
          // QA bypass: WIZARD_BYPASS=complete のときは完了画面に直行 (screenshot 用)
          if (WIZARD_BYPASS_TARGET === 'complete') {
            router.replace('/(wizard)/complete');
          } else {
            router.replace('/(wizard)/intro');
          }
        }
        break;
      case 'main':
        // onboarding を経由してメインへ向かう途中の状態を許容
        if (!inMainGroup && !inOnboardingGroup) router.replace('/(main)/calendar');
        break;
    }
  }, [routeKind, isHydrating, topSegment, router]);

  return null;
}

function HydrationSplash() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator size="large" color="#E76A85" />
    </View>
  );
}

function RootContent() {
  useAuthSession();
  const isHydrating = useAuthStore((s) => s.isHydrating);

  if (isHydrating) {
    return <HydrationSplash />;
  }
  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      <AuthGate />
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StatusBar style="dark" />
          <RootContent />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
