import { Stack } from 'expo-router';

/**
 * ウィザード共通レイアウト。
 * 各 step 画面が独自に WizardHeader を組むため、Stack header は無効化。
 * 中断保存ダイアログ (WIZ-08) は WizardHeader 経由で呼び出される。
 */
export default function WizardLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: false,
      }}
    />
  );
}
