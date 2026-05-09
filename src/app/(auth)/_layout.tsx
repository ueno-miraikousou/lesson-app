import { Stack } from 'expo-router';

/**
 * 認証グループ共通レイアウト。
 * AUTH-03/04/05/06/07 はすべてヘッダーを画面側で組むため、Stack のヘッダーは無効化。
 */
export default function AuthLayout() {
  return <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />;
}
