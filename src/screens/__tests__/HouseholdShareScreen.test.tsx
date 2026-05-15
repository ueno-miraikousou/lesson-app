/**
 * SHARE-01 HouseholdShareScreen の L2 RNTL テスト。
 *
 * カバー範囲:
 *   - 世帯名 / is_shared バッジ / メンバー数表示
 *   - 「家族を招待」ボタン → router.push('/share/issue')
 *   - 有効招待コード一覧表示 (formatCodeShort 整形済)
 *   - 上限 3 件達成時はボタン disabled
 *   - 「取消」 → ConfirmDialog → revokeInvitation 呼出 + toast
 */

import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { HouseholdShareScreen, formatCodeShort } from '../HouseholdShareScreen';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import { useAuthStore } from '../../stores/auth-store';
import { supabase } from '../../lib/supabase';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args),
  },
}));

const mockFetchActiveInvitations = jest.fn();
const mockRevokeInvitation = jest.fn();
jest.mock('../../lib/invitations', () => {
  const actual = jest.requireActual('../../lib/invitations');
  return {
    ...actual,
    fetchActiveInvitations: (...args: unknown[]) => mockFetchActiveInvitations(...args),
    revokeInvitation: (...args: unknown[]) => mockRevokeInvitation(...args),
  };
});

function mockHouseholdFetch(data: { id: string; name: string | null; is_shared: boolean }, count: number) {
  const maybeSingleMock = jest.fn(() => Promise.resolve({ data, error: null }));
  const eqHouseholdMock = jest.fn(() => ({ maybeSingle: maybeSingleMock }));
  const selectHouseholdMock = jest.fn(() => ({ eq: eqHouseholdMock }));

  // households -> select -> eq -> maybeSingle
  // household_members -> select(count exact, head) -> eq -> Promise resolve count
  const eqMembersMock = jest.fn(() => Promise.resolve({ count, error: null }));
  const selectMembersMock = jest.fn(() => ({ eq: eqMembersMock }));

  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    if (table === 'households') return { select: selectHouseholdMock };
    if (table === 'household_members') return { select: selectMembersMock };
    return {};
  });
}

describe('formatCodeShort 純関数', () => {
  it('6 桁を 3 桁ずつ区切る', () => {
    expect(formatCodeShort('483921')).toBe('483 921');
  });
  it('6 桁以外はそのまま返す', () => {
    expect(formatCodeShort('12345')).toBe('12345');
    expect(formatCodeShort('1234567')).toBe('1234567');
  });
});

describe('HouseholdShareScreen (SHARE-01)', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockBack.mockReset();
    mockFetchActiveInvitations.mockReset();
    mockRevokeInvitation.mockReset();
    useAuthStore.setState({
      householdId: 'h1',
      session: { user: { id: 'auth-1' } } as unknown as never,
      wizardCompleted: true,
      isHydrating: false,
    });
  });

  it('世帯名 + 共有バッジ + メンバー数 + 招待コード 0 件表示', async () => {
    mockHouseholdFetch({ id: 'h1', name: '山田家', is_shared: false }, 1);
    mockFetchActiveInvitations.mockResolvedValueOnce([]);

    renderWithProviders(<HouseholdShareScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('share-household-name').props.children).toBe('山田家');
    });
    expect(screen.getByTestId('share-status-badge')).toBeTruthy();
    expect(screen.getByText('未共有')).toBeTruthy();
    expect(screen.getByTestId('share-member-count').props.children).toEqual(['メンバー ', 1, ' 名']);
    await waitFor(() => {
      expect(screen.getByTestId('share-active-empty')).toBeTruthy();
    });
  });

  it('「家族を招待」ボタン → router.push("/share/issue")', async () => {
    mockHouseholdFetch({ id: 'h1', name: '山田家', is_shared: false }, 1);
    mockFetchActiveInvitations.mockResolvedValueOnce([]);

    renderWithProviders(<HouseholdShareScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('share-issue-button')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('share-issue-button'));
    expect(mockPush).toHaveBeenCalledWith('/share/issue');
  });

  it('有効コード 3 件で発行ボタン disabled', async () => {
    mockHouseholdFetch({ id: 'h1', name: '山田家', is_shared: true }, 2);
    mockFetchActiveInvitations.mockResolvedValueOnce([
      {
        id: 'i1',
        codeShort: '111111',
        codeLong: 'A'.repeat(16),
        expiresAt: '2026-05-16T05:00:00Z',
        createdAt: '2026-05-15T05:00:00Z',
      },
      {
        id: 'i2',
        codeShort: '222222',
        codeLong: 'B'.repeat(16),
        expiresAt: '2026-05-16T05:00:00Z',
        createdAt: '2026-05-15T05:00:00Z',
      },
      {
        id: 'i3',
        codeShort: '333333',
        codeLong: 'C'.repeat(16),
        expiresAt: '2026-05-16T05:00:00Z',
        createdAt: '2026-05-15T05:00:00Z',
      },
    ]);

    renderWithProviders(<HouseholdShareScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('share-active-row-i1')).toBeTruthy();
    });
    const issueBtn = screen.getByTestId('share-issue-button');
    expect(issueBtn.props.accessibilityState?.disabled).toBe(true);

    expect(screen.getByTestId('share-active-code-i1').props.children).toBe('111 111');
    expect(screen.getByText('家族共有中')).toBeTruthy();
  });

  it('「取消」ボタン → ConfirmDialog → 確定で revokeInvitation 呼出', async () => {
    mockHouseholdFetch({ id: 'h1', name: '山田家', is_shared: false }, 1);
    mockFetchActiveInvitations.mockResolvedValueOnce([
      {
        id: 'i1',
        codeShort: '111111',
        codeLong: 'A'.repeat(16),
        expiresAt: '2026-05-16T05:00:00Z',
        createdAt: '2026-05-15T05:00:00Z',
      },
    ]);
    mockRevokeInvitation.mockResolvedValueOnce(undefined);

    renderWithProviders(<HouseholdShareScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('share-active-revoke-i1')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('share-active-revoke-i1'));

    // ConfirmDialog の「取り消す」ボタンを押す
    await waitFor(() => {
      expect(screen.getByText('招待コードを取り消しますか?')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('取り消す'));

    await waitFor(() => {
      expect(mockRevokeInvitation).toHaveBeenCalledWith('i1');
    });
    await waitFor(() => {
      expect(screen.getByText('招待コードを取り消しました')).toBeTruthy();
    });
  });
});
