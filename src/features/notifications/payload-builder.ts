/**
 * Phase D Sprint 3 D3-T01..T04: 通知ペイロード組成 (N-01 / N-02 / N-03)。
 *
 * 設計判断 (ADR-008 §2.3 採用案):
 *
 * 1. 構造化 data + 表示時組成、本文 60 文字以内 + 持ち物 3 件明示 + 残り「他N点」省略。
 * 2. privacy mode 有効時は title「予定があります」+ body 空、data はそのまま (タップでアプリ open 時に詳細表示)。
 * 3. data に scheduleId / occurrenceDate / notificationType / memberId / lessonId / itemIds を含め、
 *    response-handler.ts の deeplink に使う。
 * 4. include_items_in_notification = false の場合は持ち物セクション省略 (タイトル + 「持ち物：(なし)」抑止)。
 * 5. skip_when_all_items_checked = true かつ全 ✓ 済の場合、scheduler 側で skip 判定し本層は呼ばれない。
 *    本層は「未チェック持ち物のみリスト化」する手前の API は提供 (`unchecked` フィルタ済 list を受ける)。
 *
 * 参照:
 *   - 02_設計/ADR/ADR-008 §2.3 (本文 60 文字以内 + 3 件明示 + 「他N点」)
 *   - 02_設計/通知設計-暫定意見.md v0.3 §3 (社長案「予定+持ち物統合通知」確定)
 *   - 要件定義 v0.6.2 §4.N-01..N-03
 */

import type { NotificationPreferences } from '../../types/database';

export type NotificationType = 'day_before' | 'same_day';

export interface NotificationDataPayload {
  scheduleId: string;
  occurrenceDate: string; // YYYY-MM-DD
  notificationType: NotificationType;
  memberId: string;
  lessonId: string;
  itemIds: readonly string[];
}

export interface NotificationContent {
  title: string;
  body: string;
  data: NotificationDataPayload;
  /**
   * expo-notifications `NotificationContentInput.sound` 仕様:
   *   - `true` = OS default sound 再生
   *   - `false` = サイレント
   *   - 文字列 = カスタムサウンド名 (MVP では未使用)
   */
  sound: boolean;
}

export interface BuildNotificationContentInput {
  type: NotificationType;
  /** 開始時刻 (壁時計表現の Date) */
  startAt: Date;
  /** メンバー表示名 (例: "すずちゃん") */
  memberName: string;
  /** 習い事名 (例: "スイミング") */
  lessonName: string;
  /** 場所 (任意、N-02 で利用) */
  location: string | null;
  /** 持ち物名のリスト (sort_order 昇順) */
  itemNames: readonly string[];
  /** scheduler が data に含める識別子 */
  ids: NotificationDataPayload;
  /** notification_preferences (privacy / 持ち物統合 / sound) */
  prefs: Pick<
    NotificationPreferences,
    'include_items_in_notification' | 'lock_screen_privacy_mode' | 'sound_enabled'
  >;
}

const MAX_ITEMS_DISPLAYED = 3;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "17:00" 形式 (24h) */
function formatTimeHHMM(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 持ち物統合セクションの本文を組成する。
 * 3 件まで明示 + 残りは「他 N 点」表記。空配列 / フラグ無効時は空文字を返す。
 */
export function buildItemsLine(
  itemNames: readonly string[],
  includeItems: boolean,
): string {
  if (!includeItems) return '';
  if (itemNames.length === 0) return '';

  if (itemNames.length <= MAX_ITEMS_DISPLAYED) {
    return `持ち物：${itemNames.join(' / ')}`;
  }
  const shown = itemNames.slice(0, MAX_ITEMS_DISPLAYED).join(' / ');
  const remaining = itemNames.length - MAX_ITEMS_DISPLAYED;
  return `持ち物：${shown} / 他${remaining}点`;
}

/**
 * タイトル文字列を組成する。
 * N-01 (前日): 「明日 17:00 すずちゃんのスイミング」
 * N-02 (当日): 「30 分後 17:00 すずちゃんのスイミング」 (場所あれば末尾に「(場所)」付与)
 */
export function buildTitle(input: BuildNotificationContentInput): string {
  const time = formatTimeHHMM(input.startAt);
  const memberLesson = `${input.memberName}の${input.lessonName}`;
  if (input.type === 'day_before') {
    return `明日 ${time} ${memberLesson}`;
  }
  // same_day: 場所表示は title ではなく body 側に回す案 (privacy mode 無効時のみ)
  return `まもなく ${time} ${memberLesson}`;
}

/**
 * Body 文字列を組成する。
 * - 持ち物統合 (include_items_in_notification = true かつ itemNames.length > 0) 時のみ持ち物セクション
 * - 当日 (same_day) で location あればその場所も追加
 */
export function buildBody(input: BuildNotificationContentInput): string {
  const parts: string[] = [];
  if (input.type === 'same_day' && input.location && input.location.trim() !== '') {
    parts.push(`場所：${input.location}`);
  }
  const itemsLine = buildItemsLine(
    input.itemNames,
    input.prefs.include_items_in_notification,
  );
  if (itemsLine !== '') parts.push(itemsLine);
  return parts.join('\n');
}

/**
 * privacy mode 適用版の title / body に差し替える。
 * iOS は OS Settings「プレビューを表示」側でも制御されるが、本アプリ内
 * トグル `lock_screen_privacy_mode = true` を最優先する。
 */
function applyPrivacyMode(
  title: string,
  body: string,
  enabled: boolean,
): { title: string; body: string } {
  if (!enabled) return { title, body };
  return { title: '予定があります', body: '' };
}

/**
 * N-01 / N-02 / N-03 統合の通知 content を組み立てる。
 * scheduler.ts から呼ばれる主 API。
 */
export function buildNotificationContent(
  input: BuildNotificationContentInput,
): NotificationContent {
  const rawTitle = buildTitle(input);
  const rawBody = buildBody(input);
  const { title, body } = applyPrivacyMode(
    rawTitle,
    rawBody,
    input.prefs.lock_screen_privacy_mode,
  );
  return {
    title,
    body,
    data: { ...input.ids },
    sound: input.prefs.sound_enabled,
  };
}
