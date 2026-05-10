/**
 * ローカル一時 ID 生成。
 * - ウィザード入力中の members / lessons / schedules の識別に使用
 * - DB INSERT 後は実 uuid に置き換える
 *
 * crypto.randomUUID は React Native でも 0.71+ で利用可能だが、
 * Hermes エンジンでまだサポートされていないターゲットに備えて簡易フォールバックを用意。
 */

export function tempId(prefix = 'tmp'): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}_${globalThis.crypto.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 12);
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${random}`;
}
