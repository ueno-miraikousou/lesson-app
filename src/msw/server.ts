/**
 * MSW (Mock Service Worker) のテスト用サーバー。
 *
 * 設計:
 *   - Node 環境用 (jsdom + setupServer)
 *   - グローバル handlers は最小限。各テストで個別に server.use(...) で上書き
 *   - jest.setup.expo.ts で server.listen() / server.close() を制御
 *
 * 参照: https://mswjs.io/docs/integrations/node
 */

import { setupServer } from 'msw/node';
import { defaultHandlers } from './handlers';

export const server = setupServer(...defaultHandlers);
