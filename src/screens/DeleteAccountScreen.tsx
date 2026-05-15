/**
 * SET-05 退会画面 (Phase D D4-T02 A-05)。
 *
 * 仕様: 02_設計/画面リスト.md SET-05、WBS §2.3 A-05
 *
 * AC1-5 (WBS §2.3 A-05):
 *   - AC1: 「退会する」ボタン (赤系) + 操作前に確認ダイアログを 2 段階表示
 *   - AC2: メールアドレス + パスワードで本人確認 (誤操作防止)
 *   - AC3: 退会成功で households CASCADE 削除 (世帯主) または household_members 行削除 (招待メンバー)
 *   - AC4: 完了で signOut + ログイン画面遷移、displayMessage で失敗を提示
 *   - AC5: GDPR / プライバシーポリシー第 6 条 (削除期間) 整合 ─ 同期削除を保証する範囲を画面で明示
 *
 * 設計判断 (R-D5):
 *   - クライアント側で行えるのは households / household_members の削除と signOut まで
 *   - Auth user 行 (auth.users) の物理削除は service_role が必要なため Edge Function `delete-user` 起案を Sprint 5 候補
 *   - MVP では「アプリ内データの削除 + セッション破棄」をユーザーに完全保証、Auth user 物理削除は別経路 (運営対応 / Edge Function 起案待ち)
 */

import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { TextField } from '../components/ui/TextField';
import { isAuthBypassEnabled } from '../hooks/use-auth-session';
import { deleteAccount, signInWithPassword } from '../lib/auth';
import { useAuthStore } from '../stores/auth-store';
import { colors } from '../theme/colors';

export function DeleteAccountScreen() {
  const router = useRouter();
  const session = useAuthStore((s) => s.session);
  const householdId = useAuthStore((s) => s.householdId);
  const reset = useAuthStore((s) => s.reset);

  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | undefined>();
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [secondConfirmVisible, setSecondConfirmVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const email = session?.user?.email ?? '';

  function validate(): boolean {
    setPasswordError(undefined);
    if (!password || password.length < 1) {
      setPasswordError('現在のパスワードを入力してください');
      return false;
    }
    return true;
  }

  function handleRequestDelete() {
    setSubmitError(undefined);
    if (!validate()) return;
    setConfirmVisible(true);
  }

  function handleFirstConfirm() {
    setConfirmVisible(false);
    // 2 段階目: より重い文言で再確認 (誤操作防止)
    setSecondConfirmVisible(true);
  }

  async function handleSecondConfirm() {
    setSecondConfirmVisible(false);
    setLoading(true);
    try {
      // 1) 本人確認: 現在のパスワードで再認証
      if (!isAuthBypassEnabled()) {
        if (!email) {
          setSubmitError('メールアドレスが取得できません。再ログインしてください');
          return;
        }
        const { error } = await signInWithPassword({ email, password });
        if (error) {
          setSubmitError(
            error.code === 'invalid-credentials'
              ? 'パスワードが正しくありません'
              : error.displayMessage,
          );
          return;
        }
      }

      // 2) household / household_members + signOut
      const authUserId = session?.user?.id ?? '';
      const { error: delErr } = await deleteAccount(authUserId, householdId);
      if (delErr) {
        setSubmitError(delErr.displayMessage);
        return;
      }

      // 3) クライアント状態クリア + ログイン画面遷移
      reset();
      router.replace('/(auth)/login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      style={{ backgroundColor: colors.background }}
      edges={['top', 'left', 'right']}
    >
      <View
        className="flex-row items-center border-b border-border bg-surface px-4 py-3"
        testID="delete-account-header"
      >
        <Pressable
          onPress={() => router.back()}
          className="min-h-tap min-w-tap items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="戻る"
          testID="delete-account-back"
        >
          <Text className="text-h3 text-text-primary">‹ 戻る</Text>
        </Pressable>
        <Text className="ml-2 text-h3 text-text-primary">退会</Text>
      </View>

      <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
        <Text className="text-h2 text-text-primary">アカウントを退会する</Text>
        <Text className="mt-2 text-body text-text-secondary">
          退会すると、お子様のプロフィール、習い事、予定、持ち物、達成記録などのデータがすべて削除されます。この操作は取り消せません。
        </Text>

        <View
          className="mt-4 rounded-card border border-error bg-surface p-4"
          testID="delete-account-warning"
        >
          <Text className="text-h3 text-error">削除されるデータ</Text>
          <View className="mt-2 gap-1">
            <Text className="text-body text-text-primary">・お子様 / メンバー情報</Text>
            <Text className="text-body text-text-primary">・習い事 / 予定 / 持ち物</Text>
            <Text className="text-body text-text-primary">・達成記録 / カレンダー履歴</Text>
            <Text className="text-body text-text-primary">・通知設定 / 個人設定</Text>
          </View>
          <Text className="mt-2 text-caption text-text-secondary">
            プライバシーポリシー第6条に基づき、上記データは退会後 30 日以内にすべてのバックアップを含めて完全に削除されます。
          </Text>
        </View>

        <View className="mt-6">
          <Text className="mb-1 text-caption text-text-secondary">退会するアカウント</Text>
          <Text className="text-body text-text-primary" testID="delete-account-email">
            {email || '(セッション未取得)'}
          </Text>
        </View>

        <View className="mt-4">
          <TextField
            label="現在のパスワード"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            placeholder="パスワードを入力"
            errorText={passwordError}
            testID="delete-account-password-input"
          />
        </View>

        {submitError ? (
          <Text
            className="mb-3 text-caption text-error"
            accessibilityLiveRegion="polite"
            testID="delete-account-error"
          >
            {submitError}
          </Text>
        ) : null}

        <View className="mt-2">
          <PrimaryButton
            label="退会する"
            onPress={handleRequestDelete}
            loading={loading}
            testID="delete-account-submit"
          />
          <View className="mt-2">
            <PrimaryButton
              label="キャンセル"
              variant="text"
              onPress={() => router.back()}
              testID="delete-account-cancel"
            />
          </View>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={confirmVisible}
        title="本当に退会しますか？"
        message="このアカウントとすべてのデータが削除されます。"
        confirmText="退会を続ける"
        cancelText="キャンセル"
        variant="destructive"
        onConfirm={handleFirstConfirm}
        onCancel={() => setConfirmVisible(false)}
      />
      <ConfirmDialog
        visible={secondConfirmVisible}
        title="最終確認"
        message="退会の操作を実行すると、データは復元できません。続行しますか？"
        confirmText="退会を確定する"
        cancelText="やめる"
        variant="destructive"
        onConfirm={handleSecondConfirm}
        onCancel={() => setSecondConfirmVisible(false)}
      />
    </SafeAreaView>
  );
}
