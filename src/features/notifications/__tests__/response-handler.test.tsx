/**
 * L1 unit test: response-handler.ts (Phase D Sprint 3 D3-T06)。
 *
 * 検証 (ADR-008 §2.3 末尾 + §4.4):
 *   - isNotificationDataPayload: 型ガード網羅 (正常 / 欠損 / 型違い)
 *   - navigateToScheduleDetail: router.push の引数検証 + 無効 payload は false
 *   - installNotificationResponseListener: listener install + cleanup の動作
 *   - handleColdStartNotification: getLast 結果が null / response 有りで分岐
 */

import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import {
  handleColdStartNotification,
  installNotificationResponseListener,
  isNotificationDataPayload,
  navigateToScheduleDetail,
} from '../response-handler';

const pushMock = router.push as jest.Mock;
const addListenerMock = Notifications.addNotificationResponseReceivedListener as jest.Mock;
const getLastMock = Notifications.getLastNotificationResponseAsync as jest.Mock;

describe('isNotificationDataPayload', () => {
  const valid = {
    scheduleId: 'sch-1',
    occurrenceDate: '2026-06-01',
    notificationType: 'day_before' as const,
    memberId: 'mem-1',
    lessonId: 'les-1',
    itemIds: [],
  };

  it('valid payload で true', () => {
    expect(isNotificationDataPayload(valid)).toBe(true);
  });

  it('null で false', () => {
    expect(isNotificationDataPayload(null)).toBe(false);
  });

  it('undefined で false', () => {
    expect(isNotificationDataPayload(undefined)).toBe(false);
  });

  it('plain object (空) で false', () => {
    expect(isNotificationDataPayload({})).toBe(false);
  });

  it('scheduleId 欠落で false', () => {
    const { scheduleId: _omit, ...rest } = valid;
    expect(isNotificationDataPayload(rest)).toBe(false);
  });

  it('notificationType 型違いで false', () => {
    expect(
      isNotificationDataPayload({ ...valid, notificationType: 'unknown' }),
    ).toBe(false);
  });

  it('itemIds が配列でないと false', () => {
    expect(isNotificationDataPayload({ ...valid, itemIds: 'not-array' })).toBe(false);
  });

  it('same_day も valid', () => {
    expect(
      isNotificationDataPayload({ ...valid, notificationType: 'same_day' }),
    ).toBe(true);
  });
});

describe('navigateToScheduleDetail', () => {
  beforeEach(() => {
    pushMock.mockClear();
  });

  it('valid payload で router.push 呼出 + true 返却', () => {
    const ok = navigateToScheduleDetail({
      scheduleId: 'sch-1',
      occurrenceDate: '2026-06-01',
      notificationType: 'day_before',
      memberId: 'mem-1',
      lessonId: 'les-1',
      itemIds: ['i1'],
    });
    expect(ok).toBe(true);
    expect(pushMock).toHaveBeenCalledWith({
      pathname: '/schedule/[scheduleId]',
      params: { scheduleId: 'sch-1', occurrenceDate: '2026-06-01' },
    });
  });

  it('invalid payload で push 呼ばず false', () => {
    const ok = navigateToScheduleDetail({ scheduleId: 'sch-1' });
    expect(ok).toBe(false);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('null 受け取りで false', () => {
    expect(navigateToScheduleDetail(null)).toBe(false);
  });
});

describe('installNotificationResponseListener', () => {
  beforeEach(() => {
    addListenerMock.mockClear();
    pushMock.mockClear();
  });

  it('listener を install し unsubscribe を返す', () => {
    const removeMock = jest.fn();
    addListenerMock.mockReturnValue({ remove: removeMock });
    const cleanup = installNotificationResponseListener();
    expect(addListenerMock).toHaveBeenCalledTimes(1);
    cleanup();
    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  it('listener が valid response 受信時に navigate', () => {
    addListenerMock.mockImplementation((cb: (resp: unknown) => void) => {
      cb({
        notification: {
          request: {
            content: {
              data: {
                scheduleId: 'sch-9',
                occurrenceDate: '2026-07-01',
                notificationType: 'same_day',
                memberId: 'mem-1',
                lessonId: 'les-1',
                itemIds: [],
              },
            },
          },
        },
      });
      return { remove: jest.fn() };
    });
    installNotificationResponseListener();
    expect(pushMock).toHaveBeenCalledWith({
      pathname: '/schedule/[scheduleId]',
      params: { scheduleId: 'sch-9', occurrenceDate: '2026-07-01' },
    });
  });
});

describe('handleColdStartNotification', () => {
  beforeEach(() => {
    getLastMock.mockClear();
    pushMock.mockClear();
  });

  it('response が null で false 返却 (push なし)', async () => {
    getLastMock.mockResolvedValue(null);
    const ok = await handleColdStartNotification();
    expect(ok).toBe(false);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('valid response で navigate + true', async () => {
    getLastMock.mockResolvedValue({
      notification: {
        request: {
          content: {
            data: {
              scheduleId: 'sch-9',
              occurrenceDate: '2026-07-01',
              notificationType: 'day_before',
              memberId: 'mem-1',
              lessonId: 'les-1',
              itemIds: [],
            },
          },
        },
      },
    });
    const ok = await handleColdStartNotification();
    expect(ok).toBe(true);
    expect(pushMock).toHaveBeenCalled();
  });

  it('invalid data 含む response は navigate せず false', async () => {
    getLastMock.mockResolvedValue({
      notification: {
        request: { content: { data: { wrong: 'shape' } } },
      },
    });
    const ok = await handleColdStartNotification();
    expect(ok).toBe(false);
    expect(pushMock).not.toHaveBeenCalled();
  });
});
