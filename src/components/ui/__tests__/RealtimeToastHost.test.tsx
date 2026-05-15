/**
 * L2 component test: RealtimeToastHost (Phase D Sprint 2 D2-T05)。
 *
 * 検証:
 *   - 初期は何も表示しない (message=null)
 *   - notify で表示、a11y attributes が付く
 *   - REALTIME_TOAST_DURATION_MS 経過で自動消失
 *   - 連続 notify でメッセージが置き換わり、タイマーがリセットされる
 */

import { act, render, screen } from '@testing-library/react-native';

import { RealtimeToastHost } from '../RealtimeToastHost';
import {
  REALTIME_TOAST_DURATION_MS,
  useRealtimeToastStore,
} from '../../../stores/realtime-toast-store';

describe('RealtimeToastHost', () => {
  beforeEach(() => {
    useRealtimeToastStore.setState({ message: null, key: 0 });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('初期 message=null では何も描画しない', () => {
    render(<RealtimeToastHost />);
    expect(screen.queryByTestId('realtime-toast')).toBeNull();
  });

  it('notify でメッセージが表示される (a11y alert role + livePolite)', () => {
    render(<RealtimeToastHost />);
    act(() => {
      useRealtimeToastStore.getState().notify('他のメンバーが編集しました');
    });

    const toast = screen.getByTestId('realtime-toast');
    expect(toast).toBeTruthy();
    expect(toast.props.accessibilityRole).toBe('alert');
    expect(toast.props.accessibilityLiveRegion).toBe('polite');
    expect(screen.getByTestId('realtime-toast-message').props.children).toBe(
      '他のメンバーが編集しました',
    );
  });

  it('REALTIME_TOAST_DURATION_MS 経過で自動消失', () => {
    render(<RealtimeToastHost />);
    act(() => {
      useRealtimeToastStore.getState().notify('表示');
    });
    expect(screen.queryByTestId('realtime-toast')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(REALTIME_TOAST_DURATION_MS);
    });
    expect(screen.queryByTestId('realtime-toast')).toBeNull();
  });

  it('連続 notify で 2 件目が表示され、タイマーがリセットされる', () => {
    render(<RealtimeToastHost />);
    act(() => {
      useRealtimeToastStore.getState().notify('1 件目');
    });
    act(() => {
      jest.advanceTimersByTime(REALTIME_TOAST_DURATION_MS / 2);
    });
    act(() => {
      useRealtimeToastStore.getState().notify('2 件目');
    });

    expect(screen.getByTestId('realtime-toast-message').props.children).toBe('2 件目');

    // タイマーがリセットされたので、1 件目の残り時間では消えない
    act(() => {
      jest.advanceTimersByTime(REALTIME_TOAST_DURATION_MS / 2);
    });
    expect(screen.queryByTestId('realtime-toast')).toBeTruthy();

    // 2 件目の duration 分進めると消える
    act(() => {
      jest.advanceTimersByTime(REALTIME_TOAST_DURATION_MS / 2 + 100);
    });
    expect(screen.queryByTestId('realtime-toast')).toBeNull();
  });
});
