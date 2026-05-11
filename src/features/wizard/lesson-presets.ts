/**
 * WIZ-03 サジェスト 10 種類（designer v0.3 §WIZ-03 確定）。
 *
 * 並び順は「人気・参加率の高い順」を designer が定性判断したもの。
 * MVP 第2弾以降に利用統計から再ソート予定（運用ルール）。
 *
 * 絵文字は iOS / Android の標準絵文字でレンダリング安定なもののみ採用。
 * ユーザー自由入力には絵文字を付けない（10 種類のみ絵文字、辞書はここに集約）。
 * 一覧表示時のカード絵文字は `lookupLessonEmoji(name)` を使う（名前マッチで決定、
 * スキーマ変更不要）。
 */

export interface LessonPreset {
  readonly emoji: string;
  readonly name: string;
}

export const LESSON_PRESETS: ReadonlyArray<LessonPreset> = [
  { emoji: '🏊', name: 'スイミング' },
  { emoji: '🎹', name: 'ピアノ' },
  { emoji: '⚽', name: 'サッカー' },
  { emoji: '📕', name: '英会話' },
  { emoji: '🥋', name: '空手' },
  { emoji: '📐', name: 'そろばん' },
  { emoji: '🎨', name: '絵画' },
  { emoji: '✍', name: '書道' },
  { emoji: '🩰', name: 'バレエ' },
  { emoji: '🤸', name: '体操' },
] as const;

const NAME_TO_EMOJI: ReadonlyMap<string, string> = new Map(
  LESSON_PRESETS.map((p) => [p.name, p.emoji]),
);

/**
 * 習い事の表示用絵文字を返す。
 * - サジェスト 10 種類のいずれかと完全一致する場合は対応する絵文字
 * - それ以外（ユーザー自由入力等）は `null`
 *
 * `lessons.emoji` カラムを追加するスキーマ変更を避けるため、名前マッチで決定する。
 */
export function lookupLessonEmoji(name: string): string | null {
  return NAME_TO_EMOJI.get(name.trim()) ?? null;
}
