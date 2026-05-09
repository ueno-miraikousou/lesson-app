# 習い事管理アプリ — 実装リポジトリ

React Native + Expo + Supabase で構築するクロスプラットフォーム習い事管理アプリ。

> 設計ドキュメント・要件定義は親フォルダ `01_要件定義/` `02_設計/` を参照。本リポジトリ (`03_実装/`) はソースコードと Supabase マイグレーションのみを管理。

---

## 採用技術 (ADR-001 v0.4 / mobile-engineer引継ぎサマリ §1)

| レイヤ | 技術 |
|--------|------|
| アプリFW | React Native 0.76 (New Architecture) + Expo SDK 52 |
| 言語 | TypeScript 5.6 (strict + noUncheckedIndexedAccess) |
| ナビゲーション | Expo Router |
| 状態管理 | Zustand (UI状態) + React Query (サーバ状態) |
| UIスタイル | NativeWind v4 (Tailwind RN版) |
| カレンダー | react-native-calendars + rrule |
| BaaS | Supabase (Postgres + Auth + Realtime) |
| 通知 | expo-notifications |
| 広告 | react-native-google-mobile-ads (AdMob) |
| 永続化 | expo-secure-store (Auth) + react-native-mmkv (キュー) |
| ビルド | EAS Build / EAS Submit |
| 監視 | Sentry Free |

---

## 開発環境セットアップ

### 必要なもの

- Windows 11 (社長 PC) または macOS / Linux
- Node.js LTS (現状 v24.15.0)
- npm 11+ または pnpm

### 初回セットアップ手順

```powershell
# 1. 依存関係インストール
npm install

# 2. 環境変数ファイルを作成
copy .env.example .env
# .env を開いて Supabase URL / anon key / その他キーを入力

# 3. 開発サーバ起動
npm run start
```

### よく使うコマンド

```powershell
npm run start       # Expo Dev Server 起動
npm run android     # Android エミュレータ起動
npm run ios         # iOS シミュレータ起動 (Mac 必要)
npm run lint        # ESLint
npm run typecheck   # TypeScript 型チェック
npm run format      # Prettier
```

---

## ディレクトリ構成

```
03_実装/
├── src/
│   ├── app/                # Expo Router 画面 (ファイルベース)
│   ├── components/         # 再利用可能 UI (BottomSheet 等)
│   ├── config/             # 定数・URL・環境変数
│   │   ├── app.ts          # APP_DISPLAY_NAME, DEEPLINK_SCHEME 等
│   │   ├── env.ts          # extra 経由の環境変数取得
│   │   └── urls.ts         # GitHub Pages URL 一元管理
│   ├── features/           # 機能単位のロジック (wizard / calendar / share)
│   ├── hooks/              # 共通フック
│   ├── lib/                # 外部ライブラリのラッパ (supabase 等)
│   ├── stores/             # Zustand ストア
│   ├── theme/              # カラー・タイポトークン
│   └── types/              # TypeScript 型定義
│       └── database.ts     # Supabase テーブル型 (DDL から手書き)
├── supabase/
│   ├── migrations/         # SQL マイグレーション
│   │   ├── 0001_initial_schema.sql
│   │   └── 0002_rls_policies.sql
│   └── functions/          # Edge Function (招待コード検証等)
├── docs/                   # GitHub Pages 公開ソース (privacy.html / terms.html)
├── assets/                 # アイコン・スプラッシュ等 (未追加)
├── app.config.ts           # Expo 動的設定
├── babel.config.js
├── metro.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

---

## 重要な設計原則 (実装時に必ず守る)

1. **RLS 前提**: クエリは常に `household_id` 経由で世帯境界が効く前提。RLS なしで動かす状態を絶対に作らない
2. **Service Role Key 禁止**: クライアントには `anon key` のみ。`service_role` は Edge Function 専用
3. **広告禁止ゾーン**: ウィザード中 / CAL-09 / 通知タップ着地 / 認証関連 では `<AdBanner />` を呼ばない
4. **個人情報をログに出さない**: 子供の名前・生年月日を `console.log` / Sentry に含めない
5. **個人化広告 OFF**: AdMob 設定で常に `npa: 1` (子供データ × 広告対応)
6. **WIZ-04 操作者 members 化**: 妻を `role='parent'` で必ず追加 (B案 / 社長 Q5)
7. **招待コード検証は Edge Function 経由**: クライアント直接 SELECT は別世帯コードに対して許可しない

---

## マイグレーション

### Supabase 適用方法

```powershell
# 方法1: Supabase Studio (GUI) で SQL Editor から流し込む
# 方法2: supabase CLI (推奨、後で導入)
#   supabase db push
```

### マイグレーション履歴

| 番号 | ファイル | 内容 |
|------|---------|------|
| 0001 | `0001_initial_schema.sql` | 10テーブル + RLS 即時有効化 + updated_at トリガー |
| 0002 | `0002_rls_policies.sql` | RLS ポリシー一式 + Realtime publication |

---

## 関連ドキュメント

- `../02_設計/mobile-engineer引継ぎサマリ.md` — 着手用集約 (最優先で読む)
- `../02_設計/アーキテクチャ.md` v0.3.2 — データモデル
- `../02_設計/ADR/ADR-001-技術選定.md` v0.4 — 技術選定の根拠
- `../02_設計/画面/` — designer 個別画面設計
- `../作業ログ/mobile-engineer.md` — 作業履歴
