import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useWizardStore } from '../../stores/wizard-store';

interface WizardHeaderProps {
  /** 現在のステップ番号 (1-6) */
  currentStep: number;
  /** 全ステップ数 (デフォルト 6) */
  totalSteps?: number;
  /** 戻るボタン押下 (Step 1 では非表示) */
  onBack?: () => void;
  /** 中断保存後のメイン画面遷移 */
  onAbort?: () => void;
}

/**
 * ウィザード共通ヘッダー。
 * × ボタン → WIZ-08 中断ダイアログ → 「保存して中断」or「破棄」
 *
 * 設計参照: 02_設計/画面/WIZ-ウィザード一括設計.md 共通仕様 + WIZ-08
 */
export function WizardHeader({ currentStep, totalSteps = 6, onBack, onAbort }: WizardHeaderProps) {
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [discardVisible, setDiscardVisible] = useState(false);
  const markPending = useWizardStore((s) => s.markPending);
  const clearWizard = useWizardStore((s) => s.clear);

  const percent = Math.round((currentStep / totalSteps) * 100);

  function handleSaveAndExit() {
    markPending();
    setConfirmVisible(false);
    onAbort?.();
  }

  function handleConfirmDiscard() {
    setDiscardVisible(false);
    setConfirmVisible(false);
    clearWizard();
    onAbort?.();
  }

  return (
    <View className="border-b border-border bg-surface">
      <View className="flex-row items-center justify-between px-4 py-3">
        {onBack ? (
          <Pressable
            onPress={onBack}
            className="min-h-tap min-w-tap items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="戻る"
          >
            <Text className="text-h3 text-text-primary">‹ 戻る</Text>
          </Pressable>
        ) : (
          <View className="min-w-tap" />
        )}

        <Text className="text-caption text-text-secondary">
          Step {currentStep}/{totalSteps} {percent}%
        </Text>

        <Pressable
          onPress={() => setConfirmVisible(true)}
          className="min-h-tap min-w-tap items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="中断"
        >
          <Text className="text-h2 text-text-primary">×</Text>
        </Pressable>
      </View>

      <View className="h-1 w-full bg-border">
        <View className="h-1 bg-primary" style={{ width: `${percent}%` }} />
      </View>

      <ConfirmDialog
        visible={confirmVisible}
        title="ここまでの内容を保存しますか？"
        message="後で続きから再開できます"
        confirmText="保存して中断"
        cancelText="キャンセル"
        onConfirm={handleSaveAndExit}
        onCancel={() => setConfirmVisible(false)}
      />

      <ConfirmDialog
        visible={discardVisible}
        title="入力内容を破棄しますか？"
        message="この操作は取り消せません"
        confirmText="破棄する"
        cancelText="キャンセル"
        variant="destructive"
        onConfirm={handleConfirmDiscard}
        onCancel={() => setDiscardVisible(false)}
      />
    </View>
  );
}
