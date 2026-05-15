# useHouseholdRealtime hook 設計レビュー (D2-T01 architect-5 セッション #5)

**作成**: architect-5 セッション #5 / 2026-05-16
**用途**: Phase D Sprint 2 D2-T01 で ME-5 が実装する `useHouseholdRealtime` hook の技術判断支援。ADR-007 §2.4 雛形に対する具体的な実装ガイダンス + リアル現状コードベースとの整合確認。
**前提読了済み**:
- ADR-007 Accepted (Realtime + LWW + 世帯単位 channel + 8 テーブル publication)
- Phase D WBS v0.1 §4.2 Sprint 2 D2-T01..T08
- SEC-2 計画 v0.1 §3.9-3.13 RT-01..05
- 0006 migration apply guide (households.is_shared + create_invitation + accept_invitation)
- src/lib/supabase.ts (realtime.eventsPerSecond:10 + SecureStore + autoRefreshToken)
- src/lib/query-client.ts (refetchOnWindowFocus:false, refetchOnReconnect:true, staleTime:5min, gcTime:10min)
- 既存 queryKey 体系 (queryKeys 定数 + 既存インライン: `['schedules', householdId]` 等)
- src/app/_layout.tsx (QueryClientProvider + AuthGate)
- src/stores/auth-store.ts (`session` / `householdId` / `wizardCompleted`)

**前提**: src/features/realtime/ は未存在 = ME-5 が新規作成、本書はそのレビュー指針。

---

## 0. エグゼクティブサマリ

### 0.1 設計判断 (architect-5 推奨)

| # | 論点 | ME-5 への推奨 | 根拠 |
|---|------|--------------|------|
| 1 | postgres_changes RLS filter 動作確証 | **filter 句は使わず RLS のみに依存**、payload を hook 内で再 validate (二重防御) | ADR-007 §6.5 公式仕様 + #C2 検証未完 + UUID エスケープ未確証 + schedules / schedule_item_checks に household_id 列なし |
| 2 | 8 テーブル全 subscribe vs 限定 | **Sprint 2 = 3 テーブル限定 (schedules / schedule_item_checks / members)**、残 5 テーブルは Sprint 3-4 で拡張。**household_members は publication 未登録のため Realtime 対象外** | F-06 AC1-3 + Free tier eventsPerSecond:10 制約 + Sprint 2 スコープ最小化 + publication 実体確認 (0002:327-335) |
| 3 | catch-up reconcile | **app focus 時 + reconnect 時 + 切断検知時の 3 トリガで invalidate**、refetchOnWindowFocus は false 維持 (誤検知対策、AppState で代用) | query-client.ts 既設計 + ADR-007 §2.5 |
| 4 | hot path setQueryData | **schedule_item_checks UPSERT のみ**、queryKey は `['schedule-item-checks', scheduleId, occurrenceDate]` (既存 ScheduleDetailScreen) | ADR-007 §2.4 + 既存 queryKey 体系 |
| 5 | hook 起動位置 | `(main)/_layout.tsx` または `RootContent` 内 (`householdId` 解決後) | AuthGate と整合、wizard / login 時は起動しない |
| 6 | Toast self-echo 識別 | **Sprint 2 では updated_by_member_id 列なし**、暫定 `payload.commit_timestamp` + lastLocalCommitTs 比較で抑制、Sprint 3 で 0007 migration 起案候補 | 0001_initial_schema.sql:88-99 で schedules 列確認、updated_by_member_id 列不存在 |

### 0.2 ME-5 への実装最小セット

```typescript
// src/features/realtime/useHouseholdRealtime.ts (D2-T01 実装目標)
// 推奨ステップ:
// 1. Sprint 2 では 3 テーブル subscribe (schedules / schedule_item_checks / members)
// 2. filter 句は使わず、RLS で世帯境界を防御、payload は hook 内 schedule_id 経由で再 validate
// 3. invalidate は queryClient で粒度を絞る (テーブル単位)
// 4. schedule_item_checks 受信時のみ setQueryData (hot path)
// 5. AppState + Realtime channel status の 2 トリガで catch-up
```

### 0.3 ME-5 連携指針

