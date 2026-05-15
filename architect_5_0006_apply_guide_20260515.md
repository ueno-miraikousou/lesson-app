# 0006 migration 適用ガイド + ME-5 連携メモ (architect-5 セッション #4)

**作成**: architect-5 セッション #4 / 2026-05-15
**用途**: D1-T01 で起案した `0006_phase_d_households_invitations.sql` を ME-5 が Supabase dev に適用、その後の検証 + ME-5 実装側 API 仕様の引き継ぎ
**学習事項**: #20A-#24A 全件適用済

---

## 1. 適用手順 (Chrome 経由 Supabase Dashboard、秘書 #N + ME-5 連携)

### 1.1 適用前確認
1. `git status` で working tree clean (秘書 #N が確認)
2. `0006_phase_d_households_invitations.sql` を Read で全文確認 (ME-5)
3. 機密漏洩 grep 4 パターン (eyJ / sbp_ / postgres://.*:.* / supabase.co/storage/v1/object/sign) で本ファイル 0 件確証 (ME-5)

### 1.2 Chrome 経由適用 (学習事項 #21A)
1. Chrome で `https://supabase.com/dashboard/project/prsilzxgfcvuxixmeqwi/sql/new` 開く
2. SQL Editor に本ファイル全文を貼付
3. Run (Ctrl+Return)
4. 「Query has destructive operations」確認ダイアログが出たら座標 click 承認 (#21A)
5. Success メッセージ + §5 検証 SELECT 5 件の結果を保存

### 1.3 適用後検証 (学習事項 #20A: DDL Success ≠ 全 policy 適用)

§5.1 - §5.5 の SELECT が全て期待値を返すか確認:

| 検証 | 期待結果 |
|------|----------|
| §5.1 is_shared 列 | data_type=boolean, is_nullable=NO, column_default=false |
| §5.2 create_invitation | prosecdef=true, provolatile=v (volatile, INSERT 含むため), proconfig={search_path=public, pg_temp} |
| §5.3 accept_invitation | prosecdef=true, provolatile=v, proconfig={search_path=public, pg_temp} |
| §5.4 EXECUTE 権限 | create_invitation/accept_invitation 各 1 行、grantee=authenticated, privilege_type=EXECUTE |
| §5.5 既存 policy | households(4) + household_members(4) + household_invitations(4) = 計 12 件、変更なし |

不整合あれば即 architect-5 (本セッション) に SendMessage で報告。

---

## 2. ME-5 実装向け API 仕様

### 2.1 create_invitation RPC 呼出 (SHARE-02 招待コード発行画面)

```typescript
// src/lib/invitations.ts (新規想定)
import { supabase } from '@/lib/supabase';

export async function createInvitation(
  householdId: string,
  ttlHours: number = 24
): Promise<{
  id: string;
  household_id: string;
  code_short: string;     // 6 桁数字 ("123456" 等、テンキー入力 UX 想定)
  code_long: string;       // 16 文字 大文字英数字 (QR/共有リンク向け)
  expires_at: string;      // ISO timestamptz
  created_by: string;
  created_at: string;
}> {
  const { data, error } = await supabase.rpc('create_invitation', {
    p_household_id: householdId,
    p_ttl_hours: ttlHours,
  });

  if (error) {
    // PG エラーコード別 UI ハンドリング
    // 28000 = not authenticated → re-login 誘導
    // 42501 = not owner → 警告モーダル
    // 22023 = ttl_hours 範囲外 → 入力 UI 修正
    // 40001 = code collision exhausted → retry 案内
    throw error;
  }

  // RPC は配列返却 (RETURNS TABLE)、先頭 1 行を取る
  return data[0];
}
```

#### UI 表示推奨
- 6 桁短コード: `123 456` のように 3 桁ごとに半角スペース挿入で可読性向上
- 16 桁長コード: QR コード生成 (任意、MVP は文字列のみで可)、共有 sheet で「リンク + コード」コピー
- expires_at: 残り時間表示 (例: 「あと 23 時間 59 分」)

### 2.2 accept_invitation RPC 呼出 (SHARE-03/04 招待コード入力 + 参加確認)

```typescript
export async function acceptInvitation(codeShort: string): Promise<{
  household_id: string;
  household_name: string | null;
  is_shared: boolean;
  member_id: string;
}> {
  // 入力 sanity check (UI 側でも実施推奨)
  if (!/^\d{6}$/.test(codeShort)) {
    throw new Error('INVALID_FORMAT');
  }

  const { data, error } = await supabase.rpc('accept_invitation', {
    p_code_short: codeShort,
  });

  if (error) {
    // PG エラーコード別 UI ハンドリング (SHARE-06 エラーモーダル分岐)
    // 28000 = not authenticated → re-login 誘導
    // 22023 = invalid format / expired → ERROR-INV-EXPIRED 系
    // P0002 = code not found → ERROR-INV-NOT-FOUND
    // 23505 = already a member → ERROR-INV-ALREADY-MEMBER
    throw error;
  }

  return data[0];
}
```

#### UI 表示推奨
- 入力 UI: 6 桁数字 only、テンキー (`keyboardType="number-pad"`)、自動 focus 次桁、貼付対応
- SHARE-04 参加確認: `household_name` 表示 + 「世帯に参加する」ボタン
- 成功時: 世帯切替 (`useHouseholdStore`) + カレンダー反映 (SHARE-05)
- エラー時: SHARE-06 でメッセージ分岐 (上記コード別)

### 2.3 SHARE-01 家族共有設定画面 (households.is_shared 表示 + 招待コード発行 CTA)

```typescript
// src/screens/HouseholdShareScreen.tsx (新規想定)
const { data: household } = useHouseholdQuery(householdId);
// household.is_shared = true なら「家族共有中」表示、false なら「あなただけが使用中」
// owner なら「招待コードを発行」CTA、member なら CTA 非表示
```

---

## 3. SEC-2 整合確認 (qa-2 計画 v0.1 §3.4-3.6)

### 3.1 SEC-2 INV-04 (期限 / 使用済 / 不正) 対応マッピング

| SEC-2 ケース | accept_invitation の挙動 | PG エラーコード | HTTP status (PostgREST 経由) |
|---|---|---|---|
| INV-04-EXPIRED | `expires_at <= now()` → RAISE | 22023 | 400 + error JSON |
| INV-04-USED | `used_at IS NOT NULL` → RAISE | 22023 | 400 + error JSON |
| INV-04-MALFORMED | `p_code_short !~ '^\d{6}$'` → RAISE | 22023 | 400 + error JSON |

→ SEC-2 計画 v0.1 は「application 層で 422」と記述しているが、本実装は RPC 経由 PG エラー → PostgREST は通常 400 で応答する。qa-2 と整合確認必要 (期待 status を `400, 422` 多値対応に拡張する案)。

### 3.2 SEC-2 INV-05 (RLS chicken-and-egg) 対応

| SEC-2 ケース | accept_invitation の挙動 |
|---|---|
| INV-05-VALID-SELECT | RPC 経由 = SECURITY DEFINER で内部 SELECT 可能、chicken-and-egg 回避 (#22A) |
| INV-05-VALID-JOIN | RPC が members INSERT + used_at 更新を atomic に実行 |
| INV-05-AFTER-JOIN | households SELECT は新規 household_members 行で RLS が解決、自世帯認定 |
| INV-05-DOUBLE-JOIN | 2 回目は `used_at IS NOT NULL` で 22023 |

### 3.3 SEC-2 INV-06 (cross-tenant 確証)

| SEC-2 ケース | 期待 |
|---|---|
| INV-06-SCHEDULES | 合流後の household_A schedules SELECT = 200 + 全 schedules |
| INV-06-OTHER-HOUSEHOLD | household_B schedules SELECT = 200 + `[]` (RLS で空) |
| INV-06-MEMBERS-INSERT | F-05 P1 = role 区別未実装時は 200 / 実装時は 403 |
| INV-06-INVITATION-INSERT | create_invitation は `role_in_household = 'owner'` チェック → member は 42501 / 403 |

→ 本実装で create_invitation は **owner のみ** 発行可、member は拒否 (PG 42501)。INV-06-INVITATION-INSERT の期待挙動と整合。

### 3.4 SEC-2 INV-07 (乱数強度)

| SEC-2 ケース | 本実装の挙動 |
|---|---|
| INV-07-RANDOMNESS | `gen_random_bytes(8)` = crypto-grade、100/100 ユニーク期待 |
| INV-07-PREDICTABILITY | 6 桁数字 = 10^6 = 100 万通り、総当たり攻撃可能、対策は rate-limit |
| INV-07-RATE-LIMIT | 本 migration では未実装、application 層 / Supabase Rate Limit で別途対処 (Sprint 1 後半判定) |

→ **重要**: 6 桁数字は 10^6 通りで rate-limit なしだと総当たり可能。MVP では:
- 期限 24h DEFAULT で時間制限
- 使用済みマークで 1 度使用後無効化
- ただし 24h 内に 10^6 試行は理論上可能 = rate-limit 必須に近い

→ Sprint 1 後半 or Sprint 2 で **PostgREST 経由 RPC 呼出の rate-limit** (application 層 = ME-5 / API Gateway) を追加検討。本 ADR 段階では「6 桁短コード採用 = UX 優先、rate-limit 別途」と境界明示。

### 3.5 SEC-2 RT 系 (RT-01..05)

本 0006 migration は household_invitations / households / household_members に既存 publication 登録があるため、Realtime broadcast は自動継承。

| SEC-2 ケース | 期待 |
|---|---|
| RT-01 | 自世帯 channel subscribe = SUBSCRIBED |
| RT-02 | 他世帯 channel subscribe しても event 0 件 (RLS 継承、ADR-007 §6.5) |
| RT-03 | households / household_members / schedules UPSERT = 自世帯で受信 |

→ RT-02 cross-tenant 漏洩 0 件は ADR-007 §6.5 で論証済、qa-2 SEC-2-RT-01..04 で実機確証。

---

## 4. リスク評価 (本 migration 起案時、architect-5 セッション #4)

| # | リスク | 影響度 | 発生確率 | 対処 |
|---|-------|--------|---------|------|
| R-D1-1 | `bigint` 符号付き範囲で `abs(BIGINT_MIN)` overflow | 低 | 極低 (1/2^64) | LOOP retry 8 回で吸収、retry exhausted で 40001 |
| R-D1-2 | code_short 6 桁数字の 10^6 衝突 | 低 | 低 (1 世帯あたり数件発行想定) | LOOP retry 8 回 + UNIQUE index で確実防御 |
| R-D1-3 | accept_invitation 並列受諾 race condition | 中 | 低 | `FOR UPDATE` で行ロック、後発 receiver は used_at マーク後の SELECT で expired/used 検知 |
| R-D1-4 | households.is_shared 既存行 false default で正しいか | 低 | 低 | Phase B から 1 世帯 = owner 1 名前提、is_shared=false で UX 整合 |
| R-D1-5 | 6 桁数字の総当たり攻撃 | 高 | 中 | rate-limit が必須、ME-5 が application 層 or Sprint 1 後半で実装 (本 migration 範囲外) |
| R-D1-6 | invitation 累積で household_invitations 肥大 | 低 | 中 | TTL 期限切れ行を定期削除する VACUUM cron 検討 (Phase D Sprint 5 以降) |
| R-D1-7 | accept_invitation 内 SECURITY DEFINER で auth.uid() が NULL | 低 | 低 | §1) NULL チェック明示、28000 で reject |
| R-D1-8 | code_long 16 文字の hex+upper の lowercase 混入 | 低 | 極低 | `upper()` 適用済、CHECK `length(code_long) = 16` のみで形式制約は文字種無し (許容) |

---

## 5. ME-5 / qa-2 への申し送り

### 5.1 ME-5 (D1-T02 / D1-T03 / D1-T04 / D1-T05)
1. **0006 適用後**に `src/lib/invitations.ts` を新規作成、§2.1/§2.2 の RPC 呼出を実装
2. SHARE-02 招待コード発行画面で `createInvitation()` 呼出、戻り値の `code_short` / `code_long` / `expires_at` を表示
3. SHARE-03 招待コード入力画面で 6 桁数字入力 (`keyboardType="number-pad"`、貼付対応)
4. SHARE-04 参加確認画面で `acceptInvitation()` 呼出、PG エラーコード別 UI 分岐
5. SHARE-01 設定画面で `households.is_shared` 表示 + owner 判定で CTA 表示制御
6. unit test: `invitations.ts` の short code 形式 + acceptInvitation の各エラー path
7. integration test: SHARE-* RNTL + MSW v2 で RPC mock (PG エラーコード mock 含む)

### 5.2 qa-2 (D1-T07 + SEC-2 v0.2 化)
1. Maestro YAML 3 件 (share-create / share-issue / share-join) で SHARE-* E2E 雛形
2. SEC-2 計画 v0.2 化:
   - INV-04 期待 status を `400, 422` 多値対応 (本実装は PG エラー → PostgREST 400)
   - INV-06-INVITATION-INSERT の期待 status を `403` 確定 (本実装は owner only、PG 42501 → 403)
   - INV-07-RATE-LIMIT は Sprint 1 後半 ME-5 実装まで保留

### 5.3 architect-5 (本セッション)
1. ME-5 適用支援 (本ファイル §1 + §5.1 ガイダンス)
2. SEC-2 整合確認完了 (§3 で qa-2 計画とマッピング)
3. 適用後 SQL レビュー (検証 SELECT 結果を ME-5 から受領後 architect-5 で再確認)

---

## 6. 関連参照

- `C:\dev\learnapp\supabase\migrations\0006_phase_d_households_invitations.sql` (本起案)
- `C:\dev\learnapp\supabase\migrations\0001_initial_schema.sql` (households / household_members / household_invitations 既存)
- `C:\dev\learnapp\supabase\migrations\0002_rls_policies.sql` (RLS policy 既存)
- `C:\dev\learnapp\supabase\migrations\0005_fix_rls_recursion_inline.sql` (#23A/#24A 適用済)
- `C:\Users\masah\Desktop\アプリ開発\習い事管理アプリ\02_設計\ADR\ADR-007-Phase_D_Realtime同期方式.md` Accepted
- `C:\Users\masah\Desktop\アプリ開発\習い事管理アプリ\02_設計\ADR\ADR-008-通知本体実装方針.md` Proposed
- `C:\Users\masah\Desktop\アプリ開発\習い事管理アプリ\01_要件定義\Phase_D_WBS_v0.1.md` §4.2 Sprint 1
- `C:\Users\masah\Desktop\アプリ開発\習い事管理アプリ\04_テスト\SEC-2_計画_v0.1.md` §3.1-3.7

---

## 7. ステータス

- **0006 migration 起案**: ✅ 完了
- **適用支援**: ⏳ ME-5 待ち
- **SEC-2 整合確認**: ✅ §3 で完了 (qa-2 v0.2 化時に反映)
- **学習事項 #20A-#24A 遵守**: ✅ 全件適用
