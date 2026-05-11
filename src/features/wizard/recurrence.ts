/**
 * 繰り返し予定 (schedules.recurrence_rule) の組み立てロジック。
 *
 * 切り出し理由:
 *   - WIZ-03 で複数曜日 → RRULE 1 行という設計判断 (designer v0.3 §WIZ-03 ターン2 確定)
 *     が背後にあるため、テスト対象として独立しているとリグレッションが見つけやすい
 *   - commit-wizard.ts 内に置いていると Supabase クライアントを mock しないと
 *     テストできないが、純関数として独立させればテストも自明
 *
 * 参照:
 *   - 02_設計/画面/WIZ-ウィザード一括設計.md §WIZ-03 (RRULE BYDAY カンマ区切り)
 *   - 02_設計/アーキテクチャ.md §schedules.recurrence_rule (RFC 5545)
 */

import type { WizardScheduleSlot } from '../../stores/wizard-store';

const DAY_MAP: Record<WizardScheduleSlot['daysOfWeek'][number], number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

/**
 * RFC 5545 RRULE 文字列を組み立てる。
 *
 * 仕様:
 *   - daysOfWeek 空 → null (RRULE 無し = 単発予定 / DB nullable)
 *   - 1 曜日 → `FREQ=WEEKLY;BYDAY=MO`
 *   - 複数曜日 → `FREQ=WEEKLY;BYDAY=MO,TH`
 *   - 重複曜日は dedupe して 1 回だけ含める (UI 側のバグ耐性)
 *   - 並び順は入力順を保持 (rrule.js は順序非依存だが、テスト容易性のため安定化)
 */
export function buildRecurrenceRule(slot: WizardScheduleSlot): string | null {
  if (slot.daysOfWeek.length === 0) return null;
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const d of slot.daysOfWeek) {
    if (!seen.has(d)) {
      seen.add(d);
      ordered.push(d);
    }
  }
  return `FREQ=WEEKLY;BYDAY=${ordered.join(',')}`;
}

/**
 * RRULE から始まる「次の発生日時」を計算する。
 *
 * 動作:
 *   - 与えられた `now` の曜日と、対象曜日のうち最も近い未来曜日を選ぶ
 *   - 同じ曜日で開始時刻が未来 → 今日のその時刻
 *   - 同じ曜日で開始時刻が過去 → 来週同曜日のその時刻
 *   - 対象曜日が空 → 入力された now をそのまま返す (フォールバック)
 *
 * 注意: TZ は `now` のローカルタイムをそのまま使う。UTC 変換は呼出側責任。
 */
export function nextOccurrenceStart(
  slot: WizardScheduleSlot,
  now: Date = new Date(),
): Date {
  const targets = slot.daysOfWeek
    .map((d) => DAY_MAP[d])
    .filter((n): n is number => n != null);
  if (targets.length === 0) return now;

  const today = now.getDay();
  const sorted = [...new Set(targets)].sort((a, b) => a - b);

  const [h = 0, m = 0] = slot.startTime.split(':').map((n) => parseInt(n, 10));

  // 今日が対象曜日かつ未来時刻なら今日を返す
  if (sorted.includes(today)) {
    const candidate = new Date(now);
    candidate.setHours(h, m, 0, 0);
    if (candidate > now) return candidate;
  }

  // それ以外は最短の未来曜日を選ぶ (1〜7 日後)
  let bestOffset = 8;
  for (const t of sorted) {
    const diff = ((t - today + 7) % 7) || 7; // 0 (=今日) は 7 に置換 = 来週同曜日
    if (diff < bestOffset) bestOffset = diff;
  }
  const result = new Date(now);
  result.setDate(result.getDate() + bestOffset);
  result.setHours(h, m, 0, 0);
  return result;
}

/**
 * 終了日時の合成。同日の `HH:mm` を `start` の日付に重ねる。
 * 終了時刻が開始時刻より早い場合 (深夜越え) は呼出側で判断・調整すること。
 */
export function combineDateTime(date: Date, hhmm: string): Date {
  const [h = 0, m = 0] = hhmm.split(':').map((n) => parseInt(n, 10));
  const result = new Date(date);
  result.setHours(h, m, 0, 0);
  return result;
}
