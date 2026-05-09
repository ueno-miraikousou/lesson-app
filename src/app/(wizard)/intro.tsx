import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Text,
  View,
} from 'react-native';

import { PrimaryButton } from '../../components/ui/PrimaryButton';
import { ScreenContainer } from '../../components/ui/ScreenContainer';
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
 */

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Slide {
  key: string;
  title: string;
  body: string;
  emoji: string;
}

const SLIDES: ReadonlyArray<Slide> = [
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
  const flatListRef = useRef<FlatList<Slide>>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const setStep = useWizardStore((s) => s.setStep);

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
    // フェーズB で /(wizard)/step1 等を実装後にここをルーティング。
    // 現状はストアの currentStep を進めるだけのスケルトン状態。
  }

  function handleSkip() {
    handleStart();
  }

  const isLast = activeIndex === SLIDES.length - 1;

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
