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
  const isHydrating = useAuthStore((s) => s.isHydrating);
  const route = useAuthStore(resolveAuthRoute);

  useEffect(() => {
    if (isHydrating) return;
    const inAuthGroup = segments[0] === '(auth)';
    const inWizardGroup = segments[0] === '(wizard)';
    const inMainGroup = segments[0] === '(main)';
    const inShareGroup = segments[0] === 'share';
    const inOnboardingGroup = segments[0] === 'onboarding';

    switch (route.kind) {
      case 'login':
        if (!inAuthGroup) router.replace('/(auth)/login');
        break;
      case 'household-select':
        // share/invite-code は招待参加フローなので滞在許可
        if (!inAuthGroup && !inShareGroup) router.replace('/(auth)/household-select');
        break;
      case 'wizard':
        // onboarding/notification-permission は wizard 完了直後の許可フローなので滞在許可
        if (!inWizardGroup && !inOnboardingGroup) router.replace('/(wizard)/intro');
        break;
      case 'main':
        // onboarding を経由してメインへ向かう途中の状態を許容
        if (!inMainGroup && !inOnboardingGroup) router.replace('/(main)/calendar');
        break;
    }
  }, [route.kind, isHydrating, segments, router]);

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
      <AuthGate />
      <Stack screenOptions={{ headerShown: false }} />
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
