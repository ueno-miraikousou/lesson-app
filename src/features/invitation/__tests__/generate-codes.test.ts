/**
 * L1: generate-codes.ts 純関数テスト。
 *
 * - generateCodeShort: 6 桁数字を返す (^\d{6}$)
 * - generateCodeLong: 16 文字 URL-safe を返す
 * - computeExpiresAt: 24 時間後の ISO を返す
 * - isCodeShort / isCodeLong: 形式判定
 */

import { INVITATION } from '../../../config/app';
import {
  computeExpiresAt,
  generateCodeLong,
  generateCodeShort,
  isCodeLong,
  isCodeShort,
} from '../generate-codes';

describe('generateCodeShort', () => {
  it('6 桁数字 (^\\d{6}$)', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateCodeShort();
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  it('範囲は 100000〜999999 (先頭 0 なし)', () => {
    for (let i = 0; i < 50; i++) {
      const n = parseInt(generateCodeShort(), 10);
      expect(n).toBeGreaterThanOrEqual(100000);
      expect(n).toBeLessThanOrEqual(999999);
    }
  });
});

describe('generateCodeLong', () => {
  it(`${INVITATION.CODE_LONG_LENGTH} 文字の URL-safe`, () => {
    for (let i = 0; i < 30; i++) {
      const code = generateCodeLong();
      expect(code).toHaveLength(INVITATION.CODE_LONG_LENGTH);
      expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('十分なエントロピー: 30 個生成して衝突なし', () => {
    const set = new Set<string>();
    for (let i = 0; i < 30; i++) {
      set.add(generateCodeLong());
    }
    expect(set.size).toBe(30);
  });
});

describe('computeExpiresAt', () => {
  it(`現在から ${INVITATION.EXPIRY_HOURS} 時間後の ISO`, () => {
    const now = new Date('2026-05-15T00:00:00Z');
    const expires = computeExpiresAt(now);
    expect(expires).toBe('2026-05-16T00:00:00.000Z');
  });
});

describe('isCodeShort / isCodeLong', () => {
  it.each([
    ['483921', true],
    ['123456', true],
    ['100000', true],
    ['999999', true],
    ['000000', true], // 形式上は OK (実発行は 100000 以上だが、入力検証では許容)
    ['12345', false],
    ['1234567', false],
    ['abc123', false],
    ['', false],
  ])('isCodeShort("%s") === %s', (input, expected) => {
    expect(isCodeShort(input)).toBe(expected);
  });

  it.each([
    ['ABCDEFGHIJ123456', true],
    ['1A2B3C4D5E6F7G8H', true],
    ['abc-def_ghi12345', true],
    ['short', false],
    ['', false],
    ['ABCDEFGHIJ12345!', false], // ! は URL-safe alphabet 外
  ])('isCodeLong("%s") === %s', (input, expected) => {
    expect(isCodeLong(input)).toBe(expected);
  });
});
