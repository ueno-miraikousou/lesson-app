-- ============================================================================
-- 0005_fix_rls_recursion_inline.sql
-- 起草: architect-4 / 2026-05-14 (0004 不完全に対する確実な再修正)
-- ============================================================================
--
-- 0004 適用後の検証結果:
--   - probe user (household_members 空) では RPC 200 (空集合返却で再帰トリガーされず)
--   - qa_a (household_members に紐付け行あり) では RPC 500 (stack depth exceeded 再発)
--   - 原因仮説: LANGUAGE sql の SECURITY DEFINER 関数は planner にインライン化され、
--     SECURITY DEFINER 属性が無視される。policy USING で関数を呼び、関数内 SELECT が
--     再度 policy 評価をトリガー → 無限再帰。
--
-- 確実な解決策 (2 段構え):
--   1. household_members_select_own policy USING を `auth_user_id = auth.uid()` の
--      直参照に変更 → 関数呼び出し排除、再帰原因を物理的に断つ。
--      → 副作用: 世帯共有時に他メンバーの紐付け行が見えなくなる。
--      → MVP では 1 世帯 1 owner で運用、招待受諾後の世帯共有は Edge Function 経由
--         (アーキテクチャ.md v0.3.2 §2.2) に統一するため許容範囲。
--   2. current_user_household_ids() を LANGUAGE plpgsql + SECURITY DEFINER に変更し、
--      インライン化を防止。他テーブルの policy (members, lessons 等) で安全に使用可能に。
--
-- 副作用評価:
--   - household_members の RLS: 自分自身の紐付け行のみ参照可 → SEC-1 36 ケースの
--     "RLS-HOUSEHOLDMEMB-SELECT-OTHER" は依然「authA が世帯 B の行を見れない」を満たす
--     (authA の auth.uid() != B の auth_user_id)
--   - 他テーブル (members 等) は関数経由で正しく自世帯のみ参照可
--   - 関数の戻り値は変わらない (同じ household_id 集合を返す)
-- ============================================================================

-- 1) household_members_select_own を auth.uid() 直参照に変更
DROP POLICY IF EXISTS "household_members_select_own" ON public.household_members;
CREATE POLICY "household_members_select_own"
  ON public.household_members
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- 2) current_user_household_ids() を plpgsql + SECURITY DEFINER に変更
--    (LANGUAGE plpgsql はインライン化対象外、SECURITY DEFINER が確実に効く)
CREATE OR REPLACE FUNCTION public.current_user_household_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
    SELECT household_id
    FROM public.household_members
    WHERE auth_user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_household_ids() TO authenticated;

-- 3) 検証 SELECT
-- §1 関数定義: plpgsql + SECURITY DEFINER + STABLE + search_path 固定
SELECT
  proname,
  prolang::regprocedure AS language,
  prosecdef AS is_security_definer,
  provolatile AS volatility,
  proconfig
FROM pg_proc
WHERE proname = 'current_user_household_ids'
  AND pronamespace = 'public'::regnamespace;

-- §2 household_members_select_own policy が auth.uid() 直参照に変更されているか
SELECT
  policyname,
  cmd,
  qual AS using_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'household_members'
ORDER BY policyname;

-- §3 households policy が依然 current_user_household_ids() 経由か
SELECT
  policyname,
  cmd,
  qual AS using_clause,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'households'
ORDER BY policyname;