1. **本書 §2 を読んでから ADR-007 §2.4 雛形を写経** (順序重要)
2. **§3 の reconcile パターンを必ず適用** (取りこぼし対策)
3. **§4 のテスト構成 (L1 + L2) を Sprint 2 中に書き切る**
4. **疑問発生時は本ファイル経路で architect-5 に SendMessage** (連番 [ME-5 #N])

---

## 1. ADR-007 §2.4 雛形との差分 (現状コードベース反映)

### 1.1 雛形コードの問題点 (ADR-007 §2.4 をそのまま使うと困る箇所)

| # | ADR-007 §2.4 雛形 | 現状コードベース実装上の問題 | 対処 |
|---|---|---|---|
| 1.1.A | `queryClient.invalidateQueries({ queryKey: ['schedules', householdId] })` | 現状 LessonsListScreen は `['lessons', householdId]` 使用、`schedules` の queryKey は実は `['schedules', householdId, yearMonth]` (queryKeys 定数) と `['schedule-detail', ...]` (インライン) 並存 | **invalidate 対象を「prefix のみ」で指定**: `{ queryKey: ['schedules'] }` → 全 yearMonth キャッシュを一括 invalidate (詳細は §2.3) |
| 1.1.B | `queryClient.setQueryData(['schedule_item_checks', newRow.schedule_id, newRow.occurrence_date], ...)` | 既存 ScheduleDetailScreen は `['schedule-item-checks', scheduleId, occurrenceDate]` (ハイフン、underscore でない) | **既存 queryKey に合わせる**: ハイフン (kebab-case) + 既存 ScheduleDetailScreen 行 70/133 と整合 |
| 1.1.C | `members` テーブル subscribe | **重要訂正**: スキーマには `members` (家族構成員 = 子供 / 親プロフィール) と `household_members` (認証ユーザー紐付け) の 2 テーブル並存。**publication 登録は `members` のみ** (0002_rls_policies.sql:329)。ADR-007 §6.5.3 表は両者を意図せず混同していた | **`members` で subscribe** (家族構成員 = 子供等プロフィール更新)、queryKey は `queryKeys.household.members(householdId)` を流用 (適切なら queryKeys に `members.byHousehold` 追加検討)。**`household_members` の Realtime broadcast は不可** (publication 未登録)、メンバー参加・脱退検知は SHARE-* 操作時の手動 invalidate or Sprint 3 で publication 追加検討 |
| 1.1.D | `filter: 'household_id=eq.${householdId}'` | UUID エスケープ動作未確証 (ADR-007 §6.4 C2)、**さらに schedules は household_id 列なし** (0001 schedules は lesson_id 経由)、schedule_item_checks も同様 | **filter 句使わず RLS のみで防御** (詳細は §2.2)、payload 受信時の再 validate は hook 内で schedule_id / lesson_id 経由の所属確認 (Sprint 2 簡略化: RLS のみで OK、payload の再 validate は重要 row のみ) |
| 1.1.E | useEffect 内で channel subscribe + cleanup | OK (雛形通り)、但し `householdId === null` 時は早期 return 必須、auth-store の `householdId` が null ガード | **null 安全性確保**: `if (!householdId) return;` を最初に置く (雛形通り) |
| 1.1.F | (雛形になし) schedules / schedule_item_checks / lessons / items に household_id 列なし問題 | これらテーブル row payload では household_id が直接取れない、payload validate には schedules→lessons→members→household 4 段 join 必要 | **payload validate は省略**、RLS 公式仕様 (#6.5) に全面依存、SEC-2 RT で実機実証する想定 |

### 1.2 雛形に追加すべき要素 (現状コードベース整合)

| # | 雛形にない要素 | 追加理由 |
|---|---|---|
| 1.2.A | channel status 監視 (`channel.subscribe((status) => ...)`) | ADR-007 §2.5 切断検知 invalidate、雛形には未記載 |
| 1.2.B | AppState 連携 (`react-native AppState`) | RN は browser focus と異なる、`refetchOnWindowFocus:false` (query-client.ts) ゆえ AppState API で代用 |
| 1.2.C | eventsPerSecond 制約意識 | supabase.ts で eventsPerSecond:10 = 100ms 間隔で 1 event 上限、burst 編集時の dropped event 警戒 |
| 1.2.D | logger / 計測 | Phase D Sprint 2 で connection / event count を console.log で計測 (Free tier 監視と整合) |
| 1.2.E | テスト用 export (RealtimeChannel 型) | L1 unit test の MSW v2 mock + jest 連動 |

---

## 2. 論点別技術判断

### 2.1 論点 1: postgres_changes channel の RLS filter 動作確証 (D2-T01 + SEC-2 RT-04 連動)

#### 問題
ADR-007 §2.4 雛形は `filter: 'household_id=eq.${householdId}'` を 8 テーブル全件に書いているが、以下が未確証:
- 公式仕様で UUID 含む特殊文字エスケープが必要か (§6.4 C2)
- `schedule_item_checks` は household_id 列なし → 同 filter 不可 (§2.2 注)
- filter 句が誤動作した場合、RLS のみで防御できるか

#### architect-5 判断

**A. filter 句は使わず RLS のみに依存** (schedules / schedule_item_checks は household_id 列がないため、そもそも filter 句書けない)

```typescript
// 不採用 (雛形通り):
.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'schedules',
  filter: `household_id=eq.${householdId}`,  // ← schedules に household_id 列なし = 不可能
}, callback)

// 採用 (architect-5 推奨):
.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'schedules',
  // filter 省略 = RLS で世帯境界を broker filter
}, (payload) => {
  // schedules / schedule_item_checks は household_id 列なし、
  // payload validate は不可能。RLS 公式仕様 (ADR-007 §6.5) に依存。
  // members テーブルのみ payload.new.household_id で再 validate 可能。
  void queryClient.invalidateQueries({ queryKey: ['schedules'] });
})

// members は household_id 列ありなので再 validate 可能:
.on('postgres_changes', {
  event: '*',
  schema: 'public',
  table: 'members',
}, (payload) => {
  const row = (payload.new ?? payload.old) as { household_id?: string } | null;
  if (!row || row.household_id !== householdId) return;  // 二重防御
  void queryClient.invalidateQueries({ queryKey: queryKeys.household.members(householdId) });
})
```

#### 根拠

1. **公式仕様で RLS が broker filter として作用 (ADR-007 §6.5.1)**: postgres_changes は RLS の SELECT policy に従って配信、`current_user_household_ids()` 関数が世帯境界を担保
2. **SEC-1 v0.2 37/37 PASS × 2 サイクルで RLS 健全性実証**: 同じ policy が postgres_changes channel に継承
3. **filter 句のリスク**:
   - UUID 含む特殊文字エスケープ動作未確証 (ADR-007 §6.4 C2)
   - schedule_item_checks に household_id 列なし = filter 句不可 (denormalize しない判断、§2.3 連動)
   - filter 構文ミスで「すべての event 受信」or「event 0 件」になる failure mode
4. **二重防御 = payload 内 household_id 再 validate**: SEC-2 RT-04 (filter 改竄試行) の対策として手堅い、コスト微小
5. **将来 RLS 強化時に互換性維持**: filter 句に頼ると RLS 変更時に修正必要、RLS only ならアプリ側修正不要

#### SEC-2 RT-04 整合性

```
RT-04-FILTER-NULL: filter: undefined で subscribe → 自世帯 row のみ受信 (RLS 下層 filter)
  → 本実装 = filter 省略 = まさにこのケース、qa-2 RT-04-FILTER-NULL でそのまま実証
RT-04-FILTER-OTHER: filter: 'household_id=eq.<他世帯id>' で subscribe → event 0 件
  → 本実装は filter 句使わないため、RT-04-FILTER-OTHER の試行は別途 PoC で行う (qa-2)
```

→ qa-2 SEC-2 v0.2 化時に「RT-04-FILTER-NULL は本実装の filter なし状態を実証」と明示推奨。

### 2.2 論点 2: 8 テーブル全 subscribe vs 限定 (D2-T01 Sprint 2 スコープ判断)

#### ADR-007 雛形の問題
§2.4 雛形は 4 テーブル (schedules / members / lessons / schedule_item_checks) のみだが、ADR-007 §6.5.3 表は 8 テーブル登録済と記載。Sprint 2 でどこまでカバーするか不明確。

#### architect-5 判断

**Sprint 2 = 3 テーブルに限定** (schedules / schedule_item_checks / members)、残 5 テーブルは Sprint 3-4 で段階拡張

| テーブル | publication 登録 (0002:327-335) | Sprint 2 subscribe | 根拠 |
|---|---|---|---|
| `schedules` | ✅ | ✅ | F-06 AC1 必須、最頻 broadcast 経路 |
| `schedule_item_checks` | ✅ | ✅ | F-06 AC2 必須、「パパが見ていれば安心」UX 中核 (要件定義 §3.A) |
| `members` | ✅ | ✅ | F-06 AC3 メンバー (家族構成員 = 子供等プロフィール) 更新時の他端末反映 |
| `households` | ✅ | ⏸ Sprint 3+ | is_shared 列更新が稀、初回 fetch で反映で十分 |
| `lessons` | ✅ | ⏸ Sprint 3+ | 編集頻度低、pull-on-focus + 手動 reload で MVP 許容 |
| `items` | ✅ | ⏸ Sprint 3+ | 持ち物リスト編集頻度低、Sprint 3 で追加 |
| `household_invitations` | ✅ | ❌ 非対象 | invitation 表示は SHARE-01 内のみ、subscribe 不要 (#22A chicken-and-egg) |
| `notification_preferences` | ✅ | ❌ 非対象 | 個別設定 = 自端末のみ、配偶者 push 不要 |
| `household_members` | ❌ **publication 未登録** | ❌ 不可 | **Realtime broadcast 不可**、SHARE-* 操作時の手動 invalidate で対処。Sprint 3 で publication 追加要否を 0007 migration 候補として検討 |

#### 根拠

1. **F-06 AC1-3 = 予定 / 持ち物✓ / メンバー の 3 経路が必須**: AC1 (予定 INSERT/UPDATE/DELETE) + AC2 (持ち物✓) + AC3 (メンバー / 習い事 / 持ち物リスト) のうち、Sprint 2 では「予定 + 持ち物✓ + メンバー」を必須、習い事 / 持ち物リストは Sprint 3 で十分
2. **eventsPerSecond:10 制約 (supabase.ts:42)**: 100ms 間隔で 1 event 上限、burst 編集 (両親が同時に 10+ schedules 編集) で drop 発生、テーブル数増 = drop 確率増
3. **Sprint 2 期間 5 日内に L1/L2 テスト + reconcile + Toast 実装必要**: 3 テーブル限定で test coverage 集中
4. **household_invitations は subscribe しない**:
   - chicken-and-egg (#22A) で「参加前は subscribe 不能」「参加後は不要 (一度限り使用)」
   - F-02/F-03 は React Query invalidate + 1 回限り fetch で十分
5. **notification_preferences は配偶者間で同期しない**: 個別設定の独立性、ADR-007 §6.5.3 表通り

#### Sprint 3 拡張時の追加コスト

- `lessons` / `items` / `households` の 3 テーブル追加で event 頻度は **Sprint 2 + 30% 程度** 想定 (編集頻度低)
- Free tier 2M msg/月 に対しては問題なし
- テストは Sprint 2 設計を流用、テーブル名のみ追加

#### F-05 P1 (複数端末編集) との整合

- F-05 AC4 (LWW + Toast) は Sprint 2 で実装必要 (WBS D2-T05)
- LWW は DB レベルで自然動作、Realtime は受信のみ
- Toast 表示は schedule UPDATE 受信時に「他のメンバーが編集しました」表示 → 本書 §2.4 で扱う

### 2.3 論点 3: catch-up reconcile (app focus + reconnect の実装パターン、D2-T04)

#### ADR-007 §2.5 雛形の不足
雛形では `refetchOnWindowFocus` + `refetchOnReconnect` の React Query 標準機構を活用と記載。但し:
- query-client.ts:24 で **refetchOnWindowFocus は false** (RN 誤検知対策)
- → React Native では AppState API で代用必要
- channel status 監視 (CLOSED / CHANNEL_ERROR) は実装必須

#### architect-5 判断

**3 トリガで catch-up invalidate** (粒度は subscribe 中 3 テーブルのみ):

```typescript
// 1. AppState 'active' トリガ (foreground 復帰)
// 2. Realtime channel status 'CLOSED' / 'CHANNEL_ERROR' トリガ (切断検知)
// 3. ネットワーク復帰 (refetchOnReconnect で自動、追加実装不要)
```

#### 実装パターン (ME-5 引き継ぎ用)

```typescript
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const SUBSCRIBED_TABLES = ['schedules', 'schedule_item_checks', 'members'] as const;

function invalidateAll(queryClient: QueryClient, householdId: string) {
  // 粒度: subscribe 中の 3 テーブル + 関連 prefix のみ
  void queryClient.invalidateQueries({ queryKey: ['schedules'] });
  void queryClient.invalidateQueries({ queryKey: ['schedule-item-checks'] });
  void queryClient.invalidateQueries({ queryKey: ['schedule-detail'] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.household.members(householdId) });
  // Sprint 3 拡張時に lessons / items / households 追加
}

export function useHouseholdRealtime(householdId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!householdId) return;

    const channel = supabase
      .channel(`household:${householdId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedules' }, () => {
        // schedules には household_id 列なし、payload validate 不可
        // RLS 公式仕様 (ADR-007 §6.5) に依存、SEC-2 RT で実機実証
        void queryClient.invalidateQueries({ queryKey: ['schedules'] });
        void queryClient.invalidateQueries({ queryKey: ['schedule-detail'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_item_checks' }, (payload) => {
        // schedule_item_checks は household_id 列なし、RLS が schedules 経由 filter 済
        // hot path: setQueryData で部分更新 (体感即時 < 200ms)
        const newRow = payload.new as {
          schedule_id?: string;
          item_id?: string;
          occurrence_date?: string;
          checked?: boolean;
        } | null;
        if (!newRow || !newRow.schedule_id || !newRow.item_id || !newRow.occurrence_date) {
          void queryClient.invalidateQueries({ queryKey: ['schedule-item-checks'] });
          return;
        }
        queryClient.setQueryData(
          ['schedule-item-checks', newRow.schedule_id, newRow.occurrence_date],
          (old: Record<string, unknown> | undefined) => {
            if (!old) return old;
            return { ...old, [newRow.item_id!]: newRow };
          },
        );
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, (payload) => {
        // members (家族構成員 = 子供等) は household_id 列あり、再 validate 可能
        const row = (payload.new ?? payload.old) as { household_id?: string } | null;
        if (!row || row.household_id !== householdId) return;
        void queryClient.invalidateQueries({ queryKey: queryKeys.household.members(householdId) });
      })
      .subscribe((status) => {
        // ADR-007 §2.5: 切断検知時 invalidate
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          invalidateAll(queryClient, householdId);
        }
      });

    // AppState 'active' トリガ
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        invalidateAll(queryClient, householdId);
      }
    });

    return () => {
      void supabase.removeChannel(channel);
      subscription.remove();
    };
  }, [householdId, queryClient]);
}
```

#### 根拠

1. **`refetchOnWindowFocus:false` 維持理由**: RN フォーカス API は誤検知頻発 (LessonsListScreen 等で意図しない refetch 発生)、AppState の方が確実
2. **AppState `active` トリガ**: foreground 復帰時に 1 回 invalidate、再度 background から復帰した時のみ発火 (RN 標準)
3. **channel status CLOSED / CHANNEL_ERROR**: WebSocket 切断検知の公式 status 値 (`@supabase/supabase-js` 公式)、reconnect 後 status が SUBSCRIBED に戻った時点で再 invalidate 不要 (`refetchOnReconnect:true` が代行)
4. **invalidate 粒度**: subscribe 中 3 テーブル + related prefix のみ、全 invalidate (Sprint 1 wizard processing.tsx パターン) より control 緻密
5. **AsyncStorage persist は MVP 範囲外**: ADR-007 §2.5 で言及だが query-client.ts:7 に「キャッシュ永続化は MVP では未実装」、Sprint 5 以降検討

#### エッジケース

- **多重 invalidate**: AppState active + channel CLOSED が連続で発火しても React Query 内部で dedupe
- **長時間オフライン (数時間)**: AppState active 復帰時の invalidate で全 reload、AsyncStorage persist 未導入なので前回キャッシュは gcTime:10min で消滅可能性あり (UX 影響小)
- **2 端末同時 INSERT による Toast 重複**: Sprint 2 D2-T05 で別途 dedupe ロジック (本書 §2.4)

### 2.4 論点 4: hot path setQueryData (持ち物✓、D2-T03)

#### 既存 ScheduleDetailScreen との整合

```typescript
// 既存 src/screens/ScheduleDetailScreen.tsx:70
queryKey: ['schedule-item-checks', scheduleId, occurrenceDate]
// data 型: Record<itemId, ScheduleItemCheckRow> 想定 (Sprint 2 で正式型定義 by ME-5)
```

#### architect-5 判断

**`['schedule-item-checks', scheduleId, occurrenceDate]` queryKey で setQueryData**:

```typescript
queryClient.setQueryData(
  ['schedule-item-checks', newRow.schedule_id, newRow.occurrence_date],
  (old: Record<string, ScheduleItemCheckRow> | undefined) => {
    if (!old) return old;  // cache 未 hydrate なら invalidate fallback (下記)
    return { ...old, [newRow.item_id]: newRow };
  },
);
```

#### 重要な注意 (ME-5 への警告)

1. **cache 未 hydrate (`old === undefined`) 時は setQueryData がスキップ**: cache が空の状態 (cold start 直後等) で setQueryData しても data が生成されない → invalidate fallback 必要

```typescript
// 改善版 (推奨):
queryClient.setQueryData(
  ['schedule-item-checks', newRow.schedule_id, newRow.occurrence_date],
  (old: Record<string, ScheduleItemCheckRow> | undefined) => {
    if (!old) {
      // cache 空 = 別端末の編集を pull 不要 (画面未表示)
      // 表示時の useQuery が fetch を発火するため fall through で OK
      return undefined;
    }
    return { ...old, [newRow.item_id]: newRow };
  },
);
```

2. **DELETE event の処理**: `payload.new === null` で `payload.old.item_id` 取得 → cache から削除

```typescript
if (payload.eventType === 'DELETE') {
  const oldRow = payload.old as { schedule_id?: string; item_id?: string; occurrence_date?: string };
  if (!oldRow.schedule_id || !oldRow.item_id || !oldRow.occurrence_date) return;
  queryClient.setQueryData(
    ['schedule-item-checks', oldRow.schedule_id, oldRow.occurrence_date],
    (old: Record<string, ScheduleItemCheckRow> | undefined) => {
      if (!old) return old;
      const { [oldRow.item_id!]: _, ...rest } = old;
      return rest;
    },
  );
}
```

→ Sprint 2 では「DELETE は invalidate fallback で許容」も妥当 (頻度低)、ME-5 判断

3. **Toast「他のメンバーが編集しました」 (D2-T05、F-05 AC4)**:
   - **dedupe**: 自端末発の event は自端末でも echo 受信 (Supabase 公式仕様)、Toast 表示すると「自分の操作で Toast」になる
   - 対策: client 側で `payload.commit_timestamp` または UUID を track、自端末発を識別 (Sprint 2 で別 hook で抽象化推奨)
   - シンプル代替: `payload.new.updated_by_member_id` を auth.uid() と比較し、他人発のみ Toast 表示
   - members テーブルに `auth_user_id` 列があれば判定可能 (current_user_household_ids 参照)

```typescript
// Toast 推奨パターン (D2-T05 連携):
.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'schedules' }, (payload) => {
  const row = payload.new as { household_id?: string; updated_by_member_id?: string | null };
  if (!row || row.household_id !== householdId) return;
  // updated_by_member_id が自端末 member_id と異なれば Toast
  // (member_id は auth-store または別 hook で取得、ME-5 判断)
  // ↑ Sprint 2 末で実装、本書 §3 末尾で扱う
});
```

### 2.5 論点 5: hook 起動位置 (D2-T02)

#### ADR-007 §4.2 で「画面 root で hook 起動 (useEffect で householdId 解決後)」とあるが、現状コードベースで具体的にどこか

#### architect-5 判断

**`src/app/(main)/_layout.tsx` 内で起動**:

```typescript
// src/app/(main)/_layout.tsx (新規想定、または既存に追加)
import { Stack } from 'expo-router';
import { useAuthStore } from '@/stores/auth-store';
import { useHouseholdRealtime } from '@/features/realtime/useHouseholdRealtime';

