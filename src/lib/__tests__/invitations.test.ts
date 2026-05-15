/**
 * L1: src/lib/invitations.ts の単体テスト。
 *
 * 検証:
 *   - createInvitation: RPC が呼ばれる、戻り値マッピング、エラー伝播
 *   - acceptInvitation: 形式検証、RPC error → AcceptInvitationError 翻訳
 *   - fetchActiveInvitations: builder chain 経由でのフィルタ
 *   - revokeInvitation: update 呼出
 *   - buildInvitationDeepLink / buildInvitationShareText / formatExpiresAt: 純関数
 */

// supabase クライアントは expo-secure-store に依存 (RN native) するため、
// L1 (ts-jest + node) テストでは jest.mock で完全に置き換える。
import {
  AcceptInvitationError,
  acceptInvitation,
  buildInvitationDeepLink,
  buildInvitationShareText,
  createInvitation,
  fetchActiveInvitations,
  formatExpiresAt,
  revokeInvitation,
} from '../invitations';
import { supabase } from '../supabase';

jest.mock('../supabase', () => ({
  supabase: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

type Mocked = jest.Mocked<typeof supabase>;
const mockedSupabase = supabase as unknown as Mocked & {
  rpc: jest.Mock;
};

describe('createInvitation (RPC ラッパ)', () => {
  beforeEach(() => {
    mockedSupabase.rpc = jest.fn();
  });

  it('成功時に CreatedInvitation を返す', async () => {
    mockedSupabase.rpc.mockResolvedValueOnce({
      data: [
        {
          id: 'inv-1',
          household_id: 'h1',
          code_short: '483921',
          code_long: '1A2B3C4D5E6F7G8H',
          expires_at: '2026-05-16T00:00:00Z',
          created_by: 'auth-1',
          created_at: '2026-05-15T00:00:00Z',
        },
      ],
      error: null,
    });

    const result = await createInvitation('h1', 24);
    expect(mockedSupabase.rpc).toHaveBeenCalledWith('create_invitation', {
      p_household_id: 'h1',
      p_ttl_hours: 24,
    });
    expect(result.codeShort).toBe('483921');
    expect(result.codeLong).toBe('1A2B3C4D5E6F7G8H');
    expect(result.householdId).toBe('h1');
  });

  it('RPC エラーは Error にラップして throw', async () => {
    mockedSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'caller is not owner of household' },
    });

    await expect(createInvitation('h1')).rejects.toThrow(/not owner/);
  });

  it('空配列戻りは "no row" エラー', async () => {
    mockedSupabase.rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(createInvitation('h1')).rejects.toThrow(/no row/);
  });

  it('default ttl は 24 時間', async () => {
    mockedSupabase.rpc.mockResolvedValueOnce({
      data: [
        {
          id: 'i',
          household_id: 'h',
          code_short: '111111',
          code_long: 'X'.repeat(16),
          expires_at: '2026-05-16T00:00:00Z',
          created_by: 'a',
          created_at: '2026-05-15T00:00:00Z',
        },
      ],
      error: null,
    });
    await createInvitation('h');
    expect(mockedSupabase.rpc).toHaveBeenCalledWith('create_invitation', {
      p_household_id: 'h',
      p_ttl_hours: 24,
    });
  });
});

describe('acceptInvitation (RPC エラー翻訳)', () => {
  beforeEach(() => {
    mockedSupabase.rpc = jest.fn();
  });

  it('成功時に AcceptedInvitation を返す', async () => {
    mockedSupabase.rpc.mockResolvedValueOnce({
      data: [
        {
          household_id: 'h1',
          household_name: '山田家',
          is_shared: true,
          member_id: 'm-new',
        },
      ],
      error: null,
    });

    const r = await acceptInvitation('483921');
    expect(mockedSupabase.rpc).toHaveBeenCalledWith('accept_invitation', { p_code_short: '483921' });
    expect(r.householdId).toBe('h1');
    expect(r.householdName).toBe('山田家');
    expect(r.isShared).toBe(true);
  });

  it.each([
    ['abcdef', 'invalid_format'],
    ['12345', 'invalid_format'],
    ['1234567', 'invalid_format'],
    ['', 'invalid_format'],
  ])('形式不正 "%s" は事前にクライアント検証で弾く', async (input, kind) => {
    const result = await acceptInvitation(input).catch((e: unknown) => e);
    expect(result).toBeInstanceOf(AcceptInvitationError);
    expect(result).toMatchObject({ kind });
    // クライアント側で reject されるため RPC は呼ばれない
    expect(mockedSupabase.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['accept_invitation: code not found', 'not_found'],
    ['accept_invitation: code expired (expires_at=2026-05-14T00:00:00Z)', 'expired'],
    ['accept_invitation: code already used (used_at=2026-05-15T01:00:00Z)', 'used'],
    ['accept_invitation: already a member of household h1', 'already_member'],
    ['accept_invitation: not authenticated', 'unauthenticated'],
    ['accept_invitation: invalid code format', 'invalid_format'],
    ['something completely unexpected', 'unknown'],
  ])('RPC エラー "%s" は kind="%s" に翻訳', async (rpcMsg, kind) => {
    mockedSupabase.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: rpcMsg },
    });

    const result = await acceptInvitation('483921').catch((e: unknown) => e);
    expect(result).toBeInstanceOf(AcceptInvitationError);
    expect(result).toMatchObject({ kind });
  });

  it('data が空配列の場合 "unknown" エラー', async () => {
    mockedSupabase.rpc.mockResolvedValueOnce({ data: [], error: null });
    const result = await acceptInvitation('483921').catch((e: unknown) => e);
    expect(result).toBeInstanceOf(AcceptInvitationError);
    expect(result).toMatchObject({ kind: 'unknown' });
  });
});

