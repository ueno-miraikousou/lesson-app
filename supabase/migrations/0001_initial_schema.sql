-- ========================================================================
-- 習い事管理アプリ MVP第1弾 — 初期スキーマ
-- 起草: mobile-engineer / 2026-05-10
-- 参照: 02_設計/アーキテクチャ.md v0.3.2 §2.2 + 02_設計/通知設計-暫定意見.md v0.3 §7
-- 注意:
--   - すべてのテーブルで RLS を即時有効化（一瞬でも RLS なしの状態を作らない）
--   - 月謝(payments) と lessons.monthly_fee は MVP では UI なし、第2弾予約
--   - 個人情報を含むテーブル(members)はクラッシュレポート等から漏洩しないよう実装側で配慮
-- ========================================================================

-- 必須拡張機能
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========================================================================
-- 1. households (世帯)
-- ========================================================================
CREATE TABLE public.households (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;

-- ========================================================================
-- 2. household_members (世帯と認証ユーザーの紐付け)
-- ========================================================================
CREATE TABLE public.household_members (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id        uuid NOT NULL REFERENCES public.households(id) ON DELETE CASCADE,
  auth_user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_in_household   text NOT NULL CHECK (role_in_household IN ('owner', 'member')),
  joined_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, auth_user_id)
);

CREATE INDEX idx_household_members_auth_user
  ON public.household_members(auth_user_id);
CREATE INDEX idx_household_members_household
  ON public.household_members(household_id);

ALTER TABLE public.household_members ENABLE ROW LEVEL SECURITY;

-- ========================================================================
-- 3. members (家族構成員 / 子供 + 親 + その他)
-- ========================================================================
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

-- ========================================================================
-- 4. lessons (習い事)
-- ========================================================================
CREATE TABLE public.lessons (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id             uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  name                  text NOT NULL CHECK (length(trim(name)) > 0 AND length(name) <= 30),
  classroom_name        text,
  location              text,
  monthly_fee           integer,                                -- 第2弾予約 (NULL許容)
  notifications_muted   boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lessons_member ON public.lessons(member_id);

ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;

-- ========================================================================
-- 5. schedules (予定 / 単発+繰り返し統合)
-- ========================================================================
CREATE TABLE public.schedules (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id           uuid NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  start_at            timestamptz NOT NULL,
  end_at              timestamptz NOT NULL,
  recurrence_rule     text,                                     -- RFC 5545 RRULE 形式
  recurrence_until    timestamptz,
  note                text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);

CREATE INDEX idx_schedules_lesson ON public.schedules(lesson_id);
CREATE INDEX idx_schedules_start_at ON public.schedules(start_at);

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

-- ========================================================================
-- 6. items (習い事の標準持ち物)
-- ========================================================================
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

-- ========================================================================
-- 7. schedule_item_checks (予定 × 持ち物 の交差テーブル)
-- ========================================================================
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

CREATE INDEX idx_schedule_item_checks_schedule_date
  ON public.schedule_item_checks(schedule_id, occurrence_date);

ALTER TABLE public.schedule_item_checks ENABLE ROW LEVEL SECURITY;

-- ========================================================================
-- 8. household_invitations (招待 / 6桁 + 16文字 の2形式併存)
-- ========================================================================
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

CREATE UNIQUE INDEX idx_household_invitations_code_short
  ON public.household_invitations(code_short);
CREATE UNIQUE INDEX idx_household_invitations_code_long
  ON public.household_invitations(code_long);
CREATE INDEX idx_household_invitations_active
  ON public.household_invitations(household_id, expires_at)
  WHERE used_at IS NULL;

ALTER TABLE public.household_invitations ENABLE ROW LEVEL SECURITY;

-- ========================================================================
-- 9. payments (第2弾予約 / MVP では UI なし)
-- ========================================================================
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

CREATE INDEX idx_payments_lesson_year_month
  ON public.payments(lesson_id, year_month);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- ========================================================================
-- 10. notification_preferences (通知設定 / ユーザー単位)
-- 参照: 通知設計-暫定意見.md §7.1
-- ========================================================================
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

-- ========================================================================
-- updated_at トリガー (全テーブル共通)
-- ========================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_households_updated_at
  BEFORE UPDATE ON public.households
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_members_updated_at
  BEFORE UPDATE ON public.members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_lessons_updated_at
  BEFORE UPDATE ON public.lessons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_schedules_updated_at
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_schedule_item_checks_updated_at
  BEFORE UPDATE ON public.schedule_item_checks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
