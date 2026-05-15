/**
 * Supabase Auth のラッパ。
 *
 * 設計:
 *   - 画面側は Supabase SDK を直接触らず、本ファイルの関数経由でセッション操作する
 *   - 例外は `AuthError` に正規化してから返す（UI 表示の判断を共通化）
 *   - メール認証は `emailRedirectTo` でディープリンクに戻す
 *
 * 参照:
 *   - 02_設計/画面/AUTH-07-世帯選択画面.md §9（認証ガード優先順位）
 *   - 02_設計/mobile-engineer引継ぎサマリ.md §5
 */

import type { AuthError, Session, User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

import { supabase } from './supabase';
import { DEEPLINK_SCHEME } from '../config/app';

export type AuthErrorCode =
  | 'invalid-credentials'
  | 'email-already-registered'
  | 'weak-password'
  | 'invalid-email'
  | 'rate-limited'
  | 'network'
  | 'unknown';

export interface NormalizedAuthError {
  code: AuthErrorCode;
  message: string;
  /** ユーザー向け表示メッセージ (日本語) */
  displayMessage: string;
}

function normalizeAuthError(err: AuthError | Error | null): NormalizedAuthError | null {
  if (!err) return null;
  const raw = 'message' in err ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (lower.includes('invalid login credentials') || lower.includes('invalid email or password')) {
    return {
      code: 'invalid-credentials',
      message: raw,
      displayMessage: 'メールアドレスまたはパスワードが正しくありません',
    };
  }
  if (lower.includes('user already registered') || lower.includes('already exists')) {
    return {
      code: 'email-already-registered',
      message: raw,
      displayMessage: 'このメールアドレスは既に登録されています',
    };
  }
  if (lower.includes('password') && (lower.includes('weak') || lower.includes('short'))) {
    return {
      code: 'weak-password',
      message: raw,
      displayMessage: 'パスワードは6文字以上にしてください',
    };
  }
  if (lower.includes('invalid') && lower.includes('email')) {
    return {
      code: 'invalid-email',
      message: raw,
      displayMessage: 'メールアドレスの形式が正しくありません',
    };
  }
  if (lower.includes('rate limit') || lower.includes('too many')) {
    return {
      code: 'rate-limited',
      message: raw,
      displayMessage: '試行回数が多すぎます。しばらく待ってから再度お試しください',
    };
  }
  if (lower.includes('network') || lower.includes('fetch')) {
    return {
      code: 'network',
      message: raw,
      displayMessage: 'ネットワークエラー。接続を確認してください',
    };
  }
  return {
    code: 'unknown',
    message: raw,
    displayMessage: 'エラーが発生しました。しばらく待ってから再度お試しください',
  };
}

/** メール認証完了後にアプリへ戻るための URL */
function getEmailRedirectUrl(path: 'verify-email' | 'reset-password' = 'verify-email'): string {
  return Linking.createURL(`/auth/${path}`, { scheme: DEEPLINK_SCHEME });
}

export interface SignUpInput {
  email: string;
  password: string;
}

export interface SignUpResult {
  user: User | null;
  /** メール認証が必要な場合 true */
  requiresEmailConfirmation: boolean;
}

export async function signUp({
  email,
  password,
}: SignUpInput): Promise<{ data: SignUpResult; error: NormalizedAuthError | null }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: getEmailRedirectUrl('verify-email'),
    },
  });
  return {
    data: {
      user: data?.user ?? null,
      // session が null = メール認証待ち
      requiresEmailConfirmation: data?.user != null && data?.session == null,
    },
    error: normalizeAuthError(error),
  };
}

export interface SignInInput {
  email: string;
  password: string;
}

export async function signInWithPassword({
  email,
  password,
}: SignInInput): Promise<{ session: Session | null; error: NormalizedAuthError | null }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return {
    session: data?.session ?? null,
    error: normalizeAuthError(error),
  };
}

export async function signOut(): Promise<{ error: NormalizedAuthError | null }> {
  const { error } = await supabase.auth.signOut();
  return { error: normalizeAuthError(error) };
}