export default function MainLayout() {
  const householdId = useAuthStore((s) => s.householdId);
  useHouseholdRealtime(householdId);
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

#### 根拠

1. **AuthGate 整合**: 'main' 状態 = 認証済 + 世帯あり + wizard 完了、まさに Realtime 起動条件
2. **wizard / login / share 経路で起動しない**: Sprint 1 招待コード入力中 (share) や wizard 中の Realtime は不要、無駄 connection 消費を避ける
3. **household-select 状態は除外**: 世帯未確定中 = householdId null = hook 早期 return、無駄なし
4. **再 mount 不要**: (main) layout は AuthGate のリダイレクト先で安定、useEffect の deps [householdId] のみで動作

#### 不採用案

- ❌ RootContent: wizard / login 中も Realtime 起動 → 無駄 connection
- ❌ CalendarScreen 等画面別: 画面遷移で channel 再 subscribe = 不安定 + connection 消費増

---

## 3. SEC-2 v0.2 整合確認 (Task 2 連動、qa-2 への助言)

### 3.1 ME-5 実装と SEC-2 RT 系の整合

| SEC-2 ケース | ME-5 実装での挙動 | 期待値整合 |
|---|---|---|
| RT-01-OWN-SUBSCRIBE | `useHouseholdRealtime(householdId)` で `supabase.channel('household:${id}').subscribe()` 発火、status === 'SUBSCRIBED' | ✅ 整合 |
| RT-01-EMPTY-PAYLOAD | subscribe 直後 0 event | ✅ 整合 (Sprint 1 完了で世帯 A データ存在前提、新規 INSERT なければ 0 event) |
| RT-02-OTHER-SUBSCRIBE | 本実装は自世帯のみ subscribe、他世帯 subscribe は qa-2 が手動で test code 別途用意 | テスト時は qa-2 がテスト用クライアントで `supabase.channel('household:<他世帯>')` 試行、本 hook では発生しない |
| RT-02-OTHER-EVENT-CHECK | RLS で他世帯 event 0 件配信 (公式仕様 + payload 内 household_id 再 validate で二重防御) | ✅ 整合、本実装 §2.1 の「payload validate」追加で SEC-2 RT-02 と完全整合 |
| RT-03-SCHEDULES-INSERT | schedules INSERT → 同 channel で event 受信 < 2 秒 | ✅ 整合、F-06 AC1 と同 |
| RT-03-CHECKS-UPSERT | schedule_item_checks UPSERT → channel で event 受信 < 2 秒 | ✅ 整合、F-06 AC2 |
| RT-03-MEMBERS-UPDATE | members (家族構成員) UPDATE → event 受信 | ✅ 整合 (本実装で subscribe するのは `members` で、household_members ではない、F-06 AC3) |
| RT-04-FILTER-NULL | 本実装 = filter 句使わない = まさにこのケース | ✅ 整合、RT-04-FILTER-NULL は「本実装の挙動を実証する」と qa-2 SEC-2 v0.2 で位置づけ修正推奨 |
| RT-04-FILTER-OTHER | 本実装は filter 使わない、qa-2 が別途 filter 句指定の試行クライアントを用意 | テスト時 qa-2 別実装、本 hook 関与なし |
| RT-05-INDIRECT-FILTER | 本実装は schedule_item_checks に filter なし、RLS のみで防御 | ✅ 整合、RT-05-INDIRECT-FILTER は「RLS のみで cross-tenant 0 件」を実証 |
| RT-05-OTHER-SCHEDULE-CHECK | 他世帯 schedule_item_checks UPSERT → 自世帯 channel で 0 件 | ✅ 整合 (RLS 公式仕様)、payload 内 schedule_id 経由再 validate でさらに二重防御 |

### 3.2 qa-2 SEC-2 v0.2 化への助言 (architect-5 から qa-2 へ申し送り)

1. **RT-04-FILTER-NULL 修正**: 「本実装は filter 句使わない = RLS only = まさに RT-04-FILTER-NULL の挙動を本番実装で取り入れた」と明示。期待値は「自世帯 event のみ受信、cross-tenant 0 件」で変更なし
2. **RT-04-FILTER-OTHER は別途**: ME-5 hook は filter 句使わないため、RT-04-FILTER-OTHER は qa-2 が test 用 client で別途試行 (本番コードベース無関係)
3. **RT-02 期待値整合**: 本実装の payload 再 validate は **members テーブルのみ** (schedules / schedule_item_checks は household_id 列なしで再 validate 不可、RLS 全面依存)。RT-02-OTHER-EVENT-CHECK が万一 RLS 漏洩を観測した場合、members は二重防御で吸収、schedules / checks は漏洩そのもの → SEC-2 失敗判定として扱う必要あり
4. **RT-05 整合確認**: schedule_item_checks denormalize 列追加 (0007 migration 起案候補) なし方針 = RT-05-INDIRECT-FILTER で「RLS のみで cross-tenant 0 件」を実証
5. **RT-03-MEMBERS-UPDATE 表記訂正**: SEC-2 計画 v0.1 §3.11 「members UPDATE」と既に整合 (本実装で subscribe するのは members、household_members ではない)。但し SEC-2 v0.2 化時に「ADR-007 §6.5.3 表の household_members 行は実体 members の意」と明示推奨
6. **household_members 経路のテスト**: SEC-* で「メンバー参加・脱退時の他端末通知」が必要なら、Realtime publication 追加 (0007 migration、architect-5 が Sprint 3 で起案候補) または SHARE-* 操作直後の手動 invalidate で代用検討 (qa-2 + architect-5 で方針確認)
7. **新規 RT ケース提案**: 「self-echo dedupe」(自端末発 event の Toast 抑制) は SEC ではなく UX、SEC-2 範囲外。但し F-05 AC4 Toast 実装後の確認は別途 jest L2 で

### 3.3 migration 0007 起案要否判定 (architect-5 セッション #5、本セッションで確定)

#### スキーマ確認結果 (0001_initial_schema.sql:88-99)

```sql
CREATE TABLE public.schedules (
  id, lesson_id, start_at, end_at, recurrence_rule, recurrence_until,
  note, created_at, updated_at
  -- updated_by_member_id 列なし
  -- household_id 列なし (lesson_id → lessons.member_id → members.household_id 経由)
);
```

#### 0007 起案判定

| 候補 | 0007 必要性 | 判定根拠 |
|---|---|---|
| schedule_item_checks に household_id denormalize 列追加 (ADR-007 §6.4 C3) | ❌ 不要 | filter 句使わず RLS only 方針なら denormalize 不要、§2.1 + §2.4 で論証済 |
| schedules に version 列追加 (F-07 楽観的ロック、§6.4 C4) | ❌ 不要 | F-07 は P2 後送り (WBS §1.1 + §11.1 #4)、社長判断後に Phase D Sprint 3 以降で 0007 起案 |
| schedules に updated_by_member_id 列追加 (Toast self-echo 識別) | ⏸ **Sprint 2 末判定** | 列不存在を確認、Sprint 2 中盤で Toast 実装着手時に必要性確定後 0007 起案 |
| household_members を Realtime publication に追加 | ⏸ **Sprint 3 判定** | publication 未登録 (0002:327-335)、SHARE-* 操作直後のメンバー一覧反映に必要性あり、Sprint 3 F-04 拡張時に判断 |

#### Sprint 2 中の architect-5 行動方針

- **Sprint 2 初頭** (D2-T01 実装中): 0007 不要、本書の設計で進める
- **Sprint 2 中盤** (D2-T05 Toast 実装着手時): ME-5 からの実装方針相談を受けて 0007 要否最終判定:
  - 暫定案 A: `payload.commit_timestamp` + lastLocalCommitTs 比較 (DB 改修不要、精度若干劣る)
  - 確定案 B: schedules に `updated_by_member_id uuid REFERENCES members(id)` 列追加 (0007 migration、精度確実)
- **Sprint 2 末**: 案 B 採用なら 0007 起案 + apply guide + ME-5 連携 (#23A/#24A 遵守)
- **Sprint 3 着手判断時**: household_members publication 登録の必要性を WBS Sprint 3 タスクで判定

#### Sprint 2 暫定 Toast 実装 (案 A、0007 不要パターン)

```typescript
// commit_timestamp track による self-echo dedupe
// 自端末で UPDATE 実行直後に lastLocalCommitTs を記録
// payload.commit_timestamp が lastLocalCommitTs と近接 (< 100ms) なら自端末発と推定
// → Toast 抑制
// 精度: ネットワーク遅延 + DB commit ラグ次第、誤検知 / 漏検 ありえる
// 用途: MVP では「他端末発のおおむね 90% を Toast 表示」許容ライン
```

→ Sprint 2 中盤で ME-5 が暫定案 A で進めて UX 検証、不十分なら案 B (0007) に切替の段階的アプローチ推奨。

---

## 4. テスト戦略 (D2-T06、ME-5 + qa-N 連携)

### 4.1 L1 unit test (jest + MSW v2)

#### モック設計

```typescript
// src/features/realtime/__tests__/useHouseholdRealtime.test.ts (Sprint 2 D2-T06)
// 想定 15-20 件:
// - subscribe 成功 → status === 'SUBSCRIBED'
// - schedules INSERT event → queryClient.invalidateQueries (schedules + schedule-detail)
// - schedule_item_checks UPSERT event → setQueryData (item_id keyed)
// - schedule_item_checks DELETE event → setQueryData (削除)
// - members UPDATE event (家族構成員) → invalidateQueries (queryKeys.household.members)
// - cross-tenant payload (household_id 不一致) → invalidate も setQueryData も発火しない
// - channel CLOSED → invalidateAll (3 テーブル)
// - channel CHANNEL_ERROR → invalidateAll
// - AppState 'active' → invalidateAll
// - hook cleanup → removeChannel + AppState subscription.remove
// - householdId null → 早期 return、subscribe しない
// - householdId 変化 (世帯切替) → 旧 channel cleanup + 新 channel subscribe
```

#### MSW v2 mock パターン

```typescript
// Realtime channel mock (jest a11y mock パターン #18M-#23M 継承)
const mockChannel = {
  on: jest.fn().mockReturnThis(),
  subscribe: jest.fn().mockImplementation((callback) => {
    callback('SUBSCRIBED');
    return mockChannel;
  }),
  // unsubscribe / removeChannel mock
};

jest.mock('@/lib/supabase', () => ({
  supabase: {
    channel: jest.fn(() => mockChannel),
    removeChannel: jest.fn(),
  },
}));
```

#### 学習事項 #18M-#23M 継承

- a11y mock pattern (NativeWind / safe-area-context / gesture-handler)
- RNTL v12 + MSW v2 (現状の jest_testing_patterns.md 適用)

### 4.2 L2 integration test (RNTL)

#### Sprint 2 D2-T06 で +5-10 件:
- ScheduleDetailScreen で持ち物✓表示中に Realtime payload を mock 配信 → ✓ 状態が UI 更新
- CalendarScreen で schedules INSERT event mock 配信 → 月表示の予定数増
- members UPDATE (家族構成員 = 子供等プロフィール) で関連画面のメンバー表示更新
- cross-tenant payload mock (members.household_id 不一致) → UI 変化なし (二重防御)
- schedules / schedule_item_checks cross-tenant payload mock → 本実装は受信前提で invalidate 発火、RLS 漏洩前提のテストは SEC-2 で実機実証
- channel CLOSED mock → invalidateQueries 発火確認 (useQuery refetch)

### 4.3 L3 manual E2E (Sprint 2 受入レビュー時、ME-5 + 社長デモ)

- 2 端末手動操作 (実機 + 友人端末 or Android emulator x2)
- 端末 A: 予定追加 → 端末 B で 2 秒以内反映
- 端末 A: 持ち物✓ → 端末 B で 1 秒以内 ☑ 反映
- 端末 A 機内モード → 復帰 → catch-up invalidate 確認
- Maestro YAML 1 件 (share-realtime.yaml) で単一端末 self-echo 確認 (Sprint 2 D2-T07 連動)

---

## 5. リスク評価 (Sprint 2 architect-5 観察)

| # | リスク | 影響度 | 発生確率 | 対処 |
|---|-------|--------|---------|------|
| RD-S2-A1 | RLS のみで他世帯 event 配信防御 → 仮に漏洩発見時の fallback | 高 | 低 (§3.2 SEC-2 で実証) | §2.1 payload 再 validate (二重防御)、SEC-2 で漏洩 0 件確証、漏洩発見時 SECURITY DEFINER 関数経由 broadcast に切替 |
| RD-S2-A2 | eventsPerSecond:10 制約による event drop | 中 | 低 (両親 2 端末 burst < 10 event/秒) | catch-up invalidate で reconcile、burst 編集時の UX は invalidate fallback で吸収 |
| RD-S2-A3 | hook 起動位置の AuthGate 不整合 | 中 | 低 | §2.5 で (main)/_layout.tsx 起動推奨、AuthGate と整合実証 |
| RD-S2-A4 | setQueryData の cache 未 hydrate failure | 中 | 中 | §2.4 警告通り、`old === undefined` 時は early return + invalidate fallback で表示時 fetch 発火 |
| RD-S2-A5 | DELETE event の payload.new === null 取扱漏れ | 中 | 中 | §2.4 で対処コード提示、Sprint 2 で invalidate fallback 採用も許容 |
| RD-S2-A6 | Toast self-echo (自端末発 event) で意図しない通知 | 中 | 中 | §2.4 末尾、updated_by_member_id 比較 or commit_timestamp track (ME-5 Sprint 2 末で実装) |
| RD-S2-A7 | AppState 'active' トリガが iOS / Android で挙動異なる | 低 | 中 | RN 公式仕様準拠、L3 手動 E2E で両 OS 確認 |
| RD-S2-A8 | channel CLOSED トリガが reconnect retry 中に多発 | 低 | 中 | invalidate dedupe (React Query 内部)、無害 |
| RD-S2-A9 | wizard / login 経由で hook 起動 → 無駄 connection | 低 | 低 | §2.5 (main)/_layout.tsx 限定で防止 |
| RD-S2-A10 | qa-2 SEC-2 RT-04 期待値が本実装と不一致 | 低 | 中 | §3.2 で qa-2 への申し送り推奨、v0.2 化時に確認 |

---

## 6. ME-5 への申し送り (D2-T01..T05)

### 6.1 実装着手前確認 (Sprint 2 D2-T01 前)

ME-5 は以下を順に実施:

1. **本書 §2.1 + §2.3 + §2.4 を熟読** (順序重要、§2.1 RLS only + §2.3 reconcile + §2.4 setQueryData の 3 つで hook 全体が完成)
2. **既存 `0001_initial_schema.sql:88-99` で schedules テーブル定義を確認** (architect-5 セッション #5 で確認済):
   - `updated_at` 列あり (LWW 実装に必須、自然動作)
   - `household_id` 列なし (lesson_id 経由)、`updated_by_member_id` 列なし
   - → schedules payload で再 validate 不可、RLS only で防御 (§2.1)
   - → Toast self-echo 識別は暫定 commit_timestamp 比較 (§3.3 案 A)、確定案 B (0007 migration) は Sprint 2 中盤判定
3. **既存 ScheduleDetailScreen.tsx:70 の queryKey 確認**:
   - `['schedule-item-checks', scheduleId, occurrenceDate]` 命名規約に合わせる
4. **publication 8 テーブル登録確認** (architect-5 セッション #5 で確認済、0002_rls_policies.sql:327-335):
   - 登録済: households / **members** / lessons / schedules / items / schedule_item_checks / household_invitations / notification_preferences
   - **未登録**: household_members (= 認証ユーザー紐付け)、Sprint 2 では subscribe 対象外
5. **本書 §6.2 D2-T01 実装サンプル全文写経**

### 6.2 D2-T01 実装サンプル (ADR-007 §2.4 改良版)

```typescript
// src/features/realtime/useHouseholdRealtime.ts
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { queryKeys } from '@/lib/query-client';
import type { Database } from '@/types/database';

type ScheduleItemCheckRow = Database['public']['Tables']['schedule_item_checks']['Row'];
type MemberRow = Database['public']['Tables']['members']['Row'];

function invalidateAll(queryClient: QueryClient, householdId: string) {
  void queryClient.invalidateQueries({ queryKey: ['schedules'] });
  void queryClient.invalidateQueries({ queryKey: ['schedule-detail'] });
  void queryClient.invalidateQueries({ queryKey: ['schedule-item-checks'] });
  void queryClient.invalidateQueries({ queryKey: queryKeys.household.members(householdId) });
}

export function useHouseholdRealtime(householdId: string | null): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!householdId) return;

    let channel: RealtimeChannel | undefined;

    channel = supabase
      .channel(`household:${householdId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schedules' },
        () => {
          // schedules には household_id 列なし (lesson_id 経由)、payload validate 不可
          // RLS 公式仕様 (ADR-007 §6.5) に依存、SEC-2 RT で実機実証
          void queryClient.invalidateQueries({ queryKey: ['schedules'] });
          void queryClient.invalidateQueries({ queryKey: ['schedule-detail'] });
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'schedule_item_checks' },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Partial<ScheduleItemCheckRow> | null;
            if (!oldRow?.schedule_id || !oldRow.item_id || !oldRow.occurrence_date) {
              void queryClient.invalidateQueries({ queryKey: ['schedule-item-checks'] });
              return;
            }
            queryClient.setQueryData(
              ['schedule-item-checks', oldRow.schedule_id, oldRow.occurrence_date],
              (old: Record<string, ScheduleItemCheckRow> | undefined) => {
                if (!old) return old;
                const { [oldRow.item_id!]: _removed, ...rest } = old;
                return rest;
              },
            );
            return;
          }
          const newRow = payload.new as Partial<ScheduleItemCheckRow> | null;
          if (!newRow?.schedule_id || !newRow.item_id || !newRow.occurrence_date) {
            void queryClient.invalidateQueries({ queryKey: ['schedule-item-checks'] });
            return;
          }
          queryClient.setQueryData(
            ['schedule-item-checks', newRow.schedule_id, newRow.occurrence_date],
            (old: Record<string, ScheduleItemCheckRow> | undefined) => {
              if (!old) return old;
              return { ...old, [newRow.item_id!]: newRow as ScheduleItemCheckRow };
            },
          );
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'members' },
        (payload) => {
          // members (家族構成員 = 子供等) は household_id 列あり、再 validate 可能
          // 注: household_members (認証ユーザー紐付け) は publication 未登録のため subscribe しない
          const row = (payload.new ?? payload.old) as Partial<MemberRow> | null;
          if (!row || row.household_id !== householdId) return;
          void queryClient.invalidateQueries({
            queryKey: queryKeys.household.members(householdId),
          });
        },
      )
      .subscribe((status) => {
        if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          invalidateAll(queryClient, householdId);
        }
      });

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        invalidateAll(queryClient, householdId);
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      if (channel) void supabase.removeChannel(channel);
      subscription.remove();
    };
  }, [householdId, queryClient]);
}
```

### 6.3 D2-T02 実装サンプル ((main)/_layout.tsx)

```typescript
// src/app/(main)/_layout.tsx (既存に追加 or 新規)
import { Stack } from 'expo-router';
import { useAuthStore } from '@/stores/auth-store';
import { useHouseholdRealtime } from '@/features/realtime/useHouseholdRealtime';

