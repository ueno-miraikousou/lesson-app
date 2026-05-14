/**
 * WIZ-10 追加モードバッジ。
 *
 * 仕様: 02_設計/画面/WIZ-10-後からウィザード.md §3 / §8
 *   - 追加モード時のみ各 Step 上部に表示
 *   - accessibilityLabel: 「追加モード、新規メンバー追加中」(WBS W-10 a11y AC)
 */

import { Text, View } from 'react-native';

interface AddModeBadgeProps {
  /** カスタムラベル (デフォルト: 「追加モード」) */
  label?: string;
}

export function AddModeBadge({ label = '追加モード' }: AddModeBadgeProps) {
  return (
    <View
      className="self-start rounded-full bg-primary-light px-3 py-1"
      accessibilityRole="text"
      accessibilityLabel="追加モード、新規メンバー追加中"
      testID="wiz-add-mode-badge"
    >
      <Text className="text-caption text-primary-dark">+ {label}</Text>
    </View>
  );
}
