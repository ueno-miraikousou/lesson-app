import { supabase } from './supabase';
import type { Lesson, Member, Schedule, UpdateTables } from '../types/database';

export interface ScheduleWithLesson extends Schedule {
  lesson: Pick<Lesson, 'id' | 'member_id' | 'name' | 'classroom_name' | 'location'>;
}

export interface MonthScheduleData {
  members: Member[];
  schedules: ScheduleWithLesson[];
}

/**
 * 指定世帯の members + schedules を取得する。
 *
 * 取得範囲:
 *   - members: household_id 一致の全件
 *   - schedules: lessons 経由で自世帯メンバー紐付けの全件 (recurrence_rule を含む)
 *
 * 月境界は RRULE 展開時に行う (calendar-utils.expandSchedules) ため、
 * ここでは保存済の schedule 行をすべて取得して client 側で展開する。
 *
 * MVP では月 100 件想定 (WBS §2.1 S-01 非機能要件)、Phase D 以降で月単位の絞込みに最適化。
 */
export async function fetchMembersAndSchedules(householdId: string): Promise<MonthScheduleData> {
  const { data: members, error: mErr } = await supabase
    .from('members')
    .select('*')
    .eq('household_id', householdId)
    .order('sort_order', { ascending: true });
  if (mErr) throw mErr;

  const { data: lessons, error: lErr } = await supabase
    .from('lessons')
    .select('id, member_id, name, classroom_name, location')
    .in('member_id', (members ?? []).map((m) => m.id));
  if (lErr) throw lErr;

  const lessonIds = (lessons ?? []).map((l) => l.id);
  if (lessonIds.length === 0) {
    return { members: members ?? [], schedules: [] };
  }

  const { data: schedules, error: sErr } = await supabase
    .from('schedules')
    .select('*')
    .in('lesson_id', lessonIds);
  if (sErr) throw sErr;

  const lessonById = new Map((lessons ?? []).map((l) => [l.id, l]));
  const withLesson: ScheduleWithLesson[] = (schedules ?? []).map((s) => ({
    ...s,
    lesson: lessonById.get(s.lesson_id) ?? {
      id: s.lesson_id,
      member_id: '',
      name: '(deleted)',
      classroom_name: null,
      location: null,
    },
  }));
  return { members: members ?? [], schedules: withLesson };
}

export interface CreateScheduleInput {
  lessonId: string;
  startAt: Date;
  endAt: Date;
  note?: string | null;
  recurrenceRule?: string | null;
  recurrenceUntil?: Date | null;
}

export async function createSchedule(input: CreateScheduleInput): Promise<Schedule> {
  const { data, error } = await supabase
    .from('schedules')
    .insert({
      lesson_id: input.lessonId,
      start_at: input.startAt.toISOString(),
      end_at: input.endAt.toISOString(),
      note: input.note ?? null,
      recurrence_rule: input.recurrenceRule ?? null,
      recurrence_until: input.recurrenceUntil ? input.recurrenceUntil.toISOString() : null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export interface UpdateScheduleInput {
  id: string;
  lessonId?: string;
  startAt?: Date;
  endAt?: Date;
  note?: string | null;
  recurrenceRule?: string | null;
  recurrenceUntil?: Date | null;
}

/**
 * S-09 「すべて変更」用: 既存 schedules 行を UPDATE。
 *
 * ADR-005 §2.4 採用案:
 *   - 「すべて変更」 = この行を直接 UPDATE
 *   - 「今後すべて変更」 = {@link splitScheduleAt} で既存行に UNTIL 追記 + 新規行 INSERT
 */
export async function updateSchedule(input: UpdateScheduleInput): Promise<Schedule> {
  const patch: UpdateTables<'schedules'> = {};
  if (input.lessonId !== undefined) patch.lesson_id = input.lessonId;
  if (input.startAt !== undefined) patch.start_at = input.startAt.toISOString();
  if (input.endAt !== undefined) patch.end_at = input.endAt.toISOString();
  if (input.note !== undefined) patch.note = input.note;
  if (input.recurrenceRule !== undefined) patch.recurrence_rule = input.recurrenceRule;
  if (input.recurrenceUntil !== undefined) {
    patch.recurrence_until = input.recurrenceUntil ? input.recurrenceUntil.toISOString() : null;
  }

  const { data, error } = await supabase
    .from('schedules')
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export interface SplitScheduleInput {
  /** 分割対象の既存 schedule */
  source: Schedule;
  /** 分割境界: この日以降の occurrence は新 schedule に属する (壁時計 Date) */
  splitFrom: Date;
  /** 新 schedule に適用する変更内容 (start/end 時刻 / lesson / メモ / RRULE / UNTIL) */
  newSchedule: Omit<CreateScheduleInput, 'recurrenceUntil'> & { recurrenceUntil?: Date | null };
}

/**
 * S-09 「今後すべて変更」用: 既存 schedule に UNTIL を追記して splitFrom 以前で終わらせ、
 * splitFrom 以降を新 schedule として INSERT する。
 *
 * 戻り値: 更新後の旧 schedule + 新規作成された schedule の組。
 */
export async function splitScheduleAt(
  input: SplitScheduleInput,
): Promise<{ updated: Schedule; created: Schedule }> {
  const cutoff = new Date(input.splitFrom);
  cutoff.setDate(cutoff.getDate() - 1);

  const updated = await updateSchedule({
    id: input.source.id,
    recurrenceUntil: cutoff,
  });

  const created = await createSchedule(input.newSchedule);
  return { updated, created };
}

/**
 * S-10 「すべて削除」用: schedules DELETE。
 * FK CASCADE で schedule_item_checks も自動削除される。
 */
export async function deleteSchedule(id: string): Promise<void> {
  const { error } = await supabase.from('schedules').delete().eq('id', id);
  if (error) throw error;
}

/**
 * S-10 「今後すべて削除」用: 既存 schedule に UNTIL を追記して splitFrom 以前で終わらせる。
 */
export async function truncateScheduleAt(
  scheduleId: string,
  cutoffDate: Date,
): Promise<Schedule> {
  const cutoff = new Date(cutoffDate);
  cutoff.setDate(cutoff.getDate() - 1);
  return updateSchedule({ id: scheduleId, recurrenceUntil: cutoff });
}
