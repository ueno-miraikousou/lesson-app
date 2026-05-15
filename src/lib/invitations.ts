/**
 * F-01 / F-02 / F-03 招待コード経路の Supabase RPC + クエリラッパ。
 *
 * 設計:
 *   - 0006_phase_d_households_invitations.sql の SECURITY DEFINER 関数経由で
 *     RLS 自参照 chicken-and-egg を回避する (#22A / #23A / #24A)。
 *   - 発行は create_invitation RPC (owner のみ通る、関数内でガード)
 *   - 受諾は accept_invitation RPC (期限切れ / 使用済み / 既参加 / 形式不正の各 PGRST エラーを翻訳)
 *   - 一覧 SELECT は通常の RLS 経由で十分 (自世帯 invitations のみ見える)。
 *
 * 参照:
 *   - supabase/migrations/0006_phase_d_households_invitations.sql
 *   - 02_設計/画面/SHARE-02-配偶者招待.md §1.2 (6 桁数字 + 24 時間 + 同時 3 件上限)
 *   - 02_設計/アーキテクチャ.md v0.3.2 §2.2 (招待 RLS は Edge Function 経由推奨)
 */

import { INVITATION } from '../config/app';
import { isCodeShort } from '../features/invitation/generate-codes';
import { supabase } from './supabase';
import type { HouseholdInvitation } from '../types/database';

/** 招待コード受諾時のエラー種別 (UI で文言切替) */
export type AcceptInvitationErrorKind =
  | 'unauthenticated'
  | 'invalid_format'
  | 'not_found'
  | 'expired'
  | 'used'
  | 'already_member'
  | 'unknown';

export class AcceptInvitationError extends Error {
  readonly kind: AcceptInvitationErrorKind;
  constructor(kind: AcceptInvitationErrorKind, message: string) {
    super(message);
    this.kind = kind;
    this.name = 'AcceptInvitationError';
  }
}

export interface CreatedInvitation {
  id: string;
  householdId: string;
  codeShort: string;
  codeLong: string;
  expiresAt: string;
  createdBy: string;
  createdAt: string;
}

export interface AcceptedInvitation {
  householdId: string;
  householdName: string | null;
  isShared: boolean;
  memberId: string;
}

export interface ActiveInvitation {
  id: string;
  codeShort: string;
  codeLong: string;
  expiresAt: string;
  createdAt: string;
}

/**
 * F-02: 招待コード発行 (owner 専権、SECURITY DEFINER RPC 経由)。
 *
 * @throws Error - PostgREST エラー or RPC RAISE EXCEPTION (例: 非 owner / リトライ枯渇)
 */
