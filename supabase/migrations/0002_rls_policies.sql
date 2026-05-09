-- ========================================================================
-- 習い事管理アプリ — RLS ポリシー
-- 起草: mobile-engineer / 2026-05-10
-- 参照: 02_設計/アーキテクチャ.md v0.3.2 §3
--
-- 設計原則:
--   1. 自世帯のデータしか SELECT/INSERT/UPDATE/DELETE できない
--   2. 別世帯の household_invitations は Edge Function 経由で検証 (本ファイルでは
--      クライアント直接 SELECT は禁止 / 認証済ユーザーが自分が作成した招待のみ参照可)
--   3. 通知設定 (notification_preferences) はユーザー単位アクセス (世帯境界外)
--   4. payments は MVP では UI なしだが第2弾予約のため家族メンバーは SELECT のみ可
--      INSERT/UPDATE/DELETE は MVP 段階では Edge Function 経由 (未実装/将来)
-- ========================================================================

-- ヘルパー関数: 認証ユーザーが属する世帯ID集合
-- (関数経由にすることで、各ポリシーが SUBQUERY 重複しなくなり保守容易)
CREATE OR REPLACE FUNCTION public.current_user_household_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT household_id
  FROM public.household_members
  WHERE auth_user_id = auth.uid();
$$;

-- ========================================================================
-- households
-- ========================================================================

-- SELECT: 自分が属する世帯のみ
CREATE POLICY "households_select_own"
  ON public.households
  FOR SELECT
  TO authenticated
  USING (id IN (SELECT public.current_user_household_ids()));

-- INSERT: 認証ユーザーは新規世帯を作れる (作成直後に household_members への INSERT で紐付ける)
CREATE POLICY "households_insert_self"
  ON public.households
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: 自世帯のみ (世帯名変更等)
CREATE POLICY "households_update_own"
  ON public.households
  FOR UPDATE
  TO authenticated
  USING (id IN (SELECT public.current_user_household_ids()))
  WITH CHECK (id IN (SELECT public.current_user_household_ids()));

-- DELETE: 自世帯の owner のみ (将来 SET-06 退会機能で使用)
CREATE POLICY "households_delete_owner"
  ON public.households
  FOR DELETE
  TO authenticated
  USING (
    id IN (
      SELECT household_id
      FROM public.household_members
      WHERE auth_user_id = auth.uid()
        AND role_in_household = 'owner'
    )
  );

-- ========================================================================
-- household_members
-- ========================================================================

-- SELECT: 自世帯のメンバー紐付けのみ
CREATE POLICY "household_members_select_own"
  ON public.household_members
  FOR SELECT
  TO authenticated
  USING (household_id IN (SELECT public.current_user_household_ids()));

-- INSERT: 自分自身を紐付ける場合のみ (世帯作成直後 / 招待受諾直後)
-- MVP では招待受諾も Edge Function 経由を推奨だが、暫定的にクライアント側で許可
-- (Edge Function 化したら本ポリシーは削除し、Edge Function に SECURITY DEFINER 付与)
CREATE POLICY "household_members_insert_self"
  ON public.household_members
  FOR INSERT
  TO authenticated
  WITH CHECK (auth_user_id = auth.uid());

-- UPDATE: 自世帯の owner のみが他人の役割変更可
CREATE POLICY "household_members_update_owner"
  ON public.household_members
  FOR UPDATE
  TO authenticated
  USING (
    household_id IN (
      SELECT household_id
      FROM public.household_members
      WHERE auth_user_id = auth.uid()
        AND role_in_household = 'owner'
    )
  )
  WITH CHECK (
    household_id IN (
      SELECT household_id
      FROM public.household_members
      WHERE auth_user_id = auth.uid()
        AND role_in_household = 'owner'
    )
  );

-- DELETE: 自分自身の脱退 OR owner による削除
CREATE POLICY "household_members_delete_self_or_owner"
  ON public.household_members
  FOR DELETE
  TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR household_id IN (
      SELECT household_id
      FROM public.household_members
      WHERE auth_user_id = auth.uid()
        AND role_in_household = 'owner'
    )
  );

-- ========================================================================
-- members (家族構成員)
-- ========================================================================

CREATE POLICY "members_all_own_household"
  ON public.members
  FOR ALL
  TO authenticated
  USING (household_id IN (SELECT public.current_user_household_ids()))
  WITH CHECK (household_id IN (SELECT public.current_user_household_ids()));

-- ========================================================================
-- lessons (習い事)
-- ========================================================================

CREATE POLICY "lessons_all_own_household"
  ON public.lessons
  FOR ALL
  TO authenticated
  USING (
    member_id IN (
      SELECT id FROM public.members
      WHERE household_id IN (SELECT public.current_user_household_ids())
    )
  )
  WITH CHECK (
    member_id IN (
      SELECT id FROM public.members
      WHERE household_id IN (SELECT public.current_user_household_ids())
    )
  );

-- ========================================================================
-- schedules (予定)
-- ========================================================================

