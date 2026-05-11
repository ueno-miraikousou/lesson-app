/**
 * notification_preferences テーブルのフェッチ・更新ヘルパー。
 *
 * テーブル構造 (DDL `0001_initial_schema.sql` + `0003_celebration_sound.sql`):
 *   - 1 auth_user に 1 行。`auth_user_id` で UNIQUE
 *   - 行が存在しない場合はサーバ側 DEFAULT (前日通知 ON / 当日通知 ON / 達成音 OFF 等) を採用
 *
 * 設計原則:
 *   - 画面側は Supabase クライアントを直接触らずに本ファイルの関数経由で行う
 *     → RLS エラー / 行未作成 / カラム名変更を 1 か所に閉じ込められる
 *   - 「行がまだ無い」状態を呼び出し側が意識しなくて済むよう、未作成時は
 *     `INSERT ... ON CONFLICT DO NOTHING` で空行を作ってから UPDATE する
 *     "upsert-then-read" 戦略を採用
 *
 * Supabase RLS:
 *   - 本テーブルは `notification_preferences_owner` ポリシー (auth.uid() =
 *     auth_user_id) で自分の行のみ SELECT/INSERT/UPDATE 可能
 *   - 他人の行を覗けない設計なので、ここでは `eq('auth_user_id', uid)` を
 *     必ず付ける (RLS で守られているが二重防御)
 *
 * 参照:
 *   - 02_設計/画面/NOTIF-01-通知設定.md §5
 *   - 02_設計/画面/WIZ-ウィザード一括設計.md §WIZ-09 達成音
 *   - supabase/migrations/0001_initial_schema.sql + 0003_celebration_sound.sql
 */

import { supabase } from './supabase';
import type { NotificationPreferences } from '../types/database';

/**
 * 行が無い場合に採用するデフォルト値。
 * DB 側 DEFAULT と必ず一致させること (画面初期表示が DB との往復で
 * チラつかないように)。
 */
export const NOTIFICATION_PREFERENCES_DEFAULTS = {
  reminder_day_before_enabled: true,
  reminder_day_before_time: '21:00:00',
  reminder_same_day_enabled: true,
  reminder_same_day_minutes: 30,
  include_items_in_notification: true,
  skip_when_all_items_checked: false,
  lock_screen_privacy_mode: false,
  sound_enabled: true,
  celebration_sound_enabled: false,
} as const;

/**
 * パッチ可能なフィールド。`as const` で narrow された DEFAULTS の型ではなく
 * 元の Row 型 (boolean / string / number) を採用して、トグルが渡す動的な
 * `boolean` をそのまま受け取れるようにする。
 */
export type NotificationPreferencesPatch = Partial<
  Pick<NotificationPreferences, keyof typeof NOTIFICATION_PREFERENCES_DEFAULTS>
>;

/**
 * 現在のログインユーザーの設定を取得。
 * 行が無ければ DEFAULTS をマージしたものを返す (DB に行は作らない)。
 *
 * @throws ログイン中でない場合
 */
export async function fetchNotificationPreferences(): Promise<NotificationPreferences> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const uid = userData.user?.id;
  if (!uid) throw new Error('not authenticated');

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('auth_user_id', uid)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  // 行が無い → DEFAULTS をその場で組み立てる。書き込みは UPDATE 時にまとめて。
  const now = new Date().toISOString();
  return {
    id: '',
    auth_user_id: uid,
    ...NOTIFICATION_PREFERENCES_DEFAULTS,
    created_at: now,
    updated_at: now,
  };
}

/**
 * 設定を部分更新する。行が無ければ INSERT、あれば UPDATE。
 *
 * 競合 (同時に別端末から書き込み) は最後の書き込みが勝つ Last-Write-Wins。
 * トグル UI は基本的に 1 箇所からしか触らないので問題にならない。
 */
export async function updateNotificationPreferences(
  patch: NotificationPreferencesPatch,
): Promise<NotificationPreferences> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const uid = userData.user?.id;
  if (!uid) throw new Error('not authenticated');

  // upsert: auth_user_id をキーにして行が無ければ INSERT、あれば UPDATE
  // DEFAULTS をマージしてから patch を被せることで、初回 INSERT 時に
  // NOT NULL カラムを抜けなく埋められる。
  const row = {
    auth_user_id: uid,
    ...NOTIFICATION_PREFERENCES_DEFAULTS,
    ...patch,
  };

  const { data, error } = await supabase
    .from('notification_preferences')
    .upsert(row, { onConflict: 'auth_user_id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}
