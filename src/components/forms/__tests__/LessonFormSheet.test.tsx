import { configure, fireEvent, screen } from '@testing-library/react-native';

import { LessonFormSheet } from '../LessonFormSheet';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';

/**
 * L2 サンプル 1: LessonFormSheet バリデーション + プリセット適用
 *
 * 実装に合わせた検証ポイント (依頼書 §9.1 のサンプルから差分あり):
 *   - 「追加」ボタンは常時 enabled (handleSubmit 内で validation → error 表示)
 *   - プリセット「ピアノ」は `accessibilityLabel="ピアノ"` で識別 (emoji は a11y hidden)
 *   - placeholder は「例: スイミング」 (依頼書 `/何の習い事/` から修正)
 *   - 空欄 submit でエラーメッセージ表示
 *   - 曜日 0 個 submit でエラーメッセージ表示
 *   - 正常 input → submit で `onSubmit` が呼ばれる
 *
 * 参照: 04_テスト/依頼書/L2基盤整備依頼書.md §9.1
 *      src/components/forms/LessonFormSheet.tsx (実装ソース)
 */

// 一部要素が a11y 上 hidden になっている可能性に備えて
configure({ defaultHidden: true });

describe('LessonFormSheet', () => {
  const baseProps = {
    visible: true,
    mode: 'create' as const,
    memberId: 'member-1',
    memberName: 'すず',
    onSubmit: jest.fn(),
    onClose: jest.fn(),
  };

  it('空欄で「追加」を押すとエラーメッセージが表示される', () => {
    renderWithProviders(<LessonFormSheet {...baseProps} />);

    fireEvent.press(screen.getByRole('button', { name: '追加' }));

    expect(screen.getByText('習い事の名前を入力してください')).toBeTruthy();
    expect(baseProps.onSubmit).not.toHaveBeenCalled();
  });

  it('「ピアノ」プリセットタップで習い事名フィールドに反映', () => {
    renderWithProviders(<LessonFormSheet {...baseProps} />);

    fireEvent.press(screen.getByLabelText('ピアノ'));

    expect(screen.getByDisplayValue('ピアノ')).toBeTruthy();
  });

  it('名前入力 + 曜日 0 個で「追加」を押すと曜日エラー表示', () => {
    renderWithProviders(<LessonFormSheet {...baseProps} />);

    fireEvent.changeText(screen.getByPlaceholderText('例: スイミング'), 'ピアノ');
    fireEvent.press(screen.getByRole('button', { name: '追加' }));

    expect(screen.getByText('曜日を1つ以上選択してください')).toBeTruthy();
    expect(baseProps.onSubmit).not.toHaveBeenCalled();
  });

  it('曜日チップタップで accessibilityState.checked が切り替わる', () => {
    renderWithProviders(<LessonFormSheet {...baseProps} />);

    const monday = screen.getByRole('checkbox', { name: '月' });
    // 初期 false → タップで true
    expect(monday.props.accessibilityState?.checked).toBe(false);
    fireEvent.press(monday);
    expect(monday.props.accessibilityState?.checked).toBe(true);
  });

  it('名前 + 月曜選択 + 「追加」で onSubmit が WizardLesson 形状で呼ばれる', () => {
    const onSubmit = jest.fn();
    renderWithProviders(<LessonFormSheet {...baseProps} onSubmit={onSubmit} />);

    fireEvent.changeText(screen.getByPlaceholderText('例: スイミング'), 'ピアノ');
    fireEvent.press(screen.getByRole('checkbox', { name: '月' }));
    fireEvent.press(screen.getByRole('button', { name: '追加' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ピアノ',
        memberTempId: 'member-1',
        schedules: expect.arrayContaining([
          expect.objectContaining({
            daysOfWeek: ['MO'],
            startTime: '17:00',
            endTime: '18:00',
          }),
        ]),
      }),
    );
  });
});
