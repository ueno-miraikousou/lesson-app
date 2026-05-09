/**
 * 外部 URL の一元管理。GitHub Pages の URL 等を1ファイルに集約することで、
 * 将来の独自ドメイン化時に書き換える行数を最小化する。
 *
 * 参照: 02_設計/技術メモ-GitHub Pages運用手順.md §2.1, §2.3
 *      02_設計/mobile-engineer引継ぎサマリ.md §5.5
 *
 * 社長の GitHub アカウント / リポジトリ名が確定したら、下記プレースホルダを置換する。
 * 暫定値: GITHUB_USER = '<github-username>', REPO = 'lesson-app'
 */

const GITHUB_USER = '<github-username>'; // 社長アカウント確定時に置換
const REPO = 'lesson-app'; // GitHub リポジトリ名確定時に置換

const PAGES_BASE = `https://${GITHUB_USER}.github.io/${REPO}` as const;

export const URLS = {
  /** プライバシーポリシー (architect 起草 → 公開後プロレビュー / 要件定義 v0.4 §5.7.2) */
  privacyPolicy: `${PAGES_BASE}/privacy.html`,
  /** 利用規約 */
  termsOfService: `${PAGES_BASE}/terms.html`,
  /** お問い合わせ用メール (暫定: フリーアドレス。アカウント作成後に確定) */
  contact: 'mailto:lesson-app-support@gmail.com',
  /** ストア掲載用のサポートサイト (任意 / 同 GitHub Pages のトップ) */
  supportSite: PAGES_BASE,
} as const;

export type AppUrls = typeof URLS;
