/**
 * 外部 URL の一元管理。GitHub Pages の URL 等を1ファイルに集約することで、
 * 将来の独自ドメイン化時に書き換える行数を最小化する。
 *
 * 参照: 02_設計/技術メモ-GitHub Pages運用手順.md §2.1, §2.3
 *      02_設計/mobile-engineer引継ぎサマリ.md §5.5
 *
 * 確定値:
 *   GITHUB_USER = 'ueno-miraikousou' (2026-05-10 社長アカウント作成完了)
 *   REPO        = 'lesson-app'       (リポジトリ名、社長作業待ち)
 */

const GITHUB_USER = 'ueno-miraikousou';
const REPO = 'lesson-app';

const PAGES_BASE = `https://${GITHUB_USER}.github.io/${REPO}` as const;

// TBD (Phase E E2-T01): 問い合わせメールは社長確定待ち。
//   - 仮置き値 'support@miraikousou.com' は社長ドメイン (@miraikousou.com) ベース。
//   - Google Play Console 申請前に社長で受信体制 (転送設定 / SLA / spam 対策) 整備必須。
//   - 変更時は docs/privacy.html / docs/terms.html / docs/store/store-description-draft.md も同期更新。
//   - 機密 grep 影響なし (公開情報、ストア掲載予定)。
export const URLS = {
  /** プライバシーポリシー (architect 起草 → 公開後プロレビュー / 要件定義 v0.4 §5.7.2) */
  privacyPolicy: `${PAGES_BASE}/privacy.html`,
  /** 利用規約 */
  termsOfService: `${PAGES_BASE}/terms.html`,
  /** お問い合わせ用メール (TBD 仮置き、社長確定後 src/config/urls.ts のみ差替えで全画面同期) */
  contact: 'mailto:support@miraikousou.com',
  /** ストア掲載用のサポートサイト (任意 / 同 GitHub Pages のトップ) */
  supportSite: PAGES_BASE,
} as const;

export type AppUrls = typeof URLS;
