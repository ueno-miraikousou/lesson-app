/**
 * 認証セッション + 世帯所属情報の同期ストア。
 *
 * 設計:
 *   - Auth セッション本体は Supabase SDK が SecureStore に保存している
 *   - このストアは「現在の household_id」と「ウィザード完了済みか」を1ヶ所で参照可能にする
 *   - Auth Guard (AUTH-07 仕様 §9) の判定はここを見るだけで完結する
 *
 * 参照:
 *   - 02_設計/画面/AUTH-07-世帯選択画面.md §9
 *   - 02_設計/画面遷移図.md §1
 */

import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';

interface AuthState {
  /** Supabase Auth のセッション (SDK 側 onAuthStateChange でここを更新) */
  session: Session | null;
  /** 認証ユーザーが現在所属している世帯 ID。null = 未所属 */
  householdId: string | null;
  /** ウィザード完了済みか (members が1人以上 + lessons が0以上で確定) */
  wizardCompleted: boolean;
  /** 初回起動時のセッション復元中フラグ */
  isHydrating: boolean;
}

interface AuthActions {
  setSession: (session: Session | null) => void;
  setHouseholdId: (id: string | null) => void;
  setWizardCompleted: (value: boolean) => void;
  setHydrating: (value: boolean) => void;
  reset: () => void;
}

const initialState: AuthState = {
  session: null,
  householdId: null,
  wizardCompleted: false,
  isHydrating: true,
};

export const useAuthStore = create<AuthState & AuthActions>()((set) => ({
  ...initialState,
  setSession: (session) => set({ session }),
  setHouseholdId: (householdId) => set({ householdId }),
  setWizardCompleted: (wizardCompleted) => set({ wizardCompleted }),
  setHydrating: (isHydrating) => set({ isHydrating }),
  reset: () => set(initialState),
}));

/** Auth Guard の判定結果 (AUTH-07 §9 の4段階) */
export type AuthRoute =
  | { kind: 'login' }
  | { kind: 'household-select' }
  | { kind: 'wizard' }
  | { kind: 'main' };

export function resolveAuthRoute(state: AuthState): AuthRoute {
  if (!state.session) return { kind: 'login' };
  if (!state.householdId) return { kind: 'household-select' };
  if (!state.wizardCompleted) return { kind: 'wizard' };
  return { kind: 'main' };
}
