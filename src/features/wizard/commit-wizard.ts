/**
 * ウィザード入力内容の一括 INSERT (WIZ-07 で実行)。
 *
 * 設計原則:
 *   - members → lessons → schedules → items の順で INSERT
 *   - tempId と DB UUID の対応マップで子要素の foreign key を解決
 *   - エラー発生時の補正: members を rollback。失敗詳細は呼出側で表示
 *   - 操作者 (OPERATOR_TEMP_ID = 'operator') は同 auth_user_id 配下に既に
 *     members 行があれば「既存を再利用」する冪等性パスを通す
 *
 * 参照:
 *   - 02_設計/画面/WIZ-ウィザード一括設計.md WIZ-07 + データ書き込みの方針
 *   - 02_設計/mobile-engineer引継ぎサマリ.md §5.6 (WIZ-04 B案)
 */

import { supabase } from '../../lib/supabase';
import type { WizardLesson, WizardMember } from '../../stores/wizard-store';
import { buildRecurrenceRule, combineDateTime, nextOccurrenceStart } from './recurrence';

const OPERATOR_TEMP_ID = 'operator';

interface CommitInput {
  householdId: string;
  members: readonly WizardMember[];
  lessons: readonly WizardLesson[];
}

interface CommitResult {
  insertedMemberIds: readonly string[];
  insertedLessonIds: readonly string[];
}

/**
 * ウィザード入力内容を Supabase へ一括 INSERT する。
 * 失敗時は新規 INSERT した members を補償的に削除する（実 RDB トランザクションは
 * Supabase クライアントから直接張れないため、手動補正）。
 */
export async function commitWizardData(input: CommitInput): Promise<CommitResult> {
  const { householdId, members, lessons } = input;

  // === 1. operator の既存 members 行を確認（冪等性: 再実行時も上書きにする）===
  const operator = members.find((m) => m.tempId === OPERATOR_TEMP_ID);
  let operatorExistingId: string | null = null;
  if (operator) {
    const { data: existing } = await supabase
      .from('members')
      .select('id')
      .eq('household_id', householdId)
      .eq('role', 'parent')
      .eq('name', operator.name)
      .maybeSingle();
    operatorExistingId = existing?.id ?? null;
  }

  // === 2. members INSERT (operator は既存があれば UPDATE、なければ INSERT) ===
  const insertedMemberIds: string[] = [];
  const tempIdToDbId = new Map<string, string>();
  const newlyInsertedMemberIds: string[] = [];

  for (const m of members) {
    if (m.tempId === OPERATOR_TEMP_ID && operatorExistingId) {
      // 既存 operator を再利用
      tempIdToDbId.set(m.tempId, operatorExistingId);
      const { error } = await supabase
        .from('members')
        .update({
          color_hex: m.colorHex,
          birth_date: m.birthDate,
          gender: m.gender,
        })
        .eq('id', operatorExistingId);
      if (error) {
        await rollbackMembers(newlyInsertedMemberIds);
        throw new Error(`operator update failed: ${error.message}`);
      }
      continue;
    }

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
      await rollbackMembers(newlyInsertedMemberIds);
      throw new Error(`members insert failed: ${error?.message ?? 'unknown'}`);
    }
    tempIdToDbId.set(m.tempId, data.id);
    insertedMemberIds.push(data.id);
    newlyInsertedMemberIds.push(data.id);
  }

  // === 3. lessons INSERT (memberTempId → DB id 解決) ===
  const insertedLessonIds: string[] = [];
  for (const l of lessons) {
    const memberDbId = tempIdToDbId.get(l.memberTempId);
    if (!memberDbId) {
      // operator メンバーが既存だった場合の整合性チェック
      throw new Error(`memberTempId not resolved: ${l.memberTempId}`);
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
      await rollbackMembers(newlyInsertedMemberIds);
      throw new Error(`lessons insert failed: ${error?.message ?? 'unknown'}`);
    }
    insertedLessonIds.push(data.id);

    // === 4. schedules INSERT ===
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
        await rollbackMembers(newlyInsertedMemberIds);
        throw new Error(`schedules insert failed: ${schErr.message}`);
      }
    }
  }

  return { insertedMemberIds, insertedLessonIds };
}

/** 失敗時の補正: 新規 INSERT した members を削除（CASCADE で lessons / schedules も消える）*/
async function rollbackMembers(memberIds: readonly string[]): Promise<void> {
  if (memberIds.length === 0) return;
  await supabase.from('members').delete().in('id', memberIds as string[]);
}
