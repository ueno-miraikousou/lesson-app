const JST_OFFSET_HOURS = 9;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * UTC ISO 文字列を「JST の壁時計表現」のままで Date オブジェクト化する。
 *
 * 例: "2026-05-14T08:00:00Z" (UTC) → JST 17:00 → new Date(2026, 4, 14, 17, 0, 0)
 *
 * これにより getHours() / getDate() 等が「JST の壁時計」として動作する。
 * ADR-005 §2.3 採用案 (UTC 保存 + JST floating-time 展開、DST なし日本前提)。
 *
 * Why:
 * - rrule.js の DTSTART は floating-time で動かす (TZID experimental 回避)
 * - between(from, to) の from/to も同じ「JST 解釈」で揃える必要あり
 * - 日本は DST なし → +09:00 固定で常に正しい
 */
export function toFloatingJST(utcIso: string): Date {
  const utc = new Date(utcIso);
  return new Date(
    utc.getUTCFullYear(),
    utc.getUTCMonth(),
    utc.getUTCDate(),
    utc.getUTCHours() + JST_OFFSET_HOURS,
    utc.getUTCMinutes(),
    utc.getUTCSeconds(),
  );
}

/**
 * `toFloatingJST` の逆操作: 壁時計表現 Date を UTC ISO に戻す。
 * 保存 (createSchedule) 時には不要だが、表示中の壁時計 Date を DB に書き戻すケースで使う。
 */
export function fromFloatingJST(jstDate: Date): string {
  const utcMs = Date.UTC(
    jstDate.getFullYear(),
    jstDate.getMonth(),
    jstDate.getDate(),
    jstDate.getHours() - JST_OFFSET_HOURS,
    jstDate.getMinutes(),
    jstDate.getSeconds(),
  );
  return new Date(utcMs).toISOString();
}

/** RRULE DTSTART 文字列 (`YYYYMMDDTHHMMSSZ` 形式、UTC) を作成。 */
export function toICalDate(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}
