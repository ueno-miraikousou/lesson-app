import { useEffect } from 'react';

import { getCurrentSession, subscribeToAuthChanges } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';

/**
 * アプリ起動時に1回だけ呼び、Supabase Auth セッションを auth-store に同期する。
 * 副作用:
 *   - 起動時に getSession でハイドレーション
 *   - onAuthStateChange で SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED を購読
 *   - session があれば household_members を SELECT して householdId / wizardCompleted を反映
 *
 * 参照: 02_設計/画面/AUTH-07-世帯選択画面.md §9
 */
export function useAuthSession(): void {
  const setSession = useAuthStore((s) => s.setSession);
  const setHouseholdId = useAuthStore((s) => s.setHouseholdId);
  const setWizardCompleted = useAuthStore((s) => s.setWizardCompleted);
  const setHydrating = useAuthStore((s) => s.setHydrating);

  useEffect(() => {
    let cancelled = false;

    async function syncMembership(authUserId: string) {
      const { data: membership } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('auth_user_id', authUserId)
        .maybeSingle();

      if (cancelled) return;

      if (!membership) {
        setHouseholdId(null);
        setWizardCompleted(false);
        return;
      }
      setHouseholdId(membership.household_id);

      // ウィザード完了判定: members が1人以上 + lessons が0以上 (members を見るだけで OK)
      const { count } = await supabase
        .from('members')
        .select('id', { count: 'exact', head: true })
        .eq('household_id', membership.household_id);
      if (cancelled) return;
      setWizardCompleted((count ?? 0) > 0);
    }

    async function hydrate() {
      const session = await getCurrentSession();
      if (cancelled) return;
      setSession(session);
      if (session?.user) {
        await syncMembership(session.user.id);
      }
      setHydrating(false);
    }

    void hydrate();

    const unsubscribe = subscribeToAuthChanges(async (session) => {
      setSession(session);
      if (session?.user) {
        await syncMembership(session.user.id);
      } else {
        setHouseholdId(null);
        setWizardCompleted(false);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [setSession, setHouseholdId, setWizardCompleted, setHydrating]);
}
