import { configure, render, screen, waitFor } from '@testing-library/react-native';

import { Confetti } from '../Confetti';
import { mockReduceMotion } from '../../../test-utils/mockReduceMotion';

/**
 * L2 サンプル 3: Confetti Reduce Motion 連動
 *
 * 検証ポイント:
 *   - Reduce Motion OFF + active で 紙吹雪 18 枚を描画
 *   - Reduce Motion ON で何もレンダリングしない (a11y 必須要件)
 *   - active=false で描画しない
 *
 * 注意: Confetti の outer wrapper は `accessibilityElementsHidden={true}` +
 * `importantForAccessibility="no-hide-descendants"` (a11y 仕様)。
 * RNTL の getAllByTestId は デフォルトで非表示要素をスキップするため、
 * `configure({ defaultHidden: true })` で表示扱いに切替。
 *
 * 参照: 04_テスト/依頼書/L2基盤整備依頼書.md §9.3
 *      02_設計/画面/WIZ-ウィザード一括設計.md §WIZ-09
 */

// Confetti は a11y 上 hidden 設定だが、テストでは中身の testID を検査したい
configure({ defaultHidden: true });

describe('Confetti', () => {
  it('Reduce Motion OFF 時に紙吹雪 18 枚を描画する (デフォルト count)', () => {
    mockReduceMotion(false);
    render(<Confetti active count={18} />);
    // 初期 state = useState(false) = OFF、active=true → 即時 18 枚描画
    expect(screen.getAllByTestId('confetti-piece')).toHaveLength(18);
  });

  it('Reduce Motion ON 時に何もレンダリングしない (a11y 必須要件)', async () => {
    mockReduceMotion(true);
    render(<Confetti active count={18} />);

    // useEffect 内の async setEnabled(true) 反映を待つ
    await waitFor(() => {
      expect(screen.queryAllByTestId('confetti-piece')).toHaveLength(0);
    });
  });

  it('active=false で描画しない', () => {
    mockReduceMotion(false);
    render(<Confetti active={false} count={18} />);
    expect(screen.queryAllByTestId('confetti-piece')).toHaveLength(0);
  });

  it('count=10 を渡すと 10 枚描画する (props 反映)', () => {
    mockReduceMotion(false);
    render(<Confetti active count={10} />);
    expect(screen.getAllByTestId('confetti-piece')).toHaveLength(10);
  });

  it('count=0 でも crash せず 0 枚描画する (境界値)', () => {
    mockReduceMotion(false);
    render(<Confetti active count={0} />);
    expect(screen.queryAllByTestId('confetti-piece')).toHaveLength(0);
  });
});
