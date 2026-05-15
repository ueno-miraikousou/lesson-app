/**
 * SET-04 ライセンス画面 (オープンソース表示)。
 *
 * MVP: 主要ライブラリ名 + URL のリスト表示のみ。
 * Phase E: license-checker による自動生成 + WebView 表示。
 */

import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../../../theme/colors';

interface License {
  name: string;
  url: string;
  license: string;
}

const LICENSES: License[] = [
  { name: 'React Native', url: 'https://reactnative.dev/', license: 'MIT' },
  { name: 'Expo', url: 'https://expo.dev/', license: 'MIT' },
  { name: 'expo-router', url: 'https://expo.github.io/router/', license: 'MIT' },
  { name: 'Supabase JS', url: 'https://github.com/supabase/supabase-js', license: 'MIT' },
  { name: '@tanstack/react-query', url: 'https://tanstack.com/query', license: 'MIT' },
  { name: 'zustand', url: 'https://github.com/pmndrs/zustand', license: 'MIT' },
  { name: 'rrule.js', url: 'https://github.com/jakubroztocil/rrule', license: 'BSD-3-Clause' },
  { name: 'react-native-calendars', url: 'https://github.com/wix/react-native-calendars', license: 'MIT' },
  { name: 'nativewind', url: 'https://www.nativewind.dev/', license: 'MIT' },
  { name: 'lucide-react-native', url: 'https://lucide.dev/', license: 'ISC' },
];

export default function LicensesScreen() {
  const router = useRouter();

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      style={{ backgroundColor: colors.background }}
      edges={['top', 'left', 'right']}
    >
      <View
        className="flex-row items-center border-b border-border bg-surface px-4 py-3"
        testID="settings-licenses-header"
      >
        <Pressable
          onPress={() => router.back()}
          className="min-h-tap min-w-tap items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel="戻る"
          testID="settings-licenses-back"
        >
          <Text className="text-h3 text-text-primary">‹ 戻る</Text>
        </Pressable>
        <Text className="ml-2 text-h3 text-text-primary">ライセンス</Text>
      </View>

      <ScrollView className="flex-1 px-4 py-4" testID="settings-licenses-scroll">
        <Text className="mb-4 text-caption text-text-secondary">
          本アプリは以下のオープンソースライブラリを使用しています。
        </Text>

        {LICENSES.map((lib, index) => (
          <Pressable
            key={lib.name}
            onPress={() => {
              void Linking.openURL(lib.url).catch(() => undefined);
            }}
            accessibilityRole="button"
            accessibilityLabel={`${lib.name} (${lib.license})`}
            testID={`settings-licenses-item-${index}`}
            className="mb-2 rounded-card bg-surface px-4 py-3 active:bg-primary-light"
            style={{ borderWidth: 1, borderColor: colors.border }}
          >
            <Text className="text-body text-text-primary">{lib.name}</Text>
            <Text className="mt-1 text-caption text-text-secondary">
              {lib.license} · {lib.url}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