CREATE POLICY "schedules_all_own_household"
  ON public.schedules
  FOR ALL
  TO authenticated
  USING (
    lesson_id IN (
      SELECT l.id
      FROM public.lessons l
      JOIN public.members m ON l.member_id = m.id
      WHERE m.household_id IN (SELECT public.current_user_household_ids())
    )
  )
  WITH CHECK (
    lesson_id IN (
      SELECT l.id
      FROM public.lessons l
      JOIN public.members m ON l.member_id = m.id
      WHERE m.household_id IN (SELECT public.current_user_household_ids())
    )
  );

-- ========================================================================
-- items (習い事の標準持ち物)
-- ========================================================================

CREATE POLICY "items_all_own_household"
  ON public.items
  FOR ALL
  TO authenticated
  USING (
    lesson_id IN (
      SELECT l.id
      FROM public.lessons l
      JOIN public.members m ON l.member_id = m.id
      WHERE m.household_id IN (SELECT public.current_user_household_ids())
    )
  )
  WITH CHECK (
    lesson_id IN (
      SELECT l.id
      FROM public.lessons l
      JOIN public.members m ON l.member_id = m.id
      WHERE m.household_id IN (SELECT public.current_user_household_ids())
    )
  );

-- ========================================================================
-- schedule_item_checks (予定 × 持ち物 の交差)
-- ========================================================================

CREATE POLICY "schedule_item_checks_all_own_household"
  ON public.schedule_item_checks
  FOR ALL
  TO authenticated
  USING (
    schedule_id IN (
      SELECT s.id
      FROM public.schedules s
      JOIN public.lessons l ON s.lesson_id = l.id
      JOIN public.members m ON l.member_id = m.id
      WHERE m.household_id IN (SELECT public.current_user_household_ids())
    )
  )
  WITH CHECK (
    schedule_id IN (
      SELECT s.id
      FROM public.schedules s
      JOIN public.lessons l ON s.lesson_id = l.id
      JOIN public.members m ON l.member_id = m.id
      WHERE m.household_id IN (SELECT public.current_user_household_ids())
    )
  );

-- ========================================================================
-- household_invitations (招待コード)
--
-- 重要: 招待される側は「自分が属していない世帯」の招待コードを検証する必要がある。
-- アーキテクチャ.md v0.3.2 §2.2 のコメント通り、この検証は Edge Function 経由で
-- 実装することを推奨。本ポリシーでは招待発行・取消側 (世帯所属者) のみ操作可。
-- 招待受諾側のフローは Edge Function (SECURITY DEFINER) で:
--   1. code_short / code_long の完全一致 + 未使用 + 未失効 で行検索
--   2. household_members への INSERT (招待受諾)
--   3. household_invitations.used_at / used_by_auth_user_id 更新
-- を一括で実行する。
-- ========================================================================

-- SELECT: 自世帯の招待のみ参照可 (受諾検証は Edge Function 経由)
CREATE POLICY "invitations_select_own_household"
  ON public.household_invitations
  FOR SELECT
  TO authenticated
  USING (household_id IN (SELECT public.current_user_household_ids()));

-- INSERT: 自世帯への招待を発行可、created_by は自分自身
CREATE POLICY "invitations_insert_own_household"
  ON public.household_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    household_id IN (SELECT public.current_user_household_ids())
    AND created_by = auth.uid()
  );

-- UPDATE: 自世帯の招待のみ (取消等)
CREATE POLICY "invitations_update_own_household"
  ON public.household_invitations
  FOR UPDATE
  TO authenticated
  USING (household_id IN (SELECT public.current_user_household_ids()))
  WITH CHECK (household_id IN (SELECT public.current_user_household_ids()));

-- DELETE: 自世帯の招待のみ
CREATE POLICY "invitations_delete_own_household"
  ON public.household_invitations
  FOR DELETE
  TO authenticated
  USING (household_id IN (SELECT public.current_user_household_ids()));

-- ========================================================================
-- payments (第2弾予約)
-- ========================================================================

-- SELECT: 自世帯の lesson に紐づく支払のみ
CREATE POLICY "payments_select_own_household"
  ON public.payments
  FOR SELECT
  TO authenticated
  USING (
    lesson_id IN (
      SELECT l.id
      FROM public.lessons l
      JOIN public.members m ON l.member_id = m.id
      WHERE m.household_id IN (SELECT public.current_user_household_ids())
    )
  );

-- INSERT/UPDATE/DELETE: MVP では UI なし。第2弾以降の機能。
-- ポリシーは将来追加。本MVP段階ではクライアント側からの書込みは発生しない想定。

-- ========================================================================
-- notification_preferences
-- ========================================================================

CREATE POLICY "notification_preferences_all_self"
  ON public.notification_preferences
  FOR ALL
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- ========================================================================
-- Realtime publication
-- 家族間のリアルタイム同期対象テーブルを追加
-- ========================================================================

-- supabase_realtime publication が無い場合は新規作成
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
  ) THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.households,
  public.members,
  public.lessons,
  public.schedules,
  public.items,
  public.schedule_item_checks,
  public.household_invitations,
  public.notification_preferences;
