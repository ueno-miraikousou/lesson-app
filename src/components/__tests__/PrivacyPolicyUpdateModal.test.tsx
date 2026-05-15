/**
 * PrivacyPolicyUpdateModal (C-03) テスト。
 *
 * カバー範囲:
 *   - shouldShowUpdateModal: メジャー比較ロジック (4 ケース)
 *   - 未受諾 (null) で起動 → モーダル表示
 *   - 同一バージョン受諾済 → 非表示
 *   - メジャーアップ → 表示、同意で storage.setItem 呼出 + onAccepted 通知
 *   - マイナーアップ (1.0.0 → 1.1.0) → 表示しない
 */

import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  PrivacyPolicyUpdateModal,
  shouldShowUpdateModal,
} from '../PrivacyPolicyUpdateModal';
import { renderWithProviders } from '../../test-utils/renderWithProviders';

describe('shouldShowUpdateModal (pure)', () => {
  it('受諾済バージョンが null なら true', () => {
    expect(shouldShowUpdateModal(null, '1.0.0')).toBe(true);
  });

  it('メジャー同じならば false', () => {
    expect(shouldShowUpdateModal('1.0.0', '1.0.0')).toBe(false);
    expect(shouldShowUpdateModal('1.0.0', '1.1.5')).toBe(false);
  });

  it('メジャー上がっていれば true', () => {
    expect(shouldShowUpdateModal('1.0.0', '2.0.0')).toBe(true);
  });

  it('メジャーが下がっていれば false', () => {
    expect(shouldShowUpdateModal('2.0.0', '1.5.0')).toBe(false);
  });
});

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

describe('PrivacyPolicyUpdateModal', () => {
  it('未受諾 (null) で起動 → モーダル表示', async () => {
    const storage = buildStorage(null);
    renderWithProviders(
      <PrivacyPolicyUpdateModal latestVersion="1.0.0" storage={storage as never} />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('privacy-policy-update-modal')).toBeTruthy();
    });
  });

  it('同一メジャー受諾済 → モーダル非表示', async () => {
    const storage = buildStorage('1.0.0');
    renderWithProviders(
      <PrivacyPolicyUpdateModal latestVersion="1.0.0" storage={storage as never} />,
    );
    // 非表示なら useEffect 完了後にも modal 要素が存在しない
    await waitFor(() => {
      expect(storage.getItem).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('privacy-policy-update-modal')).toBeNull();
  });

  it('メジャーアップ (1 → 2) で表示 + 同意で setItem + onAccepted', async () => {
    const storage = buildStorage('1.5.2');
    const onAccepted = jest.fn();
    renderWithProviders(
      <PrivacyPolicyUpdateModal
        latestVersion="2.0.0"
        storage={storage as never}
        onAccepted={onAccepted}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('privacy-policy-update-modal')).toBeTruthy();
    });

    fireEvent.press(screen.getByTestId('privacy-policy-update-accept'));

    await waitFor(() => {
      expect(storage.setItem).toHaveBeenCalledWith(
        'privacy_policy_accepted_version',
        '2.0.0',
      );
    });
    expect(onAccepted).toHaveBeenCalledWith('2.0.0');
  });

  it('マイナーアップ (1.0.0 → 1.1.0) は表示しない', async () => {
    const storage = buildStorage('1.0.0');
    renderWithProviders(
      <PrivacyPolicyUpdateModal latestVersion="1.1.0" storage={storage as never} />,
    );
    await waitFor(() => {
      expect(storage.getItem).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('privacy-policy-update-modal')).toBeNull();
  });

  it('内容を確認するリンクで onOpenPolicy 呼出', async () => {
    const storage = buildStorage(null);
    const onOpenPolicy = jest.fn();
    renderWithProviders(
      <PrivacyPolicyUpdateModal
        latestVersion="1.0.0"
        storage={storage as never}
        onOpenPolicy={onOpenPolicy}
      />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('privacy-policy-update-open')).toBeTruthy();
    });
    fireEvent.press(screen.getByTestId('privacy-policy-update-open'));
    expect(onOpenPolicy).toHaveBeenCalled();
  });
});
