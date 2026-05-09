/**
 * Supabase クライアントのシングルトン。
 *
 * 設計:
 *   - `createClient` を 1 回だけ呼ぶ (アプリ全体で同じインスタンスを使い回す)
 *   - セッション永続化は `expo-secure-store` を使用 (AsyncStorage より安全)
 *   - 型は `Database` から生成 (DDL 手書き → 将来 supabase-cli で自動生成へ)
 *
 * 参照:
 *   - 02_設計/アーキテクチャ.md §1 (クライアント構成)
 *   - 02_設計/mobile-engineer依頼書.md §5.2 (RLS前提の書き方)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { env } from '../config/env';
import type { Database } from '../types/database';

/**
 * SecureStore を Supabase Auth の永続化ストレージとして使うためのアダプタ。
 * AsyncStorage は平文保存で機密性が低いため、JWT を含むセッションは SecureStore に置く。
 */
const ExpoSecureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.supabaseUrl,
  env.supabaseAnonKey,
  {
    auth: {
      storage: ExpoSecureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false, // RN ではディープリンクで別途処理
    },
    realtime: {
      params: {
        eventsPerSecond: 10,
      },
    },
  },
);
