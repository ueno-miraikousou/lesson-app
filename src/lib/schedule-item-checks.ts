import { supabase } from './supabase';
import type { ScheduleItemCheck } from '../types/database';

/**
 * Sprint 5 C5-T02 schedule_item_checks UPSERT layer (I-03 チェックリスト)。
 *
 * 3-key UNIQUE: (schedule_id, item_id, occurrence_date)
 *
 * MVP 境界 (CAL-09 §1.5 「MVP 同期境界」):
 *   - 自分のチェック → 自端末: 楽観的更新で即時反映
 *   - 他家族のチェック → 自端末: Phase D で Realtime 購読、MVP は次回 fetch のみ
 *   - checked_by_member は MVP でも保存 (Phase D で履歴表示用)、表示は省略可
 */

export interface FetchChecksParams {
  scheduleId: string;
  occurrenceDate: string;
}

export async function fetchChecks(
  params: FetchChecksParams,
): Promise<ScheduleItemCheck[]> {
  const { data, error } = await supabase
    .from('schedule_item_checks')
    .select('*')
    .eq('schedule_id', params.scheduleId)
    .eq('occurrence_date', params.occurrenceDate);
  if (error) throw error;
  return data ?? [];
}

export interface UpsertCheckParams {
  scheduleId: string;
  itemId: string;
  occurrenceDate: string;
  checked: boolean;
  checkedByMemberId?: string | null;
}

/**
 * チェックを UPSERT する (toggle 用)。
 *
 * MVP 仕様:
 *   - 既存行があれば update、なければ insert
 *   - checked = false でも行を残す (履歴用)、不要なら呼び出し側で削除
 *   - checked_at は checked = true のとき now()、false のとき null
 */
export async function upsertCheck(params: UpsertCheckParams): Promise<ScheduleItemCheck> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('schedule_item_checks')
    .upsert(
      {
        schedule_id: params.scheduleId,
        item_id: params.itemId,
        occurrence_date: params.occurrenceDate,
        checked: params.checked,
        checked_at: params.checked ? now : null,
        checked_by_member: params.checkedByMemberId ?? null,
      },
      { onConflict: 'schedule_id,item_id,occurrence_date' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/**
 * I-03 AC5 一括操作: 「全部チェック」「全部解除」を 1 リクエストずつでループ。
 *
 * MVP 単純実装: 20 件想定 = 20 UPSERT、Supabase 1 接続で十分高速。
 */
export interface BulkSetChecksParams {
  scheduleId: string;
  itemIds: readonly string[];
  occurrenceDate: string;
  checked: boolean;
  checkedByMemberId?: string | null;
}

export async function bulkSetChecks(params: BulkSetChecksParams): Promise<void> {
  for (const itemId of params.itemIds) {
    await upsertCheck({
      scheduleId: params.scheduleId,
      itemId,
      occurrenceDate: params.occurrenceDate,
      checked: params.checked,
      checkedByMemberId: params.checkedByMemberId,
    });
  }
}
