/**
 * Edge Function: 招待コード検証 + 世帯参加
 *
 * このファンクションは Deno ランタイムで動作する (Supabase Edge Functions)。
 * SECURITY DEFINER 相当の権限を持つため、招待される側が「自分が属していない世帯」の
 * household_invitations 行を検証することができる。
 *
 * 仕様:
 *   - 入力: { code: string }  (6桁数字 or 16文字英数字、自動判別)
 *   - 認証: Supabase Auth JWT 必須 (`authorization: Bearer <jwt>`)
 *   - レスポンス:
 *       200 OK { household_id, household_name }
 *       400 Bad Request { error: 'INVALID_INPUT' }
 *       401 Unauthorized { error: 'UNAUTHENTICATED' }
 *       403 Forbidden { error: 'ALREADY_HAS_HOUSEHOLD' }
 *       404 Not Found  { error: 'INVALID_OR_EXPIRED_CODE' }
 *       429 Too Many Requests { error: 'RATE_LIMITED' }
 *
 * デプロイ:
 *   supabase functions deploy redeem-invitation
 *
 * 参照:
 *   - 02_設計/アーキテクチャ.md v0.3.2 §2.2
 *   - 02_設計/mobile-engineer引継ぎサマリ.md §5.3
 *   - 02_設計/画面/SHARE-02-配偶者招待.md §1.3
 */

// @ts-expect-error: Deno runtime imports (resolved at deploy time)
import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
// @ts-expect-error: Deno runtime imports
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from '../_shared/cors.ts';

// Deno ランタイムのグローバル
declare const Deno: {
  env: { get: (key: string) => string | undefined };
};

interface RequestBody {
  code?: string;
}

const isCodeShort = (input: string) => /^\d{6}$/.test(input);
const isCodeLong = (input: string) => /^[A-Za-z0-9_-]{16}$/.test(input);

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    // 1. JWT 検証
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return json(401, { error: 'UNAUTHENTICATED' });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return json(500, { error: 'SERVER_MISCONFIGURED' });
    }

    // 2. ユーザー特定 (anon key + JWT で確認)
    const userClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return json(401, { error: 'UNAUTHENTICATED' });
    }
    const authUserId = userData.user.id;

    // 3. 入力検証
    const body = (await req.json()) as RequestBody;
    const code = body.code?.trim() ?? '';
    if (!isCodeShort(code) && !isCodeLong(code)) {
      return json(400, { error: 'INVALID_INPUT' });
    }
    const column = isCodeShort(code) ? 'code_short' : 'code_long';

    // 4. 既存所属チェック (1ユーザー1世帯ルール / AUTH-07 §5.2)
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: existing } = await adminClient
      .from('household_members')
      .select('household_id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();
    if (existing) {
      return json(403, { error: 'ALREADY_HAS_HOUSEHOLD' });
    }

    // 5. TODO: Rate Limit チェック (invitation_attempts テーブル or Supabase 標準 Rate Limit)
    //          MVP 着手時に実装。詳細は アーキテクチャ.md §2.2 ブルートフォース対策

    // 6. 招待検証 (SECURITY DEFINER 相当 = service role でアクセス)
    const { data: invitation, error: invErr } = await adminClient
      .from('household_invitations')
      .select('id, household_id, expires_at, used_at')
      .eq(column, code)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (invErr || !invitation) {
      return json(404, { error: 'INVALID_OR_EXPIRED_CODE' });
    }

    // 7. 世帯への参加 (household_members INSERT) + 招待を使用済みに更新
    //    Supabase クライアントはトランザクションをサポートしないため、順次実行 + 失敗時の手動補正
    const { error: insertErr } = await adminClient
      .from('household_members')
      .insert({
        household_id: invitation.household_id,
        auth_user_id: authUserId,
        role_in_household: 'member',
      });
    if (insertErr) {
      // 重複等は INVALID_OR_EXPIRED_CODE 同等として返す (情報漏洩を避ける)
      console.error('household_members insert failed', insertErr);
      return json(404, { error: 'INVALID_OR_EXPIRED_CODE' });
    }

    const { error: updateErr } = await adminClient
      .from('household_invitations')
      .update({
        used_at: new Date().toISOString(),
        used_by_auth_user_id: authUserId,
      })
      .eq('id', invitation.id);
    if (updateErr) {
      // メンバー追加は成功しているのでログだけ残す。次回呼び出しは ALREADY_HAS_HOUSEHOLD で弾かれる
      console.error('household_invitations update failed', updateErr);
    }

    // 8. 世帯名取得 (確認画面表示用)
    const { data: household } = await adminClient
      .from('households')
      .select('name')
      .eq('id', invitation.household_id)
      .maybeSingle();

    return json(200, {
      household_id: invitation.household_id,
      household_name: household?.name ?? null,
    });
  } catch (err) {
    console.error('redeem-invitation unexpected error', err);
    return json(500, { error: 'SERVER_ERROR' });
  }
});
