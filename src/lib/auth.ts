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
