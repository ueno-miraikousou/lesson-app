import type { RecurrenceFreq, RecurrenceRule, RecurrenceWeekday } from './types';

const VALID_WEEKDAYS: readonly RecurrenceWeekday[] = [
  'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU',
];

function isValidWeekday(s: string): s is RecurrenceWeekday {
  return (VALID_WEEKDAYS as readonly string[]).includes(s);
}

/**
 * RFC 5545 風 RRULE 文字列を {@link RecurrenceRule} JSON に parse する。
 *
 * 対応: FREQ / BYDAY / BYMONTHDAY / BYSETPOS / UNTIL
 * 非対応 (MVP 範囲外): COUNT / INTERVAL / WKST / EXDATE
 *
 * Sprint 2 範囲 (S-08 AC2/AC3) に必要なパターンのみを扱う:
 *   - "FREQ=WEEKLY;BYDAY=MO" / "FREQ=WEEKLY;BYDAY=MO,TH"
 *   - "FREQ=MONTHLY;BYMONTHDAY=15"
 *   - "FREQ=MONTHLY;BYDAY=2SU" (第 2 日曜)
 *   - "FREQ=WEEKLY;BYDAY=MO;UNTIL=20260701T000000Z"
 */
export function parseRRule(rruleStr: string): RecurrenceRule {
  const trimmed = rruleStr.replace(/^RRULE:/i, '').trim();
  const parts = trimmed.split(';');
  let freq: RecurrenceFreq = 'WEEKLY';
  let byday: RecurrenceWeekday[] | undefined;
  let bymonthday: number | undefined;
  let bysetpos: number | undefined;
  let until: Date | undefined;

  for (const part of parts) {
    const [key, valueRaw] = part.split('=');
    if (!key || !valueRaw) continue;
    const value = valueRaw.trim();
    const upperKey = key.trim().toUpperCase();

    switch (upperKey) {
      case 'FREQ':
        if (value === 'WEEKLY' || value === 'MONTHLY') freq = value;
        break;
      case 'BYDAY': {
        const days: RecurrenceWeekday[] = [];
        for (const token of value.split(',')) {
          const match = token.match(/^(-?\d+)?([A-Z]{2})$/);
          if (!match) continue;
          const ord = match[1];
          const day = match[2];
          if (day && isValidWeekday(day)) {
            days.push(day);
            if (ord && !bysetpos) bysetpos = parseInt(ord, 10);
          }
        }
        if (days.length > 0) byday = days;
        break;
      }
      case 'BYMONTHDAY':
        bymonthday = parseInt(value, 10);
        break;
      case 'BYSETPOS':
        bysetpos = parseInt(value, 10);
        break;
      case 'UNTIL':
        until = parseICalDate(value);
        break;
      default:
        break;
    }
  }

  return { freq, byday, bymonthday, bysetpos, until };
}

/**
 * {@link RecurrenceRule} JSON を RFC 5545 風 RRULE 文字列に serialize する。
 * 出力例: `FREQ=WEEKLY;BYDAY=MO,TH;UNTIL=20260701T000000Z`
 *
 * `RRULE:` prefix は付けない (DTSTART と合わせる呼び出し側で付与する想定)。
 */
export function serializeRRule(rule: RecurrenceRule): string {
  const parts: string[] = [`FREQ=${rule.freq}`];
  if (rule.byday && rule.byday.length > 0) {
    if (rule.freq === 'MONTHLY' && rule.bysetpos !== undefined && rule.byday.length === 1) {
      parts.push(`BYDAY=${rule.bysetpos}${rule.byday[0]}`);
    } else {
      parts.push(`BYDAY=${rule.byday.join(',')}`);
    }
  }
  if (rule.bymonthday !== undefined) parts.push(`BYMONTHDAY=${rule.bymonthday}`);
  if (rule.until) parts.push(`UNTIL=${formatICalDate(rule.until)}`);
  return parts.join(';');
}

function parseICalDate(value: string): Date | undefined {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
  if (!m) return undefined;
  const [, y, mo, d, hh = '0', mm = '0', ss = '0'] = m;
  return new Date(Date.UTC(
    parseInt(y ?? '1970', 10),
    parseInt(mo ?? '1', 10) - 1,
    parseInt(d ?? '1', 10),
    parseInt(hh, 10),
    parseInt(mm, 10),
    parseInt(ss, 10),
  ));
}

function formatICalDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}
