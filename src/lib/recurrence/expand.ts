import { RRule } from 'rrule';

import { toFloatingJST } from './tz';
import type { Schedule } from '../../types/database';

export interface ScheduleWithMember<TExtra = Record<string, unknown>> extends Schedule {
  member_id: string;
  extra?: TExtra;
}

export interface ScheduleOccurrence<TExtra = Record<string, unknown>> {
  schedule: ScheduleWithMember<TExtra>;
  occurrenceDate: string;
  startAt: Date;
  endAt: Date;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateString(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toICalUTCString(date: Date): string {
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `T${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}Z`
  );
}

/**
 * 「JST 壁時計表現の Date」(`floatingDate`) を、rrule.js が UTC として解釈する
 * DTSTART 文字列に変換する。
 *
 * rrule.js v2 は DTSTART を常に UTC として扱うため、壁時計の各成分 (年/月/日/時/分/秒) を
 * そのまま UTC として与えると、`rule.between` 出力も「壁時計表現の UTC 値」になる。
 * その後 {@link reconstituteFloating} で local Date に戻すことで、TZ 無依存の挙動を得る。
 */
function toRRuleString(rule: string, dtstartFloating: Date): string {
  if (rule.includes('DTSTART')) return rule;
  const stamp = toICalUTCString(dtstartFloating);
  const prefix = rule.startsWith('RRULE:') ? '' : 'RRULE:';
  return `DTSTART:${stamp}\n${prefix}${rule}`;
}

/**
 * rrule.js が出力する UTC Date を、壁時計表現の local Date に復元する。
 *
 * 例: rrule.js が `Mon May 04 2026 17:00:00 UTC` を返したら → `new Date(2026, 4, 4, 17, 0, 0)`
 * 端末 TZ に関わらず、5/4 月曜 17:00 として扱える。
 */
function reconstituteFloating(utcDate: Date): Date {
  return new Date(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth(),
    utcDate.getUTCDate(),
    utcDate.getUTCHours(),
    utcDate.getUTCMinutes(),
    utcDate.getUTCSeconds(),
  );
}

/**
 * 壁時計表現の local Date を、rrule.js の `between` に渡すための UTC Date に変換する。
 *
 * 例: `new Date(2026, 4, 1, 0, 0)` (= 2026-05-01 00:00 JST) → `new Date(Date.UTC(2026, 4, 1, 0, 0))`
 */
function asRRuleRangeBound(floatingDate: Date): Date {
  return new Date(Date.UTC(
    floatingDate.getFullYear(),
    floatingDate.getMonth(),
    floatingDate.getDate(),
    floatingDate.getHours(),
    floatingDate.getMinutes(),
    floatingDate.getSeconds(),
  ));
}

/**
 * RRULE 展開: schedules を [rangeStart, rangeEnd] に含まれる occurrence の配列に展開する。
 *
 * ADR-005 §2.2 採用案 (ハイブリッド展開、表示時 rrule.js + JST floating-time):
 *   - recurrence_rule = null: 開始日が範囲内なら 1 件
 *   - recurrence_rule あり: rrule.js で展開、recurrence_until 以前のみ
 *   - DTSTART / between() ともに「JST 壁時計表現」で揃え、TZ ずれを排除
 *
 * 月跨ぎ予定 (start_at と end_at が別日) は開始日のみで 1 件としてカウント (WBS S-01 AC エッジケース)。
 *
 * 端末 TZ が UTC でも JST でも同じ結果 (toFloatingJST が UTC ISO → JST 壁時計 Date に変換し、
 * rangeStart / rangeEnd は呼び出し側で JST 壁時計表現の Date として渡される想定)。
 */
export function expandSchedules<TExtra = Record<string, unknown>>(
  schedules: readonly ScheduleWithMember<TExtra>[],
  rangeStart: Date,
  rangeEnd: Date,
): ScheduleOccurrence<TExtra>[] {
  const occurrences: ScheduleOccurrence<TExtra>[] = [];
  for (const s of schedules) {
    const startFloating = toFloatingJST(s.start_at);
    const endFloating = toFloatingJST(s.end_at);
    const durationMs = endFloating.getTime() - startFloating.getTime();

    if (!s.recurrence_rule) {
      if (startFloating >= rangeStart && startFloating <= rangeEnd) {
        occurrences.push({
          schedule: s,
          occurrenceDate: formatDateString(startFloating),
          startAt: startFloating,
          endAt: endFloating,
        });
      }
      continue;
    }

    let rule: RRule;
    try {
      rule = RRule.fromString(toRRuleString(s.recurrence_rule, startFloating));
    } catch {
      continue;
    }

    const untilFloating = s.recurrence_until ? toFloatingJST(s.recurrence_until) : null;
    const effectiveEnd = untilFloating && untilFloating < rangeEnd ? untilFloating : rangeEnd;
    const dates = rule.between(
      asRRuleRangeBound(rangeStart),
      asRRuleRangeBound(effectiveEnd),
      true,
    );
    for (const occUtc of dates) {
      const occStart = reconstituteFloating(occUtc);
      const occEnd = new Date(occStart.getTime() + durationMs);
      occurrences.push({
        schedule: s,
        occurrenceDate: formatDateString(occStart),
        startAt: occStart,
        endAt: occEnd,
      });
    }
  }
  return occurrences;
}
