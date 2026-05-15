/**
 * lib/auth.ts L1 unit (Phase D D4-T01 / D4-T02 関連)。
 *
 * カバー範囲:
 *   - updatePassword: 正常 / Auth エラー
 *   - deleteAccount: owner 経路 → households.delete、member 経路 → household_members.delete
 *   - deleteAccount: 認証ユーザー欠落エラー
 *   - deleteAccount: households 削除失敗時のエラー伝搬
 */

import { deleteAccount, updatePassword } from '../auth';
import { supabase } from '../supabase';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string) => `learnapp://${path}`),
}));

jest.mock('../supabase', () => {
  return {
    supabase: {
      auth: {
        updateUser: jest.fn(),
        signOut: jest.fn(),
      },
      from: jest.fn(),
    },
  };
});

describe('updatePassword', () => {
  beforeEach(() => {
    (supabase.auth.updateUser as jest.Mock).mockReset();
  });

  it('成功時 error=null を返す', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({ error: null });
    const result = await updatePassword('newpass8chars');
    expect(result.error).toBeNull();
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'newpass8chars' });
  });

  it('weak-password を displayMessage 化する', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({
      error: { message: 'Password is too short' },
    });
    const result = await updatePassword('short');
    expect(result.error?.code).toBe('weak-password');
    expect(result.error?.displayMessage).toContain('6文字以上');
  });

  it('rate-limited を displayMessage 化する', async () => {
    (supabase.auth.updateUser as jest.Mock).mockResolvedValue({
      error: { message: 'Rate limit exceeded' },
    });
    const result = await updatePassword('newpass8chars');
    expect(result.error?.code).toBe('rate-limited');
  });
});

describe('deleteAccount', () => {
  beforeEach(() => {
    (supabase.from as jest.Mock).mockReset();
    (supabase.auth.signOut as jest.Mock).mockReset();
    (supabase.auth.signOut as jest.Mock).mockResolvedValue({ error: null });
  });

  it('authUserId 欠落でエラーを返す', async () => {
    const result = await deleteAccount('', 'h-1');
    expect(result.error?.displayMessage).toContain('セッション');
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('owner 経路: households.delete + signOut を呼ぶ', async () => {
    const selectChain = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { role_in_household: 'owner' },
        error: null,
      }),
    };
    const householdMembersMock = {
      select: jest.fn(() => selectChain),
    };
    const householdsDeleteEq = jest.fn().mockResolvedValue({ error: null });
    const householdsMock = {
      delete: jest.fn(() => ({ eq: householdsDeleteEq })),
    };
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'household_members') return householdMembersMock;
      if (table === 'households') return householdsMock;
      return {};
    });

    const result = await deleteAccount('user-1', 'h-1');
    expect(result.householdDeleted).toBe(true);
    expect(result.error).toBeNull();
    expect(householdsMock.delete).toHaveBeenCalled();
    expect(householdsDeleteEq).toHaveBeenCalledWith('id', 'h-1');
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('member 経路: household_members.delete のみ + signOut を呼ぶ', async () => {
    const selectChain = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { role_in_household: 'member' },
        error: null,
      }),
    };
    const deleteChain = {
      eq: jest.fn().mockReturnThis(),
    };
    // deleteChain の最後の eq は最終的に await 可能オブジェクトを返す
    let callCount = 0;
    deleteChain.eq = jest.fn(() => {
      callCount++;
      if (callCount >= 2) {
        return Promise.resolve({ error: null });
      }
      return deleteChain;
    });
    const householdMembersMock = {
      select: jest.fn(() => selectChain),
      delete: jest.fn(() => deleteChain),
    };
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'household_members') return householdMembersMock;
      return {};
    });

    const result = await deleteAccount('user-1', 'h-1');
    expect(result.householdDeleted).toBe(false);
    expect(result.error).toBeNull();
    expect(householdMembersMock.delete).toHaveBeenCalled();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('households 削除失敗時にエラーを返し signOut しない', async () => {
    const selectChain = {
      eq: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({
        data: { role_in_household: 'owner' },
        error: null,
      }),
    };
    const householdsDeleteEq = jest
      .fn()
      .mockResolvedValue({ error: { message: 'Network error' } });
    const householdMembersMock = {
      select: jest.fn(() => selectChain),
    };
    const householdsMock = {
      delete: jest.fn(() => ({ eq: householdsDeleteEq })),
    };
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      if (table === 'household_members') return householdMembersMock;
      if (table === 'households') return householdsMock;
      return {};
    });

    const result = await deleteAccount('user-1', 'h-1');
    expect(result.householdDeleted).toBe(false);
    expect(result.error?.code).toBe('network');
    expect(supabase.auth.signOut).not.toHaveBeenCalled();
  });

  it('householdId=null 時は household_members を触らずに signOut のみ', async () => {
    const result = await deleteAccount('user-1', null);
    expect(result.householdDeleted).toBe(false);
    expect(result.error).toBeNull();
    expect(supabase.from).not.toHaveBeenCalled();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });
});
