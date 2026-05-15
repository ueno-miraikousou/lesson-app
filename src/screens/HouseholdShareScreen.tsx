/**
 * SHARE-01: 家族共有設定画面 (F-01 AC1-4)。
 *
 * - 世帯名 + 共有状態 (`is_shared` バッジ) 表示
 * - 「家族を招待」ボタン → SHARE-02 (`/share/issue`) 遷移
 * - 有効な招待コード一覧 (最大 3 件、`fetchActiveInvitations`)
 * - 各コードに「取消」ボタン (`revokeInvitation`)
 *
 * 参照:
 *   - 02_設計/画面/SHARE-01-家族共有設定.md (designer-3 起草想定)
 *   - 01_要件定義/Phase_D_WBS_v0.1.md §2.1 F-01
 *   - src/lib/invitations.ts
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { ScreenContainer } from '../components/ui/ScreenContainer';
import { INVITATION } from '../config/app';
import {
  type ActiveInvitation,
  fetchActiveInvitations,
  formatExpiresAt,
  revokeInvitation,
} from '../lib/invitations';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import { colors } from '../theme/colors';

interface HouseholdSummary {
  id: string;
  name: string | null;
  isShared: boolean;
  memberCount: number;
}

async function fetchHouseholdSummary(householdId: string): Promise<HouseholdSummary | null> {
  const { data: household, error } = await supabase
    .from('households')
    .select('id, name, is_shared')
    .eq('id', householdId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!household) return null;

  const { count, error: cErr } = await supabase
    .from('household_members')
    .select('*', { count: 'exact', head: true })
    .eq('household_id', householdId);
  if (cErr) throw new Error(cErr.message);

  return {
    id: household.id,
    name: household.name,
    isShared: household.is_shared,
    memberCount: count ?? 0,
  };
}

export function HouseholdShareScreen() {
  const householdId = useAuthStore((s) => s.householdId);
  const queryClient = useQueryClient();
  const [toRevoke, setToRevoke] = useState<ActiveInvitation | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const householdQuery = useQuery({
    queryKey: ['share', 'household', householdId ?? 'none'],
    queryFn: () => fetchHouseholdSummary(householdId ?? ''),
    enabled: !!householdId,
  });

  const invitationsQuery = useQuery({
    queryKey: ['share', 'invitations', householdId ?? 'none'],
    queryFn: () => fetchActiveInvitations(householdId ?? ''),
    enabled: !!householdId,
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeInvitation(id),
    onSuccess: () => {
      setToast('招待コードを取り消しました');
      void queryClient.invalidateQueries({ queryKey: ['share', 'invitations'] });
      setToRevoke(null);
    },
    onError: () => {
      setToast('取り消しに失敗しました');
      setToRevoke(null);
    },
  });

  function handleIssue() {
    router.push('/share/issue');
  }

  function handleRevoke(inv: ActiveInvitation) {
    setToRevoke(inv);
  }

  function confirmRevoke() {
    if (toRevoke) revokeMutation.mutate(toRevoke.id);
  }

  if (householdQuery.isLoading) {
    return (
      <ScreenContainer>
        <View className="mt-10 items-center" testID="share-loading">
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (householdQuery.isError || !householdQuery.data) {
    return (
      <ScreenContainer>
        <View className="mt-10" testID="share-error">
          <Text className="text-h3 text-error">世帯情報を読み込めませんでした</Text>
          <View className="mt-4">
            <PrimaryButton label="戻る" variant="secondary" onPress={() => router.back()} />
          </View>
        </View>
      </ScreenContainer>
    );
  }

  const household = householdQuery.data;
  const active = invitationsQuery.data ?? [];
  const canIssue = active.length < INVITATION.MAX_ACTIVE_PER_HOUSEHOLD;

  return (
    <ScreenContainer>
      <View
        className="flex-row items-center justify-between border-b border-border bg-surface px-4 py-3"
        testID="share-header"
      >
        <Pressable
          onPress={() => router.back()}
          className="min-h-tap min-w-tap items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="戻る"
          testID="share-back"
        >
          <Text className="text-h3 text-text-primary">‹ 戻る</Text>
        </Pressable>
        <Text className="text-h3 text-text-primary">家族共有</Text>
        <View className="min-w-tap" />
      </View>

      <View className="mt-4 rounded-card border border-border bg-surface p-4" testID="share-household">
        <Text className="text-caption text-text-secondary">世帯名</Text>
        <Text className="mt-1 text-h2 text-text-primary" testID="share-household-name">
          {household.name ?? '(名称未設定)'}
        </Text>
        <View className="mt-3 flex-row items-center">
          <View
            className={`rounded-button px-2 py-1 ${household.isShared ? 'bg-primary' : 'bg-border'}`}
            testID="share-status-badge"
          >
            <Text
              className="text-caption"
              style={{ color: household.isShared ? '#FFFFFF' : colors.textSecondary }}
            >
              {household.isShared ? '家族共有中' : '未共有'}
            </Text>
          </View>
          <Text className="ml-3 text-caption text-text-secondary" testID="share-member-count">
            メンバー {household.memberCount} 名
          </Text>
        </View>
      </View>

      <View className="mt-4">
        <Text className="text-h3 text-text-primary">招待コード</Text>
        <Text className="mt-1 text-caption text-text-secondary">
          家族のスマホで「招待コードで参加」を選び、6 桁の数字を入力してもらってください
        </Text>
      </View>

      <View className="mt-3">
        <PrimaryButton
          label={
            canIssue
              ? '家族を招待 (招待コードを発行)'
              : `招待コードは ${INVITATION.MAX_ACTIVE_PER_HOUSEHOLD} 件まで`
          }
          onPress={handleIssue}
          disabled={!canIssue}
          accessibilityLabel="家族を招待してこの世帯のデータを共有します"
          testID="share-issue-button"
        />
      </View>

      <View className="mt-4" testID="share-active-list">
        {invitationsQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} testID="share-active-loading" />
        ) : active.length === 0 ? (
          <Text className="text-caption text-text-secondary" testID="share-active-empty">
            有効な招待コードはありません
          </Text>
        ) : (
          active.map((inv) => (
            <View
              key={inv.id}
              className="mb-2 rounded-card border border-border bg-surface p-3"
              testID={`share-active-row-${inv.id}`}
            >
              <Text className="text-h2 text-text-primary" testID={`share-active-code-${inv.id}`}>
                {formatCodeShort(inv.codeShort)}
              </Text>
              <Text className="mt-1 text-caption text-text-secondary">
                有効期限: {formatExpiresAt(inv.expiresAt)}
              </Text>
              <View className="mt-2 flex-row gap-2">
                <Pressable
                  className="min-h-tap rounded-button border border-border px-3 py-2"
                  onPress={() =>
                    router.push({ pathname: '/share/issue', params: { codeShort: inv.codeShort } })
                  }
                  accessibilityRole="button"
                  accessibilityLabel="このコードを表示"
                  testID={`share-active-view-${inv.id}`}
                >
                  <Text className="text-body text-text-primary">表示</Text>
                </Pressable>
                <Pressable
                  className="min-h-tap rounded-button border border-error px-3 py-2"
                  onPress={() => handleRevoke(inv)}
                  accessibilityRole="button"
                  accessibilityLabel="このコードを取り消す"
                  testID={`share-active-revoke-${inv.id}`}
                >
                  <Text className="text-body text-error">取消</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </View>

      <ConfirmDialog
        visible={!!toRevoke}
        title="招待コードを取り消しますか?"
        message="このコードを無効にします。受け取った家族は参加できなくなります。"
        confirmText="取り消す"
        cancelText="やめる"
        variant="destructive"
        onConfirm={confirmRevoke}
        onCancel={() => setToRevoke(null)}
      />

      {toast ? (
        <View
          className="absolute inset-x-4 bottom-24 rounded-button px-4 py-3"
          style={{ backgroundColor: colors.textPrimary }}
          accessibilityLiveRegion="polite"
          testID="share-toast"
        >
          <Text className="text-body" style={{ color: '#FFFFFF' }}>
            {toast}
          </Text>
        </View>
      ) : null}
    </ScreenContainer>
  );
}

/** 6 桁数字を「483 921」のように 3 桁ずつ区切って読み上げ易くする */
export function formatCodeShort(code: string): string {
  if (code.length !== 6) return code;
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}
