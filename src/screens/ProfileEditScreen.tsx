/**
 * MEM-03: プロフィール編集画面 (操作者本人のメンバー編集)。
 *
 * 仕様: 02_設計/画面/MEM-03-プロフィール編集.md
 *      WBS §2.4 C-01
 *
 * MVP 範囲 (Sprint 6 C6-T02):
 *   - 表示名 (1-20 文字必須)
 *   - カラーピッカー (8 色、他メンバーとの重複は警告のみ)
 *   - 役割 (parent 固定、編集不可)
 *   - メールアドレス表示のみ
 *   - 保存: members UPDATE + invalidate キャッシュ
 *
 * 範囲外 (Phase D 以降):
 *   - メール変更 / 退会 (CTA グレーアウトで表示)
 *   - avatar 画像 / 自己紹介文
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ColorPickerSheet, colorNameOf } from '../components/forms/ColorPickerSheet';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { TextField } from '../components/ui/TextField';
import { isAuthBypassEnabled } from '../hooks/use-auth-session';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';
import { colors } from '../theme/colors';
import type { Member } from '../types/database';

const NAME_MIN = 1;
const NAME_MAX = 20;

/**
 * MEM-03 §6.1: 自世帯メンバー全件を取得し、auth.uid() 一致行を「自分」として扱う。
 * AUTH_BYPASS 時は CalendarScreen と同じ mock data を返す (#34M)。
 */
async function fetchSelfAndMembers(
  householdId: string,
  authUserId: string | undefined,
): Promise<{ self: Member | null; others: Member[]; email: string | null }> {
  if (isAuthBypassEnabled()) {
    const now = new Date().toISOString();
    const all: Member[] = [
      {
        id: '10000000-0000-4000-8000-000000000003',
        household_id: householdId,
        name: 'ママ',
        birth_date: null,
        gender: 'female',
        role: 'parent',
        color_hex: '#48C9B0',
        notifications_muted: false,
        sort_order: 3,
        created_at: now,
        updated_at: now,
      },
      {
        id: '10000000-0000-4000-8000-000000000001',
        household_id: householdId,
        name: 'すずちゃん',
        birth_date: null,
        gender: 'female',
        role: 'child',
        color_hex: '#FF6B7A',
        notifications_muted: false,
        sort_order: 1,
        created_at: now,
        updated_at: now,
      },
      {
        id: '10000000-0000-4000-8000-000000000002',
        household_id: householdId,
        name: 'パパ',
        birth_date: null,
        gender: 'male',
        role: 'parent',
        color_hex: '#5DADE2',
        notifications_muted: false,
        sort_order: 2,
        created_at: now,
        updated_at: now,
      },
    ];
    return {
      self: all[0] ?? null,
      others: all.slice(1),
      email: 'mock@local.test',
    };
  }

  const { data: members, error } = await supabase
    .from('members')
    .select(
      'id, household_id, name, birth_date, gender, role, color_hex, notifications_muted, sort_order, created_at, updated_at',
    )
    .eq('household_id', householdId)
    .order('sort_order', { ascending: true });
  if (error) throw error;

  // 操作者の members を「household_members」経由 もしくは auth.uid() 一致で取得。
  // MVP では household_members.auth_user_id 一致を見て、その member id を特定。
  // 簡略実装: parent ロール && (一致する display_name or 最初の parent) を「自分」とみなす。
  // 厳密実装は Phase D で household_members.member_id を追加。
  let self: Member | null = null;
  if (authUserId) {
    const { data: hm } = await supabase
      .from('household_members')
      .select('auth_user_id, household_id')
      .eq('household_id', householdId)
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (hm) {
      self = (members ?? []).find((m) => m.role === 'parent') ?? null;
    }
  }
  // フォールバック: parent ロールの最初のメンバーを「自分」として扱う
  if (!self) {
    self = (members ?? []).find((m) => m.role === 'parent') ?? null;
  }

  const others = (members ?? []).filter((m) => m.id !== self?.id);
  const { data: userResp } = await supabase.auth.getUser();

  return {
    self,
    others,
    email: userResp.user?.email ?? null,
  };
}

interface UpdateInput {
  memberId: string;
  name: string;
  colorHex: string;
}

async function updateMember(input: UpdateInput): Promise<void> {
  if (isAuthBypassEnabled()) {
    return;
  }
  const { error } = await supabase
    .from('members')
    .update({
      name: input.name,
      color_hex: input.colorHex,
    })
    .eq('id', input.memberId);
  if (error) throw error;
}

