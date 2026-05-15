/**
 * SET-01 アプリ設定画面 (Phase D D4-T03 C-02)。
 *
 * 仕様: 02_設計/画面リスト.md SET-01、WBS §2.4 C-02
 *
 * AC1-4 (WBS §2.4 C-02):
 *   - AC1: ホーム/設定タブから到達、メニュー項目: 通知設定 / プライバシーポリシー / 利用規約 / ライセンス / バージョン情報 / 退会
 *   - AC2: 各メニュー項目タップで対応画面 (NOTIF-01 / WebView 等) に遷移
 *   - AC3: バージョン情報セクション: app version + build number (Phase E でストア版数連動)
 *   - AC4: Phase B NOTIF-01 (通知設定) と整合、達成音設定は NOTIF-01 §サウンドに統合済
 *
 * 設計判断:
 *   - リスト型 UI (cards) で WCAG 2.1 AA 準拠 (最小ヒット領域 44dp)
 *   - 外部リンク (プライバシーポリシー / 利用規約) は WebView 経由を想定 (現状は URL コピー or ブラウザ起動)
 *   - 広告同意 (C-05) はオンボーディングで取得済みのため、設定画面からは「再表示」リンクとして用意
 *   - 退会は 1 階層下 (SET-05) に分離して誤操作を最小化
 */

import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { APP_DISPLAY_NAME } from '../config/app';
import { URLS } from '../config/urls';
import { colors } from '../theme/colors';

// Expo の app.config.ts に合わせて固定。Phase E でストア版数 (eas-update / runtimeVersion) 連動に。
const APP_VERSION = '0.1.0';
const APP_BUILD = '1';

interface MenuItem {
  testID: string;
  label: string;
  description?: string;
  onPress: () => void;
  /** 末尾に表示する補助テキスト (例: バージョン値) */
  trailing?: string;
  /** 危険操作 (退会) */
  destructive?: boolean;
}

export function SettingsScreen() {
  const router = useRouter();

  const items: { section: string; rows: MenuItem[] }[] = [
    {
      section: '通知',
      rows: [
        {
          testID: 'settings-link-notifications',
          label: '通知設定',
          description: '前日 / 当日通知、サウンドなど',
          onPress: () => router.push('/(main)/notifications'),
        },
      ],
    },
    {
      section: 'プライバシー',
      rows: [
        {
          testID: 'settings-link-privacy',
          label: 'プライバシーポリシー',
          description: 'ブラウザで開きます',
          onPress: () => {
            void Linking.openURL(URLS.privacyPolicy).catch(() => undefined);
          },
        },
        {
          testID: 'settings-link-terms',
          label: '利用規約',
          description: 'ブラウザで開きます',
          onPress: () => {
            void Linking.openURL(URLS.termsOfService).catch(() => undefined);
          },
        },
        {
          testID: 'settings-link-ad-consent',
          label: '広告に関する設定',
          description: '同意状況を確認・変更',
          onPress: () => router.push('/(main)/consent/ad'),
        },
      ],
    },
    {
      section: 'サポート',
      rows: [
        {
          testID: 'settings-link-contact',
          label: 'お問い合わせ',
          description: 'メーラーが開きます',
          onPress: () => {
            void Linking.openURL(URLS.contact).catch(() => undefined);
          },
        },
      ],
    },
    {
      section: 'このアプリについて',
      rows: [
        {
          testID: 'settings-version-info',
          label: 'バージョン',
          trailing: `${APP_VERSION} (${APP_BUILD})`,
          onPress: () => {
            /* 表示のみ、no-op */
          },
        },
        {
          testID: 'settings-link-licenses',
          label: 'ライセンス',
          description: 'オープンソースライセンス情報',
          onPress: () => router.push('/(main)/settings/licenses'),
        },
      ],
    },
    {
      section: 'アカウント',
      rows: [
        {
          testID: 'settings-link-profile',
          label: 'プロフィール編集',
          onPress: () => router.push('/(main)/profile'),
        },
        {
          testID: 'settings-link-delete-account',
          label: '退会する',
          description: 'アカウントとデータの完全削除',
          onPress: () => router.push('/(main)/account/delete'),
          destructive: true,
        },
      ],
    },
  ];

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      style={{ backgroundColor: colors.background }}
      edges={['top', 'left', 'right']}
    >
      <View
        className="flex-row items-center border-b border-border bg-surface px-4 py-3"
        testID="settings-header"
      >
        <Pressable
          onPress={() => router.back()}
          className="min-h-tap min-w-tap items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="戻る"
          testID="settings-back"
        >
          <Text className="text-h3 text-text-primary">‹ 戻る</Text>
        </Pressable>
        <Text className="ml-2 text-h3 text-text-primary">設定</Text>
      </View>

      <ScrollView className="flex-1" testID="settings-scroll">
        <View className="px-4 py-4">
          <Text className="text-caption text-text-secondary">
            {APP_DISPLAY_NAME} の各種設定を管理します。
          </Text>
        </View>

        {items.map((group) => (
          <View key={group.section} className="mb-4">
            <Text
              accessibilityRole="header"
              className="mb-2 px-4 text-caption text-text-secondary"
            >
              {group.section}
            </Text>
            <View
              className="mx-4 rounded-card bg-surface"
              style={{ borderWidth: 1, borderColor: colors.border }}
            >
              {group.rows.map((row, index) => (
                <View key={row.testID}>
                  <Pressable
                    onPress={row.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={row.label}
                    accessibilityHint={row.description}
                    className="min-h-tap flex-row items-center justify-between px-4 py-3 active:bg-primary-light"
                    testID={row.testID}
                  >
                    <View className="flex-1 pr-4">
                      <Text
                        className={`text-body ${
                          row.destructive ? 'text-error' : 'text-text-primary'
                        }`}
                      >
                        {row.label}
                      </Text>
                      {row.description ? (
                        <Text className="mt-1 text-caption text-text-secondary">
                          {row.description}
                        </Text>
                      ) : null}
                    </View>
                    {row.trailing ? (
                      <Text className="text-caption text-text-secondary">{row.trailing}</Text>
                    ) : (
                      <Text className="text-caption text-text-secondary">›</Text>
                    )}
                  </Pressable>
                  {index < group.rows.length - 1 ? (
                    <View
                      className="h-px"
                      style={{ backgroundColor: colors.border }}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ))}

        <View className="h-12" />
      </ScrollView>
    </SafeAreaView>
  );
}
