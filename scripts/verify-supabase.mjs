/**
 * Supabase 接続動作確認スクリプト (一時的、Node.js から直接実行)。
 *
 * 確認項目:
 *   1. SUPABASE_URL / SUPABASE_ANON_KEY が .env から読めるか
 *   2. supabase.auth.getSession() が 200 OK で返るか (未ログインは想定通り)
 *   3. RLS 適用済みテーブルへの SELECT がエラーなく空配列を返すか (RLS で拒否されない経路を確認)
 *
 * 実行方法:
 *   cd 03_実装
 *   node --env-file=.env scripts/verify-supabase.mjs
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;

if (!url || !anon) {
  console.error('FAIL: SUPABASE_URL or SUPABASE_ANON_KEY missing in environment.');
  process.exit(1);
}

console.log('OK: Environment loaded');
console.log('  URL prefix:', url.replace(/^(https:\/\/[^.]+).*/, '$1...'));
console.log('  Anon key length:', anon.length);

const supabase = createClient(url, anon, {
  auth: { persistSession: false },
});

async function main() {
  console.log('\n--- 1. auth.getSession() ---');
  const sessionResult = await supabase.auth.getSession();
  console.log('  data.session:', sessionResult.data.session === null ? 'null (expected for anonymous)' : 'present');
  if (sessionResult.error) {
    console.error('  ERROR:', sessionResult.error.message);
    process.exit(1);
  }
  console.log('  OK: getSession returned without error');

  console.log('\n--- 2. SELECT from households (RLS enforced) ---');
  const householdsResult = await supabase.from('households').select('id').limit(1);
  if (householdsResult.error) {
    const msg = householdsResult.error.message ?? '';
    const code = householdsResult.error.code ?? '';
    // PostgREST: PGRST205 = schema cache miss (table absent)
    // PostgreSQL: 42P01 = relation does not exist
    if (code === 'PGRST205' || code === '42P01' || msg.includes('does not exist') || msg.includes('Could not find the table')) {
      console.log('  EXPECTED: table not found yet → DDL needs to be applied');
      console.log('  Code:', code);
      console.log('  Message:', msg);
    } else {
      console.error('  UNEXPECTED ERROR:', JSON.stringify(householdsResult.error));
      process.exitCode = 2;
    }
  } else {
    console.log('  OK: households query returned', householdsResult.data?.length ?? 0, 'rows (anon = RLS enforced)');
  }

  console.log('\n=== verify-supabase.mjs done ===');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(99);
});
