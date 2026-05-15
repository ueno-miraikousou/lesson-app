/**
 * SHARE-04: 参加確認 + 受諾実行 (F-03 AC2, AC4)。
 *
 * 動作:
 *   1. params.code (6 桁数字) を受け取り、`accept_invitation` RPC を実行
 *   2. 成功時: auth-store の householdId を切替 + ホーム (`/(main)/calendar`) へ遷移
 *   3. 失敗時: 種別ごとの ERROR 文言を表示 + 「戻る」ボタン
 *
 * 設計判断:
 *   - 「参加する」を 1 ステップにする (プレビュー → 確定の 2 ステップではない)。
 *     世帯名が SECURITY DEFINER RPC で返ってくるため、参加完了時点で世帯名表示可。
 *   - `acceptInvitation` の AcceptInvitationError.kind に応じて UX 切替。
 *
 * 参照:
 *   - 02_設計/画面/SHARE-02-配偶者招待.md §8 (受諾側動線)
 *   - 01_要件定義/Phase_D_WBS_v0.1.md §2.1 F-03 AC2 / AC5
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { PrimaryButton } from '../components/ui/PrimaryButton';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { isCodeShort } from '../features/invitation/generate-codes';
import {
  AcceptInvitationError,
  type AcceptedInvitation,
  acceptInvitation,
} from '../lib/invitations';
import { useAuthStore } from '../stores/auth-store';
import { colors } from '../theme/colors';

interface ErrorState {
  title: string;
  message: string;
}

function errorStateOf(e: AcceptInvitationError): ErrorState {
  switch (e.kind) {
    case 'invalid_format':
      return {
        title: '招待コードの形式が正しくありません',
        message: '6 桁の数字で入力してください。',
      };
    case 'not_found':
      return {
        title: '招待コードが見つかりません',
        message: 'コードを再度ご確認のうえ、入力してください。',
      };
    case 'expired':
      return {
        title: '招待コードの有効期限が切れています',
        message: '発行者に再発行を依頼してください。',
      };
    case 'used':
      return {
        title: 'この招待コードは既に使用されています',
        message: '別のコードを発行してもらうか、参加済みの世帯を確認してください。',
      };
    case 'already_member':
      return {
        title: '既にこの世帯に参加しています',
        message: 'カレンダーを開き直すと最新の情報が表示されます。',
      };
    case 'unauthenticated':
      return {
        title: 'ログインが必要です',
        message: '再ログインしてから招待コードを入力してください。',
      };
    case 'unknown':
    default:
      return {
        title: '参加に失敗しました',
        message: e.message,
      };
  }
}

export function InviteCodeAcceptScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const setHouseholdId = useAuthStore((s) => s.setHouseholdId);
  const setWizardCompleted = useAuthStore((s) => s.setWizardCompleted);
  const queryClient = useQueryClient();

  const [error, setError] = useState<ErrorState | null>(null);
  const [accepted, setAccepted] = useState<AcceptedInvitation | null>(null);

  const code = typeof params.code === 'string' ? params.code : '';

  const acceptMutation = useMutation({
    mutationFn: acceptInvitation,
    onSuccess: (result) => {
      setAccepted(result);
      setHouseholdId(result.householdId);
      // 受諾した時点で「世帯あり」状態、ウィザード未完了でもメイン到達させる
      setWizardCompleted(true);
      // 関連クエリを全 invalidate (新世帯のデータを fetch し直す)
      queryClient.removeQueries();
    },
    onError: (e: Error) => {
      if (e instanceof AcceptInvitationError) {
        setError(errorStateOf(e));
      } else {
        setError({ title: '参加に失敗しました', message: e.message });
      }
    },
  });

  useEffect(() => {
    if (!code) {
      setError({
        title: '招待コードが渡されていません',
        message: '一つ前の画面でコードを入力し直してください。',
      });
      return;
    }
    if (!isCodeShort(code)) {
      setError({
        title: '招待コードの形式が正しくありません',
        message: '6 桁の数字で入力してください。',
      });
      return;
    }
    acceptMutation.mutate(code);
    // 1 度だけ実行 (mutate は param 依存)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  function handleGoHome() {
    router.replace('/(main)/calendar');
  }

  function handleBack() {
    router.back();
  }

  // 受諾成功 → 完了表示
  if (accepted) {
    return (
      <ScreenContainer>
        <View className="mt-12 items-center" testID="share-confirm-success">
          <Text className="text-h1 text-text-primary">参加しました</Text>
          <Text className="mt-2 text-h3 text-text-primary" testID="share-confirm-household-name">
            {accepted.householdName ?? '(名称未設定)'}
          </Text>
          <Text className="mt-4 text-body text-text-secondary">
            家族のカレンダー・持ち物が表示されるようになります。
          </Text>
          <View className="mt-8 w-full max-w-sm">
            <PrimaryButton
              label="カレンダーを開く"
              onPress={handleGoHome}
              testID="share-confirm-goto-home"
            />
          </View>
        </View>
      </ScreenContainer>
    );
  }

  // 受諾失敗 → エラー表示
  if (error) {
    return (
      <ScreenContainer>
        <View className="mt-10" testID="share-confirm-error">
          <Text className="text-h2 text-error" testID="share-confirm-error-title">
            {error.title}
          </Text>
          <Text className="mt-2 text-body text-text-primary" testID="share-confirm-error-message">
            {error.message}
          </Text>
          <View className="mt-6">
            <PrimaryButton
              label="入力に戻る"
              variant="secondary"
              onPress={handleBack}
              testID="share-confirm-back"
            />
          </View>
        </View>
      </ScreenContainer>
    );
  }

  // 受諾中
  return (
    <ScreenContainer>
      <View className="mt-16 items-center" testID="share-confirm-loading">
        <ActivityIndicator color={colors.primary} size="large" />
        <Text className="mt-4 text-body text-text-secondary">
          招待コードを確認しています…
        </Text>
      </View>
      <Pressable
        onPress={handleBack}
        className="mt-10 self-center"
        accessibilityRole="button"
        accessibilityLabel="キャンセル"
        testID="share-confirm-cancel"
      >
        <Text className="text-body text-primary-dark">キャンセル</Text>
      </Pressable>
    </ScreenContainer>
  );
}
