import { parseRRule } from './parse';
import { WEEKDAYS_JA, type RecurrenceWeekday } from './types';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * RRULE 文字列を日本語の自然言語表記に変換する (ADR-005 §2.5 採用案)。
 *
 * カバーするパターン:
 *   - 毎週 X 曜・X 曜 (FREQ=WEEKLY;BYDAY=...)
 *   - 毎月 N 日 (FREQ=MONTHLY;BYMONTHDAY=N)
 *   - 毎月第 N X 曜日 (FREQ=MONTHLY;BYDAY=NX)
 *   - UNTIL 指定があれば「YYYY/MM/DD まで」を後置
 *
 * 開始時刻 (HH:MM) は dtstart から取得して「HH:MM から」を末尾に追加。
 * パターン外は fallback で英語風表記 (「繰り返し」のみ)。
 */
export function describeRRuleJa(rruleStr: string, dtstartFloating: Date): string {
  const rule = parseRRule(rruleStr);
  const time = `${pad(dtstartFloating.getHours())}:${pad(dtstartFloating.getMinutes())}`;
  const untilSuffix = rule.until ? describeUntil(rule.until) : '';

  if (rule.freq === 'WEEKLY' && rule.byday && rule.byday.length > 0) {
    const labels = rule.byday.map((d) => WEEKDAYS_JA[d as RecurrenceWeekday]).join('・');
    return `毎週${labels}曜日、${time} から${untilSuffix}`;
  }

  if (rule.freq === 'MONTHLY' && rule.bymonthday !== undefined) {
    return `毎月${rule.bymonthday}日、${time} から${untilSuffix}`;
  }

  if (
    rule.freq === 'MONTHLY' &&
    rule.byday &&
    rule.byday.length === 1 &&
    rule.bysetpos !== undefined
  ) {
    const day = WEEKDAYS_JA[rule.byday[0] as RecurrenceWeekday];
    return `毎月第${rule.bysetpos}${day}曜日、${time} から${untilSuffix}`;
  }

  return `繰り返し、${time} から${untilSuffix}`;
}

function describeUntil(until: Date): string {
  return ` (${until.getFullYear()}/${pad(until.getMonth() + 1)}/${pad(until.getDate())} まで)`;
}
