-- ============================================================================
-- 0006_phase_d_households_invitations.sql
-- 起草: architect-5 セッション #4 / 2026-05-15 (Phase D Sprint 1 D1-T01)
--
-- 用途: Phase D Sprint 1 (F-01 / F-02 / F-03 SHARE-01..04) 着手のため、
--   households.is_shared 列追加 + 招待コード経路 SECURITY DEFINER 関数 2 件追加
--
-- 関連:
--   - ADR-007 Realtime 同期方式 (Accepted)
--   - Phase D WBS v0.1 §4.2 Sprint 1 D1-T01
--   - SEC-2 計画 v0.1 §2.1 + §3.1-3.6 (INV-01..06)
--   - 学習事項 #20A-#24A (Supabase Free tier RLS + SECURITY DEFINER + plpgsql 直参照)
--
-- 既存スキーマ前提 (0001-0005 適用済):
--   - public.households (id, name, created_at, updated_at)
--   - public.household_members (id, household_id, auth_user_id, role_in_household, joined_at)
--   - public.household_invitations
--       (id, household_id, code_short[^\d{6}$], code_long[length=16],
--        expires_at, used_at, used_by_auth_user_id, created_by, created_at)
--   - public.current_user_household_ids() = plpgsql + SECURITY DEFINER (0005 確立済)
--
-- 設計方針:
--   1. households.is_shared bool 列追加 (DEFAULT false、既存行は false)
--   2. household_invitations は既存テーブル流用 (0001 で完成済)、列追加なし
--      - 6 桁短コード = `^\d{6}$` (既存制約) を踏襲、数字テンキー入力 UX に整合
--      - 16 文字長コード = 英数字混合、QR 等で長期共有用 (本 migration では生成のみ、UX 任意)
--   3. create_invitation(p_household_id, p_ttl_hours) SECURITY DEFINER 関数:
--      - 認証ユーザーが p_household_id の owner であることを確認
--      - 6 桁短コード + 16 文字長コード 生成 (衝突時 リトライ最大 8 回)
--      - household_invitations INSERT (created_by = auth.uid())
--      - 戻り値: 行全体 (code_short / code_long / expires_at 等を返す)
--   4. accept_invitation(p_code_short) SECURITY DEFINER 関数:
--      - 6 桁短コード で household_invitations 検索 (FOR UPDATE で並列受諾防止)
--      - 検証: expires_at > now() AND used_at IS NULL
--      - household_members INSERT (auth_user_id = auth.uid(), role_in_household = 'member')
--        ※ 既存メンバー (UNIQUE 衝突) は 422 想定 = 関数内で明示 RAISE
--      - households.is_shared = true 更新 (2 人目以降参加で共有有効化)
--      - household_invitations.used_at + used_by_auth_user_id 更新
--      - 戻り値: 該当 household 行 (id / name / is_shared 等、UI で世帯切替に使用)
--
-- 学習事項 #20A-#24A 遵守:
--   - DROP IF EXISTS + 再 CREATE で冪等化 (Free tier 部分適用対策)
--   - LANGUAGE plpgsql で SECURITY DEFINER インライン化回避 (#23A)
--   - SET search_path = public, pg_temp 固定 (search_path 攻撃対策 + planner 安定)
--   - 関数内 SELECT は元から RLS バイパス (DEFINER の権限で実行) → chicken-and-egg 回避 (#22A)
--
-- 適用方法:
--   秘書 #N + ME-5 が Chrome 経由 Supabase Dashboard SQL Editor で本ファイル全文貼付 Run。
--   §後段の検証 SELECT 4 件で関数定義 + 列追加を確認、機密漏洩 grep 4 パターン 0 件確証。
-- ============================================================================

-- ============================================================================
-- §1. households.is_shared 列追加
-- ============================================================================
ALTER TABLE public.households
  ADD COLUMN IF NOT EXISTS is_shared boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.households.is_shared IS
  'Phase D F-01: 2 人目以降のメンバー参加で true、SHARE-01 設定画面で表示用フラグ';

-- ============================================================================
-- §2. create_invitation() 関数: 招待コード発行
-- ============================================================================
DROP FUNCTION IF EXISTS public.create_invitation(uuid, integer);

CREATE OR REPLACE FUNCTION public.create_invitation(
  p_household_id uuid,
  p_ttl_hours    integer DEFAULT 24
)
RETURNS TABLE (
  id                 uuid,
  household_id       uuid,
  code_short         text,
  code_long          text,
  expires_at         timestamptz,
  created_by         uuid,
  created_at         timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_uid    uuid;
  v_is_owner      boolean;
  v_code_short    text;
  v_code_long     text;
  v_expires_at    timestamptz;
  v_attempt       integer;
  v_inserted_row  public.household_invitations%ROWTYPE;
BEGIN
  -- 1) 呼出ユーザー認証確認
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'create_invitation: not authenticated'
      USING ERRCODE = '28000';  -- invalid_authorization_specification
  END IF;

  -- 2) p_household_id の owner 確認 (member は招待発行不可、SEC-2 INV-08 連動)
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = p_household_id
      AND auth_user_id = v_caller_uid
      AND role_in_household = 'owner'
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'create_invitation: caller is not owner of household %', p_household_id
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;

  -- 3) TTL 範囲チェック (1h - 168h = 1 week)
  IF p_ttl_hours IS NULL OR p_ttl_hours < 1 OR p_ttl_hours > 168 THEN
    RAISE EXCEPTION 'create_invitation: p_ttl_hours must be 1..168, got %', p_ttl_hours
      USING ERRCODE = '22023';  -- invalid_parameter_value
  END IF;

  v_expires_at := now() + (p_ttl_hours || ' hours')::interval;

  -- 4) コード生成 + 衝突時リトライ (最大 8 回)
  v_attempt := 0;
  LOOP
    v_attempt := v_attempt + 1;

    -- 6 桁数字 (0001 既存制約 `^\d{6}$` に整合、テンキー入力 UX)
    -- crypto-grade 乱数: gen_random_bytes(8) -> bigint (符号付き 64bit) -> mod 1000000
    -- 64bit 符号付きの絶対値範囲は ±9.2*10^18、mod 結果は |...| % 10^6 = 0..999999 で安全
    v_code_short := lpad(
      (abs(('x' || encode(gen_random_bytes(8), 'hex'))::bit(64)::bigint) % 1000000)::text,
      6,
      '0'
    );

    -- 16 文字 大文字英数字 (混同回避なし、QR/共有リンク向け、length=16 制約のみ)
    v_code_long := upper(substr(encode(gen_random_bytes(12), 'hex'), 1, 16));

    BEGIN
      INSERT INTO public.household_invitations (
        household_id, code_short, code_long, expires_at, created_by
      )
      VALUES (p_household_id, v_code_short, v_code_long, v_expires_at, v_caller_uid)
      RETURNING * INTO v_inserted_row;

      EXIT;  -- 成功
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 8 THEN
        RAISE EXCEPTION 'create_invitation: code collision exhausted retries (%)', v_attempt
          USING ERRCODE = '40001';  -- serialization_failure
      END IF;
      -- ループで再試行
    END;
  END LOOP;

  -- 5) 戻り値返却 (id 等 7 列)
  id           := v_inserted_row.id;
  household_id := v_inserted_row.household_id;
  code_short   := v_inserted_row.code_short;
  code_long    := v_inserted_row.code_long;
  expires_at   := v_inserted_row.expires_at;
  created_by   := v_inserted_row.created_by;
  created_at   := v_inserted_row.created_at;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invitation(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.create_invitation(uuid, integer) IS
  'Phase D F-02: 6 桁短コード + 16 文字長コード発行。owner のみ。学習事項 #22A-#24A 適用 (SECURITY DEFINER + plpgsql + RLS 自参照回避)。';

-- ============================================================================
-- §3. accept_invitation() 関数: 招待コード受諾 + メンバー参加
-- ============================================================================
DROP FUNCTION IF EXISTS public.accept_invitation(text);

CREATE OR REPLACE FUNCTION public.accept_invitation(p_code_short text)
RETURNS TABLE (
  household_id   uuid,
  household_name text,
  is_shared      boolean,
  member_id      uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_uid    uuid;
  v_invitation    public.household_invitations%ROWTYPE;
  v_household     public.households%ROWTYPE;
  v_existing_mid  uuid;
  v_new_member_id uuid;
BEGIN
  -- 1) 呼出ユーザー認証確認
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL THEN
    RAISE EXCEPTION 'accept_invitation: not authenticated'
      USING ERRCODE = '28000';
  END IF;

  -- 2) 入力 sanity check (6 桁数字)
  IF p_code_short IS NULL OR p_code_short !~ '^\d{6}$' THEN
    RAISE EXCEPTION 'accept_invitation: invalid code format'
      USING ERRCODE = '22023';
  END IF;

  -- 3) 招待コード検索 (FOR UPDATE で並列受諾防止)
  SELECT * INTO v_invitation
  FROM public.household_invitations
  WHERE code_short = p_code_short
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accept_invitation: code not found'
      USING ERRCODE = 'P0002';  -- no_data_found
  END IF;

  -- 4) 期限切れ確認
  IF v_invitation.expires_at <= now() THEN
    RAISE EXCEPTION 'accept_invitation: code expired (expires_at=%)', v_invitation.expires_at
      USING ERRCODE = '22023';
  END IF;

  -- 5) 使用済み確認
  IF v_invitation.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'accept_invitation: code already used (used_at=%)', v_invitation.used_at
      USING ERRCODE = '22023';
  END IF;

  -- 6) 既存メンバー確認 (再参加防止 + UNIQUE 衝突回避)
  SELECT id INTO v_existing_mid
  FROM public.household_members
  WHERE household_id = v_invitation.household_id
    AND auth_user_id = v_caller_uid;

  IF v_existing_mid IS NOT NULL THEN
    RAISE EXCEPTION 'accept_invitation: already a member of household %', v_invitation.household_id
      USING ERRCODE = '23505';  -- unique_violation
  END IF;

  -- 7) household_members INSERT (役割 = member、招待コード経路で参加した非 owner)
  INSERT INTO public.household_members (
    household_id, auth_user_id, role_in_household
  ) VALUES (
    v_invitation.household_id, v_caller_uid, 'member'
  )
  RETURNING id INTO v_new_member_id;

  -- 8) households.is_shared = true 更新 (2 人目以降参加で共有有効化)
  UPDATE public.households
     SET is_shared = true
   WHERE id = v_invitation.household_id
   RETURNING * INTO v_household;

  -- 9) household_invitations 使用済みマーク
  UPDATE public.household_invitations
     SET used_at = now(),
         used_by_auth_user_id = v_caller_uid
   WHERE id = v_invitation.id;

  -- 10) 戻り値返却 (UI 世帯切替 + 完了画面表示用)
  household_id   := v_household.id;
  household_name := v_household.name;
  is_shared      := v_household.is_shared;
  member_id      := v_new_member_id;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