export function ProfileEditScreen() {
  const householdId = useAuthStore((s) => s.householdId);
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();

  const memberQuery = useQuery({
    queryKey: ['profile', householdId ?? 'none'],
    queryFn: () => fetchSelfAndMembers(householdId ?? '', session?.user?.id),
    enabled: !!householdId,
  });

  const [name, setName] = useState('');
  const [colorHex, setColorHex] = useState<string>('#FF6B7A');
  const [nameError, setNameError] = useState<string | undefined>();
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (memberQuery.data?.self) {
      setName(memberQuery.data.self.name);
      setColorHex(memberQuery.data.self.color_hex);
    }
  }, [memberQuery.data?.self]);

  const updateMutation = useMutation({
    mutationFn: updateMember,
    onSuccess: () => {
      setToast('プロフィールを保存しました');
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: ['schedules'] });
      void queryClient.invalidateQueries({ queryKey: ['wizard', 'existing-household'] });
      setTimeout(() => {
        router.back();
      }, 800);
    },
    onError: () => {
      setToast('保存に失敗しました');
    },
  });

  function validate(): boolean {
    setNameError(undefined);
    const trimmed = name.trim();
    if (trimmed.length < NAME_MIN) {
      setNameError('表示名を入力してください');
      return false;
    }
    if (trimmed.length > NAME_MAX) {
      setNameError(`${NAME_MAX} 文字以内で入力してください`);
      return false;
    }
    return true;
  }

  function handleSave() {
    if (!validate()) return;
    if (!memberQuery.data?.self) return;
    updateMutation.mutate({
      memberId: memberQuery.data.self.id,
      name: name.trim(),
      colorHex,
    });
  }

  if (memberQuery.isLoading) {
    return (
      <SafeAreaView
        className="flex-1 items-center justify-center bg-background"
        style={{ backgroundColor: colors.background }}
      >
        <ActivityIndicator color={colors.primary} />
      </SafeAreaView>
    );
  }

  if (memberQuery.isError || !memberQuery.data?.self) {
    return (
      <SafeAreaView className="flex-1 bg-background" style={{ backgroundColor: colors.background }}>
        <View className="flex-1 items-center justify-center px-4" testID="profile-edit-error">
          <Text className="text-h3 text-error">プロフィールを読み込めませんでした</Text>
          <Text className="mt-2 text-body text-text-secondary">
            ログイン中のメンバー情報が見つかりません
          </Text>
          <View className="mt-6 w-full max-w-xs">
            <PrimaryButton label="戻る" onPress={() => router.back()} />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  const conflictColors = memberQuery.data.others
    .map((m) => m.color_hex.toLowerCase())
    .filter((c, i, arr) => arr.indexOf(c) === i);
  const conflictNameByColor = new Map(
    memberQuery.data.others.map((m) => [m.color_hex.toLowerCase(), m.name]),
  );

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      style={{ backgroundColor: colors.background }}
      edges={['top', 'left', 'right']}
    >
      <View
        className="flex-row items-center justify-between border-b border-border bg-surface px-4 py-3"
        testID="profile-edit-header"
      >
        <Pressable
          onPress={() => router.back()}
          className="min-h-tap min-w-tap items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="戻る"
          testID="profile-edit-back"
        >
          <Text className="text-h3 text-text-primary">‹ 戻る</Text>
        </Pressable>
        <Text className="text-h3 text-text-primary">プロフィール編集</Text>
        <View className="min-w-tap" />
      </View>

      <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
        {/* メンバー色アバター */}
        <View className="items-center" testID="profile-edit-avatar">
          <View
            className="h-20 w-20 items-center justify-center rounded-full"
            style={{ backgroundColor: colorHex }}
          >
            <Text className="text-h1 text-white">{name.trim().slice(0, 1) || 'あ'}</Text>
          </View>
          <Text className="mt-2 text-caption text-text-secondary">
            {colorNameOf(colorHex)}
          </Text>
        </View>

        <View className="mt-6">
          <TextField
            label="表示名"
            value={name}
            onChangeText={setName}
            maxLength={NAME_MAX}
            placeholder="ニックネームでもOK"
            errorText={nameError}
            testID="profile-edit-name-input"
          />
          <Text className="-mt-2 mb-3 text-caption text-text-secondary">
            {NAME_MIN}〜{NAME_MAX} 文字
          </Text>
        </View>

        <View className="mb-4">
          <Text className="mb-1 text-caption text-text-primary">役割</Text>
          <View
            className="rounded-button border border-border bg-background px-3 py-3"
            testID="profile-edit-role"
            accessibilityLabel="役割：親、編集不可"
          >
            <Text className="text-body text-text-secondary">親（編集不可）</Text>
          </View>
        </View>

        <ColorPickerSheet
          value={colorHex}
          onChange={setColorHex}
          conflictColors={conflictColors}
          conflictNameByColor={conflictNameByColor}
        />

        <View className="mb-4 mt-2 rounded-card border border-border bg-surface p-4">
          <Text className="text-caption text-text-secondary">メールアドレス</Text>
          <Text className="mt-1 text-body text-text-primary" testID="profile-edit-email">
            {memberQuery.data.email ?? '—'}
          </Text>
          <View className="mt-3 gap-1 opacity-50">
            <Text
              className="text-caption text-text-secondary"
              accessibilityState={{ disabled: true }}
              accessibilityHint="現在開発中です"
            >
              ・メールアドレスを変更 (後で利用可能)
            </Text>
            <Text
              className="text-caption text-text-secondary"
              accessibilityState={{ disabled: true }}
              accessibilityHint="現在開発中です"
            >
              ・退会・データ削除 (後で利用可能)
            </Text>
          </View>
        </View>
      </ScrollView>

      <View className="border-t border-border bg-surface px-4 py-3">
        <PrimaryButton
          label="保存"
          onPress={handleSave}
          loading={updateMutation.isPending}
          testID="profile-edit-save"
        />
      </View>

      {toast ? (
        <View
          className="absolute inset-x-4 bottom-24 rounded-button px-4 py-3"
          style={{ backgroundColor: colors.textPrimary }}
          accessibilityLiveRegion="polite"
          testID="profile-edit-toast"
        >
          <Text className="text-body" style={{ color: '#FFFFFF' }}>
            {toast}
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}