describe('fetchActiveInvitations', () => {
  it('builder chain で is(used_at, null) + gt(expires_at) を呼ぶ', async () => {
    const orderMock = jest.fn(() =>
      Promise.resolve({
        data: [
          {
            id: 'i1',
            code_short: '111111',
            code_long: 'A'.repeat(16),
            expires_at: '2026-05-16T00:00:00Z',
            created_at: '2026-05-15T00:00:00Z',
            used_at: null,
          },
        ],
        error: null,
      }),
    );
    const gtMock = jest.fn(() => ({ order: orderMock }));
    const isMock = jest.fn(() => ({ gt: gtMock }));
    const eqMock = jest.fn(() => ({ is: isMock }));
    const selectMock = jest.fn(() => ({ eq: eqMock }));

    (mockedSupabase.from as jest.Mock).mockReturnValueOnce({ select: selectMock });

    const result = await fetchActiveInvitations('h1', new Date('2026-05-15T00:00:00Z'));
    expect(result).toHaveLength(1);
    expect(result[0]?.codeShort).toBe('111111');
    expect(eqMock).toHaveBeenCalledWith('household_id', 'h1');
    expect(isMock).toHaveBeenCalledWith('used_at', null);
    expect(gtMock).toHaveBeenCalledWith('expires_at', '2026-05-15T00:00:00.000Z');
  });
});

describe('revokeInvitation', () => {
  it('update + eq(id) を呼ぶ', async () => {
    const eqMock = jest.fn(() => Promise.resolve({ error: null }));
    const updateMock = jest.fn(() => ({ eq: eqMock }));
    (mockedSupabase.from as jest.Mock).mockReturnValueOnce({ update: updateMock });

    await revokeInvitation('inv-1', new Date('2026-05-15T12:00:00Z'));
    expect(updateMock).toHaveBeenCalledWith({ used_at: '2026-05-15T12:00:00.000Z' });
    expect(eqMock).toHaveBeenCalledWith('id', 'inv-1');
  });
});

describe('buildInvitationDeepLink', () => {
  it('learnapp スキームでディープリンクを組み立てる', () => {
    expect(buildInvitationDeepLink('ABCDEF0123456789')).toBe(
      'learnapp://invite/ABCDEF0123456789',
    );
  });
  it('カスタムスキームも受け付ける', () => {
    expect(buildInvitationDeepLink('x', 'custom')).toBe('custom://invite/x');
  });
});

describe('buildInvitationShareText', () => {
  it('6 桁コード + ディープリンク + 有効期限を含む', () => {
    const text = buildInvitationShareText(
      {
        code_short: '483921',
        code_long: '1A2B3C4D5E6F7G8H',
        expires_at: '2026-05-16T05:00:00.000Z',
      },
      'learnapp',
    );
    expect(text).toContain('483921');
    expect(text).toContain('learnapp://invite/1A2B3C4D5E6F7G8H');
    expect(text).toMatch(/2026/);
  });
});

describe('formatExpiresAt', () => {
  it('YYYY/MM/DD (曜) HH:mm に整形', () => {
    // 2026-05-16 は土曜 (固定)、ローカルタイムゾーン依存だが曜日と日付は month-day で確定
    const result = formatExpiresAt('2026-05-16T05:30:00Z');
    expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2} \([日月火水木金土]\) \d{2}:\d{2}$/);
  });
});
