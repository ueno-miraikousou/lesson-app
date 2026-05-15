/**
 * SHARE-03 InviteCodeEntryScreen の L2 RNTL テスト。
 *
 * カバー範囲:
 *   - 6 桁数字入力 → 「次へ」ボタン有効化
 *   - 形式不正で「次へ」押下 → エラー表示 + router.push 未呼出
 *   - 正常入力 → router.push('/share/accept', { code })
 *   - ディープリンク params.code から自動入力
 *   - 数字以外の入力は剥がれる
 */

import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { InviteCodeEntryScreen } from '../InviteCodeEntryScreen';
import { renderWithProviders } from '../../test-utils/renderWithProviders';

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockUseLocalSearchParams = jest.fn(() => ({}));

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: (...args: unknown[]) => mockBack(...args),
  },
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

describe('InviteCodeEntryScreen (SHARE-03)', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockBack.mockReset();
    mockUseLocalSearchParams.mockReturnValue({});
  });

  it('初期は「次へ」ボタン disabled', () => {
    renderWithProviders(<InviteCodeEntryScreen />);
    const next = screen.getByTestId('share-input-next');
    expect(next.props.accessibilityState?.disabled).toBe(true);
  });

  it('6 桁数字入力 → 「次へ」有効化 + 押下で router.push', async () => {
    renderWithProviders(<InviteCodeEntryScreen />);
    fireEvent.changeText(screen.getByTestId('share-input-code'), '483921');
    const next = screen.getByTestId('share-input-next');
    await waitFor(() => {
      expect(next.props.accessibilityState?.disabled).toBe(false);
    });
    fireEvent.press(next);
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/share/accept',
      params: { code: '483921' },
    });
  });

  it('数字以外の入力は剥がれる (例: "abc12345xy")', () => {
    renderWithProviders(<InviteCodeEntryScreen />);
    fireEvent.changeText(screen.getByTestId('share-input-code'), 'abc12345xy');
    const input = screen.getByTestId('share-input-code');
    expect(input.props.value).toBe('12345');
  });

  it('5 桁では「次へ」disabled、エラー表示なし', () => {
    renderWithProviders(<InviteCodeEntryScreen />);
    fireEvent.changeText(screen.getByTestId('share-input-code'), '12345');
    const next = screen.getByTestId('share-input-next');
    expect(next.props.accessibilityState?.disabled).toBe(true);
    expect(screen.queryByText('6 桁の数字で入力してください')).toBeNull();
  });

  it('ディープリンク params.code が 6 桁数字なら自動入力', async () => {
    mockUseLocalSearchParams.mockReturnValue({ code: '999111' });
    renderWithProviders(<InviteCodeEntryScreen />);
    await waitFor(() => {
      expect(screen.getByTestId('share-input-code').props.value).toBe('999111');
    });
  });

  it('「戻る」ボタンで router.back', () => {
    renderWithProviders(<InviteCodeEntryScreen />);
    fireEvent.press(screen.getByTestId('share-input-back'));
    expect(mockBack).toHaveBeenCalled();
  });
});
