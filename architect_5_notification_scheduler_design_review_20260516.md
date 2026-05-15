# 通知スケジューラ 設計レビュー (Sprint 3 D3-T01..T06 ME-5 implementer support)

**作成**: architect-5 セッション #6 / 2026-05-16
**用途**: Phase D Sprint 3 D3-T01..T06 で ME-5 が実装する通知本体 (N-01..N-05) の技術判断支援。ADR-008 Accepted v1.0 を前提に、ME-5 が `src/features/notifications/` 配下に 4 ファイル新規実装する際の具体的ガイダンス + 落とし穴 + テスト戦略 + Sprint 2 useHouseholdRealtime との相互作用設計。

**前提読了済み**:
- ADR-008 Accepted v1.0 (2026-05-16 architect-5 セッション #6 採択、§7 PoC 結果 + §5 リスク 16 件)
- ADR-007 Accepted (Realtime + LWW + 世帯単位 channel + 8 テーブル publication)
- Sprint 2 設計レビュー (`architect_5_useHouseholdRealtime_design_review_20260516.md`)
- Phase D WBS v0.1 §4.2 Sprint 3 D3-T01..T09
- Phase B 完遂物: `expo-notifications` v0.29.0 / `notification_preferences` 9 フィールド / `src/lib/notification-preferences.ts` / `src/app/onboarding/notification-permission.tsx`
- DDL: `0001_initial_schema.sql:192-205` + `0003_celebration_sound.sql` (notification_preferences 9 フィールド)
- DDL: `0001_initial_schema.sql:88-99` (schedules 7 列: id / lesson_id / start_at / end_at / recurrence_rule / recurrence_until / note)

**前提**: `src/features/notifications/` ディレクトリは現状不存在 = ME-5 が新規作成、本書はそのレビュー指針。

---

## 0. エグゼクティブサマリ

### 0.1 設計判断 (architect-5 推奨)

| # | 論点 | ME-5 への推奨 | 根拠 |
|---|------|--------------|------|
| 1 | timezone 取扱 | **Asia/Tokyo 固定 (定数 `LOCAL_TIMEZONE = 'Asia/Tokyo'`)**、DST 非対応、日本は DST なし | 要件定義 §3.A / MVP 国内向け / DST 不要 |
| 2 | スケジュール window | **14 日先まで** (`SCHEDULE_WINDOW_DAYS = 14`)、起動時 reconcile で繰り上げ | ADR-008 §7.2 iOS 64 件制限対処 |
| 3 | 自編集 echo 抑止 | **`commit_timestamp` + `lastLocalCommitTs` + 100ms 窓比較**、AsyncStorage 永続化 | ADR-008 §7.5 R-D8-16 + Sprint 2 §2.5 連動 |
| 4 | 通知発火 → React Query invalidate ループ防止 | **「通知発火は React Query を触らない」原則**、UI 更新は別経路 (NOTIF tap 時の deeplink 内で取得) | 本書 §3 |
| 5 | trigger event matrix の hook 配置 | **scheduler.ts 単一エントリ + 各 trigger 用 export 関数**、useHouseholdRealtime / useNotificationPreferences / use mutation hook 等から呼出 | ADR-008 §2.2 + 単一責任 |
| 6 | RRULE 展開 | **rrule.js v2 + DTSTART UTC 強制パターン (memory #36M 既存)** で occurrence 列挙、TZ 無依存化 | 既存 memory + Phase B rrule.js v2 想定 |
| 7 | 持ち物統合通知の `skip_when_all_items_checked` 評価 | **当日通知の trigger 直前ではなく、通知作成時 + `schedule_item_checks` UPSERT 受信時の 2 経路**、trigger 直前評価は OS 制約上不可 | ADR-008 §2.3 + 既存 OS API 制約 |
| 8 | cold start handler 配置 | **`src/app/_layout.tsx` の `RootContent` 内**、`useLastNotificationResponse` 呼出 → router.push | ADR-008 §7.4 + 既存 `_layout.tsx` 構造 |

### 0.2 ME-5 への実装最小セット (Sprint 3 5 日完遂目標)

```
src/features/notifications/
├── scheduler.ts             (D3-T01: 中核ロジック、event-driven 再予約 = ADR-008 §2.2 matrix)
├── payload-builder.ts       (D3-T01: 通知本文組成 = ADR-008 §2.3、持ち物統合 + privacy mode)
├── response-handler.ts      (D3-T01: background path tap listener、subscribe 配置)
├── cold-start-handler.ts    (D3-T01: killed state cold start path、useLastNotificationResponse)
└── __tests__/
    ├── scheduler.test.ts
    ├── payload-builder.test.ts
    ├── response-handler.test.ts
    └── cold-start-handler.test.ts
```

### 0.3 ME-5 連携指針

1. **本書 §2 を読んでから ADR-008 §2 をクロスレビュー** (順序重要)
2. **§3 React Query ループ防止パターンを必ず適用** (重要な失敗 mode)
3. **§4 のテスト構成 (L1 + L2) を Sprint 3 中に書き切る**
4. **疑問発生時は連番 [ME-5 #N] で本ファイル経路で architect-5 へ SendMessage**

---

## 1. ADR-008 §2 雛形との差分 (現状コードベース反映)

### 1.1 雛形コードの留意点

| # | ADR-008 §2 雛形 | 現状コードベース実装上の注意点 | 対処 |
|---|---|---|---|
| 1.1.A | `Notifications.scheduleNotificationAsync({ trigger: { date: ... } })` | RN 環境では `Date` の TZ 扱いに注意、`new Date('2026-05-17T21:00:00')` は local TZ 解釈、`+09:00` 明示推奨 | **`LOCAL_TIMEZONE = 'Asia/Tokyo'`** + ISO 8601 with offset `+09:00` で組み立て (本書 §2.1) |
| 1.1.B | `data: { scheduleId, occurrenceDate, ... }` | `expo-notifications` の `data` field は **JSON-serializable のみ**、Date / Map / Set 不可 | **string / number / boolean / array のみ**、occurrenceDate は `'YYYY-MM-DD'` ISO string、Date オブジェクト渡し禁止 |
| 1.1.C | `addNotificationResponseReceivedListener` で deeplink | **killed state では発火しない** (ADR-008 §7.4 R-D8-14) | **`cold-start-handler.ts` + `response-handler.ts` の 2 経路実装**、§2.7 で詳述 |
| 1.1.D | Realtime 経由再予約の echo 抑止 | sender id 公式未提供 (ADR-008 §7.5 R-D8-16) | **`commit_timestamp` 比較で client 側抑制**、§2.5 で詳述 |
| 1.1.E | `notification_preferences` の DEFAULTS は既存 lib | DDL 行未存在時のサーバ DEFAULT との二重定義 risk | **`src/lib/notification-preferences.ts` の `NOTIFICATION_PREFERENCES_DEFAULTS` をそのまま import**、scheduler 内で再定義禁止 |
| 1.1.F | members.notifications_muted + lessons.notifications_muted | 0001 DDL で 56 行 + 76 行で確認 (`members.notifications_muted` + `lessons.notifications_muted`) | scheduler 内で reduce: `effective_muted = household_pref_off OR member.muted OR lesson.muted` |

### 1.2 雛形に追加すべき要素

| # | 雛形にない要素 | 追加理由 |
|---|---|---|
| 1.2.A | timezone 定数集約 | DST 切替 (将来万一) / TZ 変更時の影響範囲縮小 |
| 1.2.B | `SCHEDULE_WINDOW_DAYS` / `SELF_ECHO_SUPPRESS_WINDOW_MS` の const 化 | テスト境界値 + 将来チューニング容易化 |
| 1.2.C | `reconcileNotifications()` 関数 | iOS 64 件制限 + アプリ再起動時の整合性確保 (起動時必須呼出) |
| 1.2.D | logger / 計測 | Sprint 3 で console.log + Phase E で Sentry / Crashlytics 連動候補 |

---

## 2. 論点別技術判断

### 2.1 論点 1: timezone Asia/Tokyo 固定 (DST 非対応、D3-T01 + 全 N-NN)

#### 問題
要件定義は MVP 国内向け、海外ユーザー考慮不要だが、`Date` の TZ 扱いを統一しないと「前日 21:00」が端末 TZ により 20:00 や 22:00 に予約される risk。

#### architect-5 判断

**A. `Asia/Tokyo` 固定 (DST 非対応)**

```typescript
// src/features/notifications/scheduler.ts (D3-T01 実装目標、抜粋)

export const LOCAL_TIMEZONE = 'Asia/Tokyo';   // 日本固定、DST なし
export const SCHEDULE_WINDOW_DAYS = 14;        // iOS 64 件制限対処
export const SELF_ECHO_SUPPRESS_WINDOW_MS = 100; // Realtime self-echo 抑止窓
export const COLD_START_RESPONSE_DEDUPE_KEY = '@notifications/last_handled_response_id';

/**
 * 「2026-05-17」+ 「21:00」 → JST 21:00 の Date 生成 (UTC 経由で安定化)
 * memory #36M (rrule.js v2 DTSTART UTC 強制) と同じ思想:
 * - 入力は floating な「日付 + 時刻 + TZ name」
 * - 内部処理は UTC、出力は OS scheduler に渡せる Date (UTC instant)
 */
export function buildJstScheduleDate(
  dateIsoDay: string,       // 'YYYY-MM-DD'
  timeIsoLocal: string,     // 'HH:MM:SS' or 'HH:MM'
): Date {
  // JST は UTC+9 固定 (DST なし)、ISO 8601 'YYYY-MM-DDTHH:MM:SS+09:00' で解釈
  const normalizedTime = timeIsoLocal.length === 5 ? `${timeIsoLocal}:00` : timeIsoLocal;
  return new Date(`${dateIsoDay}T${normalizedTime}+09:00`);
}
```

#### 根拠

1. **要件定義 v0.6.2 MVP は国内向け**: 海外ユーザー対応は Phase E 以降、現時点で複雑な多 TZ 対応は不要
2. **日本は DST なし**: UTC+9 固定で安定、Olson TZ database 不要
3. **memory #36M (rrule.js v2 UTC 強制パターン)** との整合: 既存 RRULE 処理と同じ思想、ME-5 の認知負荷低減
4. **将来 多 TZ 対応**: `LOCAL_TIMEZONE` 定数を分岐 → ユーザー設定経由に拡張余地あり

#### Sprint 3 jest mock 戦略

```typescript
// scheduler.test.ts
import { setSystemTime } from '@sinonjs/fake-timers';  // jest が時刻 mock を支援

beforeEach(() => {
  // JST 2026-05-16 12:00:00 固定
  setSystemTime(new Date('2026-05-16T12:00:00+09:00').getTime());
});
```

### 2.2 論点 2: scheduleNotificationAsync の `trigger` 選択 (D3-T01..T03)

#### 問題
expo-notifications の trigger 種類 (DateTriggerInput / CalendarTriggerInput / TimeIntervalTriggerInput / DailyTriggerInput 等) のどれが N-01 (前日 21:00) / N-02 (当日 30 分前) に最適か。

#### architect-5 判断

**A. DateTriggerInput (`{ date: Date }`) で 1 通知 = 1 trigger**、繰り返し系 trigger は使わない

```typescript
// 推奨パターン:
await Notifications.scheduleNotificationAsync({
  content: { title, body, data, sound },
  trigger: { date: dateInstance },     // ← 単発 Date trigger
});

// 不採用パターン: CalendarTriggerInput
await Notifications.scheduleNotificationAsync({
  trigger: { hour: 21, minute: 0, repeats: true },  // ← 毎日 21 時繰り返し
  // → schedules の occurrence 別に細かい制御不可、持ち物統合変更時の更新困難
});
```

#### 根拠

1. **`DateTriggerInput` は最も単純**: 「特定の Date instant に 1 回発火」が予測可能、テスト容易
2. **CalendarTriggerInput の落とし穴**:
   - iOS では `hour` / `minute` のみ、年月日固定不可 = N-01 のような特定日固定に不適
   - `repeats: true` だと cancel / update に弱い、特定 occurrence の skip 不可
3. **TimeIntervalTriggerInput の落とし穴**:
   - iOS では `repeats: true` 時 ≥60 秒、現在時刻からの相対秒指定 = アプリ killed 時の経過時間追跡困難
4. **schedules の RRULE 展開 → 各 occurrence ごとに 2 件の DateTriggerInput**: 14 日分の occurrence × 2 = ADR-008 §7.2 試算「子供 3 人 × 3 習い事 × 12 occurrences = 36 schedules × 2 = 72 件」→ **iOS 64 件制限抵触 risk あり**
5. **対策**: 当日通知は前日通知が発火した時に scheduler 内で「翌日分のみ」追加 schedule (即時 schedule、§2.4 reconcile 連動)

#### N-01 / N-02 の trigger 計算

```typescript
// N-01 (前日 21:00 通知): 当該 occurrence の前日 21:00 (notification_preferences.reminder_day_before_time)
function getDayBeforeNotificationDate(
  occurrenceStartAt: Date,           // 当該 occurrence の予定開始時刻 (JST)
  reminderDayBeforeTime: string,     // 'HH:MM:SS' (notification_preferences.reminder_day_before_time)
): Date {
  const occurrenceDate = formatDate(occurrenceStartAt, LOCAL_TIMEZONE, 'yyyy-MM-dd');
  const dayBefore = subDays(parseDate(occurrenceDate), 1);
  return buildJstScheduleDate(formatDate(dayBefore, LOCAL_TIMEZONE, 'yyyy-MM-dd'), reminderDayBeforeTime);
}

// N-02 (当日出発 30 分前通知): 当該 occurrence の開始時刻 - 30 分 (notification_preferences.reminder_same_day_minutes)
function getSameDayNotificationDate(
  occurrenceStartAt: Date,
  reminderSameDayMinutes: number,
): Date {
  return new Date(occurrenceStartAt.getTime() - reminderSameDayMinutes * 60 * 1000);
}
```

### 2.3 論点 3: trigger event matrix の hook 配置 (D3-T01 + 各層接続)

#### ADR-008 §2.2 の 10 trigger event を各層にどう接続するか

| Event | 発生源 | scheduler.ts への接続 |
|-------|--------|---------------------|
| 予定追加 (INSERT) | 予定作成画面 (CAL-04 等) の mutation hook | `scheduleNotificationsForSchedule(schedule)` 呼出 |
| 予定編集 (UPDATE) | 同 mutation hook | `rescheduleNotificationsForSchedule(schedule)` 呼出 |
| 予定削除 (DELETE) | 同 mutation hook | `cancelNotificationsForSchedule(scheduleId)` 呼出 |
| `notification_preferences` 9 フィールド変更 | NOTIF-01 トグル onChange | `rescheduleAllNotifications()` 呼出 (グローバル) |
| `members.notifications_muted` 切替 | members.notifications_muted UPDATE mutation | `rescheduleNotificationsForMember(memberId)` 呼出 |
| `lessons.notifications_muted` 切替 | lessons.notifications_muted UPDATE mutation | `rescheduleNotificationsForLesson(lessonId)` 呼出 |
| 持ち物追加/削除/並び替え | items mutation hook | `rebuildBodyForSchedulesOfLesson(lessonId)` 呼出 (本文のみ再組成 → 再 schedule) |
| `schedule_item_checks` UPSERT | 持ち物✓ mutation hook + Realtime payload | `revaluateSameDayNotification(scheduleId, occurrenceDate)` 呼出 (skip 判定) |
| Realtime payload 受信 | useHouseholdRealtime (Sprint 2) | scheduler の dispatch 関数経由で上記 INSERT/UPDATE/DELETE event に変換 |
| アプリ起動時 | `_layout.tsx` の useEffect | `reconcileNotifications()` 呼出 (起動時必須) |
| OS 通知許可状態変化 | foreground 復帰時 `AppState` listener | `getPermissionsAsync()` → 許可 ON なら `reconcileNotifications()` |

#### scheduler.ts の export API (推奨)

```typescript
// src/features/notifications/scheduler.ts

// 単一 schedule 系 (mutation hook + Realtime から呼出)
export async function scheduleNotificationsForSchedule(schedule: Schedule): Promise<void>;
export async function rescheduleNotificationsForSchedule(schedule: Schedule): Promise<void>;
export async function cancelNotificationsForSchedule(scheduleId: string): Promise<void>;

// グループ系 (mutation hook から呼出)
export async function rescheduleNotificationsForMember(memberId: string): Promise<void>;
export async function rescheduleNotificationsForLesson(lessonId: string): Promise<void>;
export async function rebuildBodyForSchedulesOfLesson(lessonId: string): Promise<void>;
export async function revaluateSameDayNotification(scheduleId: string, occurrenceDate: string): Promise<void>;

// グローバル系 (NOTIF-01 トグル + 起動時)
export async function rescheduleAllNotifications(): Promise<void>;
export async function reconcileNotifications(): Promise<void>;

// Realtime self-echo 抑止 (commit_timestamp 比較)
export async function recordLocalCommit(commitTimestamp: string): Promise<void>;
export async function shouldSuppressEcho(payloadCommitTimestamp: string): Promise<boolean>;
```

### 2.4 論点 4: reconcileNotifications() の動作仕様 (D3-T01)

#### 必要性
- iOS 64 件制限 → schedule window を 14 日 → 起動時に 14 日先まで埋め直し
- アプリ killed 中の DB 編集を catch up

#### 実装パターン

```typescript
// scheduler.ts 内

export async function reconcileNotifications(): Promise<void> {
  // Step 1: OS 既予約一覧取得
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const scheduledMap = new Map<string, Notifications.NotificationRequest>();
  for (const req of scheduled) {
    const key = makeNotificationKey(req.content.data);  // `${scheduleId}_${occurrenceDate}_${type}`
    scheduledMap.set(key, req);
  }

  // Step 2: DB から today から SCHEDULE_WINDOW_DAYS (14) 先までの occurrence 列挙
  const horizon = addDays(new Date(), SCHEDULE_WINDOW_DAYS);
  const schedules = await fetchSchedulesUntil(horizon);    // src/lib/schedules.ts (既存 or 新規)

  // Step 3: 各 occurrence × {day_before, same_day} の必要キー算出 + diff
  const requiredKeys = new Set<string>();
  for (const schedule of schedules) {
    const occurrences = expandRrule(schedule, horizon);  // memory #36M パターン
    for (const occ of occurrences) {
      // notification_preferences + members.notifications_muted + lessons.notifications_muted reduce
      if (await shouldScheduleDayBefore(schedule, occ)) {
        const key = makeNotificationKey({ scheduleId: schedule.id, occurrenceDate: occ.dateStr, notificationType: 'day_before' });
        requiredKeys.add(key);
        if (!scheduledMap.has(key)) await scheduleDayBefore(schedule, occ);
      }
      if (await shouldScheduleSameDay(schedule, occ)) {
        const key = makeNotificationKey({ scheduleId: schedule.id, occurrenceDate: occ.dateStr, notificationType: 'same_day' });
        requiredKeys.add(key);
        if (!scheduledMap.has(key)) await scheduleSameDay(schedule, occ);
      }
    }
  }

  // Step 4: 不要な予約を cancel
  for (const [key, req] of scheduledMap) {
    if (!requiredKeys.has(key)) {
      await Notifications.cancelScheduledNotificationAsync(req.identifier);
    }
  }
}
```

#### 呼出タイミング

| 呼出経路 | 配置 |
|---------|------|
| アプリ起動時 | `src/app/_layout.tsx` の `RootContent` useEffect 内、`householdId` 解決後 |
| foreground 復帰時 | `AppState` listener で `state === 'active'` 検知時 |
| OS 通知許可 ON 検知時 | foreground 復帰時の `getPermissionsAsync()` 後 |
| グローバル再予約後 | `rescheduleAllNotifications()` の最後に呼出 |

### 2.5 論点 5: Realtime self-echo 抑止 (D3-T01 + Sprint 2 連動)

#### 問題
ADR-008 §7.5 R-D8-16: 自編集 → DB commit → Realtime broker echo → 自端末再受信 → 再予約 → 通知 cancel + 再 schedule のループ。

#### architect-5 判断

**A. `commit_timestamp` 比較で client 側抑制**

```typescript
// scheduler.ts 内

import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_LOCAL_COMMIT_KEY = '@notifications/last_local_commit_ts';

export async function recordLocalCommit(commitTimestamp: string): Promise<void> {
  await AsyncStorage.setItem(LAST_LOCAL_COMMIT_KEY, commitTimestamp);
}

export async function shouldSuppressEcho(payloadCommitTimestamp: string): Promise<boolean> {
  const lastLocalTs = await AsyncStorage.getItem(LAST_LOCAL_COMMIT_KEY);
  if (!lastLocalTs) return false;

  const payloadMs = new Date(payloadCommitTimestamp).getTime();
  const lastMs = new Date(lastLocalTs).getTime();
  const delta = payloadMs - lastMs;

  // Realtime echo は通常 50-200ms 遅延、100ms 窓で抑制
  return delta >= 0 && delta <= SELF_ECHO_SUPPRESS_WINDOW_MS;
}
```

#### 呼出パターン

```typescript
// 予定作成 mutation 内 (例 useCreateScheduleMutation.ts):
const { data, error } = await supabase.from('schedules').insert(newSchedule).select('*, commit_timestamp:created_at').single();
if (!error && data) {
  await recordLocalCommit(data.created_at);   // 自編集記録
  await scheduleNotificationsForSchedule(data); // 即時 schedule
}

// useHouseholdRealtime (Sprint 2) 内:
.on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, async (payload) => {
  if (await shouldSuppressEcho(payload.commit_timestamp)) {
    return;  // 自編集 echo は skip (既に schedule 済)
  }
  // 他端末からの編集 → scheduler 呼出
  if (payload.eventType === 'INSERT') await scheduleNotificationsForSchedule(payload.new);
  else if (payload.eventType === 'UPDATE') await rescheduleNotificationsForSchedule(payload.new);
  else if (payload.eventType === 'DELETE') await cancelNotificationsForSchedule(payload.old.id);
})
```

#### Sprint 2 設計レビューとの整合

Sprint 2 設計レビュー §0.1 #6 で「`updated_by_member_id` 列なし、暫定 commit_timestamp + lastLocalCommitTs 比較」とある。本書も同方針、AsyncStorage 永続化 + 100ms 窓 const 化を追加。

### 2.6 論点 6: 持ち物統合通知の skip 判定タイミング (D3-T04)

#### 問題
N-02 当日通知の `skip_when_all_items_checked=true` 時、「全 ✓ 済なら配信スキップ」をどう実装するか。

#### 候補比較

| 候補 | 仕組み | 実装複雑度 | 漏れ risk |
|------|-------|----------|---------|
| A. trigger 直前評価 (OS hook) | OS scheduler 発火直前にコールバック | **不可** (expo-notifications で OS scheduler への割込み API なし) | - |
| B. schedule 作成時 + check UPSERT 時の 2 経路評価 | (1) 通知作成時に「全 ✓ 済ならそもそも schedule しない」、(2) check UPSERT 受信時に「全 ✓ 済になったら cancel」 | 中 | 低 (両経路で網羅) |
| C. background fetch 経由で当日朝に再評価 | iOS Background App Refresh / Android WorkManager 経由 | 高 (Phase D 1 週で不可) | 中 (OS 側で起動保証なし) |

#### architect-5 判断

**B. 2 経路評価** を採用

```typescript
// scheduler.ts 内

async function shouldScheduleSameDay(schedule: Schedule, occurrence: Occurrence): Promise<boolean> {
  const prefs = await fetchNotificationPreferences();
  if (!prefs.reminder_same_day_enabled) return false;

  // Member / Lesson の muted check
  if (await isMutedByMember(schedule.lesson_id)) return false;
  if (await isMutedByLesson(schedule.lesson_id)) return false;

  // skip_when_all_items_checked 評価 (経路 1: 通知作成時)
  if (prefs.skip_when_all_items_checked) {
    const allChecked = await areAllItemsChecked(schedule.id, occurrence.dateStr);
    if (allChecked) return false;  // schedule しない
  }

  return true;
}

// 経路 2: schedule_item_checks UPSERT 受信時 (useScheduleItemCheckMutation / useHouseholdRealtime 経由)
export async function revaluateSameDayNotification(scheduleId: string, occurrenceDate: string): Promise<void> {
  const prefs = await fetchNotificationPreferences();
  if (!prefs.skip_when_all_items_checked) return;  // skip 機能 OFF なら何もしない

  const schedule = await fetchScheduleById(scheduleId);
  if (!schedule) return;

  const allChecked = await areAllItemsChecked(scheduleId, occurrenceDate);
  const existingKey = makeNotificationKey({ scheduleId, occurrenceDate, notificationType: 'same_day' });
  const existing = await findScheduledByKey(existingKey);

  if (allChecked && existing) {
    // 全 ✓ 済 + 通知予約済 → cancel
    await Notifications.cancelScheduledNotificationAsync(existing.identifier);
  } else if (!allChecked && !existing) {
    // 未 ✓ あり + 通知予約なし → schedule
    await scheduleSameDay(schedule, { dateStr: occurrenceDate, /* ... */ });
  }
}
```

### 2.7 論点 7: cold start handler 配置 (D3-T01)

#### ADR-008 §7.4 R-D8-14 への対処

```typescript
// src/features/notifications/cold-start-handler.ts (新規)

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { COLD_START_RESPONSE_DEDUPE_KEY } from './scheduler';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * cold start 用の最終 response 取得 + dedupe 経由 deeplink 遷移。
 * killed state → tap で起動した場合、`addNotificationResponseReceivedListener`
 * は発火しないため (expo/expo#18403, #14078)、本 hook で代替。
 *
 * 使用方法: `src/app/_layout.tsx` の `RootContent` 内で 1 度だけ呼出。
 */
export function useColdStartNotificationDeeplink() {
  const lastResponse = Notifications.useLastNotificationResponse();

  useEffect(() => {
    if (!lastResponse) return;
    void handleResponseOnce(lastResponse);
  }, [lastResponse]);
}

async function handleResponseOnce(response: Notifications.NotificationResponse) {
  // dedupe: 同じ response を 2 度処理しない (Notifications API の挙動上、hook が再 mount すると lastResponse が再供給される)
  const responseId = response.notification.request.identifier;
  const lastHandled = await AsyncStorage.getItem(COLD_START_RESPONSE_DEDUPE_KEY);
  if (lastHandled === responseId) return;
  await AsyncStorage.setItem(COLD_START_RESPONSE_DEDUPE_KEY, responseId);

  const data = response.notification.request.content.data as {
    scheduleId?: string;
    occurrenceDate?: string;
  };
  if (!data.scheduleId || !data.occurrenceDate) return;

  router.push({
    pathname: '/(main)/schedules/[id]',
    params: { id: data.scheduleId, occurrence_date: data.occurrenceDate },
  });
}
```

#### `_layout.tsx` での組込

```typescript
// src/app/_layout.tsx (RootContent 内)
import { useColdStartNotificationDeeplink } from '@/features/notifications/cold-start-handler';

function RootContent() {
  useColdStartNotificationDeeplink();   // cold start path
  // ... (既存 AuthGate 等)
}
```

```typescript
// src/features/notifications/response-handler.ts (新規)

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';

/**
 * background / foreground path: アプリ実行中 (foreground/background) に
 * tap された通知の deeplink 遷移。killed state cold start は cold-start-handler.ts が処理。
 *
 * 使用方法: `src/app/_layout.tsx` の `RootContent` 内で 1 度だけ呼出。
 */
export function useNotificationResponseListener() {
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        scheduleId?: string;
        occurrenceDate?: string;
      };
      if (!data.scheduleId || !data.occurrenceDate) return;
      router.push({
        pathname: '/(main)/schedules/[id]',
        params: { id: data.scheduleId, occurrence_date: data.occurrenceDate },
      });
    });

    return () => subscription.remove();
  }, []);
}
```

---

## 3. React Query 連動 + 通知発火 → invalidate ループ防止

### 3.1 想定される失敗 mode

```
[通知発火] → [tap で deeplink] → [画面遷移] → [画面が React Query 経由で schedule fetch]
                                    ↓
                                [fetch 成功 → query data 更新]
                                    ↓
                                [Realtime 同期で他端末にも broadcast]
                                    ↓
                                [自端末も echo 受信 → useHouseholdRealtime → invalidate]
                                    ↓
                                [再 fetch ... ループ?]
```

→ 上記は本来発生しない (fetch は read-only で DB 変更しない、Realtime は INSERT/UPDATE/DELETE のみ broadcast)。**但し**、注意すべきは以下のシナリオ:

| シナリオ | 失敗 mode | 対策 |
|----------|----------|------|
| 通知タップ → 画面遷移 → `schedule_item_checks` を ✓ で UPDATE | UPDATE → Realtime broadcast → 自端末 echo → useHouseholdRealtime が scheduler 呼出 → 当日通知 cancel | self-echo 抑止 (§2.5 commit_timestamp) で抑制 |
| scheduler 内で `notification_preferences` を読む | scheduler が DB を頻繁に read = ネットワーク overhead | **scheduler 内では cache 経由 read** = `notification_preferences` を fetch する hook (`useNotificationPreferences`) の queryClient cache を参照 |
| reconcileNotifications() が起動時に大量 query 発行 | 起動直後の重い処理 | reconcile を `setTimeout(reconcile, 500)` で 500ms 遅延、UI レンダ後に実行 |

### 3.2 「通知発火は React Query を触らない」原則

scheduler.ts 内では:
- React Query (`useQuery` / `useMutation` / `queryClient`) を**直接呼出しない**
- 代わりに **`src/lib/*.ts` の低レベル fetch 関数を直接呼出** (例 `fetchNotificationPreferences()`, `fetchScheduleById()`)
- scheduler は **副作用 (OS API call) のみ**、UI 側の cache は触らない

理由:
- scheduler は背景処理、UI thread とは独立した寿命
- queryClient cache に書き込むと UI 再レンダが連鎖、複雑性増大
- データの単一情報源は DB のみ、scheduler は「DB → OS scheduler」の片方向同期に限定

### 3.3 通知発火経路と invalidate の整理

| 経路 | 誰が invalidate するか |
|------|---------------------|
| 通知 tap → deeplink → 画面遷移 | 画面側の `useQuery({ queryKey, queryFn })` が自然に fetch |
| 通知 cancel (scheduler 内) | scheduler は invalidate しない、UI に関与しない |
| `schedule_item_checks` UPSERT (持ち物✓) | useScheduleItemCheckMutation 側で `invalidateQueries(['schedule-item-checks', ...])`、scheduler は別経路で `revaluateSameDayNotification()` 呼出 |
| Realtime payload 受信 | useHouseholdRealtime (Sprint 2) が `invalidateQueries(...)` + scheduler 呼出を**並列実行**、scheduler は invalidate しない |

---

## 4. テスト戦略

### 4.1 L1 jest unit テスト (scheduler.ts / payload-builder.ts 中心)

| ファイル | テスト件数想定 | 主な対象 |
|---------|-------------|--------|
| `scheduler.test.ts` | 10-15 件 | event matrix 各 case、self-echo 抑止 境界値、reconcile diff 検出 |
| `payload-builder.test.ts` | 8-10 件 | 持ち物 3 件明示 / 「他N点」省略 / 全 ✓ 済 / 持ち物 0 件 / privacy mode iOS / privacy mode Android / sound_enabled false |
| `cold-start-handler.test.ts` | 3-5 件 | useLastNotificationResponse mock + router.push 呼出確認 + dedupe |
| `response-handler.test.ts` | 2-3 件 | listener subscribe / unsubscribe / router.push |

### 4.2 主要 mock 戦略

```typescript
// __mocks__/expo-notifications.ts (jest.config.js で moduleNameMapper)
export const scheduleNotificationAsync = jest.fn().mockResolvedValue('mock-id-1');
export const cancelScheduledNotificationAsync = jest.fn().mockResolvedValue(undefined);
export const getAllScheduledNotificationsAsync = jest.fn().mockResolvedValue([]);
export const useLastNotificationResponse = jest.fn().mockReturnValue(null);
export const addNotificationResponseReceivedListener = jest.fn().mockReturnValue({ remove: jest.fn() });
export const getPermissionsAsync = jest.fn().mockResolvedValue({ status: 'granted' });

// __mocks__/@react-native-async-storage/async-storage.ts
export default {
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
};
```

### 4.3 L2 integration テスト (RNTL + MSW v2)

- NOTIF-01 トグル → `updateNotificationPreferences` 呼出 → scheduler `rescheduleAllNotifications` 呼出 までの flow
- 予定作成画面 mutation → scheduler `scheduleNotificationsForSchedule` 呼出 + 自編集 commit 記録
- useHouseholdRealtime からの payload 受信 → self-echo 抑止 OR scheduler 呼出 分岐 (Sprint 2 setup を再利用)

### 4.4 L3 手動 E2E (実機 emulator)

- Android emulator で `scheduleNotificationAsync({ trigger: { seconds: 60 } })` 1 分後配信確認
- foreground / background / killed state の 3 状態で deeplink 遷移確認
- NOTIF-01 トグル変更 → 既予約通知の cancel 動作確認 (`getAllScheduledNotificationsAsync` で前後比較)

### 4.5 L4 実機朝動線 (Sprint 3 末 + Sprint 5 受入)

- 前日 21:00 + 当日 30 分前の実配信 timing 確認
- 社長中間レビュー候補 (社長承認後 Sprint 3 末 or Sprint 5 中で)

---

## 5. リスク (本書追加分、ADR-008 §5 と重複しない)

| # | リスク | 影響度 | 発生確率 | 対処 |
|---|-------|--------|---------|------|
| R-N1 | scheduler.ts の event matrix 関数が量多 (10+ export) → 認知負荷 | 低 | 中 | 単一責任維持、関数命名規約 (`scheduleXxxFor` / `rescheduleXxxFor` / `cancelXxxFor`)、JSDoc 完備 |
| R-N2 | reconcileNotifications() の重さ (起動時 14 日先 occurrence × 2 通知 × N schedules を OS API call) | 中 | 中 | 並列実行 + 起動時 500ms 遅延、Sprint 3 末で大量データ実機計測 |
| R-N3 | AsyncStorage の self-echo 永続化が壊れる (端末 OS リセット 等) | 低 | 低 | 起動時に `recordLocalCommit(now)` で初期化、絶対値 100ms 比較は時刻ズレに脆弱 |
| R-N4 | timezone 定数 `LOCAL_TIMEZONE = 'Asia/Tokyo'` を将来変更時の影響範囲 | 低 | 低 (Phase D MVP 国内のみ) | 全箇所 `LOCAL_TIMEZONE` import 経由、一箇所変更で対応可、tests も含む |
| R-N5 | `useLastNotificationResponse` の dedupe key (AsyncStorage) が同一 response を 2 度処理 | 低 | 中 | dedupe key を `notification.request.identifier` ベースに、Sprint 3 で実機テスト必須 |
| R-N6 | iOS の `data` field の JSON-serialize 制約 violation (Date 渡し等) | 中 | 低 | TypeScript 型で `ScheduledNotificationData` を厳格定義、jest L1 で型 + runtime 両方網羅 |
| R-N7 | `useHouseholdRealtime` (Sprint 2) と scheduler の呼出順序 race (Realtime 受信 → scheduler 呼出 → DB 再 read で stale data) | 中 | 中 | scheduler は payload `payload.new` 直接利用、別途 fetch しない (payload は source-of-truth) |

---

## 6. ME-5 への引き継ぎチェックリスト

### Sprint 3 着手前 (Day 1)

- [ ] ADR-008 Accepted v1.0 (§7 PoC + §5 リスク 16 件) 通読
- [ ] 本書 §0-§5 通読、§2 + §3 を特に詳細に
- [ ] Sprint 2 設計レビュー §2.5 (self-echo 抑止) と本書 §2.5 の整合確認
- [ ] memory #36M (rrule.js v2 UTC 強制パターン) と本書 §2.1 の関連確認
- [ ] `src/lib/notification-preferences.ts` の DEFAULTS + RLS 二重防御パターン継承確認

### Sprint 3 Day 1-2 (D3-T01)

- [ ] `src/features/notifications/` ディレクトリ作成
- [ ] `scheduler.ts` 雛形作成 (定数 + 主要 export 関数 stub)
- [ ] `payload-builder.ts` 雛形作成
- [ ] `response-handler.ts` 雛形作成
- [ ] `cold-start-handler.ts` 雛形作成
- [ ] `_layout.tsx` の `RootContent` に hook 2 件追加 (`useColdStartNotificationDeeplink` + `useNotificationResponseListener`)
- [ ] `app.json` に `SCHEDULE_EXACT_ALARM` permission 追加 (Android)

### Sprint 3 Day 2-4 (D3-T02..T05)

- [ ] N-01 前日通知 schedule + payload 組成
- [ ] N-02 当日通知 schedule + 30 分前計算
- [ ] N-03 持ち物統合 payload (3 件明示 + 「他N点」省略 + 全 ✓ 済 skip)
- [ ] N-04 NOTIF-01 画面 + トグル → scheduler 接続 (designer-N 並行)

### Sprint 3 Day 4-5 (D3-T06..T08)

- [ ] N-05 タイミングカスタマイズ UI + scheduler 連動 (社長承認時のみ)
- [ ] L1 + L2 jest 完備 (推定 25-35 件)
- [ ] L3 実機 emulator デモ
- [ ] L4 実機朝動線 schedule (社長中間レビュー時)

### 0007 migration 起案 (Sprint 3 中)

ADR-008 §2.5 + 本書 §2.3 の検討結果、**現時点で 0007 migration は不要** と判断:
- `notification_preferences` 9 フィールドはそのまま継承
- `members.notifications_muted` / `lessons.notifications_muted` は 0001 で完成
- Sprint 2 設計レビュー §0.1 #6 の `updated_by_member_id` 列追加は **Sprint 3 不要** (commit_timestamp 比較で代替)

→ ME-5 から「列追加必要」のリクエストがあれば、その時点で architect-5 が 0007 起案。

---

## 7. 関連参照

- ADR-008 Accepted v1.0 (本書の前提)
- ADR-007 Accepted (Realtime + LWW)
- Sprint 2 設計レビュー `architect_5_useHouseholdRealtime_design_review_20260516.md`
- Phase D WBS v0.1 §4.2 Sprint 3 D3-T01..T09
- DDL `0001_initial_schema.sql:88-99` (schedules) / `0001_initial_schema.sql:192-205` (notification_preferences)
- memory #36M (rrule.js v2 UTC 強制パターン)
- memory mobile_engineer_emulator_screencap (実機 emulator デモ手法)
- memory jest_testing_patterns (Sprint 3 jest mock の参考)

---

## 8. 改訂履歴

| 日付 | バージョン | 変更内容 | 担当 |
|------|-----------|---------|------|
| 2026-05-16 | 1.0 | architect-5 セッション #6 が Phase D Sprint 3 D3-T01..T06 ME-5 implementer support として起草。論点 7 件 (timezone / trigger / event matrix / reconcile / self-echo / skip 判定 / cold start) + 推奨案 + リスク 7 件 + ME-5 引き継ぎチェックリスト + 0007 migration 不要判断. | architect-5 セッション #6 |
