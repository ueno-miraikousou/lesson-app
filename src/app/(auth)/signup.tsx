import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { TextField } from '../../components/ui/TextField';
import { signUp } from '../../lib/auth';

/**
 * AUTH-03 サインアップ画面（最小実装）。
 * - メール + パスワードでサインアップ
 * - 成功時: メール認証待ちなら AUTH-06 へ遷移
 *           即セッション発行された場合は AUTH-07 へ遷移（ガードがリダイレクト）
 *
 * Google ログインは社長 Google Cloud OAuth 設定後に追加（フェーズA-6 末で対応）。
 *
 * 参照: 02_設計/画面リスト.md §1 / 02_設計/画面/AUTH-07-世帯選択画面.md
 */
export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  function validate(): boolean {
    let ok = true;
    setEmailError(undefined);
    setPasswordError(undefined);

    if (!email || !/.+@.+\..+/.test(email)) {
      setEmailError('正しいメールアドレスを入力してください');
      ok = false;
    }
    if (!password || password.length < 8) {
      setPasswordError('パスワードは8文字以上にしてください');
      ok = false;
    }
    return ok;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitError(undefined);
    setLoading(true);
    try {
      const { data, error } = await signUp({ email, password });
      if (error) {
        setSubmitError(error.displayMessage);
        return;
      }
      if (data.requiresEmailConfirmation) {
        router.replace({
          pathname: '/(auth)/verify-email',
          params: { email },
        });
      }
      // メール認証無効プロジェクトの場合は session が即発行される。
      // ルートガード (resolveAuthRoute) が次の画面に飛ばすので、ここでの遷移は不要。
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer>
      <View className="mt-6 mb-6">
        <Text className="text-h1 text-text-primary">アカウントを作成</Text>
        <Text className="mt-2 text-body text-text-secondary">
          メールアドレスとパスワードを入力してください
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
        errorText={emailError}
      />

      <TextField
        label="パスワード"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        helperText="8文字以上"
        errorText={passwordError}
      />

      {submitError ? (
        <Text className="mb-3 text-caption text-error" accessibilityLiveRegion="polite">
          {submitError}
        </Text>
      ) : null}

      <PrimaryButton label="登録" onPress={handleSubmit} loading={loading} />

      <View className="mt-5 items-center">
        <Text className="text-body text-text-secondary">既にアカウントをお持ちの方</Text>
        <Link href="/(auth)/login" replace asChild>
          <PrimaryButton label="ログインへ" variant="text" />
        </Link>
      </View>
    </ScreenContainer>
  );
}
