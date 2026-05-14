import { memberPalette } from '../theme/colors';
import type { Member } from '../types/database';
import type { ScheduleOccurrence } from './recurrence';

export type DateString = string;

const TWO = 2;

function pad(n: number): string {
  return String(n).padStart(TWO, '0');
}

export function formatYearMonth(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function formatDateString(date: Date): DateString {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateString(value: DateString): Date {
  const [y, m, d] = value.split('-').map((n) => parseInt(n, 10));
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1, 0, 0, 0, 0);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * S-05: members.color_hex が未設定 (空文字 or 既定 fallback) のメンバーに
 * memberPalette から色をアサインする。
 *
 * アルゴリズム:
 *   1. sort_order 昇順で安定化 (同 sort_order は id で安定化)
 *   2. 既に有効な color_hex (#RRGGBB) が設定済みなら尊重
 *   3. 未設定メンバーには memberPalette[i % length] を割当
 *   4. 隣接メンバーで同色になる場合は +1 シフトで衝突を緩和 (循環時)
 */
const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export interface MemberColorAssignment {
  memberId: string;
  colorHex: string;
}

export function assignMemberColors(members: readonly Member[]): MemberColorAssignment[] {
  const sorted = [...members].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id < b.id ? -1 : 1;
  });

  const result: MemberColorAssignment[] = [];
  const palette = memberPalette;

  sorted.forEach((m, index) => {
    if (HEX_PATTERN.test(m.color_hex)) {
      result.push({ memberId: m.id, colorHex: m.color_hex });
      return;
    }
    let candidate = palette[index % palette.length] as string;
    const prev = result[result.length - 1];
    if (prev && prev.colorHex.toLowerCase() === candidate.toLowerCase()) {
      candidate = palette[(index + 1) % palette.length] as string;
    }
    result.push({ memberId: m.id, colorHex: candidate });
  });

  return result;
}

/**
 * MarkedDates 生成 (react-native-calendars 多点マーカー)。
 * 各日に当日 occur する schedule の member 色を最大 maxDots 個まで反映。
 */
export interface MarkedDate {
  dots: { key: string; color: string }[];
  selected?: boolean;
  selectedColor?: string;
}

export type MarkedDates = Record<DateString, MarkedDate>;

export function buildMarkedDates(
  occurrences: readonly ScheduleOccurrence[],
  memberColorByLessonId: Map<string, string>,
  selectedDate: DateString | null,
  options: { maxDots?: number; selectedColor?: string } = {},
): MarkedDates {
  const maxDots = options.maxDots ?? 3;
  const result: MarkedDates = {};

  for (const occ of occurrences) {
    const date = occ.occurrenceDate;
    const color = memberColorByLessonId.get(occ.schedule.lesson_id) ?? '#999999';
    const entry = result[date] ?? { dots: [] };
    if (entry.dots.length < maxDots) {
      entry.dots.push({ key: `${occ.schedule.id}-${entry.dots.length}`, color });
    }
    result[date] = entry;
  }

  if (selectedDate) {
    const existing = result[selectedDate] ?? { dots: [] };
    result[selectedDate] = {
      ...existing,
      selected: true,
      selectedColor: options.selectedColor ?? '#FF8FA3',
    };
  }
  return result;
}

// 後方互換性: ScheduleWithMember / ScheduleOccurrence / expandSchedules は
// src/lib/recurrence から re-export (旧 import 経路を維持)。
// ADR-005 §4.1 ディレクトリ構成に従い RRULE 関連は recurrence/ 配下に集約。
export { expandSchedules } from './recurrence';
export type { ScheduleWithMember, ScheduleOccurrence } from './recurrence';
