/**
 * ウィザード進行状態のストア。
 *
 * 設計:
 *   - 各ステップで入力された値を `members` / `lessons` 単位の配列で保持
 *   - AsyncStorage に永続化することで「中断 → 再起動 → 同 Step から再開」を実現
 *   - WIZ-07 の commit (一括 INSERT) 成功後に `clear()` で完全リセット
 *
 * 参照:
 *   - 02_設計/画面/WIZ-ウィザード一括設計.md v0.2
 *   - 02_設計/mobile-engineer引継ぎサマリ.md §5.6 (WIZ-04 B案 = 妻必須)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { MemberGender, MemberRole } from '../types/database';

/** 1メンバーの一時データ (DB INSERT 前のクライアント側表現) */
export interface WizardMember {
  /** ローカル一意ID。commit 時に DB の uuid に対応付け */
  tempId: string;
  name: string;
  birthDate: string | null; // ISO 日付 (YYYY-MM-DD)
  gender: MemberGender | null;
  role: MemberRole;
  colorHex: string;
}

/** 1習い事の一時データ */
export interface WizardLesson {
  tempId: string;
  /** どのメンバーの習い事か (WizardMember.tempId) */
  memberTempId: string;
  name: string;
  classroomName: string | null;
  location: string | null;
  /** 1習い事に複数の時間帯がぶら下がる (例: 月17時 + 木16時) */
  schedules: WizardScheduleSlot[];
}

export interface WizardScheduleSlot {
  tempId: string;
  /** 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' (RRULE BYDAY 互換) */
  daysOfWeek: readonly ('SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA')[];
  /** "HH:mm" */
  startTime: string;
  /** "HH:mm" */
  endTime: string;
  /** 繰り返し終了日 (任意) */
  recurrenceUntil: string | null;
}

/** ウィザードの現在 Step (画面遷移と1対1) */
export type WizardStep =
  | 'intro' // WIZ-00
  | 'step1-children-count' // WIZ-01
  | 'step2-children-info' // WIZ-02
  | 'step3-children-lessons' // WIZ-03
  | 'step4-self-lesson' // WIZ-04 (B案: 妻 members は常に作成)
  | 'step5-other-members' // WIZ-05
  | 'summary' // WIZ-06
  | 'processing' // WIZ-07
  | 'complete'; // WIZ-09

/**
 * ウィザード実行モード (ADR-006 W-10 既存データマージ戦略)。
 * - `new`: 初回ウィザード (commitWizardData、operator 冪等パスあり)
 * - `add`: 後からウィザード再実行 (commitWizardAddMode、追加分のみ INSERT)
 */
export type WizardMode = 'new' | 'add';

interface WizardState {
  /** 現在の Step */
  currentStep: WizardStep;
  /** 実行モード (ADR-006、AsyncStorage キー分離) */
  mode: WizardMode;
  /** 子供の人数 (WIZ-01 で確定、mode=add では追加分のみ) */
  childrenCount: number;
  /** 入力中の全メンバー (mode=add では追加分のみ、operator は含めない) */
  members: WizardMember[];
  /** 入力中の全習い事 (mode=add では追加分のみ) */
  lessons: WizardLesson[];
  /** WIZ-04 で「自分の習い事あり」を選択したか */
  hasSelfLesson: boolean | null;
  /** 中断保存されている状態か (再起動時の判定用) */
  hasPendingDraft: boolean;
  /** 最終更新時刻 (ISO) */
  lastUpdatedAt: string | null;
}

interface WizardActions {
  setStep: (step: WizardStep) => void;
  setMode: (mode: WizardMode) => void;
  setChildrenCount: (count: number) => void;
  upsertMember: (member: WizardMember) => void;
  removeMember: (tempId: string) => void;
  upsertLesson: (lesson: WizardLesson) => void;
  removeLesson: (tempId: string) => void;
  setHasSelfLesson: (value: boolean) => void;
  /** ウィザード完全リセット (commit 成功時 / 「破棄」選択時) */
  clear: () => void;
  /** 中断保存マーカー */
  markPending: () => void;
}

const initialState: WizardState = {
  currentStep: 'intro',
  mode: 'new',
  childrenCount: 0,
  members: [],
  lessons: [],
  hasSelfLesson: null,
  hasPendingDraft: false,
  lastUpdatedAt: null,
};

export const useWizardStore = create<WizardState & WizardActions>()(
  persist(
    (set) => ({
      ...initialState,

      setStep: (step) =>
        set((s) => ({ ...s, currentStep: step, lastUpdatedAt: new Date().toISOString() })),

      setMode: (mode) =>
        set((s) => ({ ...s, mode, lastUpdatedAt: new Date().toISOString() })),

      setChildrenCount: (count) =>
        set((s) => ({ ...s, childrenCount: count, lastUpdatedAt: new Date().toISOString() })),

      upsertMember: (member) =>
        set((s) => {
          const idx = s.members.findIndex((m) => m.tempId === member.tempId);
          const next = [...s.members];
          if (idx >= 0) {
            next[idx] = member;
          } else {
            next.push(member);
          }
          return { ...s, members: next, lastUpdatedAt: new Date().toISOString() };
        }),

      removeMember: (tempId) =>
        set((s) => ({
          ...s,
          members: s.members.filter((m) => m.tempId !== tempId),
          lessons: s.lessons.filter((l) => l.memberTempId !== tempId),
          lastUpdatedAt: new Date().toISOString(),
        })),

      upsertLesson: (lesson) =>
        set((s) => {
          const idx = s.lessons.findIndex((l) => l.tempId === lesson.tempId);
          const next = [...s.lessons];
          if (idx >= 0) {
            next[idx] = lesson;
          } else {
            next.push(lesson);
          }
          return { ...s, lessons: next, lastUpdatedAt: new Date().toISOString() };
        }),

      removeLesson: (tempId) =>
        set((s) => ({
          ...s,
          lessons: s.lessons.filter((l) => l.tempId !== tempId),
          lastUpdatedAt: new Date().toISOString(),
        })),

      setHasSelfLesson: (value) =>
        set((s) => ({ ...s, hasSelfLesson: value, lastUpdatedAt: new Date().toISOString() })),

      clear: () => set(() => ({ ...initialState })),

      markPending: () =>
        set((s) => ({ ...s, hasPendingDraft: true, lastUpdatedAt: new Date().toISOString() })),
    }),
    {
      name: 'wizard-draft-state',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // 一時的な currentStep は永続化対象だが、processing は再開時に summary に巻き戻したい
      partialize: (state) => ({
        currentStep: state.currentStep === 'processing' ? 'summary' : state.currentStep,
        mode: state.mode,
        childrenCount: state.childrenCount,
        members: state.members,
        lessons: state.lessons,
        hasSelfLesson: state.hasSelfLesson,
        hasPendingDraft: state.hasPendingDraft,
        lastUpdatedAt: state.lastUpdatedAt,
      }),
    },
  ),
);
