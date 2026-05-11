/**
 * WIZ-09 達成音 (celebration chime) の再生ヘルパー。
 *
 * Spec: designer v0.3 §WIZ-09 達成音 (line 712-728)
 *   - デフォルト OFF (DDL: notification_preferences.celebration_sound_enabled = false)
 *   - SET-06 (= サウンドと触覚) で ON 切替可能
 *   - 連続再生・ループ禁止 (1 回のみ)
 *   - iOS Silent Mode 中は鳴らさない (OS 方針に従う)
 *   - 短い「ポン♪」音 (assets/sounds/celebration.wav は ~0.30s, 自前生成 CC0)
 *
 * 実装方針:
 *   - `expo-av` の `Audio.Sound` を 1 インスタンス使い回す
 *     (load/unload を毎回やるとアタックが遅れて演出のキレが鈍る)
 *   - `playsInSilentModeIOS: false` で iOS の物理サイレントスイッチを尊重
 *   - 最初の `play()` で遅延ロード。プリロードは画面側 `useCelebrationSoundPreloader`
 *     フックで明示的にトリガできる (WIZ-07 ローディング中にプリロードして
 *     WIZ-09 進入時にゼロレイテンシで鳴らす想定)
 *
 * エラーハンドリング:
 *   - 音声ロード失敗・再生失敗は throw せずコンソールに出して握りつぶす
 *     (達成音はコアフローではなく、エラーで画面が固まると本末転倒)
 *   - Reanimated/worklets には依存しない (R-strategy 維持)
 */

import { Audio, type AVPlaybackSource } from 'expo-av';

// Metro バンドラーは静的アセットを `require()` で解決する仕様。ESM `import`
// では .wav は通らないため、ここは React Native の慣行に従って require を使う。
// 戻り値は Metro の AssetModule (number)、AVPlaybackSource にキャスト可。
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
const CELEBRATION_SOURCE: AVPlaybackSource = require('../../assets/sounds/celebration.wav');

let cachedSound: Audio.Sound | null = null;
let audioModeConfigured = false;

async function ensureAudioMode(): Promise<void> {
  if (audioModeConfigured) return;
  // iOS Silent Mode で音を鳴らさない設定 (designer spec line 728 準拠)
  // Android 側は staysActiveInBackground=false で OK (バックグラウンドで
  // 鳴り続けるアプリではない)
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: false,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
  audioModeConfigured = true;
}

async function ensureLoaded(): Promise<Audio.Sound | null> {
  if (cachedSound) return cachedSound;
  try {
    await ensureAudioMode();
    const { sound } = await Audio.Sound.createAsync(CELEBRATION_SOURCE, {
      shouldPlay: false,
      volume: 1.0,
    });
    cachedSound = sound;
    return sound;
  } catch (err) {
    console.warn('[celebration-sound] failed to load', err);
    return null;
  }
}

/**
 * 達成音を 1 回再生。設定 OFF や読み込み失敗は no-op。
 *
 * 連続呼び出しに備えて先頭まで巻き戻してから再生する (ただし MVP では
 * WIZ-09 で 1 度だけしか呼ばれない想定)。
 */
export async function playCelebrationSound(): Promise<void> {
  const sound = await ensureLoaded();
  if (!sound) return;
  try {
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch (err) {
    console.warn('[celebration-sound] play failed', err);
  }
}

/**
 * 画面アンマウント時のクリーンアップ。
 * 通常は使い回したいので呼ばない。テスト用 / メモリ逼迫時のみ。
 */
export async function unloadCelebrationSound(): Promise<void> {
  if (!cachedSound) return;
  try {
    await cachedSound.unloadAsync();
  } catch (err) {
    console.warn('[celebration-sound] unload failed', err);
  }
  cachedSound = null;
}

/**
 * テスト用フック: 内部キャッシュをリセット。本番コードからは呼ばない。
 */
export function __resetCelebrationSoundForTests(): void {
  cachedSound = null;
  audioModeConfigured = false;
}
