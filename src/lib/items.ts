import { supabase } from './supabase';
import type { Item, UpdateTables } from '../types/database';

/**
 * Sprint 4 C4-T03 用 items テーブル CRUD layer。
 *
 * ITEM-01 受け入れ基準 (WBS §2.2 I-01 + I-06 整合):
 *   - lesson_id 単位で取得 (sort_order 昇順)
 *   - CRUD: create / update / delete / reorder
 *   - 楽観的更新は呼び出し側の React Query で実施 (本層は確定操作のみ)
 *   - RLS: 自世帯の lessons に紐付く items のみ参照可能 (Phase B 既設定)
 */

export async function fetchItemsByLesson(lessonId: string): Promise<Item[]> {
  const { data, error } = await supabase
    .from('items')
    .select('*')
    .eq('lesson_id', lessonId)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export interface CreateItemInput {
  lessonId: string;
  name: string;
  sortOrder?: number;
}

export async function createItem(input: CreateItemInput): Promise<Item> {
  const { data, error } = await supabase
    .from('items')
    .insert({
      lesson_id: input.lessonId,
      name: input.name,
      sort_order: input.sortOrder ?? 0,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export interface UpdateItemInput {
  id: string;
  name?: string;
  sortOrder?: number;
}

export async function updateItem(input: UpdateItemInput): Promise<Item> {
  const patch: UpdateTables<'items'> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;

  const { data, error } = await supabase
    .from('items')
    .update(patch)
    .eq('id', input.id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Sprint 4 並び替え: items の sort_order を一括更新。
 * 引数の配列順で 0, 1, 2, ... を割当て、楽観的更新が UI で発火した後に呼ぶ。
 *
 * 失敗時は呼び出し側で rollback (前の sort_order 配列を保持)。
 *
 * MVP 単純実装: 1 行ずつ UPDATE (20 件想定 = 20 リクエスト、Supabase 1 接続で十分高速)。
 * 将来の高速化: Postgres function (PL/pgSQL) で bulk update を 1 round-trip 化。
 */
export async function reorderItems(orderedIds: readonly string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  for (let i = 0; i < orderedIds.length; i += 1) {
    const id = orderedIds[i]!;
    const { error } = await supabase
      .from('items')
      .update({ sort_order: i })
      .eq('id', id);
    if (error) throw error;
  }
}
