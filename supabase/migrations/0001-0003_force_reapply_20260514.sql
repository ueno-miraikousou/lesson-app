-- ============================================================================
-- 0001-0003 force_reapply (architect-3 / 2026-05-14)
-- ============================================================================
-- 用途: Supabase Dashboard SQL Editor で 0001-0003 を一括再適用
-- 経緯: 初回適用 (秘書 #28 報告: Success) で households 以外のテーブルが skip された
-- 対策: 各 CREATE 前に DROP IF EXISTS CASCADE で完全クリーン化 → 確実な再適用
-- 安全性: 既存データなし (qa_a の households 残骸は本 SQL で削除される、想定内)
-- 実行: Claude in Chrome 経由 (or 社長) で全文貼付 + Run、確認ダイアログ「Run this query」
-- ============================================================================

-- ============================================================
-- 既存テーブル / 関数 / publication の DROP (冪等化、CASCADE で依存先も削除)
-- ============================================================
DROP PUBLICATION IF EXISTS supabase_realtime;

DROP FUNCTION IF EXISTS public.set_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.current_user_household_ids() CASCADE;

DROP TABLE IF EXISTS public.schedule_item_checks CASCADE;
DROP TABLE IF EXISTS public.items CASCADE;
DROP TABLE IF EXISTS public.schedules CASCADE;
DROP TABLE IF EXISTS public.lessons CASCADE;
DROP TABLE IF EXISTS public.payments CASCADE;
DROP TABLE IF EXISTS public.members CASCADE;
DROP TABLE IF EXISTS public.notification_preferences CASCADE;
DROP TABLE IF EXISTS public.household_invitations CASCADE;
DROP TABLE IF EXISTS public.household_members CASCADE;
DROP TABLE IF EXISTS public.households CASCADE;

-- ============================================================
-- 0001_initial_schema.sql 本体
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. households
CREATE TABLE public.households (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

-- 2. household_members
CREATE TABLE public.household_members (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  auth_user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_in_household   text NOT NULL CHECK (role_in_household IN ('owner', 'member')),
  joined_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, auth_user_id)
);
CREATE INDEX idx_household_members_auth_user ON public.household_members(auth_user_id);
CREATE INDEX idx_household_members_household ON public.household_members(household_id);
ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

-- 3. members
CREATE TABLE public.members (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id          uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  name                  text NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 30),
  birth_date            date,
  gender                text CHECK (gender IS NULL OR gender IN ('female', 'male', 'unspecified')),
  role                  text NOT NULL CHECK (role IN ('child', 'parent', 'other')),
  color_hex             text NOT NULL DEFAULT '#FF6B7A',
  notifications_muted   boolean NOT NULL DEFAULT false,
  sort_order            integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_members_household ON public.members(household_id);
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- 4. lessons
CREATE TABLE public.lessons (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id             uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  name                  text NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 30),
  classroom_name        text,
  location              text,
  monthly_fee           integer,
  notifications_muted   boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_lessons_member ON public.lessons(member_id);
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

-- 5. schedules
CREATE TABLE public.schedules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id           uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  start_at            timestamptz NOT NULL,
  end_at              timestamptz NOT NULL,
  recurrence_rule     text,
  recurrence_until    timestamptz,
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);
CREATE INDEX idx_schedules_lesson ON public.schedules(lesson_id);
CREATE INDEX idx_schedules_start_at ON public.schedules(start_at);
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

-- 6. items
CREATE TABLE public.items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 50),
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_items_lesson ON public.items(lesson_id);
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

-- 7. schedule_item_checks
CREATE TABLE public.schedule_item_checks (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id           uuid NOT NULL REFERENCES public.schedules(id) ON DELETE CASCADE,
  item_id               uuid NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  occurrence_date       date NOT NULL,
  checked               boolean NOT NULL DEFAULT false,
  checked_at            timestamptz,
  checked_by_member     uuid REFERENCES public.household_members(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_id, item_id, occurrence_date)
);
CREATE INDEX idx_schedule_item_checks_schedule_date ON public.schedule_item_checks(schedule_id, occurrence_date);
ALTER TABLE public.schedule_item_checks ENABLE ROW LEVEL SECURITY;

-- 8. household_invitations
CREATE TABLE public.household_invitations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id            uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  code_short              text NOT NULL UNIQUE CHECK (code_short ~ '^\d{6}$'),
  code_long               text NOT NULL UNIQUE CHECK (length(code_long) = 16),
  expires_at              timestamptz NOT NULL,
  used_at                 timestamptz,
  used_by_auth_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_household_invitations_code_short ON public.household_invitations(code_short);
