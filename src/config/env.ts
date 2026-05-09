/**
 * 環境変数の取得を一箇所に集約する。
 * Expo の `extra` 経由で `app.config.ts` から渡された値を読む。
 *
 * 設計原則:
 *   - Service Role Key は絶対にここで読まない (サーバ専用)
 *   - 公開キー (anon key) のみクライアントに配布
 *   - 必須キーが未設定なら fail-fast (起動時に明確なエラー)
 *
 * 参照: 02_設計/mobile-engineer依頼書.md §5.2-3
 */

import Constants from 'expo-constants';

type ExtraConfig = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  admobAndroidAppId: string | null;
  admobIosAppId: string | null;
  sentryDsn: string | null;
  appEnv: 'development' | 'preview' | 'production';
};

function readExtra(): ExtraConfig {
  const extra = (Constants.expoConfig?.extra ?? {}) as Partial<ExtraConfig>;

  if (!extra.supabaseUrl || !extra.supabaseAnonKey) {
    throw new Error(
      'SUPABASE_URL と SUPABASE_ANON_KEY が未設定です。.env ファイルと app.config.ts を確認してください。',
    );
  }

  return {
    supabaseUrl: extra.supabaseUrl,
    supabaseAnonKey: extra.supabaseAnonKey,
    admobAndroidAppId: extra.admobAndroidAppId ?? null,
    admobIosAppId: extra.admobIosAppId ?? null,
    sentryDsn: extra.sentryDsn ?? null,
    appEnv: extra.appEnv ?? 'development',
  };
}

export const env = readExtra();

export const isDevelopment = env.appEnv === 'development';
export const isProduction = env.appEnv === 'production';
