import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

import { useReduceMotionEnabled } from '../../hooks/use-reduce-motion-enabled';

/**
 * WIZ-09 紙吹雪演出 (designer v0.3 §WIZ-09 — 控えめ仕様)
 *
 * Spec (designer v0.3 lines 692〜):
 *   - 枚数: 15〜20 枚 (props で上書き可、デフォルト 18)
 *   - サイズ: 6 × 10 dp
 *   - 落下時間: 800ms (回転 + 落下 + フェードアウト)
 *   - カラー: メインカラー系 4 色からランダム
 *   - Reduce Motion ON 時: 完全に停止 (`null` を返す。a11y 必須要件)
 *
 * Implementation choice — plain RN Animated (not react-native-confetti-cannon):
 *   - The R-strategy patch leaves Reanimated 3 in place and forbids the
 *     external worklets package; sticking to RN's built-in Animated keeps the
 *     surface area small and side-steps that whole class of issues.
 *   - 18 sprites @ 800ms is well within Animated's comfort zone — no JS-thread
 *     pressure, no need for the native driver (we animate translateY +
 *     rotate + opacity, all supported).
 *   - Library size: 0 bytes added. Maintenance: owned in-tree, easy to tweak.
 *
 * Performance notes:
 *   - `useNativeDriver: true` for every animation so frames run off the JS
 *     thread. translate / rotate / opacity are all native-driver-safe.
 *   - All sprites animate in parallel via Animated.parallel(...).
 */

const CONFETTI_COLORS = [
  '#FF8FA3', // primary (rose pink)
  '#FFD0DA', // primary-light (pale pink)
  '#FFB088', // secondary (warm gold)
  '#FFFFFF', // surface (white)
] as const;

interface ConfettiPieceParams {
  readonly color: string;
  /** Horizontal start position in dp, relative to the playing field. */
  readonly startX: number;
  /** Horizontal drift in dp added over the fall. */
  readonly drift: number;
  /** Total rotation in turns (e.g. 1.5 = 540°). */
  readonly turns: number;
  /** Start delay in ms (staggered to avoid a single uniform burst). */
  readonly delay: number;
}

export interface ConfettiProps {
  /** When false the component renders nothing (used to gate trigger). */
  readonly active?: boolean;
  /** Total number of confetti pieces. Designer spec: 15〜20. Default 18. */
  readonly count?: number;
  /** Total fall duration in ms. Designer spec: 800ms. */
  readonly fallDurationMs?: number;
}

export function Confetti({ active = true, count = 18, fallDurationMs = 800 }: ConfettiProps) {
  const reduceMotion = useReduceMotionEnabled();
  const { width, height } = useWindowDimensions();

  // Stable per-piece parameters — generated once per mount so each piece keeps
  // its color/start/drift/spin throughout the animation.
  const pieces = useMemo<ConfettiPieceParams[]>(() => {
    const safeCount = Math.max(0, Math.floor(count));
    const arr: ConfettiPieceParams[] = [];
    for (let i = 0; i < safeCount; i += 1) {
      arr.push({
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
        startX: Math.random() * width,
        drift: (Math.random() - 0.5) * 80, // -40 〜 +40 dp の横移動
        turns: 1 + Math.random() * 2, // 1 〜 3 回転
        delay: Math.random() * 200, // 0 〜 200ms のスタッガー
      });
    }
    return arr;
  }, [count, width]);

  // Reduce Motion ON or inactive → render nothing (a11y: 完全停止).
  if (reduceMotion || !active) return null;

  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {pieces.map((piece, idx) => (
        <ConfettiPiece
          key={idx}
          params={piece}
          fallHeight={height}
          fallDurationMs={fallDurationMs}
        />
      ))}
    </View>
  );
}

interface ConfettiPieceProps {
  readonly params: ConfettiPieceParams;
  readonly fallHeight: number;
  readonly fallDurationMs: number;
}

function ConfettiPiece({ params, fallHeight, fallDurationMs }: ConfettiPieceProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: fallDurationMs,
      delay: params.delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, fallDurationMs, params.delay]);

  // translateY: from -20 (just above the visible top) to the full screen height
  // — the piece exits the bottom of the visible area.
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-20, fallHeight + 20],
  });

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, params.drift],
  });

  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${params.turns * 360}deg`],
  });

  // Fade out over the last 25% of the fall to avoid an abrupt clip at the
  // bottom of the screen.
  const opacity = progress.interpolate({
    inputRange: [0, 0.75, 1],
    outputRange: [1, 1, 0],
  });

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          left: params.startX,
          backgroundColor: params.color,
          transform: [{ translateY }, { translateX }, { rotate }],
          opacity,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    top: 0,
    width: 6,
    height: 10,
    borderRadius: 1,
  },
});
