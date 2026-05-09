// Edge Function 共通の CORS ヘッダ。
// MVP では Same Origin で動作するが、Web 版や開発 Tools からの呼び出しに備えて緩めに設定。
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
