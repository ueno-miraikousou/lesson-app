import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { CalendarScreen } from '../CalendarScreen';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { useAuthStore } from '../../stores/auth-store';
import {
  createSchedule,
  deleteSchedule,
  fetchMembersAndSchedules,
} from '../../lib/schedules';
import type { Member } from '../../types/database';
import type { ScheduleWithLesson } from '../../lib/schedules';

/**
 * CAL-01 月表示の RNTL コンポーネントテスト (Sprint 1 C1-T01/T02/T05)
 *
 * 検証範囲:
 *   - 月ヘッダー + ナビゲーション要素 (testID 経由)
 *   - データロード成功時、選択日アジェンダに該当予定が表示される
 *   - データ 0 件のとき empty-day テキスト表示
 *   - FAB タップで ScheduleFormSheet が visible になる
 *   - エラー時の再試行 UI
 */

jest.mock('../../lib/schedules', () => ({
  fetchMembersAndSchedules: jest.fn(),
  createSchedule: jest.fn(() => Promise.resolve({ id: 's-new' })),
  updateSchedule: jest.fn(() => Promise.resolve({ id: 's1' })),
  deleteSchedule: jest.fn(() => Promise.resolve()),
  truncateScheduleAt: jest.fn(() => Promise.resolve({ id: 's1' })),
  splitScheduleAt: jest.fn(() =>
    Promise.resolve({ updated: { id: 's1' }, created: { id: 's-new' } }),
  ),
}));

const mockedFetch = fetchMembersAndSchedules as jest.MockedFunction<typeof fetchMembersAndSchedules>;

// react-native-calendars は ネイティブ依存が多いため、テスト用に簡略な View に差し替え
jest.mock('react-native-calendars', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View } = require('react-native');
  return {
    Calendar: ({ children, testID }: { children?: ReactNode; testID?: string }) =>
      React.createElement(View, { testID }, children),
    LocaleConfig: { locales: {}, defaultLocale: 'ja' },
  };
});

configure({ defaultHidden: true });

