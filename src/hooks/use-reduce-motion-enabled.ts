import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Reflects the OS-level "Reduce Motion" / "視差効果を減らす" accessibility
 * setting. Returns true when the user has asked the system to minimise
 * non-essential animation.
 *
 * Usage:
 *   - WIZ-09 must disable the confetti when this is true (designer v0.3 §WIZ-09,
 *     line 708 — "完全に停止しテキストのみ表示").
 *   - The hook reacts to runtime toggles via the
 *     `reduceMotionChanged` AccessibilityInfo event, so flipping the OS
 *     setting while the app is running updates the UI on the next render.
 *
 * Implementation notes:
 *   - We use the basic `AccessibilityInfo.isReduceMotionEnabled()` (returns a
 *     Promise<boolean>) rather than `isReducedMotionEnabled` because the
 *     latter is iOS 14+ only and the former is available on both platforms in
 *     React Native 0.76.
 *   - On older Android versions without the system setting this resolves to
 *     false, which is the correct default (animations on).
 */
export function useReduceMotionEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;

    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (!cancelled) setEnabled(value);
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (value: boolean) => {
        if (!cancelled) setEnabled(value);
      },
    );

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return enabled;
}
