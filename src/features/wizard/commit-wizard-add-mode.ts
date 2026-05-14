/**
 * WIZ-10 後からウィザード再実行: 追加分のみ INSERT (ADR-006 案 B PostgREST + 手動補正)。
 *
 * 設計原則 (ADR-006 §2.3 §4.3 整合):
 *   - 既存 members / lessons / schedules には touch しない (追加専用)
 *   - operator (OPERATOR_TEMP_ID = 'operator') は既存前提 → スキップ
 *   - 失敗時は当回 INSERT した newMembers を rollback (CASCADE で lessons/schedules も削除)
 *   - 既存メンバーへの追加 lesson は対象外 (= 既存メンバー編集は MEM-04 / MEM-06 経路)
 *
 * 参照:
 *   - ADR-006 §4.3 W-10 専用関数の仕様
 *   - Phase B 既存 commit-wizard.ts (同パターン)
 */

import { supabase } from '../../lib/supabase';
import type { WizardLesson, WizardMember } from '../../stores/wizard-store';
import { buildRecurrenceRule, combineDateTime, nextOccurrenceStart } from './recurrence';

const OPERATOR_TEMP_ID = 'operator';

interface CommitAddInput {
  householdId: string;
  /** 追加メンバー (operator を含めない、含まれていても無視) */
  newMembers: readonly WizardMember[];
  /** 追加 lessons (memberTempId は newMembers の tempId を指す) */
  newLessons: readonly WizardLesson[];
}

export interface CommitAddResult {
  insertedMemberIds: readonly string[];
  insertedLessonIds: readonly string[];
}

/**
 * 追加モードのウィザード入力を Supabase へ INSERT する。
 *
 * @throws Error INSERT 失敗時 (rollback 完了後に re-throw)
 */
export async function commitWizardAddMode(input: CommitAddInput): Promise<CommitAddResult> {
  const { householdId, newMembers, newLessons } = input;

  // operator は既存前提のため、念のため除外
  const targetMembers = newMembers.filter((m) => m.tempId !== OPERATOR_TEMP_ID);

  if (targetMembers.length === 0 && newLessons.length === 0) {
    return { insertedMemberIds: [], insertedLessonIds: [] };
  }

  const insertedMemberIds: string[] = [];
  const tempIdToDbId = new Map<string, string>();

  // === 1. 新規 members INSERT (既存 operator は別扱い、ここでは扱わない) ===
  for (const m of targetMembers) {
    const { data, error } = await supabase
      .from('members')
      .insert({
        household_id: householdId,
        name: m.name,
        birth_date: m.birthDate,
        gender: m.gender,
        role: m.role,
        color_hex: m.colorHex,
      })
      .select('id')
      .single();
    if (error || !data) {
      await rollbackMembers(insertedMemberIds);
      throw new Error(`add-mode members insert failed: ${error?.message ?? 'unknown'}`);
    }
    tempIdToDbId.set(m.tempId, data.id);
    insertedMemberIds.push(data.id);
  }

  // === 2. lessons INSERT (memberTempId → DB id 解決) ===
  const insertedLessonIds: string[] = [];
  for (const l of newLessons) {
    const memberDbId = tempIdToDbId.get(l.memberTempId);
    if (!memberDbId) {
      // 追加モードでは「既存メンバーへの新規 lesson」は WIZ-10 範囲外。
      // tempId が解決できなければ補正してエラー。
      await rollbackMembers(insertedMemberIds);
      throw new Error(`add-mode memberTempId not resolved: ${l.memberTempId}`);
    }
    const { data, error } = await supabase
      .from('lessons')
      .insert({
        member_id: memberDbId,
        name: l.name,
        classroom_name: l.classroomName,
        location: l.location,
      })
      .select('id')
      .single();
    if (error || !data) {
      await rollbackMembers(insertedMemberIds);
      throw new Error(`add-mode lessons insert failed: ${error?.message ?? 'unknown'}`);
    }
    insertedLessonIds.push(data.id);

    // === 3. schedules INSERT (lesson の各 slot) ===
    for (const slot of l.schedules) {
      if (slot.daysOfWeek.length === 0) continue;
      const startAt = nextOccurrenceStart(slot);
      const endAt = combineDateTime(startAt, slot.endTime);
      const { error: schErr } = await supabase.from('schedules').insert({
        lesson_id: data.id,
        start_at: startAt.toISOString(),
        end_at: endAt.toISOString(),
        recurrence_rule: buildRecurrenceRule(slot),
        recurrence_until: slot.recurrenceUntil,
      });
      if (schErr) {
        await rollbackMembers(insertedMemberIds);
        throw new Error(`add-mode schedules insert failed: ${schErr.message}`);
      }
    }
  }

  return { insertedMemberIds, insertedLessonIds };
}

/**
 * 補正: 当回 INSERT した members を削除。CASCADE で関連 lessons / schedules も削除される。
 * 既存メンバーは含まれないため、安全に DELETE 可能。
 */
async function rollbackMembers(memberIds: readonly string[]): Promise<void> {
  if (memberIds.length === 0) return;
  await supabase
    .from('members')
    .delete()
    .in('id', memberIds as string[]);
}
