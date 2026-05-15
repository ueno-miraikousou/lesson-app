/**
 * Realtime 経由で他端末の編集を受信した際に「他のメンバーが編集しました」Toast を
 * グローバル表示するための軽量ストア (Phase D Sprint 2 D2-T05、F-05 AC4 / F-06 LWW)。
 *
 * 設計判断:
 *   - useHouseholdRealtime hook が payload 受信時に notify() を呼び、
 *     画面側 (root layout の RealtimeToastHost) が message + key を購読して表示
 *   - 「自端末発」の更新も Realtime ループバックで戻ってくるため、
 *     hook 側で「直近の自分の mutation か?」を判定する必要があるが、
 *     MVP は誤検知よりも見落としを警戒し UPDATE/DELETE 受信時のみ通知 (INSERT は除外)
 *   - 連続イベント時は最後のメッセージで上書き (queue ではなく LWW のように 1 件のみ表示)
 *   - 自動消失は 4 秒 (CalendarScreen UndoToast の UNDO_TIMEOUT_MS = 8000 より短く、
 *     編集競合は再現性が低いので軽い通知)
 *
 * 参照:
 *   - ADR-007 §2.3 / §6.1 LWW + Toast
 *   - 01_要件定義/Phase_D_WBS_v0.1.md §2.1 F-05 AC4 / F-06 AC1-2
 */

import { create } from 'zustand';

export const REALTIME_TOAST_DURATION_MS = 4000;

interface RealtimeToastState {
  /** 表示中のメッセージ。null = 非表示 */
  message: string | null;
  /** 再表示判定用 (同じメッセージ連続でも UI が反応するように) */
  key: number;
}

interface RealtimeToastActions {
  notify: (message: string) => void;
  dismiss: () => void;
}

export const useRealtimeToastStore = create<RealtimeToastState & RealtimeToastActions>()((set, get) => ({
  message: null,
  key: 0,
  notify: (message) => {
    set({ message, key: get().key + 1 });
  },
  dismiss: () => {
    set({ message: null });
  },
}));
