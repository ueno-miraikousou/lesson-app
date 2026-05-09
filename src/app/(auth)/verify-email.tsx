import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { resendVerificationEmail } from '../../lib/auth';

/**
 * AUTH-06 メール認証案内。
 * サインアップ直後 or 認証メールリンクから戻った場合に表示する。
 */
export default function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === 'string' ? params.email : '';
  const [resendStatus, setResendStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  async function handleResend() {
    if (!email) {
      setErrorMessage('メールアドレス情報がありません。ログイン画面から再度サインアップしてください');
      setResendStatus('error');
      return;
    }
    setResendStatus('sending');
    setErrorMessage(undefined);
    const { error } = await resendVerificationEmail(email);
    if (error) {
      setResendStatus('error');
      setErrorMessage(error.displayMessage);
    } else {
      setResendStatus('sent');
    }
  }

  return (
    <ScreenContainer>
      <View className="mt-10">
        <Text className="text-h1 text-text-primary">メールを確認してください</Text>
        <Text className="mt-3 text-body text-text-secondary">
          {email
            ? `${email} 宛に認証用のリンクを送信しました。リンクをタップしてアカウントを有効化してください。`
            : '登録メールアドレス宛に認証用のリンクを送信しました。リンクをタップしてアカウントを有効化してください。'}
        </Text>

        <View className="mt-6">
          <PrimaryButton
            label={
              resendStatus === 'sent'
                ? 'もう一度送信しました'
                : resendStatus === 'sending'
                  ? '送信中...'
                  : '認証メールを再送'
            }
            variant="secondary"
            onPress={handleResend}
            loading={resendStatus === 'sending'}
            disabled={resendStatus === 'sent'}
          />
        </View>

        {errorMessage ? (
          <Text className="mt-3 text-caption text-error">{errorMessage}</Text>
        ) : null}

        <View className="mt-8">
          <PrimaryButton
            label="ログインに戻る"
            variant="text"
            onPress={() => router.replace('/(auth)/login')}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}
