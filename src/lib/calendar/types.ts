/**
 * カレンダー表示用の共通イベント型。
 * ADR-004 §4.3 ラッパー層の API。
 * 採用ライブラリ (`react-native-calendars` の `Timeline`) 非依存。
 */
export interface CalendarEvent {
  id: string;
  title: string;
  /** ISO8601 UTC、または「JST 壁時計表現の Date」.toISOString() */
  startAt: string;
  endAt: string;
  /** メンバー識別カラー (#RRGGBB) */
  memberColor: string;
  /** 表示用補助 (メンバー名 / レッスン名 / 場所) */
  memberName?: string;
  lessonName?: string;
  location?: string | null;
  /** スケジュール展開時の occurrence_date (YYYY-MM-DD)、重複表示の判別用 */
  occurrenceDate?: string;
}

export interface DateRange {
  start: Date;
  end: Date;
}
