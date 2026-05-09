import { forwardRef } from 'react';
import { Text, TextInput, type TextInputProps, View } from 'react-native';

import { colors } from '../../theme/colors';

export interface TextFieldProps extends TextInputProps {
  label: string;
  /** 補助テキスト（プレースホルダの下） */
  helperText?: string | undefined;
  /** エラー表示 */
  errorText?: string | undefined;
}

/**
 * ラベル + 入力 + 補助/エラーテキスト の最小構成。
 * デザインシステム v0.2 のカラー / 余白に準拠。
 */
export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, helperText, errorText, ...rest },
  ref,
) {
  const hasError = errorText != null && errorText.length > 0;
  return (
    <View className="mb-4">
      <Text className="mb-1 text-caption text-text-primary">{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textSecondary}
        className={`min-h-tap rounded-button border bg-surface px-3 py-3 text-body text-text-primary ${
          hasError ? 'border-error' : 'border-border'
        }`}
        {...rest}
      />
      {hasError ? (
        <Text className="mt-1 text-caption text-error">{errorText}</Text>
      ) : helperText ? (
        <Text className="mt-1 text-caption text-text-secondary">{helperText}</Text>
      ) : null}
    </View>
  );
});
