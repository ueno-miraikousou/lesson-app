/**
 * AD-01 広告同意画面 (Phase D D4-T05 C-05 UI のみ)。
 *
 * 仕様: 02_設計/画面リスト.md AD-01、WBS §2.4 C-05
 *
 * AC1-4 (WBS §2.4 C-05):
 *   - AC1: ONBD 完了後または初回広告表示前に表示
 *   - AC2: 「個人化された広告に同意」「個人化しない (非個人化広告のみ)」「広告を表示しない (Phase E では未対応)」の 3 択
 *   - AC3: 選択結果を `ad_consent_state` (AsyncStorage + Phase E で notification_preferences または ad_consents テーブル) に保存
 *   - AC4: 設定画面 (SET-01) から再表示可能
 *
 * 設計判断 (Phase D = UI のみ、Phase E で UMP SDK 連動):
 *   - 永続化: AsyncStorage 'ad_consent_state' で MVP 互換性確保
 *   - 子供向け広告: COPPA / 国内ガイドライン準拠の文言を画面に明記
 *   - Phase E で react-native-google-mobile-ads + UMP SDK が選択を読み取る
 *   - 再表示可能 (toggle ではなく radio 形式で全 3 択明示)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '../components/ui/PrimaryButton';
import { URLS } from '../config/urls';
import { colors } from '../theme/colors';

export type AdConsentState = 'personalized' | 'non-personalized' | 'no-ads';

const STORAGE_KEY = 'ad_consent_state';

export async function loadAdConsentState(
  storage: Pick<typeof AsyncStorage, 'getItem'> = AsyncStorage,
): Promise<AdConsentState | null> {
  const stored = await storage.getItem(STORAGE_KEY);
  if (stored === 'personalized' || stored === 'non-personalized' || stored === 'no-ads') {
    return stored;
  }
  return null;
}

export async function saveAdConsentState(
  state: AdConsentState,
  storage: Pick<typeof AsyncStorage, 'setItem'> = AsyncStorage,
): Promise<void> {
  await storage.setItem(STORAGE_KEY, state);
}

interface ChoiceOption {
  value: AdConsentState;
  label: string;
  description: string;
  testID: string;
  /** Phase E SDK 連動前に「現在は機能未提供」表示 */
  disabled?: boolean;
  disabledNote?: string;
}

const OPTIONS: ChoiceOption[] = [
  {
    value: 'non-personalized',
    label: '個人化しない広告のみ表示',
    description:
      'お子様向けに配慮した、年齢・興味に合わせた個人情報を使わない広告を表示します。アプリの動作には影響しません。',
    testID: 'consent-option-non-personalized',
  },
  {
    value: 'personalized',
    label: '個人化された広告を表示',
    description:
      'より関連性の高い広告を表示するために、興味や利用状況の一部を広告配信に使用します。設定画面からいつでも変更できます。',
    testID: 'consent-option-personalized',
  },
  {
    value: 'no-ads',
    label: '広告を表示しない (Phase E で対応予定)',
    description:
      '将来的に、有料プランで広告を非表示にできるようにする予定です。現在の MVP 版では選択しても他オプションと同じ挙動になります。',
    testID: 'consent-option-no-ads',
    disabled: true,
    disabledNote: '近日提供予定',
  },
];

export interface AdConsentScreenProps {
  /** テスト用に storage を差し替え */
  storage?: typeof AsyncStorage;
  /** 保存完了後の遷移先 (デフォルト router.back) */
  onSaved?: (state: AdConsentState) => void;
}

export function AdConsentScreen({ storage = AsyncStorage, onSaved }: AdConsentScreenProps = {}) {
  const router = useRouter();
  const [selected, setSelected] = useState<AdConsentState>('non-personalized');
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const current = await loadAdConsentState(storage);
      if (cancelled) return;
      if (current) setSelected(current);
      setInitialLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [storage]);

  async function handleSubmit() {
    setSaving(true);
    try {
      // Phase D UI のみ: AsyncStorage に保存して終了。Phase E で UMP SDK 連動。
      await saveAdConsentState(selected, storage);
      if (onSaved) {
        onSaved(selected);
        return;
      }
      // 設定画面 → consent と来た場合は戻る、ONBD 経路は (main) 強制リダイレクト想定
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(main)/calendar');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      style={{ backgroundColor: colors.background }}
      edges={['top', 'left', 'right']}
    >
      <View
        className="flex-row items-center border-b border-border bg-surface px-4 py-3"
        testID="consent-header"
      >
        {router.canGoBack() ? (
          <Pressable
            onPress={() => router.back()}
            className="min-h-tap min-w-tap items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="戻る"
            testID="consent-back"
          >
            <Text className="text-h3 text-text-primary">‹ 戻る</Text>
          </Pressable>
        ) : null}
        <Text className="ml-2 text-h3 text-text-primary">広告に関する設定</Text>
      </View>

      <ScrollView className="flex-1 px-4 py-4" testID="consent-scroll">
        <Text className="text-h2 text-text-primary">広告表示の設定</Text>
        <Text className="mt-2 text-body text-text-secondary">
          本アプリは無料で提供するため、広告を表示します。広告の表示方法を選択してください。
        </Text>
        <Text className="mt-2 text-caption text-text-secondary" testID="consent-coppa-note">
          ※ お子様の個人情報は広告には使用しません。COPPA / 国内ガイドラインに準拠しています。
          詳細は{' '}
          <Text style={{ color: colors.primary }}>{URLS.privacyPolicy}</Text>
          {' '}をご覧ください。
        </Text>

        <View className="mt-4" testID="consent-options">
          {OPTIONS.map((opt) => {
            const isSelected = opt.value === selected;
            return (
              <Pressable
                key={opt.value}
                onPress={() => {
                  if (opt.disabled) return;
                  setSelected(opt.value);
                }}
                disabled={opt.disabled}
                accessibilityRole="radio"
                accessibilityLabel={opt.label}
                accessibilityState={{ selected: isSelected, disabled: !!opt.disabled }}
                testID={opt.testID}
                className={`mb-3 rounded-card px-4 py-3 ${
                  isSelected ? 'bg-primary-light' : 'bg-surface'
                } ${opt.disabled ? 'opacity-50' : ''}`}
                style={{
                  borderWidth: 2,
                  borderColor: isSelected ? colors.primary : colors.border,
                }}
              >
                <View className="flex-row items-center">
                  <View
                    className="mr-3 h-5 w-5 items-center justify-center rounded-full"
                    style={{
                      borderWidth: 2,
                      borderColor: isSelected ? colors.primary : colors.border,
                    }}
                  >
                    {isSelected ? (
                      <View
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: colors.primary }}
                      />
                    ) : null}
                  </View>
                  <Text className="flex-1 text-body text-text-primary">{opt.label}</Text>
                </View>
                <Text className="ml-8 mt-1 text-caption text-text-secondary">
                  {opt.description}
                </Text>
                {opt.disabledNote ? (
                  <Text className="ml-8 mt-1 text-caption text-error">{opt.disabledNote}</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <View className="mt-2">
          <PrimaryButton
            label="この設定で続ける"
            onPress={handleSubmit}
            loading={saving}
            disabled={!initialLoaded}
            testID="consent-submit"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default AdConsentScreen;
