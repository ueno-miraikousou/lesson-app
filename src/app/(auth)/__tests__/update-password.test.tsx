/**
 * AUTH-06 update-password.tsx 画面テスト (Phase D D4-T01 A-03)。
 *
 * カバー範囲:
 *   - 初期表示: 入力フィールド 2 つ + submit 表示
 *   - バリデーション: 8 文字未満 / 確認用不一致
 *   - 正常入力で updatePassword 呼出 → 成功画面表示
 *   - Auth エラー時に displayMessage 表示
 */

import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import UpdatePasswordScreen from '../update-password';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';
import { updatePassword } from '../../../lib/auth';

jest.mock('../../../lib/auth', () => ({
  updatePassword: jest.fn(),
}));

describe('UpdatePasswordScreen (AUTH-06 / A-03)', () => {
  beforeEach(() => {
    (updatePassword as jest.Mock).mockReset();
    (router.replace as jest.Mock).mockReset();
  });

  it('入力フィールド 2 つ + submit ボタン表示', () => {
    renderWithProviders(<UpdatePasswordScreen />);
    expect(screen.getByTestId('auth-reset-password-input')).toBeTruthy();
    expect(screen.getByTestId('auth-reset-confirm-input')).toBeTruthy();
    expect(screen.getByTestId('auth-reset-update-submit')).toBeTruthy();
  });

  it('8 文字未満で submit → エラー表示 + updatePassword 未呼出', async () => {
    renderWithProviders(<UpdatePasswordScreen />);
    fireEvent.changeText(screen.getByTestId('auth-reset-password-input'), 'short');
    fireEvent.changeText(screen.getByTestId('auth-reset-confirm-input'), 'short');
    fireEvent.press(screen.getByTestId('auth-reset-update-submit'));
    await waitFor(() => {
      expect(screen.getByText('パスワードは8文字以上にしてください')).toBeTruthy();
    });
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('確認用パスワード不一致 → エラー表示 + updatePassword 未呼出', async () => {
    renderWithProviders(<UpdatePasswordScreen />);
    fireEvent.changeText(screen.getByTestId('auth-reset-password-input'), 'newpass8chars');
    fireEvent.changeText(screen.getByTestId('auth-reset-confirm-input'), 'different8char');
    fireEvent.press(screen.getByTestId('auth-reset-update-submit'));
    await waitFor(() => {
      expect(screen.getByText('確認用パスワードが一致しません')).toBeTruthy();
    });
    expect(updatePassword).not.toHaveBeenCalled();
  });

  it('正常入力 → updatePassword 呼出 + 成功画面表示', async () => {
    (updatePassword as jest.Mock).mockResolvedValue({ error: null });
    renderWithProviders(<UpdatePasswordScreen />);
    fireEvent.changeText(screen.getByTestId('auth-reset-password-input'), 'newpass8chars');
    fireEvent.changeText(screen.getByTestId('auth-reset-confirm-input'), 'newpass8chars');
    fireEvent.press(screen.getByTestId('auth-reset-update-submit'));

    await waitFor(() => {
      expect(updatePassword).toHaveBeenCalledWith('newpass8chars');
    });
    await waitFor(() => {
      expect(screen.getByTestId('auth-reset-update-success')).toBeTruthy();
    });
  });

  it('Auth エラー時に displayMessage を表示', async () => {
    (updatePassword as jest.Mock).mockResolvedValue({
      error: {
        code: 'rate-limited',
        message: 'rate limit',
        displayMessage: '試行回数が多すぎます。しばらく待ってから再度お試しください',
      },
    });
    renderWithProviders(<UpdatePasswordScreen />);
    fireEvent.changeText(screen.getByTestId('auth-reset-password-input'), 'newpass8chars');
    fireEvent.changeText(screen.getByTestId('auth-reset-confirm-input'), 'newpass8chars');
    fireEvent.press(screen.getByTestId('auth-reset-update-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('auth-reset-update-error')).toBeTruthy();
    });
    expect(screen.getByText('試行回数が多すぎます。しばらく待ってから再度お試しください')).toBeTruthy();
  });
});
