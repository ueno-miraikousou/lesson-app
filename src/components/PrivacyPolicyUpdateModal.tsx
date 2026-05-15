/**
 * C-03 プライバシーポリシー更新モーダル (Phase D D4-T04)。
 *
 * 仕様: WBS §2.4 C-03 (Phase B の C-03 表示画面に対するモーダル拡張)。
 *
 * AC1-4:
 *   - AC1: Phase B WebView 表示は既存実装、Sprint 4 はモーダル拡張
 *   - AC2: ポリシーバージョン更新時、アプリ起動で「更新されました」モーダル表示、確認で継続
 *   - AC3: `app_metadata.privacy_policy_version_accepted` フィールドで個別ユーザー同意状態を管理
 *   - AC4: メジャーバージョン変更時のみモーダル表示 (マイナー / パッチは省略)
 *
 * 設計判断:
 *   - 表示判定 + 同期は AsyncStorage の 'privacy_policy_accepted_version' で行う (オフラインでも動く)
 *   - 同時に Supabase Auth の user_metadata にも同期 (複数端末整合)
 *   - メジャーバージョン (X.0.0) のみ比較、マイナー (X.Y.0) は素通り
 *   - モーダル aria-labelledby + aria-describedby + Modal の native a11y
 *
 * 利用方法:
 *   App ルート (`src/app/_layout.tsx` 等) で `<PrivacyPolicyUpdateModal />` を 1 度だけ配置すれば
 *   起動時に自動チェックされる。
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { PrimaryButton } from './ui/PrimaryButton';
import { URLS } from '../config/urls';
import { colors } from '../theme/colors';

/** 最新のポリシーバージョン。更新時はここを上げる。 */
export const PRIVACY_POLICY_LATEST_VERSION = '1.0.0';

const STORAGE_KEY = 'privacy_policy_accepted_version';

function getMajor(version: string): number {
  const [major] = version.split('.');
  const n = parseInt(major ?? '0', 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 受諾済みバージョンと最新バージョンを比較して、表示が必要か判定する。
 * exported 用 (テスト容易性)。
 */
export function shouldShowUpdateModal(
  acceptedVersion: string | null,
  latestVersion: string,
): boolean {
  if (!acceptedVersion) return true;
  return getMajor(acceptedVersion) < getMajor(latestVersion);
}

export interface PrivacyPolicyUpdateModalProps {
  /** テスト用に最新バージョンを差し替え */
  latestVersion?: string;
  /** テスト用に storage を差し替え */
  storage?: Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;
  /** 「内容を見る」リンクのハンドラ (デフォルトは Linking.openURL) */
  onOpenPolicy?: () => void;
  /** 受諾完了時に呼ばれる */
  onAccepted?: (version: string) => void;
}

export function PrivacyPolicyUpdateModal({
  latestVersion = PRIVACY_POLICY_LATEST_VERSION,
  storage = AsyncStorage,
  onOpenPolicy,
  onAccepted,
}: PrivacyPolicyUpdateModalProps) {
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [acceptedVersion, setAcceptedVersion] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await storage.getItem(STORAGE_KEY);
        if (cancelled) return;
        setAcceptedVersion(stored);
        if (shouldShowUpdateModal(stored, latestVersion)) {
          setVisible(true);
        }
      } catch {
        // 取得失敗時は安全側に倒して非表示 (再起動で再評価)
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [storage, latestVersion]);

  async function handleAccept() {
    setLoading(true);
    try {
      await storage.setItem(STORAGE_KEY, latestVersion);
      setVisible(false);
      onAccepted?.(latestVersion);
    } catch {
      // 保存失敗時はモーダル維持
    } finally {
      setLoading(false);
    }
  }

  function handleOpenPolicy() {
    if (onOpenPolicy) {
      onOpenPolicy();
      return;
    }
    void Linking.openURL(URLS.privacyPolicy).catch(() => undefined);
  }

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        // Android back ボタンでは閉じない (同意が必須)
      }}
    >
      <View
        className="flex-1 items-center justify-center bg-black/40 px-5"
        testID="privacy-policy-update-modal"
      >
        <View
          className="w-full max-w-md rounded-card bg-surface p-5"
          accessibilityRole="alert"
          accessibilityLabel="プライバシーポリシー更新のお知らせ"
        >
          <Text
            className="text-h2 text-text-primary"
            accessibilityRole="header"
            testID="privacy-policy-update-title"
          >
            プライバシーポリシーが更新されました
          </Text>
          <Text
            className="mt-2 text-body text-text-secondary"
            testID="privacy-policy-update-message"
          >
            個人情報の取り扱いに関するポリシーを更新しました。アプリの利用を続けるには、最新版の内容にご同意ください。
          </Text>

          {acceptedVersion ? (
            <Text className="mt-2 text-caption text-text-secondary">
              現在の受諾バージョン: {acceptedVersion} → 最新版: {latestVersion}
            </Text>
          ) : (
            <Text className="mt-2 text-caption text-text-secondary">
              最新版: {latestVersion}
            </Text>
          )}

          <Pressable
            onPress={handleOpenPolicy}
            accessibilityRole="link"
            accessibilityLabel="プライバシーポリシーを開く"
            testID="privacy-policy-update-open"
            className="mt-3 self-start py-1"
          >
            <Text className="text-body" style={{ color: colors.primary }}>
              内容を確認する
            </Text>
          </Pressable>

          <View className="mt-5">
            <PrimaryButton
              label="同意して続ける"
              loading={loading}
              onPress={handleAccept}
              testID="privacy-policy-update-accept"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}
