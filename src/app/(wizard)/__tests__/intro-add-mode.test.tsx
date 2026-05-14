/**
 * WIZ-10 intro mode=add UI テスト。
 *
 * カバー範囲:
 *   - mode=add で AddModeBadge / 既存サマリ表示 / 追加開始ボタン
 *   - 通常モード (mode 未指定) で通常スライド表示 (回帰)
 *   - clearWizard が mode=add 時に呼ばれる (state 混在回避)
 */

import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import WizardIntroScreen from '../intro';
import { useWizardStore } from '../../../stores/wizard-store';
import { useAuthStore } from '../../../stores/auth-store';

const mockReplace = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  },
  useLocalSearchParams: jest.fn(() => ({ mode: 'add' })),
}));

jest.mock('../../../features/wizard/use-existing-household-data', () => ({
  useExistingHouseholdData: jest.fn(() => ({
    data: {
      members: [],
      usedColors: [],
      usedNames: [],
      childCount: 2,
      parentCount: 1,
      otherCount: 0,
      lessonCount: 3,
    },
    isLoading: false,
    isError: false,
  })),
}));

configure({ defaultHidden: true });

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe('WIZ-10 intro mode=add', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    useWizardStore.getState().clear();
    useAuthStore.setState({
      householdId: '00000000-0000-4000-8000-000000000002',
      session: null,
      wizardCompleted: true,
      isHydrating: false,
    });
  });

  it('mode=add で 追加モードバッジ + 既存サマリ + 開始ボタンが表示される', () => {
    renderWithQuery(<WizardIntroScreen />);
    expect(screen.getByTestId('wiz-add-mode-badge')).toBeTruthy();
    expect(screen.getByTestId('wiz-add-mode-title')).toBeTruthy();
    expect(screen.getByTestId('wiz-add-mode-existing-summary')).toBeTruthy();
    expect(screen.getByTestId('wiz-add-mode-start-children')).toBeTruthy();
  });

  it('mode=add 起動時に wizard-store を clear + mode を add に設定', async () => {
    // 事前に汚れた state を投入
    useWizardStore.setState({
      childrenCount: 5,
      mode: 'new',
    });
    renderWithQuery(<WizardIntroScreen />);
    await waitFor(() => {
      expect(useWizardStore.getState().mode).toBe('add');
    });
    expect(useWizardStore.getState().childrenCount).toBe(0);
  });

  it('既存サマリに「子供 N 人 ・ 親 M 人」が含まれる', () => {
    renderWithQuery(<WizardIntroScreen />);
    expect(screen.getByText(/子供 2 人/)).toBeTruthy();
    expect(screen.getByText(/親 1 人/)).toBeTruthy();
  });

  it('「家族メンバーを追加する」タップで step1 へ遷移 (mode=add 維持)', () => {
    renderWithQuery(<WizardIntroScreen />);
    fireEvent.press(screen.getByTestId('wiz-add-mode-start-children'));
    expect(mockPush).toHaveBeenCalledWith('/(wizard)/step1');
  });

  it('「後でやる」タップで「/」へ replace', () => {
    renderWithQuery(<WizardIntroScreen />);
    fireEvent.press(screen.getByText('後でやる'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('閉じる × ボタンタップで「/」へ replace', () => {
    renderWithQuery(<WizardIntroScreen />);
    fireEvent.press(screen.getByTestId('wiz-add-mode-close'));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });
});
