import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Switch,
  Text,
  View,
} from 'react-native';

import { ScreenContainer } from '../../../components/ui/ScreenContainer';
import { useReduceMotionEnabled } from '../../../hooks/use-reduce-motion-enabled';
import {
  playCelebrationSound,
  unloadCelebrationSound,
} from '../../../lib/celebration-sound';
import {
  fetchNotificationPreferences,
  NOTIFICATION_PREFERENCES_DEFAULTS,
  updateNotificationPreferences,
} from '../../../lib/notification-preferences';
import { colors } from '../../../theme/colors';
import type { NotificationPreferences } from '../../../types/database';

// fetch 失敗時の表示用 fallback (DEFAULTS から構築)
// 認証エラー / ネットワーク不通でも UI を表示し、エラー文だけ画面下部に出す
function buildFallbackPrefs(): NotificationPreferences {
  const now = new Date().toISOString();
  return {
    id: '',
    auth_user_id: '',
    ...NOTIFICATION_PREFERENCES_DEFAULTS,
    created_at: now,
    updated_at: now,
  };
}

/**
 * NOTIF-01 通知設定画面。
 *
 * 設計参照:
 *   - 02_設計/NOTIF-01統合計画.md v1.0 §2-5 (架構、案 α 実装)
 *   - 02_設計/画面/NOTIF-01-通知設定.md v0.2 (画面仕様)
 *
 * セクション構成 (画面表示順):
 *   1. §通知マスター — 「通知を受け取る」全体 ON/OFF
 *   2. §通知のタイミング — 前日通知 (時刻) + 当日通知 (分前)
 *   3. §通知の内容 — 持ち物統合通知
 *   4. §プライバシー — ロック画面プライバシーモード
 *   5. §サウンド — 通知音 / バイブレーション (placeholder) / 達成音 (試聴付き)
 *   6. §メンバー別の設定 — placeholder「近日実装予定」(別テーブル設計が必要)
 *
 * 既存資産:
 *   - `lib/notification-preferences.ts` の DEFAULTS が 9 項目フル対応 → 新規 DDL 不要
 *   - `lib/celebration-sound.ts` の試聴ロジックを再利用
 *   - 旧 `sound-haptics.tsx` の ToggleRow + 楽観的更新パターンを移植
 *
 * 楽観的更新:
 *   - トグル即時反映 → DB 失敗時にロールバック
 *   - エラーは画面下部に accessibilityLiveRegion で告知
 *
 * a11y:
 *   - 各トグルは `accessibilityRole="switch"` + `accessibilityState.checked`
 *   - 行全体タップで切替 (Pressable wrap、44dp 以上のヒット領域)
 *   - section header は `accessibilityRole="header"`
 *   - エラーは `accessibilityLiveRegion="polite"`
 */
