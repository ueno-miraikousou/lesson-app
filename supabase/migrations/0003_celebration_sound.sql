-- ============================================================================
-- 0003_celebration_sound.sql
--
-- Adds the celebration-sound preference for WIZ-09 (designer v0.3 §WIZ-09).
--
-- Spec recap (designer v0.3 line 724):
--   - The wizard's completion screen plays a short celebratory sound when the
--     user has explicitly opted in.
--   - Default OFF (designer + 社長 ターン2 確定).
--   - Surfaced as a toggle in SET-06.
--   - Saved per-user, alongside the other notification preferences.
--
-- Migration strategy:
--   - ADD COLUMN with NOT NULL DEFAULT false. Existing rows pick up the
--     default automatically, so legacy users keep the silent behaviour they
--     had before this column existed — no backfill needed.
--   - The column lives on `notification_preferences` because that is where
--     other audio/visual notification toggles already live; co-locating keeps
--     the per-user settings query in SET-06 simple (one SELECT, one UPDATE).
-- ============================================================================

ALTER TABLE public.notification_preferences
  ADD COLUMN celebration_sound_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.notification_preferences.celebration_sound_enabled IS
  'WIZ-09 達成音の再生可否。デフォルト OFF。SET-06 でトグル可能。';