function makeMember(overrides: Partial<Member> & { id: string }): Member {
  return {
    id: overrides.id,
    household_id: overrides.household_id ?? 'h1',
    name: overrides.name ?? 'M',
    birth_date: null,
    gender: null,
    role: 'child',
    color_hex: overrides.color_hex ?? '',
    notifications_muted: false,
    sort_order: overrides.sort_order ?? 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function makeSchedule(opts: {
  id: string;
  lessonId: string;
  memberId: string;
  memberName: string;
  lessonName: string;
  start: Date;
  end: Date;
}): ScheduleWithLesson {
  return {
    id: opts.id,
    lesson_id: opts.lessonId,
    start_at: opts.start.toISOString(),
    end_at: opts.end.toISOString(),
    recurrence_rule: null,
    recurrence_until: null,
    note: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    lesson: {
      id: opts.lessonId,
      member_id: opts.memberId,
      name: opts.lessonName,
      classroom_name: null,
      location: null,
    },
  };
}

beforeEach(() => {
  useAuthStore.setState({
    session: null,
    householdId: 'h1',
    wizardCompleted: true,
    isHydrating: false,
  });
});

describe('CalendarScreen', () => {
  it('ヘッダーと今日ボタン、FAB、カレンダーグリッドが表示される', async () => {
    mockedFetch.mockResolvedValueOnce({ members: [], schedules: [] });

    renderWithProviders(<CalendarScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('calendar-header')).toBeTruthy();
    });
    expect(screen.getByTestId('calendar-go-today')).toBeTruthy();
    expect(screen.getByTestId('calendar-grid')).toBeTruthy();
    expect(screen.getByTestId('calendar-fab')).toBeTruthy();
  });

  it('当月 0 件のとき empty-month CTA が表示される', async () => {
    mockedFetch.mockResolvedValueOnce({ members: [], schedules: [] });

    renderWithProviders(<CalendarScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('calendar-empty-month')).toBeTruthy();
    });
  });

  it('当月に他日 schedule あり、選択日 0 件のとき empty-day メッセージ', async () => {
    const today = new Date();
    // 当月内の別日 (今日 + 1 ヶ月だと別月になるので、同月の翌日)
    const sameMonthOtherDay = new Date(today);
    const dayOffset = today.getDate() === 1 ? 1 : -1;
    sameMonthOtherDay.setDate(today.getDate() + dayOffset);
    const m = makeMember({ id: 'm1', sort_order: 1 });
    const s = makeSchedule({
      id: 's-other',
      lessonId: 'l1',
      memberId: 'm1',
      memberName: 'M',
      lessonName: 'スイミング',
      start: new Date(
        sameMonthOtherDay.getFullYear(),
        sameMonthOtherDay.getMonth(),
        sameMonthOtherDay.getDate(),
        17,
        0,
      ),
      end: new Date(
        sameMonthOtherDay.getFullYear(),
        sameMonthOtherDay.getMonth(),
        sameMonthOtherDay.getDate(),
        18,
        0,
      ),
    });
    mockedFetch.mockResolvedValueOnce({ members: [m], schedules: [s] });

    renderWithProviders(<CalendarScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('calendar-empty-day')).toBeTruthy();
    });
  });

  it('当日に schedule が 1 件あればアジェンダ項目が表示される', async () => {
    const today = new Date();
    const memberId = 'm1';
    const m = makeMember({ id: memberId, name: 'すずちゃん', sort_order: 1 });
    const s = makeSchedule({
      id: 's1',
      lessonId: 'l1',
      memberId,
      memberName: 'すずちゃん',
      lessonName: 'スイミング',
      start: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 17, 0),
      end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 0),
    });
    mockedFetch.mockResolvedValueOnce({ members: [m], schedules: [s] });

    renderWithProviders(<CalendarScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('agenda-item-s1')).toBeTruthy();
    });
  });

  it('FAB タップで ScheduleFormSheet (close ボタン) が表示される', async () => {
    mockedFetch.mockResolvedValueOnce({ members: [], schedules: [] });

    renderWithProviders(<CalendarScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('calendar-fab')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('calendar-fab'));

    await waitFor(() => {
      expect(screen.getByTestId('schedule-form-close')).toBeTruthy();
    });
  });

  it('fetch が reject したらエラー UI が表示される', async () => {
    mockedFetch.mockRejectedValueOnce(new Error('rls-denied'));

    renderWithProviders(<CalendarScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('calendar-error')).toBeTruthy();
    });
  });

  describe('Sprint 2 C2-T03/T04 編集削除フロー', () => {
    function setupSingleSchedule() {
      const today = new Date();
      const m = makeMember({ id: 'm1', name: 'すずちゃん', sort_order: 1 });
      const s = makeSchedule({
        id: 's1',
        lessonId: 'l1',
        memberId: 'm1',
        memberName: 'すずちゃん',
        lessonName: 'スイミング',
        start: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 17, 0),
        end: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 18, 0),
      });
      mockedFetch.mockResolvedValueOnce({ members: [m], schedules: [s] });
    }

    it('agenda item タップで ActionSheet が表示される', async () => {
      setupSingleSchedule();
      renderWithProviders(<CalendarScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('agenda-item-s1')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('agenda-item-s1'));

      await waitFor(() => {
        expect(screen.getByTestId('schedule-action-sheet')).toBeTruthy();
      });
      expect(screen.getByTestId('schedule-action-edit-all')).toBeTruthy();
      expect(screen.getByTestId('schedule-action-delete')).toBeTruthy();
    });

    it('単発予定では「今後すべて編集」ボタンは出ない', async () => {
      setupSingleSchedule();
      renderWithProviders(<CalendarScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('agenda-item-s1')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('agenda-item-s1'));

      await waitFor(() => {
        expect(screen.getByTestId('schedule-action-sheet')).toBeTruthy();
      });
      expect(screen.queryByTestId('schedule-action-edit-future')).toBeNull();
    });

    it('編集ボタンタップで ScheduleFormSheet が編集モードで表示される', async () => {
      setupSingleSchedule();
      renderWithProviders(<CalendarScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('agenda-item-s1')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('agenda-item-s1'));
      await waitFor(() => {
        expect(screen.getByTestId('schedule-action-sheet')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('schedule-action-edit-all'));

      await waitFor(() => {
        expect(screen.getByText('予定を編集')).toBeTruthy();
      });
    });

    it('削除ボタン → 確認 dialog → 削除実行 → Undo Toast 表示', async () => {
      setupSingleSchedule();
      renderWithProviders(<CalendarScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('agenda-item-s1')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('agenda-item-s1'));
      fireEvent.press(await screen.findByTestId('schedule-action-delete'));

      await waitFor(() => {
        expect(screen.getByTestId('schedule-delete-confirm')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('schedule-delete-confirm-all'));

      await waitFor(() => {
        expect(screen.getByTestId('undo-toast')).toBeTruthy();
      });
      expect(deleteSchedule).toHaveBeenCalledWith('s1');
    });

    it('Undo Toast の「元に戻す」で createSchedule が呼ばれる', async () => {
      setupSingleSchedule();
      renderWithProviders(<CalendarScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('agenda-item-s1')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('agenda-item-s1'));
      fireEvent.press(await screen.findByTestId('schedule-action-delete'));
      fireEvent.press(await screen.findByTestId('schedule-delete-confirm-all'));

      await waitFor(() => {
        expect(screen.getByTestId('undo-toast-action')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('undo-toast-action'));

      await waitFor(() => {
        expect(createSchedule).toHaveBeenCalled();
      });
      expect(deleteSchedule).toHaveBeenCalledTimes(1);
    });
  });

  describe('Sprint 3 C3-T01/T02/T03 週表示 + フィルタ', () => {
    it('月 ↔ 週 切替で WeekTimelineView が表示される', async () => {
      mockedFetch.mockResolvedValueOnce({ members: [], schedules: [] });
      renderWithProviders(<CalendarScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('calendar-view-toggle')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('calendar-view-toggle'));

      await waitFor(() => {
        expect(screen.getByTestId('week-timeline')).toBeTruthy();
      });
      expect(screen.getByTestId('week-nav-prev')).toBeTruthy();
      expect(screen.getByTestId('week-nav-next')).toBeTruthy();
    });

    it('フィルタボタンタップで member-filter-sheet が表示される', async () => {
      const m = makeMember({ id: 'm1', name: 'すずちゃん', sort_order: 1 });
      mockedFetch.mockResolvedValueOnce({ members: [m], schedules: [] });
      renderWithProviders(<CalendarScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('calendar-filter-open')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('calendar-filter-open'));

      await waitFor(() => {
        expect(screen.getByTestId('member-filter-sheet')).toBeTruthy();
      });
      expect(screen.getByTestId('member-filter-chip-m1')).toBeTruthy();
      expect(screen.getByTestId('member-filter-show-all')).toBeTruthy();
      expect(screen.getByTestId('member-filter-hide-all')).toBeTruthy();
    });

    it('メンバーチップタップで accessibilityState.checked が切り替わる', async () => {
      const m = makeMember({ id: 'm1', name: 'すずちゃん', sort_order: 1 });
      mockedFetch.mockResolvedValueOnce({ members: [m], schedules: [] });
      renderWithProviders(<CalendarScreen />);

      await waitFor(() => {
        expect(screen.getByTestId('calendar-filter-open')).toBeTruthy();
      });
      fireEvent.press(screen.getByTestId('calendar-filter-open'));

      const chip = await screen.findByTestId('member-filter-chip-m1');
      expect(chip.props.accessibilityState?.checked).toBe(true);
      fireEvent.press(chip);

      await waitFor(() => {
        const refreshed = screen.getByTestId('member-filter-chip-m1');
        expect(refreshed.props.accessibilityState?.checked).toBe(false);
      });
    });
  });
});
