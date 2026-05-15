/**
 * SHARE-02: 招待コード発行画面 (F-02 AC1-5)。
 *
 * - 発行ボタンタップで `create_invitation` RPC → 6 桁数字 + 16 文字長コード生成
 * - 大きく数字表示 + コピー + 共有 (Share API) + ディープリンク表示
 * - 既存有効コードがクエリ params から渡されている場合はそれを表示 (取消画面からの遷移)
 *
 * 参照:
 *   - 02_設計/画面/SHARE-02-配偶者招待.md §3 / §4 (designer-3 v0.1.1)
 *   - 01_要件定義/Phase_D_WBS_v0.1.md §2.1 F-02
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';

import { PrimaryButton } from '../components/ui/PrimaryButton';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { DEEPLINK_SCHEME } from '../config/app';
import {
  buildInvitationDeepLink,
  buildInvitationShareText,
  type CreatedInvitation,
  createInvitation,
  formatExpiresAt,
} from '../lib/invitations';
import { useAuthStore } from '../stores/auth-store';
import { colors } from '../theme/colors';
import { formatCodeShort } from './HouseholdShareScreen';

interface SerializedInvitation {
  codeShort: string;
  codeLong: string;
  expiresAt: string;
}

export function InviteCodeIssueScreen() {
  const householdId = useAuthStore((s) => s.householdId);
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ codeShort?: string; codeLong?: string; expiresAt?: string }>();

  const [current, setCurrent] = useState<SerializedInvitation | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // パラメータ経由で既存コードを表示する経路 (SHARE-01 「表示」ボタン)
  useEffect(() => {
    if (params.codeShort && params.codeLong && params.expiresAt) {
      setCurrent({
        codeShort: String(params.codeShort),
        codeLong: String(params.codeLong),
        expiresAt: String(params.expiresAt),
      });
    }
  }, [params.codeShort, params.codeLong, params.expiresAt]);

  const issueMutation = useMutation({
    mutationFn: async (): Promise<CreatedInvitation> => {
      if (!householdId) throw new Error('世帯 ID が未設定です');
      return createInvitation(householdId);
    },
    onSuccess: (created) => {
      setCurrent({
        codeShort: created.codeShort,
        codeLong: created.codeLong,
        expiresAt: created.expiresAt,
      });
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ['share', 'invitations'] });
    },
    onError: (e: Error) => {
      // SECURITY DEFINER 関数の RAISE EXCEPTION を翻訳
      const msg = e.message ?? '';
      if (msg.includes('not owner')) {
        setError('世帯のオーナーのみ招待コードを発行できます');
      } else if (msg.includes('collision exhausted')) {
        setError('コード生成が混み合っています。少し時間を置いて再試行してください');
      } else if (msg.includes('not authenticated')) {
        setError('ログインが切れています。再ログインしてください');
      } else {
        setError('招待コードの発行に失敗しました、再試行してください');
      }
    },
  });

  async function handleCopy() {
    if (!current) return;
    await Clipboard.setStringAsync(current.codeShort);
    setToast('コピーしました');
  }

  async function handleShare() {
    if (!current) return;
    const message = buildInvitationShareText(
      {
        code_short: current.codeShort,
        code_long: current.codeLong,
        expires_at: current.expiresAt,
      },
      DEEPLINK_SCHEME,
    );
    try {
      await Share.share({ message });
    } catch {
      setToast('共有に失敗しました');
    }
  }

  function handleReissue() {
    setCurrent(null);
    setError(null);
    issueMutation.mutate();
  }

  return (
    <ScreenContainer>
      <View
        className="flex-row items-center justify-between border-b border-border bg-surface px-4 py-3"
        testID="issue-header"
      >
        <Pressable
          onPress={() => router.back()}
          className="min-h-tap min-w-tap items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="戻る"
          testID="issue-back"
        >
          <Text className="text-h3 text-text-primary">‹ 戻る</Text>
        </Pressable>
        <Text className="text-h3 text-text-primary">家族を招待</Text>
        <View className="min-w-tap" />
      </View>

      {!current ? (
        <View className="mt-6" testID="issue-pre">
          <Text className="text-h2 text-text-primary">家族メンバーを招待しましょう</Text>
          <Text className="mt-2 text-body text-text-secondary">
            発行ボタンを押すと、6 桁の招待コードが作成されます。コードは 24 時間有効です。
          </Text>
          <View className="mt-6">
            <PrimaryButton
              label="招待コードを発行"
              onPress={() => issueMutation.mutate()}
              loading={issueMutation.isPending}
              testID="issue-button"
            />
          </View>
          {error ? (
            <Text className="mt-3 text-caption text-error" testID="issue-error">
              {error}
            </Text>
          ) : null}
        </View>
      ) : (
        <View className="mt-6" testID="issue-result">
          <Text className="text-caption text-text-secondary">招待コード</Text>
          <View
            className="mt-2 items-center rounded-card border border-border bg-surface p-6"
            accessibilityLabel={`招待コード ${current.codeShort.split('').join(' ')}`}
            testID="issue-code-card"
          >
            <Text className="text-display text-text-primary" testID="issue-code-short">
              {formatCodeShort(current.codeShort)}
            </Text>
          </View>

          <View className="mt-3 flex-row gap-2">
            <Pressable
              className="min-h-tap flex-1 items-center justify-center rounded-button border border-border bg-surface px-3 py-3"
              onPress={handleCopy}
              accessibilityRole="button"
              accessibilityLabel="コードをコピー"
              testID="issue-copy"
            >
              <Text className="text-body text-text-primary">コピー</Text>
            </Pressable>
            <Pressable
              className="min-h-tap flex-1 items-center justify-center rounded-button border border-primary bg-surface px-3 py-3"
              onPress={handleShare}
              accessibilityRole="button"
              accessibilityLabel="招待リンクを共有"
              testID="issue-share"
            >
              <Text className="text-body text-primary-dark">共有</Text>
            </Pressable>
          </View>

          <View className="mt-4 rounded-card border border-border bg-surface p-3">
            <Text className="text-caption text-text-secondary">招待リンク (LINE 等で送る用)</Text>
            <Text className="mt-1 text-body text-text-primary" testID="issue-deeplink">
              {buildInvitationDeepLink(current.codeLong, DEEPLINK_SCHEME)}
            </Text>
          </View>

          <Text className="mt-4 text-caption text-text-secondary" testID="issue-expires">
            有効期限: {formatExpiresAt(current.expiresAt)}
          </Text>

          <View className="mt-6">
            <PrimaryButton
              label="新しいコードを発行"
              variant="secondary"
              onPress={handleReissue}
              loading={issueMutation.isPending}
              testID="issue-reissue"
            />
          </View>
        </View>
      )}

      {toast ? (
        <View
          className="absolute inset-x-4 bottom-24 rounded-button px-4 py-3"
          style={{ backgroundColor: colors.textPrimary }}
          accessibilityLiveRegion="polite"
          testID="issue-toast"
        >
          <Text className="text-body" style={{ color: '#FFFFFF' }}>
            {toast}
          </Text>
        </View>
      ) : null}
    </ScreenContainer>
  );
}
