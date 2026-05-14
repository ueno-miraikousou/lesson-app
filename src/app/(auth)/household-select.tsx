import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, BackHandler, Pressable, Text, View } from 'react-native';
import { useEffect } from 'react';

import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { signOut } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/auth-store';

/**
 * AUTH-07 世帯選択画面。
 * 認証直後に表示し、新規世帯作成 or 招待コード参加 を選ばせる。
 *
 * 設計参照: 02_設計/画面/AUTH-07-世帯選択画面.md §3-§5
 */
export default function HouseholdSelectScreen() {
  const session = useAuthStore((s) => s.session);
  const setHouseholdId = useAuthStore((s) => s.setHouseholdId);
  const [creating, setCreating] = useState(false);

  // Android のシステムバックを無効化（AUTH-07 §4.3 仕様）
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const displayName =
    session?.user?.user_metadata?.['display_name'] ?? session?.user?.email ?? 'ゲスト';

  async function handleCreateNew() {
    if (!session?.user) {
      Alert.alert('エラー', '認証情報が確認できません。再ログインしてください');
      return;
    }
    setCreating(true);
    try {
      // 1. households INSERT
      const { data: household, error: hhErr } = await supabase
        .from('households')
        .insert({ name: `${displayName}家` })
        .select('id')
        .single();
      if (hhErr || !household) {
        throw hhErr ?? new Error('households insert failed');
      }

      // 2. household_members INSERT (owner)
      const { error: memberErr } = await supabase.from('household_members').insert({
        household_id: household.id,
        auth_user_id: session.user.id,
        role_in_household: 'owner',
      });
      if (memberErr) {
        // 失敗時のロールバック (AUTH-07 §9 のクライアント側補正)
        await supabase.from('households').delete().eq('id', household.id);
        throw memberErr;
      }

      setHouseholdId(household.id);
      // ガードがウィザードへリダイレクト
      router.replace('/');
    } catch {
      Alert.alert(
        'エラー',
        '世帯の作成に失敗しました。ネットワーク接続を確認してから再度お試しください',
      );
    } finally {
      setCreating(false);
    }
  }

  function handleJoinByCode() {
    router.push('/share/invite-code');
  }

  async function handleLogout() {
    await signOut();
    // ガードが /(auth)/login にリダイレクト
  }

  return (
    <ScreenContainer>
      <View className="mt-10 items-center">
        <Text className="text-h2 text-text-primary">ようこそ</Text>
        <Text className="mt-1 text-body text-text-secondary">{displayName}</Text>
      </View>

      <View className="mt-8">
        <Text className="text-h1 text-text-primary">どちらで始めますか？</Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="新しく家族を始める"
        onPress={handleCreateNew}
        disabled={creating}
        className={`mt-6 rounded-card border border-border bg-surface p-5 ${creating ? 'opacity-60' : 'active:bg-primary-light'}`}
      >
        <Text className="text-h3 text-text-primary">👨‍👩‍👧 新しく家族を始める</Text>
        <Text className="mt-2 text-body text-text-secondary">
          家族の情報を最初から登録します
        </Text>
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="招待コードで参加する"
        onPress={handleJoinByCode}
        className="mt-3 rounded-card border border-border bg-surface p-5 active:bg-primary-light"
      >
        <Text className="text-h3 text-text-primary">🔑 招待コードで参加する</Text>
        <Text className="mt-2 text-body text-text-secondary">
          家族から招待コードを受け取りましたか？
        </Text>
      </Pressable>

      <View className="mt-8 items-center">
        <PrimaryButton label="別のアカウントでログイン" variant="text" onPress={handleLogout} />
      </View>

      {creating ? (
        <Text className="mt-4 text-center text-caption text-text-secondary">
          世帯を作成しています...
        </Text>
      ) : null}
    </ScreenContainer>
  );
}
