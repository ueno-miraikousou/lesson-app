import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { TextField } from '../../components/ui/TextField';
import { updatePassword } from '../../lib/auth';

/**
 * AUTH-06 パスワード再設定画面 (Phase D D4-T01 A-03)。
 *
 * 動作前提:
 *   - 送信メールのリンクから戻ってくると、Supabase Auth が自動でリカバリーセッションを発行する
 *   - そのセッションで `updateUser({ password })` を呼ぶことで再設定が完了する
 *   - 成功時はログイン状態になるため AuthGate がそのまま (main) へ遷移させる
 *
 * AC1-4 (WBS §2.3 A-03):
 *   - AC1: メールリンクから着地後、本画面で新パスワードを 2 回入力
 *   - AC2: 8 文字以上 + 確認用一致のバリデーション
 *   - AC3: updateUser API 成功で「変更しました」表示 + ログイン画面/ホーム遷移
 *   - AC4: ネットワーク等エラーは displayMessage を表示
 */
export default function UpdatePasswordScreen() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [confirmError, setConfirmError] = useState<string | undefined>();
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    let ok = true;
    setPasswordError(undefined);
    setConfirmError(undefined);
    if (!password || password.length < 8) {
      setPasswordError('パスワードは8文字以上にしてください');
      ok = false;
    }
    if (password !== confirmPassword) {
      setConfirmError('確認用パスワードが一致しません');
      ok = false;
    }
    return ok;
  }

  async function handleSubmit() {
    setSubmitError(undefined);
    if (!validate()) return;
    setLoading(true);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        setSubmitError(error.displayMessage);
        return;
      }
      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <ScreenContainer>
        <View className="mt-10" testID="auth-reset-update-success">
          <Text className="text-h1 text-text-primary">パスワードを変更しました</Text>
          <Text className="mt-3 text-body text-text-secondary">
            新しいパスワードでログインを継続できます。
          </Text>
          <View className="mt-6">
            <PrimaryButton
              label="ホームに戻る"
              onPress={() => router.replace('/(main)/calendar')}
              testID="auth-reset-update-home"
            />
          </View>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View className="mt-6 mb-6">
        <Text className="text-h1 text-text-primary">新しいパスワード</Text>
        <Text className="mt-2 text-body text-text-secondary">
          8文字以上で新しいパスワードを設定してください
        </Text>
      </View>

      <TextField
        label="新しいパスワード"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        helperText="8文字以上"
        errorText={passwordError}
        testID="auth-reset-password-input"
      />

      <TextField
        label="確認のためもう一度入力"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        errorText={confirmError}
        testID="auth-reset-confirm-input"
      />

      {submitError ? (
        <Text
          className="mb-3 text-caption text-error"
          accessibilityLiveRegion="polite"
          testID="auth-reset-update-error"
        >
          {submitError}
        </Text>
      ) : null}

      <PrimaryButton
        label="パスワードを変更"
        onPress={handleSubmit}
        loading={loading}
        testID="auth-reset-update-submit"
      />

      <View className="mt-5">
        <PrimaryButton
          label="ログインに戻る"
          variant="text"
          onPress={() => router.replace('/(auth)/login')}
          testID="auth-reset-update-back-login"
        />
      </View>
    </ScreenContainer>
  );
}