COMMENT ON FUNCTION public.accept_invitation(text) IS
  'Phase D F-03: 招待コード受諾 + household_members INSERT + is_shared 更新 + used_at マーク。RLS chicken-and-egg 回避のため SECURITY DEFINER 必須 (学習事項 #22A)。';

-- ============================================================================
-- §4. household_invitations Realtime publication 確認 (既存登録、追加なし)
--    0002_rls_policies.sql:327-335 で 8 テーブル登録済を踏襲
-- ============================================================================
-- (本 migration では publication 変更なし、既存登録を確認するのみ)

-- ============================================================================
-- §5. 検証 SELECT (適用後手動確認用)
-- ============================================================================

-- §5.1 households.is_shared 列追加確認
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'households'
  AND column_name = 'is_shared';

-- §5.2 create_invitation 関数定義確認 (plpgsql + SECURITY DEFINER + search_path 固定)
SELECT
  proname,
  pg_get_function_identity_arguments(oid) AS args,
  prosecdef AS is_security_definer,
  provolatile AS volatility,
  proconfig AS config_settings
FROM pg_proc
WHERE proname = 'create_invitation'
  AND pronamespace = 'public'::regnamespace;

-- §5.3 accept_invitation 関数定義確認
SELECT
  proname,
  pg_get_function_identity_arguments(oid) AS args,
  prosecdef AS is_security_definer,
  provolatile AS volatility,
  proconfig AS config_settings
FROM pg_proc
WHERE proname = 'accept_invitation'
  AND pronamespace = 'public'::regnamespace;

-- §5.4 EXECUTE 権限確認 (authenticated ロール付与)
SELECT
  routine_name,
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_name IN ('create_invitation', 'accept_invitation')
  AND routine_schema = 'public'
ORDER BY routine_name, grantee;

-- §5.5 既存 RLS policy への影響確認 (households / household_members / household_invitations)
SELECT
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('households', 'household_members', 'household_invitations')
ORDER BY tablename, policyname;
