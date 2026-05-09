import { Modal, Pressable, Text, View } from 'react-native';

import { PrimaryButton } from './PrimaryButton';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  /** destructive = 削除等の破壊的アクション。確認ボタンが赤系になる */
  variant?: 'default' | 'destructive';
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * 削除確認・重要操作の確認ダイアログ。
 *
 * 参照: 02_設計/画面/共通フォームコンポーネント仕様.md §5
 *      02_設計/デザインシステム.md §6.3 (ダイアログ)
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = 'OK',
  cancelText = 'キャンセル',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable
        className="flex-1 items-center justify-center bg-black/40 px-5"
        onPress={onCancel}
        accessibilityLabel="ダイアログ外側"
        accessibilityHint="タップでキャンセル"
      >
        <Pressable
          // 内側タップでダイアログを閉じないように
          onPress={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-card bg-surface p-5"
          accessibilityRole="alert"
        >
          <Text className="text-h2 text-text-primary">{title}</Text>
          {message ? (
            <Text className="mt-2 text-body text-text-secondary">{message}</Text>
          ) : null}

          <View className="mt-5">
            <PrimaryButton
              label={confirmText}
              onPress={onConfirm}
              variant={variant === 'destructive' ? 'primary' : 'primary'}
            />
            <View className="mt-2">
              <PrimaryButton label={cancelText} variant="text" onPress={onCancel} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
