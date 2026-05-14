/**
 * メンバー色変更用のカラーピッカー (8 色パレット)。
 *
 * 仕様:
 *   - 02_設計/画面/MEM-03-プロフィール編集.md §3.3 / §4.3
 *   - デザインシステム v0.3 §3.3 8 色パレット
 *   - 他メンバーと色が重複した場合は警告のみ (保存は許可、C-01 エッジケース)
 */

import { Pressable, Text, View } from 'react-native';

import { memberPalette } from '../../theme/colors';

const COLOR_NAMES: Record<string, string> = {
  '#FF6B7A': 'コーラル',
  '#5DADE2': 'スカイブルー',
  '#48C9B0': 'ミント',
  '#F4D03F': 'サンフラワー',
  '#A569BD': 'ラベンダー',
  '#F39C12': 'オレンジ',
  '#FF9F89': 'ピーチ',
  '#1ABC9C': 'ターコイズ',
};

export function colorNameOf(hex: string): string {
  return COLOR_NAMES[hex.toUpperCase()] ?? hex;
}

export interface ColorPickerSheetProps {
  /** 現在選択中の色 (hex、必ず一つは選択状態) */
  value: string;
  /** 選択変更ハンドラ */
  onChange: (color: string) => void;
  /** 他メンバーが使用中の色 (lowercase、警告表示用) */
  conflictColors?: readonly string[];
  /** 他メンバーが使用中の色 → メンバー名のマップ (lowercase キー) */
  conflictNameByColor?: ReadonlyMap<string, string>;
}

/**
 * 8 色チップ + 選択中色名 + 重複警告 を表示するインラインフォーム要素。
 * BottomSheet ではなく親画面に直接埋め込む (フルスクリーン画面で使用)。
 */
export function ColorPickerSheet({
  value,
  onChange,
  conflictColors,
  conflictNameByColor,
}: ColorPickerSheetProps) {
  const conflictSet = new Set((conflictColors ?? []).map((c) => c.toLowerCase()));
  const conflictName = conflictNameByColor?.get(value.toLowerCase());
  const isConflict = conflictSet.has(value.toLowerCase());

  return (
    <View className="mb-4" testID="color-picker-sheet">
      <Text className="mb-2 text-caption text-text-primary">カレンダーの色</Text>
      <View className="flex-row flex-wrap gap-2">
        {memberPalette.map((c) => {
          const selected = value.toLowerCase() === c.toLowerCase();
          return (
            <Pressable
              key={c}
              onPress={() => onChange(c)}
              className={`h-12 w-12 items-center justify-center rounded-full border-2 ${
                selected ? 'border-primary-dark' : 'border-transparent'
              }`}
              style={{ backgroundColor: c }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={`${colorNameOf(c)}、${selected ? '選択中' : '未選択'}`}
              testID={`color-picker-chip-${c}`}
            >
              {selected ? <Text className="text-white">✓</Text> : null}
            </Pressable>
          );
        })}
      </View>
      <Text className="mt-2 text-caption text-text-secondary" testID="color-picker-selected">
        選択中: {colorNameOf(value)}
      </Text>
      {isConflict && conflictName ? (
        <Text
          className="mt-1 text-caption text-warning"
          accessibilityLiveRegion="polite"
          testID="color-picker-conflict-warning"
        >
          ⚠ {conflictName}も同じ色を使っています
        </Text>
      ) : null}
    </View>
  );
}
