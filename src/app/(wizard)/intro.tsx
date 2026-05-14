import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  View,
} from 'react-native';

import { AddModeBadge } from '../../components/wizard/AddModeBadge';
import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
import { useExistingHouseholdData } from '../../features/wizard/use-existing-household-data';
import { useAuthStore } from '../../stores/auth-store';
import { useWizardStore } from '../../stores/wizard-store';

/**
 * WIZ-00 価値訴求 + ウィザード開始（最小スケルトン）。
 *
 * デザイン v0.2 の3スワイプ構造を踏襲:
 *   1) 困りごと共感
 *   2) 価値提案
 *   3) 開始確認
 *
 * 本実装はフェーズB でイラストとアニメーションを追加する。
 *
 * 参照: 02_設計/画面/WIZ-ウィザード一括設計.md WIZ-00
 *
 * Sprint 6 (Phase C / W-10): `?mode=add` ルートパラメータで WIZ-10 追加モードに切替。
 * 設計参照: ADR-006 §2.1 / 02_設計/画面/WIZ-10-後からウィザード.md §3.1
 */

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Slide {
  key: string;
  title: string;
  body: string;
  emoji: string;
}

const SLIDES: readonly Slide[] = [
  {
    key: 'pain',
    title: '家族みんなの習い事を\n1つ1つ登録するの、\n大変ですよね。',
    body: 'カレンダー、ノート、メモアプリ。色々使い分けると、すぐに迷子になってしまいます。',
    emoji: '😩',
  },
  {
    key: 'value',
    title: '質問に答えていくだけで、\n家族のスケジュールが\n1分で完成します。',
    body: 'お子さんも、ママ・パパ自身も。家族みんなの習い事を、まとめて登録できます。',
    emoji: '✨',
  },
  {
    key: 'start',
    title: '準備ができたら、\nはじめましょう。',
    body: '途中でやめても、あとから再開できます。',
    emoji: '🎵',
  },
];