CREATE UNIQUE INDEX idx_household_invitations_code_long ON public.household_invitations(code_long);
CREATE INDEX idx_household_invitations_active ON public.household_invitations(household_id, expires_at) WHERE used_at IS NULL;
ALTER TABLE public.household_invitations ENABLE ROW LEVEL SECURITY;

-- 9. payments
CREATE TABLE public.payments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id   uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  year_month  text NOT NULL CHECK (year_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount      integer,
  paid_at     date,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'skipped')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, year_month)
);
CREATE INDEX idx_payments_lesson_year_month ON public.payments(lesson_id, year_month);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 10. notification_preferences
CREATE TABLE public.notification_preferences (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id                    uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_day_before_enabled     boolean NOT NULL DEFAULT true,
  reminder_day_before_time        time NOT NULL DEFAULT '21:00',
  reminder_same_day_enabled       boolean NOT NULL DEFAULT true,
  reminder_same_day_minutes       integer NOT NULL DEFAULT 30 CHECK (reminder_same_day_minutes BETWEEN 5 AND 240),
  include_items_in_notification   boolean NOT NULL DEFAULT true,
  skip_when_all_items_checked     boolean NOT NULL DEFAULT false,
  lock_screen_privacy_mode        boolean NOT NULL DEFAULT false,
  sound_enabled                   boolean NOT NULL DEFAULT true,
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- updated_at トリガー
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_households_updated_at BEFORE UPDATE ON public.households FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_members_updated_at BEFORE UPDATE ON public.members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_lessons_updated_at BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_schedules_updated_at BEFORE UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_items_updated_at BEFORE UPDATE ON public.items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_schedule_item_checks_updated_at BEFORE UPDATE ON public.schedule_item_checks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_notification_preferences_updated_at BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 0002_rls_policies.sql 本体
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_user_household_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT household_id FROM public.household_members WHERE auth_user_id = auth.uid();
$$;

-- households
CREATE POLICY "households_select_own" ON public.households FOR SELECT TO authenticated USING (id IN (SELECT public.current_user_household_ids()));
CREATE POLICY "households_insert_self" ON public.households FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "households_update_own" ON public.households FOR UPDATE TO authenticated USING (id IN (SELECT public.current_user_household_ids())) WITH CHECK (id IN (SELECT public.current_user_household_ids()));
CREATE POLICY "households_delete_owner" ON public.households FOR DELETE TO authenticated USING (id IN (SELECT household_id FROM public.household_members WHERE auth_user_id = auth.uid() AND role_in_household = 'owner'));

-- household_members
CREATE POLICY "household_members_select_own" ON public.household_members FOR SELECT TO authenticated USING (household_id IN (SELECT public.current_user_household_ids()));
CREATE POLICY "household_members_insert_self" ON public.household_members FOR INSERT TO authenticated WITH CHECK (auth_user_id = auth.uid());
CREATE POLICY "household_members_update_owner" ON public.household_members FOR UPDATE TO authenticated USING (household_id IN (SELECT household_id FROM public.household_members WHERE auth_user_id = auth.uid() AND role_in_household = 'owner')) WITH CHECK (household_id IN (SELECT household_id FROM public.household_members WHERE auth_user_id = auth.uid() AND role_in_household = 'owner'));
CREATE POLICY "household_members_delete_self_or_owner" ON public.household_members FOR DELETE TO authenticated USING (auth_user_id = auth.uid() OR household_id IN (SELECT household_id FROM public.household_members WHERE auth_user_id = auth.uid() AND role_in_household = 'owner'));

-- members
CREATE POLICY "members_all_own_household" ON public.members FOR ALL TO authenticated
  USING (household_id IN (SELECT public.current_user_household_ids()))
  WITH CHECK (household_id IN (SELECT public.current_user_household_ids()));

-- lessons
CREATE POLICY "lessons_all_own_household" ON public.lessons FOR ALL TO authenticated
  USING (member_id IN (SELECT id FROM public.members WHERE household_id IN (SELECT public.current_user_household_ids())))
  WITH CHECK (member_id IN (SELECT id FROM public.members WHERE household_id IN (SELECT public.current_user_household_ids())));

-- schedules
CREATE POLICY "schedules_all_own_household" ON public.schedules FOR ALL TO authenticated
  USING (lesson_id IN (SELECT l.id FROM public.lessons l JOIN public.members m ON l.member_id = m.id WHERE m.household_id IN (SELECT public.current_user_household_ids())))
  WITH CHECK (lesson_id IN (SELECT l.id FROM public.lessons l JOIN public.members m ON l.member_id = m.id WHERE m.household_id IN (SELECT public.current_user_household_ids())));

-- items
CREATE POLICY "items_all_own_household" ON public.items FOR ALL TO authenticated
  USING (lesson_id IN (SELECT l.id FROM public.lessons l JOIN public.members m ON l.member_id = m.id WHERE m.household_id IN (SELECT public.current_user_household_ids())))
  WITH CHECK (lesson_id IN (SELECT l.id FROM public.lessons l JOIN public.members m ON l.member_id = m.id WHERE m.household_id IN (SELECT public.current_user_household_ids())));

-- schedule_item_checks
CREATE POLICY "schedule_item_checks_all_own_household" ON public.schedule_item_checks FOR ALL TO authenticated
  USING (schedule_id IN (SELECT s.id FROM public.schedules s JOIN public.lessons l ON s.lesson_id = l.id JOIN public.members m ON l.member_id = m.id WHERE m.household_id IN (SELECT public.current_user_household_ids())))
  WITH CHECK (schedule_id IN (SELECT s.id FROM public.schedules s JOIN public.lessons l ON s.lesson_id = l.id JOIN public.members m ON l.member_id = m.id WHERE m.household_id IN (SELECT public.current_user_household_ids())));

-- household_invitations
CREATE POLICY "invitations_select_own_household" ON public.household_invitations FOR SELECT TO authenticated USING (household_id IN (SELECT public.current_user_household_ids()));
CREATE POLICY "invitations_insert_own_household" ON public.household_invitations FOR INSERT TO authenticated WITH CHECK (household_id IN (SELECT public.current_user_household_ids()) AND created_by = auth.uid());
CREATE POLICY "invitations_update_own_household" ON public.household_invitations FOR UPDATE TO authenticated USING (household_id IN (SELECT public.current_user_household_ids())) WITH CHECK (household_id IN (SELECT public.current_user_household_ids()));
CREATE POLICY "invitations_delete_own_household" ON public.household_invitations FOR DELETE TO authenticated USING (household_id IN (SELECT public.current_user_household_ids()));

-- payments
CREATE POLICY "payments_select_own_household" ON public.payments FOR SELECT TO authenticated USING (lesson_id IN (SELECT l.id FROM public.lessons l JOIN public.members m ON l.member_id = m.id WHERE m.household_id IN (SELECT public.current_user_household_ids())));

-- notification_preferences
CREATE POLICY "notification_preferences_all_self" ON public.notification_preferences FOR ALL TO authenticated USING (auth_user_id = auth.uid()) WITH CHECK (auth_user_id = auth.uid());

-- Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE
  public.households, public.members, public.lessons, public.schedules, public.items,
  public.schedule_item_checks, public.household_invitations, public.notification_preferences;

-- ============================================================
-- 0003_celebration_sound.sql 本体
-- ============================================================

ALTER TABLE public.notification_preferences
  ADD COLUMN celebration_sound_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.notification_preferences.celebration_sound_enabled IS
  'WIZ-09 達成音の再生可否。デフォルト OFF。SET-06 でトグル可能。';

-- ============================================================
-- 適用検証 (実行後、結果を Run output で確認)
-- ============================================================

-- 全 10 テーブル存在確認
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('households','household_members','members','lessons','schedules','items','schedule_item_checks','household_invitations','payments','notification_preferences')
ORDER BY table_name;

-- RLS 全部有効確認
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('households','household_members','members','lessons','schedules','items','schedule_item_checks','household_invitations','payments','notification_preferences')
ORDER BY tablename;

-- households 個別 policy 確認
SELECT policyname, cmd, with_check::text
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'households'
ORDER BY policyname;

-- ============================================================
-- 期待される結果
-- ============================================================
-- 1) 上記 1 つ目 SELECT: 10 行返却 (全テーブル存在)
-- 2) 上記 2 つ目 SELECT: 全て rowsecurity = t (true)
-- 3) 上記 3 つ目 SELECT: 4 policy 返却 (delete_owner / insert_self / select_own / update_own)
--    特に insert_self の with_check = 'true' を確認
