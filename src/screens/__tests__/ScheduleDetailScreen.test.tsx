import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ScheduleDetailScreen } from '../ScheduleDetailScreen';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { useAuthStore } from '../../stores/auth-store';
import { fetchMembersAndSchedules } from '../../lib/schedules';
import { fetchItemsByLesson } from '../../lib/items';
import { fetchLessonById } from '../../lib/lessons';
import { fetchChecks, upsertCheck } from '../../lib/schedule-item-checks';

jest.mock('../../lib/schedules', () => ({
  fetchMembersAndSchedules: jest.fn(),
}));
jest.mock('../../lib/items', () => ({
  fetchItemsByLesson: jest.fn(),
}));
jest.mock('../../lib/lessons', () => ({
  fetchLessonById: jest.fn(),
}));
jest.mock('../../lib/schedule-item-checks', () => ({
  fetchChecks: jest.fn(() => Promise.resolve([])),
  upsertCheck: jest.fn(() => Promise.resolve({ id: 'c1' })),
  bulkSetChecks: jest.fn(() => Promise.resolve()),
}));
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({
    scheduleId: 's1',
    occurrenceDate: '2026-05-14',
  })),
}));

const mockedFetchSchedule = fetchMembersAndSchedules as jest.MockedFunction<
  typeof fetchMembersAndSchedules
>;
const mockedFetchItems = fetchItemsByLesson as jest.MockedFunction<typeof fetchItemsByLesson>;
const mockedFetchLesson = fetchLessonById as jest.MockedFunction<typeof fetchLessonById>;
const mockedUpsertCheck = upsertCheck as jest.MockedFunction<typeof upsertCheck>;
const mockedFetchChecks = fetchChecks as jest.MockedFunction<typeof fetchChecks>;

configure({ defaultHidden: true });

const member = {
  id: 'm1',
  household_id: 'h1',
  name: 'すずちゃん',
  birth_date: null,
  gender: null,
  role: 'child' as const,
  color_hex: '#FF6B7A',
  notifications_muted: false,
  sort_order: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const schedule = {
  id: 's1',
  lesson_id: 'l1',
  start_at: new Date(Date.UTC(2026, 4, 14, 8, 0)).toISOString(),
  end_at: new Date(Date.UTC(2026, 4, 14, 9, 0)).toISOString(),
  recurrence_rule: null,
  recurrence_until: null,
  note: '水着 + タオル',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  lesson: {
    id: 'l1',
    member_id: 'm1',
    name: 'スイミング',
    classroom_name: null,
    location: '○○プール',
  },
};

const lesson = {
  id: 'l1',
  member_id: 'm1',
  name: 'スイミング',
  classroom_name: null,
  location: null,
  monthly_fee: null,
  notifications_muted: false,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  member: { id: 'm1', name: 'すずちゃん', color_hex: '#FF6B7A' },
};

beforeEach(() => {
  useAuthStore.setState({
    session: null,
    householdId: 'h1',
    wizardCompleted: true,
    isHydrating: false,
  });
});

describe('ScheduleDetailScreen', () => {
  it('予定が見つかれば title / location / memo が表示される', async () => {
    mockedFetchSchedule.mockResolvedValueOnce({ members: [member], schedules: [schedule] });
    mockedFetchLesson.mockResolvedValueOnce(lesson);
    mockedFetchItems.mockResolvedValueOnce([]);
    mockedFetchChecks.mockResolvedValueOnce([]);

    renderWithProviders(<ScheduleDetailScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('schedule-detail-title')).toBeTruthy();
    });
    expect(screen.getByText('スイミング')).toBeTruthy();
    expect(screen.getByText('○○プール')).toBeTruthy();
    expect(screen.getByText('水着 + タオル')).toBeTruthy();
  });

  it('items 0 件で 「持ち物を登録する」 ボタン表示', async () => {
    mockedFetchSchedule.mockResolvedValueOnce({ members: [member], schedules: [schedule] });
    mockedFetchLesson.mockResolvedValueOnce(lesson);
    mockedFetchItems.mockResolvedValueOnce([]);
    mockedFetchChecks.mockResolvedValueOnce([]);

    renderWithProviders(<ScheduleDetailScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('schedule-detail-items-empty')).toBeTruthy();
    });
    expect(screen.getByTestId('schedule-detail-items-register')).toBeTruthy();
  });

  it('items 2 件あれば checkbox が表示される', async () => {
    mockedFetchSchedule.mockResolvedValueOnce({ members: [member], schedules: [schedule] });
    mockedFetchLesson.mockResolvedValueOnce(lesson);
    mockedFetchItems.mockResolvedValueOnce([
      {
        id: 'i1',
        lesson_id: 'l1',
        name: '水着',
        sort_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'i2',
        lesson_id: 'l1',
        name: 'タオル',
        sort_order: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
    mockedFetchChecks.mockResolvedValueOnce([]);

    renderWithProviders(<ScheduleDetailScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('schedule-detail-check-i1')).toBeTruthy();
    });
    expect(screen.getByTestId('schedule-detail-check-i2')).toBeTruthy();
    expect(screen.getByTestId('schedule-detail-check-all')).toBeTruthy();
    expect(screen.getByTestId('schedule-detail-uncheck-all')).toBeTruthy();
  });

  it('チェックボックスタップで upsertCheck が呼ばれる', async () => {
    mockedFetchSchedule.mockResolvedValueOnce({ members: [member], schedules: [schedule] });
    mockedFetchLesson.mockResolvedValueOnce(lesson);
    mockedFetchItems.mockResolvedValueOnce([
      {
        id: 'i1',
        lesson_id: 'l1',
        name: '水着',
        sort_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
    mockedFetchChecks.mockResolvedValueOnce([]);

    renderWithProviders(<ScheduleDetailScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('schedule-detail-check-i1')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('schedule-detail-check-i1'));

    await waitFor(() => {
      expect(mockedUpsertCheck).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduleId: 's1',
          itemId: 'i1',
          occurrenceDate: '2026-05-14',
          checked: true,
        }),
      );
    });
  });

  it('初期状態でチェック済の item は accessibilityState.checked=true', async () => {
    mockedFetchSchedule.mockResolvedValueOnce({ members: [member], schedules: [schedule] });
    mockedFetchLesson.mockResolvedValueOnce(lesson);
    mockedFetchItems.mockResolvedValueOnce([
      {
        id: 'i1',
        lesson_id: 'l1',
        name: '水着',
        sort_order: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);
    mockedFetchChecks.mockResolvedValueOnce([
      {
        id: 'c1',
        schedule_id: 's1',
        item_id: 'i1',
        occurrence_date: '2026-05-14',
        checked: true,
        checked_at: new Date().toISOString(),
        checked_by_member: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ]);

    renderWithProviders(<ScheduleDetailScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('schedule-detail-check-i1')).toBeTruthy();
    });
    const checkbox = screen.getByTestId('schedule-detail-check-i1');
    expect(checkbox.props.accessibilityState?.checked).toBe(true);
  });

  it('schedule が見つからない場合エラー表示', async () => {
    mockedFetchSchedule.mockResolvedValueOnce({ members: [], schedules: [] });
    renderWithProviders(<ScheduleDetailScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('schedule-detail-error')).toBeTruthy();
    });
  });
});