export default function WizardIntroScreen() {
  const params = useLocalSearchParams<{ mode?: 'add' | 'new' }>();
  const routeMode = params.mode === 'add' ? 'add' : 'new';
  const flatListRef = useRef<FlatList<Slide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const setStep = useWizardStore((s) => s.setStep);
  const setMode = useWizardStore((s) => s.setMode);
  const clearWizard = useWizardStore((s) => s.clear);
  const householdId = useAuthStore((s) => s.householdId);

  // ADR-006 §2.4: mode=add 時は既存 wizard state を必ずクリア (キー混在回避)
  useEffect(() => {
    if (routeMode === 'add') {
      clearWizard();
      setMode('add');
    } else {
      setMode('new');
    }
  }, [routeMode, clearWizard, setMode]);

  const existing = useExistingHouseholdData(householdId, routeMode === 'add');

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const offsetX = e.nativeEvent.contentOffset.x;
    const next = Math.round(offsetX / SCREEN_WIDTH);
    if (next !== activeIndex) {
      setActiveIndex(next);
    }
  }

  function handleNext() {
    if (activeIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
      return;
    }
    handleStart();
  }

  function handleStart() {
    setStep('step1-children-count');
    router.push('/(wizard)/step1');
  }

  function handleSkip() {
    handleStart();
  }

  const isLast = activeIndex === SLIDES.length - 1;

  // === WIZ-10 追加モード: 既存数表示 + 追加対象選択 (designer-3 §3.1) ===
  if (routeMode === 'add') {
    return (
      <ScreenContainer scrollable={false}>
        <View className="flex-row items-center justify-between px-4 py-2">
          <AddModeBadge />
          <Pressable
            onPress={() => router.replace('/')}
            className="min-h-tap min-w-tap items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="閉じる"
            testID="wiz-add-mode-close"
          >
            <Text className="text-h2 text-text-primary">×</Text>
          </Pressable>
        </View>

        <View className="flex-1 px-4 pt-2">
          <Text className="text-h1 text-text-primary" testID="wiz-add-mode-title">
            家族を追加しましょう
          </Text>
          <Text className="mt-2 text-body text-text-secondary">
            既存のデータはそのまま、追加分だけが登録されます
          </Text>

          {existing.isLoading ? (
            <View className="mt-6 items-center" testID="wiz-add-mode-loading">
              <ActivityIndicator />
            </View>
          ) : (
            <View
              className="mt-6 rounded-card border border-border bg-surface p-4"
              testID="wiz-add-mode-existing-summary"
            >
              <Text className="text-caption text-text-secondary">現在の登録</Text>
              <Text className="mt-1 text-body text-text-primary">
                子供 {existing.data.childCount} 人 ・ 親 {existing.data.parentCount} 人
                {existing.data.otherCount > 0
                  ? ` ・ その他 ${existing.data.otherCount} 人`
                  : ''}
              </Text>
              {existing.data.lessonCount > 0 ? (
                <Text className="mt-1 text-caption text-text-secondary">
                  習い事 {existing.data.lessonCount} 件
                </Text>
              ) : null}
            </View>
          )}

          <Text className="mt-6 text-h3 text-text-primary">何を追加しますか？</Text>
          <View className="mt-3 gap-3">
            <Pressable
              onPress={handleStart}
              className="rounded-card border-2 border-primary bg-primary-light/40 p-4 active:bg-primary-light"
              accessibilityRole="button"
              testID="wiz-add-mode-start-children"
            >
              <Text className="text-h3 text-primary-dark">+ 家族メンバーを追加する</Text>
              <Text className="mt-1 text-caption text-text-secondary">
                子供 / 親戚 / その他のメンバー + 習い事
              </Text>
            </Pressable>
          </View>

          <View className="mt-6 rounded-card bg-primary-light/30 p-3">
            <Text className="text-caption text-text-secondary">
              ヒント: 既存メンバーの情報を変更したい場合は、設定 → プロフィール編集から行えます
            </Text>
          </View>
        </View>

        <View className="px-4 pb-6">
          <PrimaryButton label="後でやる" variant="text" onPress={() => router.replace('/')} />
        </View>
      </ScreenContainer>
    );
  }

  // === 通常モード (初回ウィザード) ===
  return (
    <ScreenContainer scrollable={false} padded={false}>
      {/* スキップ */}
      <View className="flex-row justify-end px-4 py-2">
        <PrimaryButton label="スキップ" variant="text" onPress={handleSkip} />
      </View>

      {/* スワイプスライド */}
      <View className="flex-1">
        <FlatList
          ref={flatListRef}
          data={SLIDES as Slide[]}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <View style={{ width: SCREEN_WIDTH }} className="items-center justify-center px-6">
              <View className="h-40 w-40 items-center justify-center rounded-card bg-primary-light">
                <Text className="text-display">{item.emoji}</Text>
              </View>
              <Text className="mt-8 text-center text-h1 text-text-primary">{item.title}</Text>
              <Text className="mt-4 text-center text-body text-text-secondary">{item.body}</Text>
            </View>
          )}
        />
      </View>

      {/* ページインジケータ */}
      <View className="flex-row items-center justify-center py-3">
        {SLIDES.map((s, i) => (
          <View
            key={s.key}
            className={`mx-1 h-2 w-2 rounded-full ${i === activeIndex ? 'bg-primary' : 'bg-border'}`}
          />
        ))}
      </View>

      {/* CTA ボタン */}
      <View className="px-4 pb-6">
        {isLast ? (
          <View>
            <PrimaryButton label="はじめる" onPress={handleStart} />
            <View className="mt-2">
              <PrimaryButton
                label="後でやる"
                variant="text"
                onPress={() => router.replace('/')}
              />
            </View>
          </View>
        ) : (
          <PrimaryButton label="次へ" onPress={handleNext} />
        )}
      </View>
    </ScreenContainer>
  );
}
