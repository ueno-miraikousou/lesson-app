import { AccessibilityInfo } from 'react-native';

/**
 * Reduce Motion OS 設定の mock 戻り値を制御。
 *
 * Usage:
 *   beforeEach(() => mockReduceMotion(false));
 *   it('紙吹雪が表示される', () => { ... });
 *   it('Reduce Motion ON で非表示', () => {
 *     mockReduceMotion(true);
 *     ...
 *   });
 */
export function mockReduceMotion(enabled: boolean): void {
  jest
    .spyOn(AccessibilityInfo, 'isReduceMotionEnabled')
    .mockResolvedValue(enabled);
  // addEventListener が返す subscription も mock (remove() メソッド付き)
  jest
    .spyOn(AccessibilityInfo, 'addEventListener')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .mockImplementation(() => ({ remove: jest.fn() }) as any);
}
