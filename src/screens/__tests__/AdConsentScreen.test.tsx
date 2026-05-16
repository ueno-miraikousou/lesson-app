/**
 * AdConsentScreen (AD-01 / C-05 UI のみ) テスト。
 *
 * カバー範囲:
 *   - 初期: storage が空 → デフォルト「non-personalized」
 *   - 初期: storage に 'personalized' あり → ロード後にその選択を保持
 *   - 「広告を表示しない」オプションは disabled で選択不可
 *   - 選択切替 + submit → saveAdConsentState 呼出
 *   - submit 後に router.back / router.replace のいずれかが呼ばれる
 */

import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

import {
  AdConsentScreen,
  loadAdConsentState,
  saveAdConsentState,
} from '../AdConsentScreen';
import { renderWithProviders } from '../../test-utils/renderWithProviders';

function buildStorage(initial: string | null) {
  let value = initial;
  return {
    getItem: jest.fn((_key: string) => Promise.resolve(value)),
    setItem: jest.fn((_key: string, v: string) => {
      value = v;
      return Promise.resolve();
    }),
  };
}

describe('AdConsentScreen storage helpers', () => {
  it('loadAdConsentState: 既知の値はそのまま返す', async () => {
    const storage = buildStorage('personalized');
    expect(await loadAdConsentState(storage as never)).toBe('personalized');
  });

  it('loadAdConsentState: 未保存なら null', async () => {
    const storage = buildStorage(null);
    expect(await loadAdConsentState(storage as never)).toBeNull();
  });

  it('loadAdConsentState: 無効な値は null として扱う', async () => {
    const storage = buildStorage('garbage');
    expect(await loadAdConsentState(storage as never)).toBeNull();
  });

  it('saveAdConsentState: storage.setItem を正しい key で呼ぶ', async () => {
    const storage = buildStorage(null);
    await saveAdConsentState('non-personalized', storage as never);
    expect(storage.setItem).toHaveBeenCalledWith(
      'ad_consent_state',
      'non-personalized',
    );
  });
});

describe('AdConsentScreen (AD-01 / C-05)', () => {
  const mockBack = jest.fn();
  const mockReplace = jest.fn();
  const mockCanGoBack = jest.fn();

  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({
      back: mockBack,
      replace: mockReplace,
      push: jest.fn(),
      canGoBack: mockCanGoBack,
    });
    mockBack.mockReset();
    mockReplace.mockReset();
    mockCanGoBack.mockReset();
    mockCanGoBack.mockReturnValue(true);
  });

  it('3 つのオプションを表示する', async () => {
    const storage = buildStorage(null);
    renderWithProviders(<AdConsentScreen storage={storage as never} />);
    await waitFor(() => {
      expect(storage.getItem).toHaveBeenCalled();
    });
    expect(screen.getByTestId('consent-option-personalized')).toBeTruthy();
    expect(screen.getByTestId('consent-option-non-personalized')).toBeTruthy();
    expect(screen.getByTestId('consent-option-no-ads')).toBeTruthy();
  });

  it('初回 (storage 空) → デフォルト non-personalized 選択', async () => {
    const storage = buildStorage(null);
    renderWithProviders(<AdConsentScreen storage={storage as never} />);
    await waitFor(() => {
      const node = screen.getByTestId('consent-option-non-personalized');
      expect(node.props.accessibilityState?.selected).toBe(true);
    });
  });

  it('storage に personalized あり → ロード後に保持', async () => {
    const storage = buildStorage('personalized');
    renderWithProviders(<AdConsentScreen storage={storage as never} />);
    await waitFor(() => {
      const node = screen.getByTestId('consent-option-personalized');
      expect(node.props.accessibilityState?.selected).toBe(true);
    });
  });

  it('選択切替 + submit → saveAdConsentState 呼出', async () => {
    const storage = buildStorage(null);
    const onSaved = jest.fn();
    renderWithProviders(
      <AdConsentScreen storage={storage as never} onSaved={onSaved} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('consent-option-personalized')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('consent-option-personalized'));
    fireEvent.press(screen.getByTestId('consent-submit'));
    await waitFor(() => {
      expect(storage.setItem).toHaveBeenCalledWith(
        'ad_consent_state',
        'personalized',
      );
    });
    expect(onSaved).toHaveBeenCalledWith('personalized');
  });

  it('disabled オプション (no-ads) を押しても選択は変わらない', async () => {
    const storage = buildStorage(null);
    renderWithProviders(<AdConsentScreen storage={storage as never} />);
    await waitFor(() => {
      expect(screen.getByTestId('consent-option-no-ads')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('consent-option-no-ads'));
    // disabled なのでデフォルト non-personalized のまま
    const noAds = screen.getByTestId('consent-option-no-ads');
    expect(noAds.props.accessibilityState?.selected).toBe(false);
    const defaultChoice = screen.getByTestId('consent-option-non-personalized');
    expect(defaultChoice.props.accessibilityState?.selected).toBe(true);
  });

  it('canGoBack=true で submit → router.back', async () => {
    const storage = buildStorage(null);
    mockCanGoBack.mockReturnValue(true);
    renderWithProviders(<AdConsentScreen storage={storage as never} />);
    await waitFor(() => {
      expect(screen.getByTestId('consent-submit')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('consent-submit'));
    await waitFor(() => {
      expect(mockBack).toHaveBeenCalled();
    });
  });

  it('canGoBack=false で submit → router.replace に main 遷移', async () => {
    const storage = buildStorage(null);
    mockCanGoBack.mockReturnValue(false);
    renderWithProviders(<AdConsentScreen storage={storage as never} />);
    await waitFor(() => {
      expect(screen.getByTestId('consent-submit')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('consent-submit'));
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(main)/calendar');
    });
  });

  it('Phase E: 同意フォーム再表示ボタンが表示される (UMP form trigger)', async () => {
    const storage = buildStorage(null);
    renderWithProviders(<AdConsentScreen storage={storage as never} />);
    await waitFor(() => {
      expect(screen.getByTestId('consent-reshow-form')).toBeTruthy();
    });
    expect(screen.getByLabelText('同意フォームを再表示')).toBeTruthy();
  });

  it('Phase E: reshowConsentForm DI が呼ばれて選択状態が更新される', async () => {
    const storage = buildStorage(null);
    const reshow = jest.fn().mockResolvedValue('personalized');
    renderWithProviders(
      <AdConsentScreen storage={storage as never} reshowConsentForm={reshow} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('consent-reshow-form')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('consent-reshow-form'));
    await waitFor(() => {
      expect(reshow).toHaveBeenCalled();
    });
    await waitFor(() => {
      const node = screen.getByTestId('consent-option-personalized');
      expect(node.props.accessibilityState?.selected).toBe(true);
    });
  });
});
