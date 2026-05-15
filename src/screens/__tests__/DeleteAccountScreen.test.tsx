/**
 * DeleteAccountScreen (SET-05 / A-05) テスト。
 *
 * カバー範囲:
 *   - 初期表示 + メールアドレス表示
 *   - パスワード未入力で submit → エラー
 *   - 1 段目確認 → 2 段目確認 → signIn + deleteAccount + reset + router.replace
 *   - deleteAccount エラー時に displayMessage 表示
 */

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import { DeleteAccountScreen } from '../DeleteAccountScreen';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import * as authLib from '../../lib/auth';
import { useAuthStore } from '../../stores/auth-store';

jest.mock('../../hooks/use-auth-session', () => ({
  isAuthBypassEnabled: () => false,
}));

jest.mock('../../lib/auth', () => ({
  signInWithPassword: jest.fn(),
  deleteAccount: jest.fn(),
}));

describe('DeleteAccountScreen (SET-05 / A-05)', () => {
  const mockReplace = jest.fn();
  const mockBack = jest.fn();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({
      back: mockBack,
      replace: mockReplace,
      push: jest.fn(),
    });
    mockReplace.mockReset();
    mockBack.mockReset();
    (authLib.signInWithPassword as jest.Mock).mockReset();
    (authLib.deleteAccount as jest.Mock).mockReset();

    useAuthStore.setState({
      householdId: 'h-1',
      session: {
        user: { id: 'user-1', email: 'a@b.co' },
      } as unknown as never,
      wizardCompleted: true,
      isHydrating: false,
    });
  });

  afterEach(() => {
    act(() => {
      useAuthStore.setState({ session: null, householdId: null });
    });
  });

  it('メールアドレスを表示する', () => {
    renderWithProviders(<DeleteAccountScreen />);
    expect(screen.getByTestId('delete-account-email').props.children).toBe('a@b.co');
  });

  it('パスワード未入力で submit → エラー表示 + 確認ダイアログ未表示', async () => {
    renderWithProviders(<DeleteAccountScreen />);
    fireEvent.press(screen.getByTestId('delete-account-submit'));
    await waitFor(() => {
      expect(screen.getByText('現在のパスワードを入力してください')).toBeTruthy();
    });
    expect(authLib.signInWithPassword).not.toHaveBeenCalled();
  });

  it('正常フロー: 1 段目 → 2 段目 → signIn + deleteAccount + reset + replace', async () => {
    (authLib.signInWithPassword as jest.Mock).mockResolvedValue({ error: null });
    (authLib.deleteAccount as jest.Mock).mockResolvedValue({
      householdDeleted: true,
      error: null,
    });

    renderWithProviders(<DeleteAccountScreen />);
    fireEvent.changeText(screen.getByTestId('delete-account-password-input'), 'mypass1234');
    fireEvent.press(screen.getByTestId('delete-account-submit'));

    // 1 段目確認ダイアログ
    await waitFor(() => {
      expect(screen.getByText('本当に退会しますか？')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('退会を続ける'));

    // 2 段目確認ダイアログ
    await waitFor(() => {
      expect(screen.getByText('最終確認')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('退会を確定する'));

    await waitFor(() => {
      expect(authLib.signInWithPassword).toHaveBeenCalledWith({
        email: 'a@b.co',
        password: 'mypass1234',
      });
    });
    await waitFor(() => {
      expect(authLib.deleteAccount).toHaveBeenCalledWith('user-1', 'h-1');
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });
  });

  it('再認証失敗時にエラー表示 + deleteAccount 未呼出', async () => {
    (authLib.signInWithPassword as jest.Mock).mockResolvedValue({
      error: {
        code: 'invalid-credentials',
        message: 'invalid',
        displayMessage: 'メールアドレスまたはパスワードが正しくありません',
      },
    });

    renderWithProviders(<DeleteAccountScreen />);
    fireEvent.changeText(screen.getByTestId('delete-account-password-input'), 'wrong');
    fireEvent.press(screen.getByTestId('delete-account-submit'));
    await waitFor(() => {
      expect(screen.getByText('本当に退会しますか？')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('退会を続ける'));
    await waitFor(() => {
      expect(screen.getByText('最終確認')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('退会を確定する'));

    await waitFor(() => {
      expect(screen.getByTestId('delete-account-error')).toBeTruthy();
    });
    expect(authLib.deleteAccount).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('deleteAccount エラー時に displayMessage 表示 + replace されない', async () => {
    (authLib.signInWithPassword as jest.Mock).mockResolvedValue({ error: null });
    (authLib.deleteAccount as jest.Mock).mockResolvedValue({
      householdDeleted: false,
      error: {
        code: 'network',
        message: 'fetch failed',
        displayMessage: 'ネットワークエラー。接続を確認してください',
      },
    });

    renderWithProviders(<DeleteAccountScreen />);
    fireEvent.changeText(screen.getByTestId('delete-account-password-input'), 'mypass1234');
    fireEvent.press(screen.getByTestId('delete-account-submit'));
    fireEvent.press(screen.getByText('退会を続ける'));
    await waitFor(() => {
      expect(screen.getByText('最終確認')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('退会を確定する'));

    await waitFor(() => {
      expect(screen.getByText('ネットワークエラー。接続を確認してください')).toBeTruthy();
    });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
