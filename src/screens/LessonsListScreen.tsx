import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AdBanner } from '../components/ads/AdBanner';
import { PrimaryButton } from '../components/ui/PrimaryButton';
import { fetchLessonsWithMembers, type LessonWithMember } from '../lib/lessons';
import { useAuthStore } from '../stores/auth-store';
import { colors } from '../theme/colors';

/**
 * MEM-04 習い事一覧 (Sprint 4 C4-T01)。
 *
 * 設計 MD は未起草 (designer 範囲)、ITEM-01 §1.5 AC1 で求められる導線として最低限の一覧画面を実装。
 * メンバー別にグループ化、各 lesson カードタップで MEM-06 詳細 (lessons/[lessonId]) へ遷移。
 */
export function LessonsListScreen() {
  const householdId = useAuthStore((s) => s.householdId);

  const query = useQuery({
    queryKey: ['lessons', householdId],
    queryFn: () => {
      if (!householdId) throw new Error('householdId is missing');
      return fetchLessonsWithMembers(householdId);
    },
    enabled: !!householdId,
  });

  const grouped = useGroupByMember(query.data);

  return (
    <SafeAreaView
      className="flex-1 bg-background"
      style={{ flex: 1, backgroundColor: colors.background }}
      edges={['top', 'left', 'right']}
    >
      <View
        className="flex-row items-center justify-between border-b border-border bg-surface px-4 py-3"
        testID="lessons-list-header"
      >
        <Text className="text-h2 text-text-primary">習い事一覧</Text>
        <PrimaryButton
          label="戻る"
          variant="secondary"
          onPress={() => router.back()}
          testID="lessons-list-back"
        />
      </View>

      {query.isLoading ? (
        <View className="flex-1 items-center justify-center" testID="lessons-list-loading">
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : query.isError ? (
        <View className="flex-1 items-center justify-center px-4" testID="lessons-list-error">
          <Text className="text-body text-error">習い事を読み込めませんでした</Text>
          <Pressable onPress={() => void query.refetch()} className="mt-2">
            <Text className="text-body text-primary">再試行</Text>
          </Pressable>
        </View>
      ) : grouped.length === 0 ? (
        <View className="flex-1 items-center justify-center px-4" testID="lessons-list-empty">
          <Text className="text-body text-text-secondary">習い事がまだ登録されていません</Text>
          <Text className="mt-1 text-caption text-text-secondary">
            ウィザードから家族の習い事を登録してください
          </Text>
        </View>
      ) : (
        <ScrollView
          className="flex-1 px-4 py-4"
          contentContainerStyle={{ paddingBottom: 24 }}
          testID="lessons-list-scroll"
        >
          {grouped.map((group) => (
            <View key={group.memberId} className="mb-5" testID={`lessons-group-${group.memberId}`}>
              <View className="mb-2 flex-row items-center">
                <View
                  className="mr-2 h-3 w-3 rounded-full"
                  style={{ backgroundColor: group.color }}
                />
                <Text className="text-h3 text-text-primary">{group.memberName}</Text>
              </View>
              {group.lessons.map((l) => (
                <Pressable
                  key={l.id}
                  onPress={() =>
                    router.push({ pathname: '/(main)/lessons/[lessonId]', params: { lessonId: l.id } })
                  }
                  className="mb-2 rounded-button border border-border bg-surface px-3 py-3"
                  accessibilityRole="button"
                  accessibilityLabel={`${group.memberName}の${l.name}、詳細へ`}
                  testID={`lesson-card-${l.id}`}
                >
                  <Text className="text-body text-text-primary">{l.name}</Text>
                  {l.classroom_name ? (
                    <Text className="text-caption text-text-secondary">{l.classroom_name}</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      )}

      <AdBanner testID="lessons-list-ad-banner" />
    </SafeAreaView>
  );
}

interface MemberGroup {
  memberId: string;
  memberName: string;
  color: string;
  lessons: LessonWithMember[];
}

function useGroupByMember(lessons: LessonWithMember[] | undefined): MemberGroup[] {
  if (!lessons || lessons.length === 0) return [];
  const map = new Map<string, MemberGroup>();
  for (const l of lessons) {
    const m = l.member;
    if (!map.has(m.id)) {
      map.set(m.id, { memberId: m.id, memberName: m.name, color: m.color_hex, lessons: [] });
    }
    map.get(m.id)!.lessons.push(l);
  }
  return Array.from(map.values());
}
