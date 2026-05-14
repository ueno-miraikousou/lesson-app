import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '../components/ui/PrimaryButton';
import { fetchLessonById } from '../lib/lessons';
import { colors } from '../theme/colors';

/**
 * MEM-06 習い事詳細 (Sprint 4 C4-T01 最小実装)。
 *
 * 設計 MD は未起草 (designer 範囲)、ITEM-01 §1.5 AC1 「MEM-04 → MEM-06 → ITEM-01」導線確保が目的。
 * 内容: lesson 基本情報 (名前 / 教室 / 場所) + 「持ち物リスト編集」ボタンで ITEM-01 へ遷移。
 */
export function LessonDetailScreen() {
  const params = useLocalSearchParams<{ lessonId: string }>();
  const lessonId = params.lessonId ?? '';

  const query = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: () => fetchLessonById(lessonId),
    enabled: !!lessonId,
  });

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['top', 'left', 'right']}
    >
      <View
        className="flex-row items-center justify-between border-b border-border bg-surface px-4 py-3"
        testID="lesson-detail-header"
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="戻る"
          testID="lesson-detail-back"
          className="min-h-tap min-w-tap items-center justify-center"
        >
          <Text className="text-body text-primary">＜ 戻る</Text>
        </Pressable>
        <Text className="text-h3 text-text-primary">習い事詳細</Text>
        <View className="min-w-tap" />
      </View>

      {query.isLoading ? (
        <View className="flex-1 items-center justify-center" testID="lesson-detail-loading">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : query.isError || !query.data ? (
        <View className="flex-1 items-center justify-center px-4" testID="lesson-detail-error">
          <Text className="text-body text-error">習い事が見つかりませんでした</Text>
          <Pressable onPress={() => router.back()} className="mt-2">
            <Text className="text-body text-primary">戻る</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView className="flex-1 px-4 py-4" testID="lesson-detail-body">
          <View className="mb-4 flex-row items-center">
            <View
              className="mr-3 h-4 w-4 rounded-full"
              style={{ backgroundColor: query.data.member.color_hex }}
            />
            <Text className="text-caption text-text-secondary">
              {query.data.member.name} の習い事
            </Text>
          </View>

          <Text className="mb-4 text-h1 text-text-primary" testID="lesson-detail-name">
            {query.data.name}
          </Text>

          {query.data.classroom_name ? (
            <View className="mb-3">
              <Text className="text-caption text-text-secondary">教室名</Text>
              <Text className="text-body text-text-primary">{query.data.classroom_name}</Text>
            </View>
          ) : null}

          {query.data.location ? (
            <View className="mb-3">
              <Text className="text-caption text-text-secondary">場所</Text>
              <Text className="text-body text-text-primary">{query.data.location}</Text>
            </View>
          ) : null}

          {query.data.monthly_fee !== null && query.data.monthly_fee !== undefined ? (
            <View className="mb-3">
              <Text className="text-caption text-text-secondary">月謝</Text>
              <Text className="text-body text-text-primary">¥{query.data.monthly_fee}</Text>
            </View>
          ) : null}

          <View className="mt-6">
            <PrimaryButton
              label="持ち物リストを編集"
              onPress={() =>
                router.push({
                  pathname: '/(main)/lessons/[lessonId]/items',
                  params: { lessonId },
                })
              }
              testID="lesson-detail-edit-items"
            />
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
