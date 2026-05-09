import { Stack } from 'expo-router';

/**
 * ウィザード共通レイアウト。
 * フェーズB で進捗バー / 中断ダイアログ等を組み込む。
 */
export default function WizardLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
