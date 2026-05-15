/**
 * SettingsScreen (SET-01 / C-02) テスト。
 *
 * カバー範囲:
 *   - 全主要メニュー項目の表示 (testID)
 *   - 通知設定タップ → router.push('/(main)/notifications')
 *   - プライバシー URL タップ → Linking.openURL
 *   - 退会タップ → router.push('/(main)/account/delete')
 *   - バージョン情報表示
 */

import { fireEvent, screen } from '@testing-library/react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';

import { SettingsScreen } from '../SettingsScreen';
import { renderWithProviders } from '../../test-utils/renderWithProviders';

describe('SettingsScreen (SET-01 / C-02)', () => {
  const mockPush = jest.fn();
  const mockBack = jest.fn();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({
      back: mockBack,
      push: mockPush,
      replace: jest.fn(),
    });
    (Linking.openURL as jest.Mock).mockReset();
    (Linking.openURL as jest.Mock).mockResolvedValue(undefined);
    mockPush.mockReset();
    mockBack.mockReset();
  });

  it('主要メニュー項目を表示する', () => {
    renderWithProviders(<SettingsScreen />);
    expect(screen.getByTestId('settings-link-notifications')).toBeTruthy();
    expect(screen.getByTestId('settings-link-privacy')).toBeTruthy();
    expect(screen.getByTestId('settings-link-terms')).toBeTruthy();
    expect(screen.getByTestId('settings-link-ad-consent')).toBeTruthy();
    expect(screen.getByTestId('settings-link-contact')).toBeTruthy();
    expect(screen.getByTestId('settings-version-info')).toBeTruthy();
    expect(screen.getByTestId('settings-link-licenses')).toBeTruthy();
    expect(screen.getByTestId('settings-link-profile')).toBeTruthy();
    expect(screen.getByTestId('settings-link-delete-account')).toBeTruthy();
  });

  it('通知設定タップ → /(main)/notifications', () => {
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByTestId('settings-link-notifications'));
    expect(mockPush).toHaveBeenCalledWith('/(main)/notifications');
  });

  it('プライバシーポリシータップ → Linking.openURL', () => {
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByTestId('settings-link-privacy'));
    expect(Linking.openURL).toHaveBeenCalled();
    const calledUrl = (Linking.openURL as jest.Mock).mock.calls[0][0];
    expect(calledUrl).toContain('privacy');
  });

  it('利用規約タップ → Linking.openURL', () => {
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByTestId('settings-link-terms'));
    expect(Linking.openURL).toHaveBeenCalled();
    const calledUrl = (Linking.openURL as jest.Mock).mock.calls[0][0];
    expect(calledUrl).toContain('terms');
  });

  it('退会タップ → /(main)/account/delete', () => {
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByTestId('settings-link-delete-account'));
    expect(mockPush).toHaveBeenCalledWith('/(main)/account/delete');
  });

  it('広告同意タップ → /(main)/consent/ad', () => {
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByTestId('settings-link-ad-consent'));
    expect(mockPush).toHaveBeenCalledWith('/(main)/consent/ad');
  });

  it('バージョン情報を表示する', () => {
    renderWithProviders(<SettingsScreen />);
    const row = screen.getByTestId('settings-version-info');
    expect(row).toBeTruthy();
    expect(screen.getByText(/0\.1\.0/)).toBeTruthy();
  });

  it('戻るボタンタップ → router.back', () => {
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByTestId('settings-back'));
    expect(mockBack).toHaveBeenCalled();
  });
});
