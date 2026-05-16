/**
 * アプリ全体で参照する定数の一元管理。
 * アプリ正式名称が確定したらここを差し替えると、各画面・ストア申請・ディープリンクが揃う。
 *
 * 参照: 02_設計/デザインシステム.md v0.2 §1 (仮称維持中)
 *      02_設計/mobile-engineer引継ぎサマリ.md §5.5, §5.6, §5.9
 */

// TBD (Phase E E2-T01): APP_DISPLAY_NAME は社長確定待ち (候補「家族の習い事」「みらいこうそう習い事」等)。
//   - Google Play Console 申請前 (Sprint 3 着手前) に社長判断必須。
//   - 変更時は app.config.ts の APP_DISPLAY_NAME / docs/privacy.html / docs/terms.html / docs/store/store-description-draft.md も同期更新。
//   - 商標調査 (J-PlatPat) は architect-N で実施想定。
export const APP_DISPLAY_NAME = '習い事管理アプリ' as const;
export const APP_SLUG = 'lesson-app' as const;

/**
 * ディープリンクスキーム。アプリ名確定時に置換。
 * - 招待ディープリンク: `learnapp://invite/<code_long>`
 * - 通知タップ着地: `learnapp://schedule/<scheduleId>?date=<occurrenceDate>`
 */
export const DEEPLINK_SCHEME = 'learnapp' as const;

/** Android applicationId / iOS bundleIdentifier の暫定値。team-lead 判断 (2026-05-10) で確定。 */
export const ANDROID_APPLICATION_ID = 'com.miraikousou.lessonapp' as const;
export const IOS_BUNDLE_IDENTIFIER = 'com.miraikousou.lessonapp' as const;

/** 招待コード仕様 (02_設計/画面/SHARE-02 §1.2 / アーキテクチャ.md v0.3.2 §2.2) */
export const INVITATION = {
  /** 6桁数字コードの範囲: 100000〜999999 (先頭0なし) */
  CODE_SHORT_LENGTH: 6,
  /** 16文字英数字 (URL safe) */
  CODE_LONG_LENGTH: 16,
  /** 有効期限: 24時間 */
  EXPIRY_HOURS: 24,
  /** 1世帯あたり同時に有効なコード上限 */
  MAX_ACTIVE_PER_HOUSEHOLD: 3,
} as const;

/** 通知デフォルト設定 (02_設計/通知設計-暫定意見.md §7.1 / 社長 Q2 確定) */
export const NOTIFICATION_DEFAULTS = {
  REMINDER_DAY_BEFORE_TIME: '21:00',
  REMINDER_SAME_DAY_MINUTES: 30,
  INCLUDE_ITEMS_IN_NOTIFICATION: true,
  SKIP_WHEN_ALL_ITEMS_CHECKED: false,
  LOCK_SCREEN_PRIVACY_MODE: false,
} as const;
