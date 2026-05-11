import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';

import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { colors } from '../../theme/colors';
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
} from '../../lib/notification-preferences';
import {
  playCelebrationSound,
  unloadCelebrationSound,
} from '../../lib/celebration-sound';
import { useReduceMotionEnabled } from '../../hooks/use-reduce-motion-enabled';

/**
 * SET-06 派生「サウンドと触覚」画面。
 *
 * Spec 出典:
 *   - WIZ-09 達成音 (designer v0.3 line 712-728): 達成音 ON/OFF トグルの置き場所
 *   - SET-01 設定トップ (line 100-104): SET-06 は別途「退会・データ削除」を担う
 *
 * 設計判断 (mobile-engineer):
 *   - SET-01 の SET-06 番号は「退会・データ削除」のためすでに使われている。
 *     一方で designer v0.3 §WIZ-09 は「設定 SET-06『サウンドと触覚』で ON 切替」と
 *     書いており、両者の番号が衝突している。番号衝突は designer に対して
 *     再採番依頼を投げる必要があるが、本ターンでは実装ブロックを避けるため、
 *     ルートを「番号」ではなく「内容」(`sound-haptics`) で命名する。
 *     設定トップ画面が後段で実装される際、本画面へのリンクが追加される想定。
 *   - 達成音以外のサウンド (通知音 sound_enabled / バイブ等) も将来このページに
 *     集約されるので、トグル一覧として展開しやすい縦並びレイアウトを採用。
 *
 * a11y:
 *   - 各トグル行は `Pressable` で行全体タップ可能 (44dp 以上のヒット領域)
 *   - `accessibilityRole="switch"` + `accessibilityState={{ checked }}` で
 *     スクリーンリーダーが「○○ オン/オフ」と読み上げられるようにする
 *   - 「試聴」ボタンは Reduce Motion ON 時にも動作 (音と動きは独立)
 */
export default function SoundHapticsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [celebrationEnabled, setCelebrationEnabled] = useState(false);
  const reduceMotion = useReduceMotionEnabled();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const prefs = await fetchNotificationPreferences();
        if (!cancelled) {
          setCelebrationEnabled(prefs.celebration_sound_enabled);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : '設定の読み込みに失敗しました');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 画面アンマウント時にプリロード済み Audio.Sound をクリーンアップ。
  // 設定画面で試聴したインスタンスはここでしか使わないため。
  useEffect(() => {
    return () => {
      void unloadCelebrationSound();
    };
  }, []);

  async function handleToggleCelebration(next: boolean) {
    // 楽観的更新: トグルを即時反映 → DB 失敗時にロールバック
    const previous = celebrationEnabled;
    setCelebrationEnabled(next);
    setSaving(true);
    setError(null);
    try {
      await updateNotificationPreferences({ celebration_sound_enabled: next });
      // ON にした瞬間に試聴 (UX: 「どんな音か聴ける」期待に応える)
      if (next) {
        await playCelebrationSound();
      }
    } catch (e) {
      setCelebrationEnabled(previous);
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    if (!celebrationEnabled) return;
    await playCelebrationSound();
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

  return (
    <ScreenContainer>
      <View className="mt-2 flex-row items-center">
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="戻る"
          className="-ml-2 min-h-[44px] min-w-[44px] items-center justify-center"
        >
          <Text className="text-h3 text-primary-dark">{'< 戻る'}</Text>
        </Pressable>
      </View>

      <Text className="mt-4 text-h1 text-text-primary">サウンドと触覚</Text>
      <Text className="mt-2 text-caption text-text-secondary">
        達成時の音や振動を設定します。サイレントモード中は鳴りません。
      </Text>

      <View className="mt-6 rounded-xl bg-surface" style={{ borderWidth: 1, borderColor: colors.border }}>
        <ToggleRow
          title="ウィザード達成音"
          description="家族カレンダー完成時に短い「ポン♪」音を再生します。"
          value={celebrationEnabled}
          onValueChange={handleToggleCelebration}
          disabled={saving}
          a11yLabel="ウィザード達成音"
          a11yHint="オンにするとウィザード完了時に短い音が鳴ります"
        />

        {celebrationEnabled && (
          <View className="border-t" style={{ borderColor: colors.border }}>
            <Pressable
              onPress={handlePreview}
              accessibilityRole="button"
              accessibilityLabel="達成音を試聴"
              className="min-h-[48px] flex-row items-center justify-between px-4 py-3 active:bg-primary-light"
            >
              <Text className="text-body text-text-primary">試聴する</Text>
              <Text className="text-h3 text-primary-dark">{'▶'}</Text>
            </Pressable>
          </View>
        )}
      </View>

      {reduceMotion && (
        <Text className="mt-3 text-caption text-text-secondary">
          ※「視差効果を減らす」が有効なため、達成画面の紙吹雪は表示されません。
          音の設定はこの設定とは独立して動作します。
        </Text>
      )}

      {error && (
        <Text accessibilityLiveRegion="polite" className="mt-4 text-caption text-error">
          {error}
        </Text>
      )}
    </ScreenContainer>
  );
}

interface ToggleRowProps {
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  a11yLabel: string;
  a11yHint?: string;
}

function ToggleRow({
  title,
  description,
  value,
  onValueChange,
  disabled,
  a11yLabel,
  a11yHint,
}: ToggleRowProps) {
  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={a11yLabel}
      accessibilityHint={a11yHint}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      className="min-h-[56px] flex-row items-center justify-between px-4 py-3 active:bg-primary-light"
    >
      <View className="flex-1 pr-4">
        <Text className="text-body text-text-primary">{title}</Text>
        {description && (
          <Text className="mt-1 text-caption text-text-secondary">{description}</Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor={colors.surface}
      />
    </Pressable>
  );
}
