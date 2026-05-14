/**
 * カレンダー画面 (CAL-01 月 / CAL-02 週) の表示モード + メンバーフィルタの永続化ストア。
 *
 * 永続化方針 (Phase C Sprint 3、ME-5):
 *   - 表示モード ('month' | 'week') を AsyncStorage に保存 (CAL-01 §3.5、CAL-02 §3.1)
 *   - メンバーフィルタ (除外メンバー ID set) を AsyncStorage に保存 (CAL-04 AC5)
 *   - hydrate は起動時 1 回、updateMode/setFilter 後は debounce なしで書き込み
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type CalendarViewMode = 'month' | 'week';

const STORAGE_KEY_MODE = 'calendar:viewMode';
const STORAGE_KEY_FILTER = 'calendar:memberFilter';

interface CalendarViewState {
  mode: CalendarViewMode;
  /** 表示「しない」メンバー ID の集合 (空 set = 全員表示) */
  hiddenMemberIds: Set<string>;
  hydrated: boolean;
}

interface CalendarViewActions {
  setMode: (mode: CalendarViewMode) => void;
  setHiddenMembers: (ids: readonly string[]) => void;
  toggleMember: (id: string) => void;
  showAll: () => void;
  hideAll: (memberIds: readonly string[]) => void;
  hydrate: () => Promise<void>;
}

export const useCalendarViewStore = create<CalendarViewState & CalendarViewActions>()((set, get) => ({
  mode: 'month',
  hiddenMemberIds: new Set(),
  hydrated: false,

  setMode: (mode) => {
    set({ mode });
    void AsyncStorage.setItem(STORAGE_KEY_MODE, mode);
  },

  setHiddenMembers: (ids) => {
    const next = new Set(ids);
    set({ hiddenMemberIds: next });
    void AsyncStorage.setItem(STORAGE_KEY_FILTER, JSON.stringify([...next]));
  },

  toggleMember: (id) => {
    const current = new Set(get().hiddenMemberIds);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    set({ hiddenMemberIds: current });
    void AsyncStorage.setItem(STORAGE_KEY_FILTER, JSON.stringify([...current]));
  },

  showAll: () => {
    set({ hiddenMemberIds: new Set() });
    void AsyncStorage.setItem(STORAGE_KEY_FILTER, JSON.stringify([]));
  },

  hideAll: (memberIds) => {
    const next = new Set(memberIds);
    set({ hiddenMemberIds: next });
    void AsyncStorage.setItem(STORAGE_KEY_FILTER, JSON.stringify([...next]));
  },

  hydrate: async () => {
    try {
      const [modeRaw, filterRaw] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEY_MODE),
        AsyncStorage.getItem(STORAGE_KEY_FILTER),
      ]);
      const mode: CalendarViewMode = modeRaw === 'week' ? 'week' : 'month';
      let hiddenMemberIds = new Set<string>();
      if (filterRaw) {
        try {
          const parsed = JSON.parse(filterRaw);
          if (Array.isArray(parsed)) hiddenMemberIds = new Set(parsed.filter((x) => typeof x === 'string'));
        } catch {
          // ignore corruption
        }
      }
      set({ mode, hiddenMemberIds, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },
}));