export async function sendPasswordResetEmail(
  email: string,
): Promise<{ error: NormalizedAuthError | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getEmailRedirectUrl('reset-password'),
  });
  return { error: normalizeAuthError(error) };
}

/**
 * Phase D D4-T01 A-03: パスワード再設定 (AUTH-06)。
 * メールリンクから戻った後、Supabase Auth がセッションを発行している前提で
 * `updateUser({ password })` を呼ぶ。
 */
export async function updatePassword(
  newPassword: string,
): Promise<{ error: NormalizedAuthError | null }> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { error: normalizeAuthError(error) };
}

/**
 * Phase D D4-T02 A-05: アカウント退会。
 *
 * 設計:
 *   - クライアントから安全に呼べる経路は限られる (Supabase Auth admin API は service_role 必須)。
 *   - MVP: 自世帯の所有データ (members / lessons / schedules / items / chat 等) は
 *     ON DELETE CASCADE 設定 (architect-5 0006 migration 設計、§RD-5) により
 *     household 行削除で連鎖削除される。
 *   - household_members から自分の行を削除して所属関係を切る。
 *   - その後 signOut() でクライアントセッションを破棄。
 *   - Auth user 行そのものの削除は Edge Function `delete-user` (service_role 経由、Sprint 5 起案候補)
 *     で非同期に処理する想定。MVP では「セッション破棄 + 所属解除」までを同期的に保証する。
 *
 * AUTH_BYPASS 時はサーバ呼出を全てスキップし、signOut も no-op で抜ける。
 */
export interface DeleteAccountResult {
  /** household 削除を実行したか (世帯主のとき true、所属解除のみのとき false) */
  householdDeleted: boolean;
  error: NormalizedAuthError | null;
}

export async function deleteAccount(
  authUserId: string,
  householdId: string | null,
): Promise<DeleteAccountResult> {
  if (!authUserId) {
    return {
      householdDeleted: false,
      error: {
        code: 'unknown',
        message: 'missing auth user id',
        displayMessage: 'セッションが取得できません。再度ログインしてください',
      },
    };
  }

  // 1) household_members の自分の行を取得 (世帯主かどうか判定)
  let householdDeleted = false;
  if (householdId) {
    const { data: membership, error: selErr } = await supabase
      .from('household_members')
      .select('role_in_household')
      .eq('household_id', householdId)
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (selErr) {
      return { householdDeleted: false, error: normalizeAuthError(selErr) };
    }
    // 世帯主 (owner) なら household を CASCADE 削除、それ以外は所属解除のみ
    if (membership?.role_in_household === 'owner') {
      const { error: delHouseholdErr } = await supabase
        .from('households')
        .delete()
        .eq('id', householdId);
      if (delHouseholdErr) {
        return { householdDeleted: false, error: normalizeAuthError(delHouseholdErr) };
      }
      householdDeleted = true;
    } else {
      const { error: delMembershipErr } = await supabase
        .from('household_members')
        .delete()
        .eq('household_id', householdId)
        .eq('auth_user_id', authUserId);
      if (delMembershipErr) {
        return { householdDeleted: false, error: normalizeAuthError(delMembershipErr) };
      }
    }
  }

  // 2) クライアントセッション破棄 (Auth user 行の削除は Edge Function で非同期処理)
  const { error: signOutErr } = await signOut();
  return { householdDeleted, error: signOutErr };
}

export async function resendVerificationEmail(
  email: string,
): Promise<{ error: NormalizedAuthError | null }> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: getEmailRedirectUrl('verify-email') },
  });
  return { error: normalizeAuthError(error) };
}

export async function getCurrentSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Auth セッションの変化を購読。
 * - INITIAL_SESSION: アプリ起動時の復元
 * - SIGNED_IN / SIGNED_OUT: ログイン状態変化
 * - TOKEN_REFRESHED: 自動リフレッシュ
 *
 * @returns 購読解除関数
 */
export function subscribeToAuthChanges(
  callback: (session: Session | null) => void,
): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => {
    data.subscription.unsubscribe();
  };
}
