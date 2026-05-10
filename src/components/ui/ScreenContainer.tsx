import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ScreenContainerProps {
  children: ReactNode;
  /** スクロール可能にする (フォーム画面で推奨) */
  scrollable?: boolean;
  /** padding を外側に追加するか (デフォルト true) */
  padded?: boolean;
}

/**
 * 認証系・フォーム系画面の共通ラッパ。
 * - SafeArea (iOS のノッチ・Android のステータスバー対策)
 * - KeyboardAvoidingView (iOS のキーボードでフォームが隠れないように)
 * - ScrollView (任意)
 * - 標準余白 16dp (デザインシステム §5 space-4)
 */
export function ScreenContainer({
  children,
  scrollable = true,
  padded = true,
}: ScreenContainerProps) {
  return (
    <SafeAreaView
      className="flex-1 bg-background"
      style={{ flex: 1, backgroundColor: '#FFF8F5' }}
      edges={['top', 'left', 'right']}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scrollable ? (
          <ScrollView
            className={padded ? 'flex-1 px-4 py-4' : 'flex-1'}
            keyboardShouldPersistTaps="handled"
            contentContainerClassName={padded ? 'pb-8' : ''}
          >
            {children}
          </ScrollView>
        ) : (
          <View className={padded ? 'flex-1 px-4 py-4' : 'flex-1'}>{children}</View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
