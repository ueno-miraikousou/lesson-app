import { supabase } from './supabase';
import type { Lesson, Member } from '../types/database';

/**
 * Sprint 4 C4-T01 用 lessons + members 取得 layer (MEM-04 / MEM-06 画面用)。
 *
 * MEM-04 (習い事一覧): 自世帯のメンバー別に lessons をグループ化
 * MEM-06 (習い事詳細): 1 lesson の詳細 + 紐付くメンバー名
 *
 * RLS: 自世帯 members に紐付く lessons のみ参照可能 (Phase B 既設定)。
 */

export interface LessonWithMember extends Lesson {
  member: Pick<Member, 'id' | 'name' | 'color_hex'>;
}

export async function fetchLessonsWithMembers(householdId: string): Promise<LessonWithMember[]> {
  const { data: members, error: mErr } = await supabase
    .from('members')
    .select('id, name, color_hex')
    .eq('household_id', householdId);
  if (mErr) throw mErr;

  const memberIds = (members ?? []).map((m) => m.id);
  if (memberIds.length === 0) return [];

  const { data: lessons, error: lErr } = await supabase
    .from('lessons')
    .select('*')
    .in('member_id', memberIds)
    .order('name', { ascending: true });
  if (lErr) throw lErr;

  const memberById = new Map(
    (members ?? []).map((m) => [m.id, { id: m.id, name: m.name, color_hex: m.color_hex }]),
  );

  return (lessons ?? []).map((l) => ({
    ...l,
    member: memberById.get(l.member_id) ?? {
      id: l.member_id,
      name: '(unknown)',
      color_hex: '#999999',
    },
  }));
}

export async function fetchLessonById(lessonId: string): Promise<LessonWithMember | null> {
  const { data: lesson, error: lErr } = await supabase
    .from('lessons')
    .select('*')
    .eq('id', lessonId)
    .maybeSingle();
  if (lErr) throw lErr;
  if (!lesson) return null;

  const { data: member, error: mErr } = await supabase
    .from('members')
    .select('id, name, color_hex')
    .eq('id', lesson.member_id)
    .maybeSingle();
  if (mErr) throw mErr;

  return {
    ...lesson,
    member: member ?? { id: lesson.member_id, name: '(unknown)', color_hex: '#999999' },
  };
}
