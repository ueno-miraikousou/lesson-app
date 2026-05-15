/**
 * L2 integration test: NOTIF-01 トグル → scheduler 再構築連動 (Phase D Sprint 3 D3-T05)。
 *
 * 検証 (ADR-008 §4.3):
 *   - prefs トグル変更 → updateNotificationPreferences 成功 → rescheduleAllNotifications 呼出
 *   - 失敗時 (DB error) は scheduler を呼ばない
 *   - householdId が null の場合は scheduler 呼出抑止
 *
 * 注: 画面の細かい a11y は他テストで担保、本 test は side-effect chain のみ検証。
 */

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import NotificationsScreen from '../index';
import * as scheduler from '../../../../features/notifications/scheduler';
import * as notificationPreferencesLib from '../../../../lib/notification-preferences';
import { useAuthStore } from '../../../../stores/auth-store';
import { renderWithProviders } from '../../../../test-utils/renderWithProviders';
import type { NotificationPreferences } from '../../../../types/database';

jest.mock('../../../../features/notifications/scheduler', () => ({
  rescheduleAllNotifications: jest.fn(() => Promise.resolve({ scheduled: 0, skipped: 0 })),
}));

jest.mock('../../../../lib/notification-preferences', () => {
  const actual = jest.requireActual('../../../../lib/notification-preferences');
  return {
    ...actual,
    fetchNotificationPreferences: jest.fn(),
    updateNotificationPreferences: jest.fn(),
  };
});

const PREFS: NotificationPreferences = {
  id: 'pref-1',
  auth_user_id: 'uid-1',
  reminder_day_before_enabled: true,
  reminder_day_before_time: '21:00:00',
  reminder_same_day_enabled: true,
  reminder_same_day_minutes: 30,
  include_items_in_notification: true,
  skip_when_all_items_checked: false,
  lock_screen_privacy_mode: false,
  sound_enabled: true,
  celebration_sound_enabled: false,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
};

const fetchMock = notificationPreferencesLib.fetchNotificationPreferences as jest.Mock;
const updateMock = notificationPreferencesLib.updateNotificationPreferences as jest.Mock;
const rescheduleMock = scheduler.rescheduleAllNotifications as jest.Mock;

beforeEach(() => {
  fetchMock.mockReset();
  updateMock.mockReset();
  rescheduleMock.mockReset();
  fetchMock.mockResolvedValue(PREFS);
  updateMock.mockResolvedValue({ ...PREFS, reminder_day_before_enabled: false });
  rescheduleMock.mockResolvedValue({ scheduled: 0, skipped: 0 });
  useAuthStore.setState({
    householdId: 'hh-1',
    session: null,
    wizardCompleted: true,
    isHydrating: false,
  });
});

afterEach(() => {
  useAuthStore.getState().reset();
});

describe('NotificationsScreen × scheduler 再構築連動', () => {
  it('前日通知トグル切替 → DB 成功 → rescheduleAllNotifications(householdId) 呼出', async () => {
    renderWithProviders(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByLabelText('前日通知')).toBeTruthy());

    const toggle = screen.getByLabelText('前日通知');
    await act(async () => {
      fireEvent.press(toggle);
    });

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    // 「ON→OFF」patch が含まれるか
    expect(updateMock.mock.calls[0][0]).toMatchObject({
      reminder_day_before_enabled: false,
    });

    await waitFor(() => expect(rescheduleMock).toHaveBeenCalledWith('hh-1'));
  });

  it('updateNotificationPreferences 失敗時は rescheduleAllNotifications を呼ばない', async () => {
    updateMock.mockRejectedValue(new Error('DB error'));
    renderWithProviders(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByLabelText('前日通知')).toBeTruthy());

    const toggle = screen.getByLabelText('前日通知');
    await act(async () => {
      fireEvent.press(toggle);
    });

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(rescheduleMock).not.toHaveBeenCalled();
  });

  it('householdId 未設定なら scheduler 呼出抑止 (画面表示は維持)', async () => {
    useAuthStore.setState({
      householdId: null,
      session: null,
      wizardCompleted: true,
      isHydrating: false,
    });
    renderWithProviders(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByLabelText('前日通知')).toBeTruthy());

    const toggle = screen.getByLabelText('前日通知');
    await act(async () => {
      fireEvent.press(toggle);
    });

    await waitFor(() => expect(updateMock).toHaveBeenCalled());
    expect(rescheduleMock).not.toHaveBeenCalled();
  });

  it('当日通知トグル切替も scheduler 再構築をトリガ', async () => {
    renderWithProviders(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByLabelText('当日通知')).toBeTruthy());

    const toggle = screen.getByLabelText('当日通知');
    await act(async () => {
      fireEvent.press(toggle);
    });

    await waitFor(() => expect(rescheduleMock).toHaveBeenCalledWith('hh-1'));
  });

  it('持ち物統合トグル切替も scheduler 再構築をトリガ', async () => {
    renderWithProviders(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByLabelText('持ち物を含める')).toBeTruthy());

    const toggle = screen.getByLabelText('持ち物を含める');
    await act(async () => {
      fireEvent.press(toggle);
    });

    await waitFor(() => expect(rescheduleMock).toHaveBeenCalledWith('hh-1'));
  });
});
