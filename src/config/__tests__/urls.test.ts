/**
 * src/config/urls.ts テスト (Phase E E2-T01)。
 *
 * カバー範囲:
 *   - URLS object の構造と型 (privacyPolicy / termsOfService / contact / supportSite)
 *   - privacyPolicy / termsOfService は GitHub Pages URL (HTTPS)
 *   - contact は mailto: スキーム + @ を含む有効なメールアドレス形式
 *   - supportSite は HTTPS URL
 *
 * 目的:
 *   - 社長確定後に urls.ts のみ差替えで全画面同期される設計の回帰防止
 *   - mailto: スキーム指定漏れ防止 (誤って 'support@miraikousou.com' のみだと Linking.openURL が動作しない)
 */

import { URLS } from '../urls';

describe('URLS (Phase E E2-T01)', () => {
  it('必須キー 4 つを持つ', () => {
    expect(URLS).toHaveProperty('privacyPolicy');
    expect(URLS).toHaveProperty('termsOfService');
    expect(URLS).toHaveProperty('contact');
    expect(URLS).toHaveProperty('supportSite');
  });

  it('privacyPolicy は HTTPS の privacy.html を指す', () => {
    expect(URLS.privacyPolicy).toMatch(/^https:\/\//);
    expect(URLS.privacyPolicy).toContain('privacy.html');
  });

  it('termsOfService は HTTPS の terms.html を指す', () => {
    expect(URLS.termsOfService).toMatch(/^https:\/\//);
    expect(URLS.termsOfService).toContain('terms.html');
  });

  it('contact は mailto: スキーム + 有効なメールアドレス形式', () => {
    expect(URLS.contact.startsWith('mailto:')).toBe(true);
    const address = URLS.contact.slice('mailto:'.length);
    // 簡易 RFC 5322 サブセット: ローカル部 + @ + ドメイン部
    expect(address).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  it('supportSite は HTTPS URL (任意項目だが現在は GitHub Pages)', () => {
    expect(URLS.supportSite).toMatch(/^https:\/\//);
  });

  it('privacyPolicy / termsOfService / supportSite は同一の base URL を共有 (一元管理)', () => {
    expect(URLS.privacyPolicy.startsWith(URLS.supportSite)).toBe(true);
    expect(URLS.termsOfService.startsWith(URLS.supportSite)).toBe(true);
  });
});
