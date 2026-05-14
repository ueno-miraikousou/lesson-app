import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';

import { getCurrentSession, subscribeToAuthChanges } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/auth-store';

/**
 * Phase B QA bypass: AUTH-04 (Supabase auth) を経由せず screenshot 取得のために
 * mocked session を注入する。本番ビルドには影響しない (環境変数 OFF が default)。
 *
 * 有効化条件:
 *   - __DEV__ または EXPO_PUBLIC_AUTH_BYPASS === 'true'
 *   - リリース前チェック必須: 環境変数が production ビルドに紛れていないこと
 *
 * 注入する状態:
 *   - session: mocked Supabase Session (ID は test_phaseb_20260512 prefix)
 *   - householdId: 固定値 (DB に存在しなくても OK、Auth Guard 通過用)
 *   - wizardCompleted: false → 起動時に (wizard)/intro へ自動遷移
 *     ※ wizard を完走したい場合は手動で /(wizard)/complete に deep link で飛ぶ
 *
 * 参照: team_lead_response_20260512_0735.md (案 2 Hybrid)
 */
const AUTH_BYPASS_ENABLED = process.env.EXPO_PUBLIC_AUTH_BYPASS === 'true';

const MOCK_USER_ID = 'mock-user-phaseb-20260512';
const MOCK_HOUSEHOLD_ID = 'mock-household-phaseb-20260512';

function buildMockSession(): Session {
  const nowSec = Math.floor(Date.now() / 1000);
  return {
    access_token: 'mock_access_token_phaseb_20260512',
    refresh_token: 'mock_refresh_token_phaseb_20260512',
    expires_in: 3600,
    expires_at: nowSec + 3600,
    token_type: 'bearer',
    user: {
      id: MOCK_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'test_phaseb_20260512@local.mock',
      email_confirmed_at: new Date().toISOString(),
      phone: '',
      confirmation_sent_at: undefined,
      confirmed_at: new Date().toISOString(),
      last_sign_in_at: new Date().toISOString(),
      app_metadata: { provider: 'mock' },
      user_metadata: { display_name: 'Phase B Test User' },
      identities: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  } as Session;
}

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

    // Phase B QA bypass: mocked session を即時注入して AUTH-04 をスキップ
    if (AUTH_BYPASS_ENABLED) {
      console.warn(
        '[AUTH_BYPASS] Phase B QA mode: mocked session injected. ' +
          'This should NEVER appear in production builds. Set EXPO_PUBLIC_AUTH_BYPASS=false.'
      );
      setSession(buildMockSession());
      setHouseholdId(MOCK_HOUSEHOLD_ID);
      // WIZARD_BYPASS=main のとき: ウィザード完了済として main 経由で各画面 (NOTIF-01 等) 到達可能に
      // WIZARD_BYPASS=complete のとき: wizardCompleted=false で wizard route → AuthGate で complete に強制
      // 未設定 (本番) のとき: ここに来ないため考慮不要
      const wizardBypassTarget = process.env.EXPO_PUBLIC_WIZARD_BYPASS;
      setWizardCompleted(wizardBypassTarget === 'main');
      setHydrating(false);
      return () => {
        cancelled = true;
      };
    }

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
