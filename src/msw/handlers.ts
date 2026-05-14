/**
 * MSW グローバル handlers。
 *
 * デフォルトは Supabase REST 全テーブルが空配列を返す最安全状態。
 * 個別テストで `server.use(http.post('*\/rest/v1/members', () => ...))` 等で上書き。
 *
 * Supabase URL は env で切替可能なため `*` glob で抽象化。
 */

import { http, HttpResponse } from 'msw';

export const defaultHandlers = [
  // Auth
  http.post('*/auth/v1/signup', () =>
    HttpResponse.json({ user: null, session: null }),
  ),
  http.post('*/auth/v1/token', () =>
    HttpResponse.json({ access_token: 'test-token', user: { id: 'test-uid' } }),
  ),
  http.get('*/auth/v1/user', () =>
    HttpResponse.json({ id: 'test-uid', email: 'test@test.local' }),
  ),

  // PostgREST: 全テーブルで空配列をデフォルト返却
  http.get('*/rest/v1/:table', () => HttpResponse.json([])),
  http.post('*/rest/v1/:table', () => HttpResponse.json([])),
  http.patch('*/rest/v1/:table', () => HttpResponse.json([])),
  http.delete('*/rest/v1/:table', () => HttpResponse.json([])),
];
