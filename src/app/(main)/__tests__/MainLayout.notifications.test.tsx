/**
 * L2 integration test: (main)/_layout.tsx 通知ハンドラ起動 (Phase D Sprint 3 D3-T01)。
 *
 * 検証 (ADR-008 §4.4):
 *   - householdId 有り → reconcileNotifications(householdId) 呼出
 *   - householdId 未設定 → reconcileNotifications 呼出抑止
 *   - mount で installNotificationResponseListener + handleColdStartNotification 起動
 *   - unmount で response listener cleanup
 */

import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import MainLayout from '../_layout';
import * as scheduler from '../../../features/notifications/scheduler';
import * as responseHandler from '../../../features/notifications/response-handler';
import { useAuthStore } from '../../../stores/auth-store';

jest.mock('../../../features/realtime/useHouseholdRealtime', () => ({
  useHouseholdRealtime: jest.fn(),
}));

jest.mock('../../../features/notifications/scheduler', () => ({
  reconcileNotifications: jest.fn(() => Promise.resolve({ scheduled: 0, skipped: 0 })),
}));

jest.mock('../../../features/notifications/response-handler', () => ({
  installNotificationResponseListener: jest.fn(() => jest.fn()),
  handleColdStartNotification: jest.fn(() => Promise.resolve(false)),
}));

const reconcileMock = scheduler.reconcileNotifications as jest.Mock;
const installListenerMock =
  responseHandler.installNotificationResponseListener as jest.Mock;
const coldStartMock = responseHandler.handleColdStartNotification as jest.Mock;

function renderWithQuery() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MainLayout />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  reconcileMock.mockClear();
  installListenerMock.mockClear();
  coldStartMock.mockClear();
});

afterEach(() => {
  useAuthStore.getState().reset();
});

describe('MainLayout × 通知ハンドラ', () => {
  it('householdId 有り → reconcileNotifications 呼出', () => {
    useAuthStore.setState({
      householdId: 'hh-1',
      session: null,
      wizardCompleted: true,
      isHydrating: false,
    });
    renderWithQuery();
    expect(reconcileMock).toHaveBeenCalledWith('hh-1');
  });

  it('householdId 未設定 → reconcileNotifications 呼ばず', () => {
    useAuthStore.setState({
      householdId: null,
      session: null,
      wizardCompleted: false,
      isHydrating: false,
    });
    renderWithQuery();
    expect(reconcileMock).not.toHaveBeenCalled();
  });

  it('mount で response listener install + cold start 呼出', () => {
    useAuthStore.setState({
      householdId: 'hh-1',
      session: null,
      wizardCompleted: true,
      isHydrating: false,
    });
    renderWithQuery();
    expect(installListenerMock).toHaveBeenCalledTimes(1);
    expect(coldStartMock).toHaveBeenCalledTimes(1);
  });

  it('unmount で response listener cleanup 呼出', () => {
    const cleanup = jest.fn();
    installListenerMock.mockReturnValue(cleanup);
    useAuthStore.setState({
      householdId: 'hh-1',
      session: null,
      wizardCompleted: true,
      isHydrating: false,
    });
    const { unmount } = renderWithQuery();
    unmount();
    expect(cleanup).toHaveBeenCalled();
  });
});
