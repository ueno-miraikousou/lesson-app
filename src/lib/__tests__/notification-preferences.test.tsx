import {
  NOTIFICATION_PREFERENCES_DEFAULTS,
  type NotificationPreferencesPatch,
} from '../notification-preferences';

/**
 * L1 サンプル: notification-preferences の DEFAULTS 純関数チェック
 *
 * 設計参照:
 *   - 04_テスト/依頼書/L2基盤整備依頼書.md §11.4 N3 (notification-preferences 単体テスト推奨)
 *   - 02_設計/NOTIF-01統合計画.md §1.5 (DEFAULTS は NOTIF-01 全 9 項目対応)
 *
 * 注意: fetchNotificationPreferences / updateNotificationPreferences は
 * Supabase クライアント依存のため L2 (jest.mock + MSW) で検証推奨。本 L1 テストは
 * DEFAULTS 定数 + 型整合の検証のみ。
 */
describe('NOTIFICATION_PREFERENCES_DEFAULTS', () => {
  it('全 9 項目が定義されている (NOTIF-01 v0.2 仕様)', () => {
    const keys = Object.keys(NOTIFICATION_PREFERENCES_DEFAULTS);
    expect(keys).toHaveLength(9);
  });

  it('リマインダー前日 = ON、時刻 = 21:00:00', () => {
    expect(NOTIFICATION_PREFERENCES_DEFAULTS.reminder_day_before_enabled).toBe(true);
    expect(NOTIFICATION_PREFERENCES_DEFAULTS.reminder_day_before_time).toBe('21:00:00');
  });

  it('リマインダー当日 = ON、分前 = 30', () => {
    expect(NOTIFICATION_PREFERENCES_DEFAULTS.reminder_same_day_enabled).toBe(true);
    expect(NOTIFICATION_PREFERENCES_DEFAULTS.reminder_same_day_minutes).toBe(30);
  });

  it('持ち物統合通知 = ON、完了時 skip = OFF', () => {
    expect(NOTIFICATION_PREFERENCES_DEFAULTS.include_items_in_notification).toBe(true);
    expect(NOTIFICATION_PREFERENCES_DEFAULTS.skip_when_all_items_checked).toBe(false);
  });

  it('ロック画面プライバシー = OFF (デフォルトで内容表示)', () => {
    expect(NOTIFICATION_PREFERENCES_DEFAULTS.lock_screen_privacy_mode).toBe(false);
  });

  it('通知音 = ON、達成音 = OFF (達成音は明示的に opt-in)', () => {
    expect(NOTIFICATION_PREFERENCES_DEFAULTS.sound_enabled).toBe(true);
    expect(NOTIFICATION_PREFERENCES_DEFAULTS.celebration_sound_enabled).toBe(false);
  });

  it('NotificationPreferencesPatch 型は DEFAULTS の全キーを許容する', () => {
    // 型レベルテスト: 全フィールドを patch として渡せる
    const fullPatch: NotificationPreferencesPatch = {
      reminder_day_before_enabled: false,
      reminder_day_before_time: '08:30:00',
      reminder_same_day_enabled: false,
      reminder_same_day_minutes: 60,
      include_items_in_notification: false,
      skip_when_all_items_checked: true,
      lock_screen_privacy_mode: true,
      sound_enabled: false,
      celebration_sound_enabled: true,
    };
    expect(Object.keys(fullPatch)).toHaveLength(9);
  });

  it('部分 patch も許容 (Partial 型)', () => {
    const partial: NotificationPreferencesPatch = {
      celebration_sound_enabled: true,
    };
    expect(partial.celebration_sound_enabled).toBe(true);
  });
});
