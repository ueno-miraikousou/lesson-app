/**
 * 招待コード生成ユーティリティ。
 *
 * 仕様:
 *   - code_short: 6桁数字 (100000〜999999)
 *   - code_long:  16文字 URL-safe Base64 風 (A-Z, a-z, 0-9, _, -)
 *   - 衝突回避は INSERT 側で UNIQUE 制約に頼り、5回までリトライ
 *   - 24時間有効期限
 *
 * 参照:
 *   - 02_設計/アーキテクチャ.md v0.3.2 §2.2 (発行ロジック擬似コード)
 *   - 02_設計/画面/SHARE-02-配偶者招待.md §1.2 §9
 */

import { INVITATION } from '../../config/app';

const URL_SAFE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

/**
 * 6桁の数字コードを生成 (先頭0なし)。
 * Math.random は暗号学的に弱いが、UNIQUE 制約 + Rate Limit + 短命なら実用十分。
 * Edge Function 側ではより強い乱数源を使うことを推奨。
 */
export function generateCodeShort(): string {
  const min = 10 ** (INVITATION.CODE_SHORT_LENGTH - 1); // 100000
  const max = 10 ** INVITATION.CODE_SHORT_LENGTH; // 1000000
  return Math.floor(min + Math.random() * (max - min)).toString();
}

/**
 * 16文字の URL-safe コードを生成。
 * QR / ディープリンクの URL に直接埋め込むため URL safe な文字種に限定。
 */
export function generateCodeLong(): string {
  const length = INVITATION.CODE_LONG_LENGTH;
  let result = '';
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * URL_SAFE_ALPHABET.length);
    result += URL_SAFE_ALPHABET[idx];
  }
  return result;
}

/**
 * 有効期限の ISO 文字列を返す。
 * 現在時刻から `INVITATION.EXPIRY_HOURS` 時間後。
 */
export function computeExpiresAt(now: Date = new Date()): string {
  const ms = INVITATION.EXPIRY_HOURS * 60 * 60 * 1000;
  return new Date(now.getTime() + ms).toISOString();
}

/** 入力文字列が code_short 形式 (6桁数字) か判定 */
export function isCodeShort(input: string): boolean {
  return /^\d{6}$/.test(input);
}

/** 入力文字列が code_long 形式 (16文字 URL-safe) か判定 */
export function isCodeLong(input: string): boolean {
  return new RegExp(`^[A-Za-z0-9_-]{${INVITATION.CODE_LONG_LENGTH}}$`).test(input);
}
