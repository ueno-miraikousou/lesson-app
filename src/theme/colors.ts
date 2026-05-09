/**
 * カラートークン (デザインシステム v0.2 準拠)。
 * 実装は NativeWind の `tailwind.config.js` で消費される。
 *
 * 参照: 02_設計/デザインシステム.md v0.2 §2-§3
 *      社長 ターン1 Q3 で候補A (ローズピンク・暖色) 確定
 */

export const colors = {
  // ── プライマリ・セマンティック ──
  primary: '#FF8FA3',
  primaryDark: '#E76A85',
  primaryLight: '#FFD0DA',
  secondary: '#FFB088',

  // ── 背景・サーフェス ──
  background: '#FFF8F5',
  surface: '#FFFFFF',

  // ── テキスト ──
  textPrimary: '#2D1F1A',
  textSecondary: '#6B5D55',

  // ── 枠線・区切り ──
  border: '#E8DDD6',

  // ── ステータス (OS 標準準拠) ──
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',
} as const;

/**
 * メンバー識別カラー (members.color_hex の自動割当パレット)。
 * 9人目以降は1からループ。色被り時のみユーザー操作で変更可能。
 *
 * 参照: 02_設計/デザインシステム.md v0.2 §3.3
 */
export const memberPalette = [
  '#FF6B7A', // 1 コーラル (1人目: 妻)
  '#5DADE2', // 2 スカイブルー (2人目: 夫)
  '#48C9B0', // 3 ミント
  '#F4D03F', // 4 サンフラワー
  '#A569BD', // 5 ラベンダー
  '#F39C12', // 6 オレンジ
  '#FF9F89', // 7 ピーチ
  '#1ABC9C', // 8 ターコイズ
] as const;

export type MemberColor = (typeof memberPalette)[number];
export type ColorToken = keyof typeof colors;