export async function createInvitation(
  householdId: string,
  ttlHours: number = INVITATION.EXPIRY_HOURS,
): Promise<CreatedInvitation> {
  const { data, error } = await supabase.rpc('create_invitation', {
    p_household_id: householdId,
    p_ttl_hours: ttlHours,
  });

  if (error) {
    throw new Error(`createInvitation failed: ${error.message}`);
  }
  // RPC は SETOF を返すため配列、要素 0
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('createInvitation returned no row');
  }

  return {
    id: row.id,
    householdId: row.household_id,
    codeShort: row.code_short,
    codeLong: row.code_long,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

/**
 * F-03: 招待コード受諾 (SECURITY DEFINER RPC、RLS 自参照回避)。
 * 期限切れ / 使用済み / 既参加 / 形式不正は AcceptInvitationError に翻訳。
 */
export async function acceptInvitation(codeShort: string): Promise<AcceptedInvitation> {
  // クライアント側でも事前検証 (UX: 即時 422)
  if (!isCodeShort(codeShort)) {
    throw new AcceptInvitationError('invalid_format', '招待コードは 6 桁の数字で入力してください');
  }

  const { data, error } = await supabase.rpc('accept_invitation', { p_code_short: codeShort });

  if (error) {
    const msg = error.message ?? '';
    // RPC 関数の RAISE EXCEPTION 文字列 + SQLSTATE で種別判定
    // (PGRST → message に "expired" / "already used" / "not found" / "already a member" / "invalid code format" 等の英文が混入)
    if (msg.includes('not authenticated')) {
      throw new AcceptInvitationError('unauthenticated', 'ログインが必要です');
    }
    if (msg.includes('invalid code format')) {
      throw new AcceptInvitationError(
        'invalid_format',
        '招待コードは 6 桁の数字で入力してください',
      );
    }
    if (msg.includes('code not found')) {
      throw new AcceptInvitationError('not_found', '招待コードが見つかりません');
    }
    if (msg.includes('code expired')) {
      throw new AcceptInvitationError(
        'expired',
        '招待コードの有効期限が切れています。発行者に再発行を依頼してください',
      );
    }
    if (msg.includes('already used')) {
      throw new AcceptInvitationError('used', 'この招待コードは既に使用されています');
    }
    if (msg.includes('already a member')) {
      throw new AcceptInvitationError('already_member', '既にこの世帯に参加しています');
    }
    throw new AcceptInvitationError('unknown', `招待の受諾に失敗しました: ${msg}`);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new AcceptInvitationError('unknown', '招待の受諾結果を取得できませんでした');
  }

  return {
    householdId: row.household_id,
    householdName: row.household_name,
    isShared: row.is_shared,
    memberId: row.member_id,
  };
}

/**
 * SHARE-01 / SHARE-02 で表示する自世帯の有効な招待コード一覧。
 * RLS で自世帯のみ SELECT 可、used_at IS NULL かつ未失効を有効と判定。
 */
export async function fetchActiveInvitations(
  householdId: string,
  now: Date = new Date(),
): Promise<ActiveInvitation[]> {
  const { data, error } = await supabase
    .from('household_invitations')
    .select('id, code_short, code_long, expires_at, created_at, used_at')
    .eq('household_id', householdId)
    .is('used_at', null)
    .gt('expires_at', now.toISOString())
    .order('created_at', { ascending: false });

  if (error) throw new Error(`fetchActiveInvitations failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    id: row.id,
    codeShort: row.code_short,
    codeLong: row.code_long,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  }));
}

/**
 * SHARE-02 「取消」ボタン: used_at を立てて以降使用不可にする (実質失効)。
 * RLS で自世帯のみ UPDATE 可。
 */
export async function revokeInvitation(invitationId: string, now: Date = new Date()): Promise<void> {
  const { error } = await supabase
    .from('household_invitations')
    .update({ used_at: now.toISOString() })
    .eq('id', invitationId);
  if (error) throw new Error(`revokeInvitation failed: ${error.message}`);
}

/** ディープリンク URL を組み立てる (`learnapp://invite/<code_long>`) */
export function buildInvitationDeepLink(codeLong: string, scheme: string = 'learnapp'): string {
  return `${scheme}://invite/${codeLong}`;
}

/** 共有テキスト (LINE / メール 等の Share Sheet 用、SHARE-02 §4.3 文言案) */
export function buildInvitationShareText(invitation: Pick<HouseholdInvitation, 'code_short' | 'code_long' | 'expires_at'>, scheme: string = 'learnapp'): string {
  const deepLink = buildInvitationDeepLink(invitation.code_long, scheme);
  const expiresLocal = new Date(invitation.expires_at).toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return [
    '「習い事管理アプリ」の家族招待です',
    '下記リンクをタップしてご参加ください',
    '',
    deepLink,
    '',
    'または、アプリ起動後に下記コードを入力:',
    invitation.code_short,
    '',
    `このリンク・コードは ${expiresLocal} まで有効です`,
  ].join('\n');
}

/** ISO 文字列を「YYYY/MM/DD (曜) HH:mm」形式に整形 (UI 用) */
export function formatExpiresAt(iso: string): string {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const youbi = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}/${mm}/${dd} (${youbi}) ${hh}:${mi}`;
}
