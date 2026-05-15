/**
 * SHARE-04 InviteCodeAcceptScreen の L2 RNTL テスト。
 *
 * カバー範囲:
 *   - mount 時に code (params) で acceptInvitation 自動実行
 *   - 成功時: 完了画面 + auth-store.householdId 更新
 *   - 失敗時 (expired): エラー画面表示
 *   - 失敗時 (already_member): エラー画面表示
 *   - code 未指定: エラー表示 + acceptInvitation 未呼出
 *   - 形式不正: エラー表示 + acceptInvitation 未呼出
 */

import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { InviteCodeAcceptScreen } from '../InviteCodeAcceptScreen';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { useAuthStore } from '../../stores/auth-store';
import { AcceptInvitationError } from '../../lib/invitations';

const mockReplace = jest.fn();
const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn(() => ({}));

jest.mock('expo-router', () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    back: (...args: unknown[]) => mockBack(...args),
  },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

const mockAcceptInvitation = jest.fn();
jest.mock('../../lib/invitations', () => {
  const actual = jest.requireActual('../../lib/invitations');
  return {
    ...actual,
    acceptInvitation: (...args: unknown[]) => mockAcceptInvitation(...args),
  };
});

describe('InviteCodeAcceptScreen (SHARE-04)', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockBack.mockReset();
    mockAcceptInvitation.mockReset();
    mockUseLocalSearchParams.mockReset();
    useAuthStore.setState({
      householdId: null,
      session: { user: { id: 'auth-1' } } as unknown as never,
      wizardCompleted: false,
      isHydrating: false,
    });
  });

  it('code 未指定 → エラー表示 + acceptInvitation 未呼出', async () => {
    mockUseLocalSearchParams.mockReturnValue({});
    renderWithProviders(<InviteCodeAcceptScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('share-confirm-error-title')).toBeTruthy();
    });
    expect(mockAcceptInvitation).not.toHaveBeenCalled();
  });

  it('形式不正コード → エラー表示 + acceptInvitation 未呼出', async () => {
    mockUseLocalSearchParams.mockReturnValue({ code: 'abc' });
    renderWithProviders(<InviteCodeAcceptScreen />);
    await waitFor(() => {
      expect(screen.getByText('招待コードの形式が正しくありません')).toBeTruthy();
    });
    expect(mockAcceptInvitation).not.toHaveBeenCalled();
  });

  it('成功時: 完了画面 + householdId 更新 + 「カレンダーを開く」', async () => {
    mockUseLocalSearchParams.mockReturnValue({ code: '483921' });
    mockAcceptInvitation.mockResolvedValueOnce({
      householdId: 'h1',
      householdName: '山田家',
      isShared: true,
      memberId: 'm-new',
    });

    renderWithProviders(<InviteCodeAcceptScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('share-confirm-success')).toBeTruthy();
    });
    expect(screen.getByTestId('share-confirm-household-name').props.children).toBe('山田家');
    expect(useAuthStore.getState().householdId).toBe('h1');
    expect(useAuthStore.getState().wizardCompleted).toBe(true);

    fireEvent.press(screen.getByTestId('share-confirm-goto-home'));
    expect(mockReplace).toHaveBeenCalledWith('/(main)/calendar');
  });

  it('期限切れエラー → エラー画面表示', async () => {
    mockUseLocalSearchParams.mockReturnValue({ code: '483921' });
    mockAcceptInvitation.mockRejectedValueOnce(
      new AcceptInvitationError('expired', 'expired'),
    );

    renderWithProviders(<InviteCodeAcceptScreen />);
    await waitFor(() => {
      expect(screen.getByText('招待コードの有効期限が切れています')).toBeTruthy();
    });
    expect(useAuthStore.getState().householdId).toBeNull();
  });

  it('既参加エラー → エラー画面表示', async () => {
    mockUseLocalSearchParams.mockReturnValue({ code: '483921' });
    mockAcceptInvitation.mockRejectedValueOnce(
      new AcceptInvitationError('already_member', 'already a member'),
    );

    renderWithProviders(<InviteCodeAcceptScreen />);
    await waitFor(() => {
      expect(screen.getByText('既にこの世帯に参加しています')).toBeTruthy();
    });
  });

  it('「入力に戻る」ボタンで router.back', async () => {
    mockUseLocalSearchParams.mockReturnValue({ code: '483921' });
    mockAcceptInvitation.mockRejectedValueOnce(
      new AcceptInvitationError('not_found', 'code not found'),
    );

    renderWithProviders(<InviteCodeAcceptScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('share-confirm-back')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('share-confirm-back'));
    expect(mockBack).toHaveBeenCalled();
  });
});
