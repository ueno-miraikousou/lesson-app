/**
 * L1 unit test: realtime-toast-store (Phase D Sprint 2 D2-T05)。
 *
 * 検証:
 *   - notify でメッセージが置き換わる + key がインクリメント
 *   - 連続 notify で最新メッセージが上書きされ key は単調増加
 *   - dismiss で null 化
 */

import { useRealtimeToastStore } from '../realtime-toast-store';

describe('useRealtimeToastStore', () => {
  beforeEach(() => {
    useRealtimeToastStore.setState({ message: null, key: 0 });
  });

  it('初期値は message=null / key=0', () => {
    const { message, key } = useRealtimeToastStore.getState();
    expect(message).toBeNull();
    expect(key).toBe(0);
  });

  it('notify でメッセージが入り key がインクリメント', () => {
    useRealtimeToastStore.getState().notify('テスト1');
    expect(useRealtimeToastStore.getState().message).toBe('テスト1');
    expect(useRealtimeToastStore.getState().key).toBe(1);
  });

  it('連続 notify で最新が上書きされ key は単調増加', () => {
    const { notify } = useRealtimeToastStore.getState();
    notify('1 件目');
    notify('2 件目');
    notify('3 件目');
    const state = useRealtimeToastStore.getState();
    expect(state.message).toBe('3 件目');
    expect(state.key).toBe(3);
  });

  it('dismiss で message が null 化される (key は維持)', () => {
    const { notify, dismiss } = useRealtimeToastStore.getState();
    notify('表示中');
    dismiss();
    expect(useRealtimeToastStore.getState().message).toBeNull();
    // key は再表示判定用なので減らさない (UI 側 useEffect 依存値の安定性)
    expect(useRealtimeToastStore.getState().key).toBe(1);
  });
});
