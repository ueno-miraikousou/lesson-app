import { Stack } from 'expo-router';

/**
 * メインタブ用レイアウト (プレースホルダ)。
 * フェーズC でボトムタブ (calendar / members / settings) に置き換える。
 */
export default function MainLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
