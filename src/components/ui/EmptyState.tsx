import { type ReactNode } from 'react';
import { Text, View } from 'react-native';

import { PrimaryButton } from './PrimaryButton';

export interface EmptyStateAction {
  label: string;
  onPress: () => void;
}

export interface EmptyStateProps {
  /** アイコンまたはイラスト */
  icon?: ReactNode;
  title: string;
  description?: string;
  primaryAction?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
}

/**
 * 空状態テンプレート。
 * EMPTY-01 (カレンダー予定0件) / EMPTY-02 (メンバー0人) / EMPTY-03 (持ち物未登録)
 * の3パターンで利用される。
 *
 * 参照: 02_設計/画面/共通フォームコンポーネント仕様.md §6
 *      02_設計/デザインシステム.md §9.2
 */
export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-4">
      {icon ? <View className="mb-5">{icon}</View> : null}
      <Text className="text-center text-h2 text-text-primary">{title}</Text>
      {description ? (
        <Text className="mt-2 text-center text-body text-text-secondary">{description}</Text>
      ) : null}
      {primaryAction ? (
        <View className="mt-6 w-full max-w-xs">
          <PrimaryButton label={primaryAction.label} onPress={primaryAction.onPress} />
        </View>
      ) : null}
      {secondaryAction ? (
        <View className="mt-2 w-full max-w-xs">
          <PrimaryButton
            label={secondaryAction.label}
            variant="text"
            onPress={secondaryAction.onPress}
          />
        </View>
      ) : null}
    </View>
  );
}
