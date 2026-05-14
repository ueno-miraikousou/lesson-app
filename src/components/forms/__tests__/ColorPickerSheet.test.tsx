/**
 * ColorPickerSheet (C-01 主動線カラーピッカー) UI テスト。
 *
 * カバー範囲:
 *   - 8 色チップ全て描画 + value が選択状態
 *   - チップタップで onChange が呼ばれる
 *   - 他メンバーと色重複時に警告表示 + nameByColor で名前が出る
 *   - colorNameOf で日本語色名 (コーラル / ターコイズ etc.) が出る
 */

import { fireEvent, screen } from '@testing-library/react-native';

import { ColorPickerSheet, colorNameOf } from '../ColorPickerSheet';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';

describe('ColorPickerSheet', () => {
  it('value=#FF6B7A → コーラルチップが選択状態', () => {
    renderWithProviders(
      <ColorPickerSheet value="#FF6B7A" onChange={jest.fn()} />,
    );
    const coral = screen.getByTestId('color-picker-chip-#FF6B7A');
    expect(coral.props.accessibilityState?.selected).toBe(true);
  });

  it('別チップタップで onChange に hex が渡る', () => {
    const onChange = jest.fn();
    renderWithProviders(
      <ColorPickerSheet value="#FF6B7A" onChange={onChange} />,
    );
    fireEvent.press(screen.getByTestId('color-picker-chip-#48C9B0'));
    expect(onChange).toHaveBeenCalledWith('#48C9B0');
  });

  it('conflictColors に value が含まれる + nameByColor 有 → 警告表示', () => {
    const conflictColors = ['#48c9b0']; // lowercase
    const conflictNameByColor = new Map([['#48c9b0', 'パパ']]);
    renderWithProviders(
      <ColorPickerSheet
        value="#48C9B0"
        onChange={jest.fn()}
        conflictColors={conflictColors}
        conflictNameByColor={conflictNameByColor}
      />,
    );
    const warning = screen.getByTestId('color-picker-conflict-warning');
    expect(warning).toBeTruthy();
    expect(warning.props.children).toEqual(expect.arrayContaining(['パパ']));
  });

  it('conflictColors に value が含まれない → 警告非表示', () => {
    const conflictColors = ['#5dade2'];
    const conflictNameByColor = new Map([['#5dade2', 'パパ']]);
    renderWithProviders(
      <ColorPickerSheet
        value="#FF6B7A"
        onChange={jest.fn()}
        conflictColors={conflictColors}
        conflictNameByColor={conflictNameByColor}
      />,
    );
    expect(screen.queryByTestId('color-picker-conflict-warning')).toBeNull();
  });

  it('「選択中: <色名>」表示で日本語色名が出る', () => {
    renderWithProviders(
      <ColorPickerSheet value="#A569BD" onChange={jest.fn()} />,
    );
    expect(screen.getByTestId('color-picker-selected').props.children).toEqual(
      expect.arrayContaining(['選択中: ', 'ラベンダー']),
    );
  });

  it('colorNameOf: 既知 hex は日本語名、未知 hex は hex そのまま', () => {
    expect(colorNameOf('#FF6B7A')).toBe('コーラル');
    expect(colorNameOf('#ff6b7a')).toBe('コーラル');
    expect(colorNameOf('#000000')).toBe('#000000');
  });
});
