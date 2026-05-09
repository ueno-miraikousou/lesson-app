import { ActivityIndicator, Pressable, type PressableProps, Text } from 'react-native';

export interface PrimaryButtonProps extends Omit<PressableProps, 'children'> {
  label: string;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'text';
}

/**
 * デザインシステム v0.2 §6.1 準拠の主要ボタン。
 * - primary: ローズピンク背景 + 白文字
 * - secondary: 白背景 + ローズピンク文字+枠線
 * - text: 文字のみ
 */
export function PrimaryButton({
  label,
  loading,
  variant = 'primary',
  disabled,
  ...rest
}: PrimaryButtonProps) {
  const isDisabled = disabled === true || loading === true;
  const base = 'min-h-button items-center justify-center rounded-button px-5';
  let style: string;
  let textStyle: string;
  switch (variant) {
    case 'primary':
      style = `${base} ${isDisabled ? 'bg-primary-light' : 'bg-primary active:bg-primary-dark'}`;
      textStyle = `text-h3 ${isDisabled ? 'text-text-secondary' : 'text-white'}`;
      break;
    case 'secondary':
      style = `${base} border-2 ${isDisabled ? 'border-border bg-surface' : 'border-primary bg-surface active:bg-primary-light'}`;
      textStyle = `text-h3 ${isDisabled ? 'text-text-secondary' : 'text-primary-dark'}`;
      break;
    case 'text':
      style = `${base} bg-transparent`;
      textStyle = `text-h3 ${isDisabled ? 'text-text-secondary' : 'text-primary-dark'}`;
      break;
  }

  return (
    <Pressable className={style} disabled={isDisabled} accessibilityRole="button" {...rest}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#FFFFFF' : '#E76A85'} />
      ) : (
        <Text className={textStyle}>{label}</Text>
      )}
    </Pressable>
  );
}
