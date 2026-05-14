import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ItemsScreen } from '../ItemsScreen';
import { renderWithProviders } from '../../test-utils/renderWithProviders';
import {
  createItem,
  deleteItem,
  fetchItemsByLesson,
  reorderItems,
  updateItem,
} from '../../lib/items';

/**
 * ITEM-01 持ち物リスト編集 RNTL コンポーネントテスト (Sprint 4 C4-T04)。
 */

jest.mock('../../lib/items', () => ({
  fetchItemsByLesson: jest.fn(),
  createItem: jest.fn(),
  updateItem: jest.fn(),
  deleteItem: jest.fn(),
  reorderItems: jest.fn(() => Promise.resolve()),
}));

jest.mock('../../lib/lessons', () => ({
  fetchLessonById: jest.fn(() =>
    Promise.resolve({
      id: 'l1',
      member_id: 'm1',
      name: 'スイミング',
      classroom_name: null,
      location: null,
      monthly_fee: null,
      notifications_muted: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      member: { id: 'm1', name: 'すずちゃん', color_hex: '#FF6B7A' },
    }),
  ),
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ lessonId: 'l1' })),
}));

const mockedFetchItems = fetchItemsByLesson as jest.MockedFunction<typeof fetchItemsByLesson>;
const mockedCreateItem = createItem as jest.MockedFunction<typeof createItem>;
const mockedUpdateItem = updateItem as jest.MockedFunction<typeof updateItem>;
const mockedDeleteItem = deleteItem as jest.MockedFunction<typeof deleteItem>;

configure({ defaultHidden: true });

function makeItem(overrides: { id: string; name: string; sort_order: number }) {
  return {
    id: overrides.id,
    lesson_id: 'l1',
    name: overrides.name,
    sort_order: overrides.sort_order,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe('ItemsScreen', () => {
  it('items 空のときプレースホルダ表示', async () => {
    mockedFetchItems.mockResolvedValueOnce([]);
    renderWithProviders(<ItemsScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('items-empty')).toBeTruthy();
    });
    expect(screen.getByTestId('items-add-input')).toBeTruthy();
  });

  it('items が 3 件あれば row 3 つ表示', async () => {
    mockedFetchItems.mockResolvedValueOnce([
      makeItem({ id: 'i1', name: '水着', sort_order: 0 }),
      makeItem({ id: 'i2', name: 'ゴーグル', sort_order: 1 }),
      makeItem({ id: 'i3', name: 'タオル', sort_order: 2 }),
    ]);
    renderWithProviders(<ItemsScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('item-row-i1')).toBeTruthy();
    });
    expect(screen.getByTestId('item-row-i2')).toBeTruthy();
    expect(screen.getByTestId('item-row-i3')).toBeTruthy();
  });

  it('追加ボタンタップで createItem が呼ばれる', async () => {
    mockedFetchItems.mockResolvedValueOnce([]);
    mockedCreateItem.mockResolvedValueOnce(
      makeItem({ id: 'i-new', name: '水着', sort_order: 0 }),
    );
    renderWithProviders(<ItemsScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('items-add-input')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByTestId('items-add-input'), '水着');
    fireEvent.press(screen.getByTestId('items-add-button'));

    await waitFor(() => {
      expect(mockedCreateItem).toHaveBeenCalledWith(
        expect.objectContaining({ lessonId: 'l1', name: '水着' }),
      );
    });
  });

  it('空名で追加ボタン press はエラー表示 (input は disabled なのでエラー出ない)', async () => {
    mockedFetchItems.mockResolvedValueOnce([]);
    renderWithProviders(<ItemsScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('items-add-button')).toBeTruthy();
    });
    // 空のままなので button は disabled、createItem は呼ばれない
    fireEvent.press(screen.getByTestId('items-add-button'));
    expect(mockedCreateItem).not.toHaveBeenCalled();
  });

  it('row タップ → 編集モード → 保存で updateItem が呼ばれる', async () => {
    mockedFetchItems.mockResolvedValueOnce([
      makeItem({ id: 'i1', name: '水着', sort_order: 0 }),
    ]);
    mockedUpdateItem.mockResolvedValueOnce(
      makeItem({ id: 'i1', name: '水着 (大)', sort_order: 0 }),
    );
    renderWithProviders(<ItemsScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('item-tap-edit-i1')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('item-tap-edit-i1'));

    await waitFor(() => {
      expect(screen.getByTestId('item-edit-input-i1')).toBeTruthy();
    });
    fireEvent.changeText(screen.getByTestId('item-edit-input-i1'), '水着 (大)');
    fireEvent.press(screen.getByTestId('item-edit-save-i1'));

    await waitFor(() => {
      expect(mockedUpdateItem).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'i1', name: '水着 (大)' }),
      );
    });
  });

  it('上下ボタンで reorderItems が呼ばれる', async () => {
    mockedFetchItems.mockResolvedValueOnce([
      makeItem({ id: 'i1', name: '水着', sort_order: 0 }),
      makeItem({ id: 'i2', name: 'タオル', sort_order: 1 }),
    ]);
    renderWithProviders(<ItemsScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('item-move-down-i1')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('item-move-down-i1'));

    await waitFor(() => {
      expect(reorderItems).toHaveBeenCalled();
    });
    const lastCall = (reorderItems as jest.Mock).mock.calls.at(-1);
    expect(lastCall?.[0]).toEqual(['i2', 'i1']);
  });

  it('一番上のアイテムは「上に移動」が disabled', async () => {
    mockedFetchItems.mockResolvedValueOnce([
      makeItem({ id: 'i1', name: '水着', sort_order: 0 }),
      makeItem({ id: 'i2', name: 'タオル', sort_order: 1 }),
    ]);
    renderWithProviders(<ItemsScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('item-move-up-i1')).toBeTruthy();
    });
    const upBtn = screen.getByTestId('item-move-up-i1');
    expect(upBtn.props.accessibilityState?.disabled).toBe(true);
  });

  it('削除ボタンタップ後の confirm → deleteItem が呼ばれる', async () => {
    mockedFetchItems.mockResolvedValueOnce([
      makeItem({ id: 'i1', name: '水着', sort_order: 0 }),
    ]);
    mockedDeleteItem.mockResolvedValueOnce(undefined);
    const alertSpy = jest.spyOn(jest.requireActual('react-native').Alert, 'alert');
    alertSpy.mockImplementation((...args: unknown[]) => {
      const buttons = args[2] as { onPress?: () => void; style?: string }[] | undefined;
      const deleteButton = buttons?.find((b) => b.style === 'destructive');
      deleteButton?.onPress?.();
    });
    renderWithProviders(<ItemsScreen />);

    await waitFor(() => {
      expect(screen.getByTestId('item-delete-i1')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('item-delete-i1'));

    await waitFor(() => {
      expect(mockedDeleteItem).toHaveBeenCalledWith('i1');
    });
    alertSpy.mockRestore();
  });
});
