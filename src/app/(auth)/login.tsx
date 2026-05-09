import { Link } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { TextField } from '../../components/ui/TextField';
import { signInWithPassword } from '../../lib/auth';

/**
 * AUTH-04 ログイン画面（最小実装）。
 * 成功時は onAuthStateChange 経由で auth-store が更新される → ルートガードが次画面へ。
 */
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setSubmitError(undefined);
    if (!email || !password) {
      setSubmitError('メールアドレスとパスワードを入力してください');
      return;
    }
    setLoading(true);
    try {
      const { error } = await signInWithPassword({ email, password });
      if (error) {
        setSubmitError(error.displayMessage);
      }
      // 成功時はガードが遷移を担当する
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer>
      <View className="mt-6 mb-6">
        <Text className="text-h1 text-text-primary">ログイン</Text>
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
      />

      <TextField
        label="パスワード"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="password"
        textContentType="password"
      />

      {submitError ? (
        <Text className="mb-3 text-caption text-error" accessibilityLiveRegion="polite">
          {submitError}
        </Text>
      ) : null}

      <PrimaryButton label="ログイン" onPress={handleSubmit} loading={loading} />

      <View className="mt-3">
        <Link href="/(auth)/reset-password" asChild>
          <PrimaryButton label="パスワードを忘れた方" variant="text" />
        </Link>
      </View>

      <View className="mt-5 items-center">
        <Text className="text-body text-text-secondary">アカウントをお持ちでない方</Text>
        <Link href="/(auth)/signup" replace asChild>
          <PrimaryButton label="新規登録" variant="text" />
        </Link>
      </View>
    </ScreenContainer>
  );
}
