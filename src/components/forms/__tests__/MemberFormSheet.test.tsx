import { configure, fireEvent, screen } from '@testing-library/react-native';

import { MemberFormSheet } from '../MemberFormSheet';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';

/**
 * L2 サンプル 2: MemberFormSheet 色自動割当 + 性別選択
 *
 * 実装に合わせた検証ポイント:
 *   - usedColors で除外された色を skip して若い色が初期選択 (memberPalette 1=#FF6B7A → 2=#5DADE2)
 *   - 色チップは `accessibilityLabel="色 <hex>"` で識別
 *   - accessibilityState.selected で選択状態判定
 *   - 性別「答えない」を選んで onSubmit に gender='unspecified' が渡る
 *
 * 参照: 04_テスト/依頼書/L2基盤整備依頼書.md §9.2
 *      src/components/forms/MemberFormSheet.tsx
 *      src/theme/colors.ts (memberPalette)
 */

configure({ defaultHidden: true });

describe('MemberFormSheet 色自動割当', () => {
  it('usedColors 空 → 1 番目の色 (#FF6B7A コーラル) が初期選択', () => {
    renderWithProviders(
      <MemberFormSheet
        visible
        mode="create-child"
        usedColors={[]}
        onSubmit={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    const coral = screen.getByLabelText('色 #FF6B7A');
    expect(coral.props.accessibilityState?.selected).toBe(true);
  });

  it('usedColors=[#FF6B7A] → 2 番目の #5DADE2 スカイブルーが初期選択', () => {
    renderWithProviders(
      <MemberFormSheet
        visible
        mode="create-child"
        usedColors={['#FF6B7A']}
        onSubmit={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    const sky = screen.getByLabelText('色 #5DADE2');
    expect(sky.props.accessibilityState?.selected).toBe(true);
  });

  it('色チップタップで選択状態が切り替わる', () => {
    renderWithProviders(
      <MemberFormSheet
        visible
        mode="create-child"
        usedColors={[]}
        onSubmit={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    const mint = screen.getByLabelText('色 #48C9B0');
    expect(mint.props.accessibilityState?.selected).toBe(false);
    fireEvent.press(mint);
    expect(mint.props.accessibilityState?.selected).toBe(true);
  });

  it('「答えない」性別 + 名前入力で onSubmit に gender=unspecified が渡る', () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <MemberFormSheet
        visible
        mode="create-child"
        usedColors={[]}
        onSubmit={onSubmit}
        onClose={jest.fn()}
      />,
    );
    fireEvent.changeText(screen.getByPlaceholderText('ニックネームでもOK'), 'すず');
    fireEvent.press(screen.getByRole('radio', { name: '答えない' }));
    fireEvent.press(screen.getByRole('button', { name: '追加' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'すず',
        gender: 'unspecified',
        role: 'child',
      }),
    );
  });

  it('名前 0 文字で「追加」を押すとエラー表示 + onSubmit 未呼出', () => {
    const onSubmit = jest.fn();
    renderWithProviders(
      <MemberFormSheet
        visible
        mode="create-child"
        usedColors={[]}
        onSubmit={onSubmit}
        onClose={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: '追加' }));
    expect(screen.getByText('お名前を入力してください')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
