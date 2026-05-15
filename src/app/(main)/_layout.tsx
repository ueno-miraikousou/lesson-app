import { Stack } from 'expo-router';

import { useHouseholdRealtime } from '../../features/realtime/useHouseholdRealtime';
import { useAuthStore } from '../../stores/auth-store';

/**
 * メインタブ用レイアウト。
 *
 * Phase D Sprint 2 D2-T02: 認証済 + 世帯あり + wizard 完了の (main) 経路でのみ
 * 世帯単位 Realtime 同期 hook を起動する (architect-5 設計レビュー §2.5)。
 * wizard / login / share 経路では起動させないことで無駄 connection を避ける。
 */
export default function MainLayout() {
  const householdId = useAuthStore((s) => s.householdId);
  useHouseholdRealtime(householdId);
  return <Stack screenOptions={{ headerShown: false }} />;
}