export default function MainLayout() {
  const householdId = useAuthStore((s) => s.householdId);
  useHouseholdRealtime(householdId);
  return <Stack screenOptions={{ headerShown: false }} />;
}
```

### 6.4 D2-T05 Toast 実装サンプル (F-05 AC4)

```typescript
// 別 hook: useHouseholdEditToast (D2-T05 で実装)
// schedules UPDATE event を受信、updated_by_member_id !== currentMemberId なら Toast
// member_id 取得は別途 useCurrentMember hook (Sprint 2 後半で実装)
// 既存 schedules テーブルに updated_by_member_id 列なければ Sprint 2 で 0007 migration 起案
```

→ ME-5 が Sprint 2 中盤で schedules テーブル定義確認 + Toast 実装着手時、必要に応じて architect-5 に 0007 migration 起案依頼を出す。

### 6.5 D2-T06 テスト構成 (jest_testing_patterns.md 継承)

- L1 unit: useHouseholdRealtime hook 15-20 件 (本書 §4.1)
- L2 integration: RNTL 5-10 件 (本書 §4.2)
- 期待 jest 緑数: 176 + 20-30 = **196-206 件 PASS**

---

## 7. 結論 (architect-5 セッション #5)

1. **useHouseholdRealtime hook 設計は ADR-007 §2.4 雛形を素直に適用すれば動くが、現状コードベースのスキーマ事実と乖離あり**、本書の修正点 (§1.1 / §2.1 / §2.2) を反映して D2-T01 実装着手可能
2. **3 テーブル限定 (schedules / schedule_item_checks / members) で Sprint 2 完遂**、残 5 テーブルは Sprint 3 拡張、**household_members は publication 未登録のため Realtime 対象外**
3. **RLS only で防御** + members のみ payload 再 validate (schedules / schedule_item_checks は household_id 列がないため再 validate 不可)
4. **catch-up reconcile は AppState + channel status の 2 トリガ**で `refetchOnWindowFocus:false` 制約と整合
5. **migration 0007 起案は Sprint 2 中盤に Toast 実装方針確定時に最終判定**、初頭は不要。確定案 B (schedules.updated_by_member_id 列追加) は Sprint 2 中盤 ME-5 から SendMessage 受領後に architect-5 が起案
6. **qa-2 SEC-2 v0.2 化**: RT-04-FILTER-NULL 位置づけ調整 + RT-02 二重防御範囲明示 + ADR-007 §6.5.3 表の household_members vs members 訂正 + household_members publication 未登録の影響を整理 (§3.2)
7. **ADR-007 v1.1 起草候補**: §6.5.3 表で「household_members」と記載したテーブルは実態 `members` (家族構成員)、`household_members` は publication 未登録 = Realtime 不可。Sprint 2 末で実機 PoC 結果と合わせて v1.1 化推奨

### 7.1 architect-5 セッション #5 完遂物

- 本書: `architect_5_useHouseholdRealtime_design_review_20260516.md`
- ME-5 への D2-T01..T05 実装ガイダンス
- qa-2 への SEC-2 v0.2 化助言
- migration 0007 起案要否判定 (=不要、Sprint 2 末で再評価)

---

## 8. 関連参照

- `C:\Users\masah\Desktop\アプリ開発\習い事管理アプリ\02_設計\ADR\ADR-007-Phase_D_Realtime同期方式.md` Accepted §2.4 / §6.4 / §6.5
- `C:\Users\masah\Desktop\アプリ開発\習い事管理アプリ\01_要件定義\Phase_D_WBS_v0.1.md` §4.2 Sprint 2 D2-T01..T08
- `C:\Users\masah\Desktop\アプリ開発\習い事管理アプリ\04_テスト\SEC-2_計画_v0.1.md` §3.9-3.13 RT-01..05
- `C:\dev\learnapp\architect_5_0006_apply_guide_20260515.md`
- `C:\dev\learnapp\supabase\migrations\0006_phase_d_households_invitations.sql`
- `C:\dev\learnapp\src\lib\supabase.ts` (realtime.eventsPerSecond:10 + SecureStore)
- `C:\dev\learnapp\src\lib\query-client.ts` (refetchOnWindowFocus:false, refetchOnReconnect:true)
- `C:\dev\learnapp\src\app\_layout.tsx` (QueryClientProvider + AuthGate)
- `C:\dev\learnapp\src\screens\ScheduleDetailScreen.tsx:70` queryKey `['schedule-item-checks', scheduleId, occurrenceDate]`
- 学習事項 #18M-#23M (jest a11y mock + NativeWind + safe-area-context + gesture-handler + RNTL v12 + MSW v2)
- 学習事項 #20A-#24A (Supabase Free tier + RLS + SECURITY DEFINER + plpgsql 直参照)