export default function NotificationsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [showDayBeforeTimePicker, setShowDayBeforeTimePicker] = useState(false);
  const [showSameDayMinutesPicker, setShowSameDayMinutesPicker] = useState(false);
  const reduceMotion = useReduceMotionEnabled();

  // 初期 fetch + fallback
  // 認証エラー / ネットワーク不通のとき DEFAULTS で UI を出し、画面下部にエラー文を表示。
  // 「読み込めません」全画面エラーを避けて、ユーザーがオフラインでも設定 UI を確認できる
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fetched = await fetchNotificationPreferences();
        if (!cancelled) setPrefs(fetched);
      } catch (e) {
        if (!cancelled) {
          setPrefs(buildFallbackPrefs());
          setError(
            e instanceof Error
              ? `設定の読み込みに失敗しました (${e.message})`
              : '設定の読み込みに失敗しました',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // アンマウント時に Audio.Sound をクリーンアップ
  useEffect(() => {
    return () => {
      void unloadCelebrationSound();
    };
  }, []);

  /**
   * 任意のトグル / 値を楽観的更新する共通ハンドラ。
   * patch は単一フィールドの差分。
   *
   * @param patch DB に送る差分
   * @param previousValue ロールバック用の元値 (UI 上の表現)
   * @param applyOptimistic UI を即時更新する関数
   * @param applyRollback UI を元に戻す関数
   * @param afterSuccess 成功時の追加処理 (試聴音再生など)
   */
  async function applyPatch<T>(
    patch: Parameters<typeof updateNotificationPreferences>[0],
    previousValue: T,
    applyOptimistic: (next: T) => void,
    nextValue: T,
    afterSuccess?: () => Promise<void> | void,
  ) {
    applyOptimistic(nextValue);
    setSaving(true);
    setError(null);
    try {
      const updated = await updateNotificationPreferences(patch);
      setPrefs(updated);
      if (afterSuccess) await afterSuccess();
    } catch (e) {
      applyOptimistic(previousValue);
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  // 簡易ヘルパー: prefs の単一フィールド更新
  function patchPrefs<K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K],
  ) {
    setPrefs((p) => (p ? { ...p, [key]: value } : p));
  }

  if (loading) {
    return (
      <ScreenContainer scrollable={false}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      </ScreenContainer>
    );
  }

  if (!prefs) {
    return (
      <ScreenContainer scrollable={false}>
        <View className="flex-1 items-center justify-center px-4">
          <Text className="text-body text-text-secondary">
            設定を読み込めませんでした
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <Header onBack={() => router.back()} />

      <Text className="mt-4 text-h1 text-text-primary">通知設定</Text>
      <Text className="mt-2 text-caption text-text-secondary">
        通知のタイミング、内容、サウンドなどを設定します。
      </Text>

      {/* ============================================================ */}
      {/* §通知マスター */}
      {/* ============================================================ */}
      <SectionHeader title="通知" />
      <Card>
        <ToggleRow
          title="通知を受け取る"
          description="このアプリからの通知を受け取ります"
          value={prefs.reminder_day_before_enabled || prefs.reminder_same_day_enabled}
          onValueChange={async (next) => {
            // マスタートグル: 両方の reminder を同時に切替 (簡易実装)
            await applyPatch(
              { reminder_day_before_enabled: next, reminder_same_day_enabled: next },
              !next,
              () => {
                patchPrefs('reminder_day_before_enabled', next);
                patchPrefs('reminder_same_day_enabled', next);
              },
              next,
            );
          }}
          disabled={saving}
          a11yLabel="通知を受け取る"
        />
      </Card>

      {/* ============================================================ */}
      {/* §通知のタイミング */}
      {/* ============================================================ */}
      <SectionHeader title="通知のタイミング" />
      <Card>
        <ToggleRow
          title="前日に通知"
          description={`前日の ${formatTime(prefs.reminder_day_before_time)} に通知`}
          value={prefs.reminder_day_before_enabled}
          onValueChange={async (next) => {
            await applyPatch(
              { reminder_day_before_enabled: next },
              !next,
              (v) => patchPrefs('reminder_day_before_enabled', v),
              next,
            );
          }}
          disabled={saving}
          a11yLabel="前日通知"
        />
        {prefs.reminder_day_before_enabled ? (
          <View className="border-t" style={{ borderColor: colors.border }}>
            <Pressable
              onPress={() => setShowDayBeforeTimePicker(true)}
              accessibilityRole="button"
              accessibilityLabel={`前日通知の時刻 ${formatTime(prefs.reminder_day_before_time)}、タップで変更`}
              className="min-h-[48px] flex-row items-center justify-between px-4 py-3 active:bg-primary-light"
            >
              <Text className="text-body text-text-primary">通知時刻</Text>
              <Text className="text-body text-primary-dark">
                {formatTime(prefs.reminder_day_before_time)}
              </Text>
            </Pressable>
            {showDayBeforeTimePicker ? (
              <DateTimePicker
                value={parseTimeStringToDate(prefs.reminder_day_before_time)}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                is24Hour
                onChange={(_event, selected) => {
                  if (Platform.OS !== 'ios') setShowDayBeforeTimePicker(false);
                  if (selected) {
                    const next = formatDateToTimeString(selected);
                    void applyPatch(
                      { reminder_day_before_time: next },
                      prefs.reminder_day_before_time,
                      (v) => patchPrefs('reminder_day_before_time', v),
                      next,
                    );
                  }
                }}
              />
            ) : null}
          </View>
        ) : null}
        <DividerRow />
        <ToggleRow
          title="当日に通知"
          description={`当日の ${prefs.reminder_same_day_minutes}分前 に通知`}
          value={prefs.reminder_same_day_enabled}
          onValueChange={async (next) => {
            await applyPatch(
              { reminder_same_day_enabled: next },
              !next,
              (v) => patchPrefs('reminder_same_day_enabled', v),
              next,
            );
          }}
          disabled={saving}
          a11yLabel="当日通知"
        />
        {prefs.reminder_same_day_enabled ? (
          <View className="border-t" style={{ borderColor: colors.border }}>
            <Pressable
              onPress={() => setShowSameDayMinutesPicker((s) => !s)}
              accessibilityRole="button"
              accessibilityLabel={`当日通知の時間 ${prefs.reminder_same_day_minutes}分前、タップで変更`}
              className="min-h-[48px] flex-row items-center justify-between px-4 py-3 active:bg-primary-light"
            >
              <Text className="text-body text-text-primary">通知時間</Text>
              <Text className="text-body text-primary-dark">
                {prefs.reminder_same_day_minutes}分前
              </Text>
            </Pressable>
            {showSameDayMinutesPicker ? (
              <View className="border-t bg-surface px-4 py-3" style={{ borderColor: colors.border }}>
                <View className="flex-row flex-wrap gap-2">
                  {[15, 30, 45, 60, 90, 120].map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => {
                        setShowSameDayMinutesPicker(false);
                        if (m === prefs.reminder_same_day_minutes) return;
                        void applyPatch(
                          { reminder_same_day_minutes: m },
                          prefs.reminder_same_day_minutes,
                          (v) => patchPrefs('reminder_same_day_minutes', v),
                          m,
                        );
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: m === prefs.reminder_same_day_minutes }}
                      accessibilityLabel={`${m}分前`}
                      className={`rounded-button border-2 px-4 py-2 ${
                        m === prefs.reminder_same_day_minutes
                          ? 'border-primary bg-primary-light'
                          : 'border-border bg-surface'
                      }`}
                    >
                      <Text
                        className={`text-body ${
                          m === prefs.reminder_same_day_minutes
                            ? 'text-primary-dark'
                            : 'text-text-primary'
                        }`}
                      >
                        {m}分前
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </Card>

      {/* ============================================================ */}
      {/* §通知の内容 */}
      {/* ============================================================ */}
      <SectionHeader title="通知の内容" />
      <Card>
        <ToggleRow
          title="持ち物を含める"
          description="通知に当日の持ち物リストを含めます"
          value={prefs.include_items_in_notification}
          onValueChange={async (next) => {
            await applyPatch(
              { include_items_in_notification: next },
              !next,
              (v) => patchPrefs('include_items_in_notification', v),
              next,
            );
          }}
          disabled={saving}
          a11yLabel="持ち物を含める"
        />
        <DividerRow />
        <ToggleRow
          title="完了済みは通知しない"
          description="チェック済みアイテムのみの場合、通知をスキップ"
          value={prefs.skip_when_all_items_checked}
          onValueChange={async (next) => {
            await applyPatch(
              { skip_when_all_items_checked: next },
              !next,
              (v) => patchPrefs('skip_when_all_items_checked', v),
              next,
            );
          }}
          disabled={saving}
          a11yLabel="完了済みは通知しない"
        />
      </Card>

      {/* ============================================================ */}
      {/* §プライバシー */}
      {/* ============================================================ */}
      <SectionHeader title="プライバシー" />
      <Card>
        <ToggleRow
          title="ロック画面で内容を隠す"
          description="ロック画面では「通知があります」のみ表示"
          value={prefs.lock_screen_privacy_mode}
          onValueChange={async (next) => {
            await applyPatch(
              { lock_screen_privacy_mode: next },
              !next,
              (v) => patchPrefs('lock_screen_privacy_mode', v),
              next,
            );
          }}
          disabled={saving}
          a11yLabel="ロック画面プライバシー"
        />
      </Card>

      {/* ============================================================ */}
      {/* §サウンド (最重点セクション) */}
      {/* ============================================================ */}
      <SectionHeader title="サウンド" />
      <Card>
        <ToggleRow
          title="通知音"
          description="通知時に音を鳴らします"
          value={prefs.sound_enabled}
          onValueChange={async (next) => {
            await applyPatch(
              { sound_enabled: next },
              !next,
              (v) => patchPrefs('sound_enabled', v),
              next,
            );
          }}
          disabled={saving}
          a11yLabel="通知音"
        />
        <DividerRow />
        <ToggleRow
          title="バイブレーション"
          description="近日実装予定（v0.3 で対応）"
          value={false}
          onValueChange={() => {
            /* placeholder, no-op */
          }}
          disabled
          a11yLabel="バイブレーション (近日実装予定)"
        />
        <DividerRow />
        <ToggleRow
          title="達成音"
          description="ウィザード完了時に短い音を鳴らします"
          value={prefs.celebration_sound_enabled}
          onValueChange={async (next) => {
            await applyPatch(
              { celebration_sound_enabled: next },
              !next,
              (v) => patchPrefs('celebration_sound_enabled', v),
              next,
              async () => {
                // ON にした瞬間に試聴 (UX 仕様)
                if (next) await playCelebrationSound();
              },
            );
          }}
          disabled={saving}
          a11yLabel="達成音"
        />
        {prefs.celebration_sound_enabled ? (
          <View className="border-t" style={{ borderColor: colors.border }}>
            <Pressable
              onPress={() => {
                void playCelebrationSound();
              }}
              accessibilityRole="button"
              accessibilityLabel="達成音を試聴"
              className="min-h-[48px] flex-row items-center justify-between px-4 py-3 active:bg-primary-light"
            >
              <Text className="text-body text-text-primary">試聴する</Text>
              <Text className="text-h3 text-primary-dark">{'▶'}</Text>
            </Pressable>
          </View>
        ) : null}
      </Card>

      {/* ============================================================ */}
      {/* §メンバー別の設定 (placeholder) */}
      {/* ============================================================ */}
      <SectionHeader title="メンバー別の設定" />
      <Card>
        <View className="px-4 py-6">
          <Text className="text-body text-text-secondary">
            近日実装予定（メンバー別の通知 ON/OFF）
          </Text>
          <Text className="mt-2 text-caption text-text-secondary">
            お子さん 1 人ずつ、習い事 1 件ずつ通知 ON/OFF を切り替えられるようになります。
          </Text>
        </View>
      </Card>

      {reduceMotion ? (
        <Text className="mt-4 text-caption text-text-secondary">
          ※「視差効果を減らす」が有効なため、達成画面の紙吹雪は表示されません。
          サウンド設定は紙吹雪と独立して動作します。
        </Text>
      ) : null}

      {error ? (
        <Text accessibilityLiveRegion="polite" className="mt-4 text-caption text-error">
          {error}
        </Text>
      ) : null}

      <View className="h-8" />
    </ScreenContainer>
  );
}

// ============================================================
// 内部コンポーネント
// ============================================================

function Header({ onBack }: { onBack: () => void }) {
  return (
    <View className="mt-2 flex-row items-center">
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="戻る"
        className="-ml-2 min-h-[44px] min-w-[44px] items-center justify-center"
      >
        <Text className="text-h3 text-primary-dark">{'< 戻る'}</Text>
      </Pressable>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <Text
      accessibilityRole="header"
      className="mt-6 mb-2 text-caption text-text-secondary"
    >
      {title}
    </Text>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <View
      className="rounded-xl bg-surface"
      style={{ borderWidth: 1, borderColor: colors.border }}
    >
      {children}
    </View>
  );
}

function DividerRow() {
  return <View className="h-px" style={{ backgroundColor: colors.border }} />;
}

interface ToggleRowProps {
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  a11yLabel: string;
}

function ToggleRow({
  title,
  description,
  value,
  onValueChange,
  disabled,
  a11yLabel,
}: ToggleRowProps) {
  return (
    <Pressable
      onPress={() => {
        if (!disabled) onValueChange(!value);
      }}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      className="min-h-[56px] flex-row items-center justify-between px-4 py-3 active:bg-primary-light"
    >
      <View className="flex-1 pr-4">
        <Text
          className={`text-body ${
            disabled ? 'text-text-secondary' : 'text-text-primary'
          }`}
        >
          {title}
        </Text>
        {description ? (
          <Text className="mt-1 text-caption text-text-secondary">{description}</Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={(next) => {
          if (!disabled) onValueChange(next);
        }}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.surface}
      />
    </Pressable>
  );
}

// ============================================================
// time formatting helpers (DB の HH:MM:SS と Date object の往復)
// ============================================================

function formatTime(t: string): string {
  // DB の `HH:MM:SS` → 表示用 `HH:MM`
  const [h = '00', m = '00'] = t.split(':');
  return `${h}:${m}`;
}

function parseTimeStringToDate(t: string): Date {
  const [h = '0', m = '0'] = t.split(':');
  const d = new Date();
  d.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);
  return d;
}

function formatDateToTimeString(d: Date): string {
  // DB は HH:MM:SS で持っているので秒を 00 として返す
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;
}
