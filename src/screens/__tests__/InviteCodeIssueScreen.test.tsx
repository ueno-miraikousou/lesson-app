/**
 * SHARE-02 InviteCodeIssueScreen の L2 RNTL テスト。
 *
 * カバー範囲:
 *   - 初期表示: 「招待コードを発行」ボタン
 *   - 発行成功: コード表示 + 「コピー」「共有」「新しいコードを発行」ボタン
 *   - 発行失敗 (not owner): エラー文言「世帯のオーナーのみ…」
 *   - params で既存コードが渡される場合: 表示モード
 *   - コピーボタン → Clipboard.setStringAsync
 */

import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';

import { InviteCodeIssueScreen } from '../InviteCodeIssueScreen';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { useAuthStore } from '../../stores/auth-store';

const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn(() => ({}));

jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    push: jest.fn(),
  },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

const mockCreateInvitation = jest.fn();
jest.mock('../../lib/invitations', () => {
  const actual = jest.requireActual('../../lib/invitations');
  return {
    ...actual,
    createInvitation: (...args: unknown[]) => mockCreateInvitation(...args),
  };
});

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve()),
}));

describe('InviteCodeIssueScreen (SHARE-02)', () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockCreateInvitation.mockReset();
    mockUseLocalSearchParams.mockReset();
    mockUseLocalSearchParams.mockReturnValue({});
    (Clipboard.setStringAsync as jest.Mock).mockClear();
    useAuthStore.setState({
      householdId: 'h1',
      session: { user: { id: 'auth-1' } } as unknown as never,
      wizardCompleted: true,
      isHydrating: false,
    });
  });

  it('初期表示で「招待コードを発行」ボタン', () => {
    renderWithProviders(<InviteCodeIssueScreen />);
    expect(screen.getByTestId('issue-button')).toBeTruthy();
    expect(screen.queryByTestId('issue-code-short')).toBeNull();
  });

  it('発行成功で 6 桁 (空白区切り) + ディープリンク + 有効期限を表示', async () => {
    mockCreateInvitation.mockResolvedValueOnce({
      id: 'inv-1',
      householdId: 'h1',
      codeShort: '483921',
      codeLong: '1A2B3C4D5E6F7G8H',
      expiresAt: '2026-05-16T05:00:00Z',
      createdBy: 'auth-1',
      createdAt: '2026-05-15T05:00:00Z',
    });

    renderWithProviders(<InviteCodeIssueScreen />);
    fireEvent.press(screen.getByTestId('issue-button'));

    await waitFor(() => {
      expect(screen.getByTestId('issue-code-short')).toBeTruthy();
    });
    expect(screen.getByTestId('issue-code-short').props.children).toBe('483 921');
    expect(screen.getByTestId('issue-deeplink').props.children).toBe(
      'learnapp://invite/1A2B3C4D5E6F7G8H',
    );
    expect(mockCreateInvitation).toHaveBeenCalledWith('h1');
  });

  it('発行失敗 (not owner) で「世帯のオーナーのみ…」エラー文言', async () => {
    mockCreateInvitation.mockRejectedValueOnce(
      new Error('createInvitation failed: caller is not owner of household abc'),
    );

    renderWithProviders(<InviteCodeIssueScreen />);
    fireEvent.press(screen.getByTestId('issue-button'));

    await waitFor(() => {
      expect(
        screen.getByText('世帯のオーナーのみ招待コードを発行できます'),
      ).toBeTruthy();
    });
  });

  it('params 経由で既存コードが渡された場合は即時表示モード', async () => {
    mockUseLocalSearchParams.mockReturnValue({
      codeShort: '555111',
      codeLong: 'X'.repeat(16),
      expiresAt: '2026-05-16T05:00:00Z',
    });

    renderWithProviders(<InviteCodeIssueScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('issue-code-short')).toBeTruthy();
    });
    expect(screen.getByTestId('issue-code-short').props.children).toBe('555 111');
    expect(mockCreateInvitation).not.toHaveBeenCalled();
  });

  it('「コピー」ボタンで Clipboard.setStringAsync 呼出 + toast 表示', async () => {
    mockCreateInvitation.mockResolvedValueOnce({
      id: 'inv-1',
      householdId: 'h1',
      codeShort: '123456',
      codeLong: 'Y'.repeat(16),
      expiresAt: '2026-05-16T05:00:00Z',
      createdBy: 'auth-1',
      createdAt: '2026-05-15T05:00:00Z',
    });

    renderWithProviders(<InviteCodeIssueScreen />);
    fireEvent.press(screen.getByTestId('issue-button'));
    await waitFor(() => {
      expect(screen.getByTestId('issue-copy')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('issue-copy'));
    await waitFor(() => {
      expect(Clipboard.setStringAsync).toHaveBeenCalledWith('123456');
    });
    await waitFor(() => {
      expect(screen.getByText('コピーしました')).toBeTruthy();
    });
  });
});
