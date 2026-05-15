import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { TextField } from '../../components/ui/TextField';
import { sendPasswordResetEmail } from '../../lib/auth';

/**
 * AUTH-05 パスワードリセットメール送信。
 * 成功・失敗を問わず汎用的な完了メッセージを表示（メアド存在の有無を漏らさない）。
 */
export default function ResetPasswordScreen() {
  const [email, setEmail] = useState('');
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setSubmitError(undefined);
    if (!email || !/.+@.+\..+/.test(email)) {
      setSubmitError('正しいメールアドレスを入力してください');
      return;
    }
    setLoading(true);
    try {
      const { error } = await sendPasswordResetEmail(email);
      if (error && error.code !== 'unknown') {
        // ネットワーク等の致命的エラーのみ表示
        setSubmitError(error.displayMessage);
        return;
      }
      // メール存在/未存在は伝えず、成功表示で統一
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <ScreenContainer>
        <View className="mt-10" testID="auth-reset-request-success">
          <Text className="text-h1 text-text-primary">メールを送信しました</Text>
          <Text className="mt-3 text-body text-text-secondary">
            ご入力のメールアドレスにパスワードリセット用のリンクを送信しました。メールが届かない場合は、迷惑メールフォルダもご確認ください。
          </Text>
          <View className="mt-6">
            <PrimaryButton
              label="ログインに戻る"
              onPress={() => router.replace('/(auth)/login')}
              testID="auth-reset-request-back-login"
            />
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View className="mt-6 mb-6">
        <Text className="text-h1 text-text-primary">パスワードリセット</Text>
        <Text className="mt-2 text-body text-text-secondary">
          ご登録のメールアドレスにリセット用リンクを送信します
        </Text>
      </View>

      <TextField
        label="メールアドレス"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        errorText={submitError}
        testID="auth-reset-request-email-input"
      />

      <PrimaryButton
        label="リセットメールを送信"
        onPress={handleSubmit}
        loading={loading}
        testID="auth-reset-request-submit"
      />

      <View className="mt-5">
        <PrimaryButton
          label="ログインに戻る"
          variant="text"
          onPress={() => router.replace('/(auth)/login')}
          testID="auth-reset-request-back-login-bottom"
        />
      </View>
    </ScreenContainer>
  );
}
