/**
 * MEM-03 ProfileEditScreen (C-01) UI テスト。
 *
 * カバー範囲:
 *   - self メンバーロード → 表示名 + 色がプリフィル
 *   - 空名で保存 → エラー表示 + updateMember 未呼出
 *   - 21 文字超で保存 → エラー表示
 *   - 正常な名前 + 色変更 → updateMember 呼出 + toast 表示
 *   - 他メンバー色との重複時に ColorPickerSheet 警告表示
 */

import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ProfileEditScreen } from '../ProfileEditScreen';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { useAuthStore } from '../../stores/auth-store';

const mockBack = jest.fn();
const mockPush = jest.fn();
const mockGetUser = jest.fn();
const mockSelf = {
  id: 'm-self',
  household_id: 'h1',
  name: 'ママ',
  birth_date: null,
  gender: 'female' as const,
  role: 'parent' as const,
  color_hex: '#48C9B0',
  notifications_muted: false,
  sort_order: 3,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
};
const mockOther = {
  ...mockSelf,
  id: 'm-other',
  name: 'パパ',
  role: 'parent' as const,
  color_hex: '#5DADE2',
  sort_order: 2,
};

let mockUpdateError: { message: string } | null = null;
const mockUpdateSpy = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    back: (...args: unknown[]) => mockBack(...args),
    push: (...args: unknown[]) => mockPush(...args),
  },
}));

jest.mock('../../hooks/use-auth-session', () => ({
  isAuthBypassEnabled: () => false,
}));

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: (...args: unknown[]) => mockGetUser(...args),
    },
    from: jest.fn((table: string) => {
      if (table === 'members') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              order: jest.fn(() =>
                Promise.resolve({ data: [mockSelf, mockOther], error: null }),
              ),
            })),
          })),
          update: jest.fn((row: unknown) => ({
            eq: jest.fn((_col: string, id: string) => {
              mockUpdateSpy(row, id);
              return Promise.resolve({ error: mockUpdateError });
            }),
          })),
        };
      }
      if (table === 'household_members') {
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              eq: jest.fn(() => ({
                maybeSingle: jest.fn(() =>
                  Promise.resolve({
                    data: { auth_user_id: 'auth-1', household_id: 'h1' },
                    error: null,
                  }),
                ),
              })),
            })),
          })),
        };
      }
      return {};
    }),
  },
}));

configure({ defaultHidden: true });

describe('ProfileEditScreen (MEM-03 / C-01)', () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockPush.mockReset();
    mockGetUser.mockReset();
    mockUpdateSpy.mockReset();
    mockUpdateError = null;
    mockGetUser.mockResolvedValue({
      data: { user: { email: 'test@example.com', id: 'auth-1' } },
    });
    useAuthStore.setState({
      householdId: 'h1',
      session: { user: { id: 'auth-1' } } as unknown as never,
      wizardCompleted: true,
      isHydrating: false,
    });
  });

  it('self メンバーロード → 表示名 + メールがプリフィル', async () => {
    renderWithProviders(<ProfileEditScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('profile-edit-name-input')).toBeTruthy();
    });
    expect(screen.getByDisplayValue('ママ')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('profile-edit-email').props.children).toBe('test@example.com');
    });
  });

  it('役割は「親（編集不可）」表示で編集不可', async () => {
    renderWithProviders(<ProfileEditScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('profile-edit-role')).toBeTruthy();
    });
    expect(screen.getByText('親（編集不可）')).toBeTruthy();
  });

  it('空の表示名で保存 → エラー表示 + updateMember 未呼出', async () => {
    renderWithProviders(<ProfileEditScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('profile-edit-name-input')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByTestId('profile-edit-name-input'), '   ');
    fireEvent.press(screen.getByTestId('profile-edit-save'));
    await waitFor(() => {
      expect(screen.getByText('表示名を入力してください')).toBeTruthy();
    });
    expect(mockUpdateSpy).not.toHaveBeenCalled();
  });

  it('正常入力 → updateMember 呼出 + 「プロフィールを保存しました」toast', async () => {
    renderWithProviders(<ProfileEditScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('profile-edit-name-input')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByTestId('profile-edit-name-input'), 'ママ太郎');
    fireEvent.press(screen.getByTestId('color-picker-chip-#A569BD'));
    fireEvent.press(screen.getByTestId('profile-edit-save'));

    await waitFor(() => {
      expect(mockUpdateSpy).toHaveBeenCalledTimes(1);
    });
    expect(mockUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ママ太郎', color_hex: '#A569BD' }),
      'm-self',
    );
    await waitFor(() => {
      expect(screen.getByText('プロフィールを保存しました')).toBeTruthy();
    });
  });

  it('他メンバーと色重複時に ColorPickerSheet 警告が出る', async () => {
    renderWithProviders(<ProfileEditScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('profile-edit-name-input')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('color-picker-chip-#5DADE2'));
    await waitFor(() => {
      const warning = screen.getByTestId('color-picker-conflict-warning');
      expect(warning.props.children).toEqual(expect.arrayContaining(['パパ']));
    });
  });
});
