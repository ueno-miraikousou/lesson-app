/**
 * 週単位カレンダー (CAL-02) のためのユーティリティ。
 * - 週の境界計算 (firstDay = 0 = 日曜開始)
 * - 重なり 3 列 + 「+N 件」集約ロジック (ADR-004 R-A1 + CAL-02 §3.5)
 */

import type { CalendarEvent } from './types';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * 引数の date を含む週 (日曜開始) の最初の日 00:00 を返す。
 */
export function startOfWeek(date: Date, firstDay: 0 | 1 = 0): Date {
  const d = new Date(date);
  const diff = (d.getDay() - firstDay + 7) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d;
}

export function endOfWeek(date: Date, firstDay: 0 | 1 = 0): Date {
  const start = startOfWeek(date, firstDay);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function addWeeks(date: Date, delta: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + delta * 7);
  return result;
}

export function isSameWeek(a: Date, b: Date, firstDay: 0 | 1 = 0): boolean {
  return startOfWeek(a, firstDay).getTime() === startOfWeek(b, firstDay).getTime();
}

/**
 * 同曜日 + 時刻重なりのイベントを 3 列までに集約し、4 件目以降を「+N 件」に集約する。
 *
 * 出力形状:
 * - 通常イベントは 1 件ずつ (column = 0/1/2)
 * - 「+N」イベントは集約されたまま代表として 1 件 (overflowCount 付き)
 */
export interface ResolvedEvent extends CalendarEvent {
  column: 0 | 1 | 2;
  /** 「+N 件」表示の対象、null なら通常イベント */
  overflowCount?: number;
  /** overflow 時、追加で含まれていたイベント (UI 詳細展開用) */
  overflowEvents?: CalendarEvent[];
}

const MAX_COLUMNS = 3;

function startMs(e: CalendarEvent): number {
  return new Date(e.startAt).getTime();
}

function endMs(e: CalendarEvent): number {
  return new Date(e.endAt).getTime();
}

function overlaps(a: CalendarEvent, b: CalendarEvent): boolean {
  return startMs(a) < endMs(b) && startMs(b) < endMs(a);
}

/**
 * 1 日分のイベントを 3 列までに集約。
 * 4 件目以降は最終列に「+N 件」として集約 (overflow フラグ)。
 */
export function resolveOverlaps(events: readonly CalendarEvent[]): ResolvedEvent[] {
  const sorted = [...events].sort((a, b) => startMs(a) - startMs(b));
  const columns: CalendarEvent[][] = [[], [], []];
  const overflow: CalendarEvent[] = [];

  for (const e of sorted) {
    let placed = false;
    for (let c = 0; c < MAX_COLUMNS; c += 1) {
      const lastInColumn = columns[c]![columns[c]!.length - 1];
      if (!lastInColumn || !overlaps(lastInColumn, e)) {
        columns[c]!.push(e);
        placed = true;
        break;
      }
    }
    if (!placed) overflow.push(e);
  }

  const result: ResolvedEvent[] = [];
  columns.forEach((col, idx) => {
    for (const e of col) {
      result.push({ ...e, column: idx as 0 | 1 | 2 });
    }
  });

  if (overflow.length > 0) {
    const first = overflow[0]!;
    result.push({
      ...first,
      title: `他 ${overflow.length} 件`,
      column: 2,
      overflowCount: overflow.length,
      overflowEvents: overflow,
    });
  }

  return result;
}

/** 曜日別にイベントをグループ化 (CAL-02 §4.3 で使用)。key = YYYY-MM-DD */
export function groupByDate(events: readonly CalendarEvent[]): Record<string, CalendarEvent[]> {
  const result: Record<string, CalendarEvent[]> = {};
  for (const e of events) {
    const key = e.occurrenceDate ?? formatDateString(new Date(e.startAt));
    (result[key] = result[key] ?? []).push(e);
  }
  return result;
}
