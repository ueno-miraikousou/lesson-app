-- ========================================================================
-- 0004_fix_rls_recursion.sql
-- 起草: architect-4 / 2026-05-14 (SEC-1 force_reapply 後の致命的バグ修復)
--
-- 問題:
--   - 0002_rls_policies.sql の `current_user_household_ids()` 関数は
--     `SECURITY INVOKER` (default) で定義されており、`household_members` を SELECT する。
--   - `household_members_select_own` policy USING で同関数を呼ぶため、
--     policy → 関数 → policy → 関数 ... の無限再帰となり、
--     PostgreSQL `stack depth limit exceeded` (code 54001) → HTTP 500 で全クエリ失敗。
--
-- 検証 (architect-4 / 2026-05-14):
--   - qa_a (authenticated JWT) で SELECT households / SELECT household_members /
--     SELECT members / POST members / RPC current_user_household_ids 全て 500 (54001)
--   - service_role (RLS bypass) では 200/201 で成功 → スキーマは正常
--   - service_role 経由で household_members 1 行 INSERT 済の状態で再現
--
-- 修正:
--   - 関数を `SECURITY DEFINER` に変更 → 関数内クエリは関数オーナー (postgres) で実行
--   - これにより関数内の `household_members` SELECT は RLS をバイパスする
--   - policy USING で関数を呼ぶ際、関数内部の SELECT は再 policy 評価しない
--   - `SET search_path = public, pg_temp` で security definer 関数の標準化
--   - STABLE は維持 (引数同じなら同一トランザクション内で結果不変、planner 最適化対応)
--
-- 副作用評価:
--   - 関数の戻り値は変わらない (元の SQL と同等の集合を返す)
--   - SECURITY DEFINER の権限昇格リスク: 関数本体が auth.uid() を condition に
--     使うため、呼び出しユーザーの household_id 以外を返すことはない (安全)
--   - GRANT EXECUTE は `authenticated` ロールに継続付与 (要確認、CREATE OR REPLACE で
--     保持される想定。明示的に再 GRANT)
--
-- 適用方法:
--   Supabase Dashboard SQL Editor で本ファイル全文を貼付 Run。
--   実行後、検証 SELECT 3 件で関数定義変更を確認。
-- ========================================================================

-- 1) 関数再定義 (SECURITY DEFINER + search_path 固定)
CREATE OR REPLACE FUNCTION public.current_user_household_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT household_id
  FROM public.household_members
  WHERE auth_user_id = auth.uid();
$$;

-- 2) 関数の EXECUTE 権限を authenticated ロールに付与 (CREATE OR REPLACE 後の念のため)
GRANT EXECUTE ON FUNCTION public.current_user_household_ids() TO authenticated;

-- 3) 検証 SELECT
-- §1 関数定義確認 (security_definer = true, volatility = 's' = STABLE)
SELECT
  proname AS function_name,
  prosecdef AS is_security_definer,
  provolatile AS volatility,
  proconfig AS config_settings
FROM pg_proc
WHERE proname = 'current_user_household_ids'
  AND pronamespace = 'public'::regnamespace;

-- §2 EXECUTE 権限確認
SELECT
  grantee,
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_name = 'current_user_household_ids'
  AND routine_schema = 'public';

-- §3 policy USING が依然 current_user_household_ids() を参照していることを確認
-- (policy 本体は変更不要)
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  qual AS using_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN (
    'households_select_own',
    'household_members_select_own',
    'members_all_own_household'
  )
ORDER BY tablename, policyname;
