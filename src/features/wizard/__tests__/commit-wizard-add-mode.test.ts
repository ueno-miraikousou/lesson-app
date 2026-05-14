/**
 * commitWizardAddMode (W-10 追加モード) のユニットテスト。
 *
 * カバー範囲:
 *   - 追加メンバー INSERT 成功 → tempIdToDbId 解決経由で lessons + schedules
 *   - operator (固定 tempId) は対象外 (フィルタされる)
 *   - INSERT 失敗時に rollback (新規 members の DELETE) が呼ばれる
 *   - 0 件入力時は即座 return
 */

import { commitWizardAddMode } from '../commit-wizard-add-mode';

const insertMembers = jest.fn();
const insertLessons = jest.fn();
const insertSchedules = jest.fn();
const deleteMembers = jest.fn();

jest.mock('../../../lib/supabase', () => ({
  supabase: {
    from: jest.fn((table: string) => {
      if (table === 'members') {
        return {
          insert: jest.fn((row: unknown) => ({
            select: jest.fn(() => ({
              single: jest.fn(() => insertMembers(row)),
            })),
          })),
          delete: jest.fn(() => ({
            in: jest.fn((_col: string, ids: string[]) => deleteMembers(ids)),
          })),
        };
      }
      if (table === 'lessons') {
        return {
          insert: jest.fn((row: unknown) => ({
            select: jest.fn(() => ({
              single: jest.fn(() => insertLessons(row)),
            })),
          })),
        };
      }
      if (table === 'schedules') {
        return {
          insert: jest.fn((row: unknown) => insertSchedules(row)),
        };
      }
      return {};
    }),
  },
}));

describe('commitWizardAddMode (W-10 追加モード)', () => {
  beforeEach(() => {
    insertMembers.mockReset();
    insertLessons.mockReset();
    insertSchedules.mockReset();
    deleteMembers.mockReset();
  });

  it('空入力 (0 件) なら DB アクセスせず即時 return', async () => {
    const result = await commitWizardAddMode({
      householdId: 'h1',
      newMembers: [],
      newLessons: [],
    });
    expect(result).toEqual({ insertedMemberIds: [], insertedLessonIds: [] });
    expect(insertMembers).not.toHaveBeenCalled();
    expect(deleteMembers).not.toHaveBeenCalled();
  });

  it('operator (固定 tempId) は newMembers から除外され INSERT されない', async () => {
    insertMembers.mockResolvedValue({ data: { id: 'db-new' }, error: null });
    const result = await commitWizardAddMode({
      householdId: 'h1',
      newMembers: [
        {
          tempId: 'operator',
          name: 'ママ',
          birthDate: null,
          gender: null,
          role: 'parent',
          colorHex: '#48C9B0',
        },
        {
          tempId: 'm2',
          name: 'ハヤト',
          birthDate: null,
          gender: 'male',
          role: 'child',
          colorHex: '#F39C12',
        },
      ],
      newLessons: [],
    });
    expect(insertMembers).toHaveBeenCalledTimes(1);
    expect(insertMembers).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ハヤト', role: 'child' }),
    );
    expect(result.insertedMemberIds).toEqual(['db-new']);
  });

  it('members + lessons + schedules 順で INSERT、tempId → DB id を lessons.member_id へ解決', async () => {
    insertMembers.mockResolvedValueOnce({ data: { id: 'db-m1' }, error: null });
    insertLessons.mockResolvedValueOnce({ data: { id: 'db-l1' }, error: null });
    insertSchedules.mockResolvedValueOnce({ error: null });

    await commitWizardAddMode({
      householdId: 'h1',
      newMembers: [
        {
          tempId: 'm1',
          name: 'ハヤト',
          birthDate: '2021-04-15',
          gender: 'male',
          role: 'child',
          colorHex: '#F39C12',
        },
      ],
      newLessons: [
        {
          tempId: 'l1',
          memberTempId: 'm1',
          name: 'スイミング',
          classroomName: null,
          location: null,
          schedules: [
            {
              tempId: 'sl1',
              daysOfWeek: ['MO'],
              startTime: '17:00',
              endTime: '18:00',
              recurrenceUntil: null,
            },
          ],
        },
      ],
    });

    expect(insertLessons).toHaveBeenCalledWith(
      expect.objectContaining({ member_id: 'db-m1', name: 'スイミング' }),
    );
    expect(insertSchedules).toHaveBeenCalledWith(
      expect.objectContaining({ lesson_id: 'db-l1' }),
    );
  });

  it('members INSERT 失敗時に rollback されず (まだ何も INSERT されていない) throw する', async () => {
    insertMembers.mockResolvedValueOnce({ data: null, error: { message: 'db fail' } });
    await expect(
      commitWizardAddMode({
        householdId: 'h1',
        newMembers: [
          {
            tempId: 'm1',
            name: 'ハヤト',
            birthDate: null,
            gender: null,
            role: 'child',
            colorHex: '#F39C12',
          },
        ],
        newLessons: [],
      }),
    ).rejects.toThrow(/add-mode members insert failed/);
    expect(deleteMembers).not.toHaveBeenCalled();
  });

  it('lessons INSERT 失敗時、当回 INSERT した newMembers を rollback DELETE', async () => {
    insertMembers.mockResolvedValueOnce({ data: { id: 'db-m1' }, error: null });
    insertLessons.mockResolvedValueOnce({ data: null, error: { message: 'lesson fail' } });

    await expect(
      commitWizardAddMode({
        householdId: 'h1',
        newMembers: [
          {
            tempId: 'm1',
            name: 'ハヤト',
            birthDate: null,
            gender: null,
            role: 'child',
            colorHex: '#F39C12',
          },
        ],
        newLessons: [
          {
            tempId: 'l1',
            memberTempId: 'm1',
            name: 'スイミング',
            classroomName: null,
            location: null,
            schedules: [],
          },
        ],
      }),
    ).rejects.toThrow(/add-mode lessons insert failed/);

    expect(deleteMembers).toHaveBeenCalledTimes(1);
    expect(deleteMembers).toHaveBeenCalledWith(['db-m1']);
  });

  it('解決できない memberTempId (既存メンバーへの lesson 追加) を弾く + rollback', async () => {
    insertMembers.mockResolvedValueOnce({ data: { id: 'db-m1' }, error: null });

    await expect(
      commitWizardAddMode({
        householdId: 'h1',
        newMembers: [
          {
            tempId: 'm1',
            name: 'ハヤト',
            birthDate: null,
            gender: null,
            role: 'child',
            colorHex: '#F39C12',
          },
        ],
        newLessons: [
          {
            tempId: 'l1',
            memberTempId: 'existing-member-not-in-wizard',
            name: 'スイミング',
            classroomName: null,
            location: null,
            schedules: [],
          },
        ],
      }),
    ).rejects.toThrow(/memberTempId not resolved/);

    expect(deleteMembers).toHaveBeenCalledWith(['db-m1']);
  });
});
