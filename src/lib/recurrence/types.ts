export type RecurrenceFreq = 'WEEKLY' | 'MONTHLY';
export type RecurrenceWeekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  byday?: RecurrenceWeekday[];
  bymonthday?: number;
  bysetpos?: number;
  until?: Date;
}

export const WEEKDAY_ORDER: readonly RecurrenceWeekday[] = [
  'SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA',
];

export const WEEKDAYS_JA: Record<RecurrenceWeekday, string> = {
  SU: '日', MO: '月', TU: '火', WE: '水', TH: '木', FR: '金', SA: '土',
};
