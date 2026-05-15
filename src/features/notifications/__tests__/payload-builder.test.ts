/**
 * L1 unit test: payload-builder.ts (Phase D Sprint 3 D3-T06)。
 *
 * 検証 (ADR-008 §2.3):
 *   - buildItemsLine: 0 件 / 3 件以下 / 4 件以上 (「他 N 点」) / フラグ無効
 *   - buildTitle: day_before / same_day 切替 + 時刻表示 24h pad
 *   - buildBody: 場所 (same_day のみ) + 持ち物統合
 *   - buildNotificationContent: privacy mode 有効時の差し替え + sound 切替 + data 識別子
 */

import {
  buildItemsLine,
  buildTitle,
  buildBody,
  buildNotificationContent,
  type BuildNotificationContentInput,
  type NotificationDataPayload,
} from '../payload-builder';

const IDS: NotificationDataPayload = {
  scheduleId: 'sch-1',
  occurrenceDate: '2026-06-01',
  notificationType: 'day_before',
  memberId: 'mem-1',
  lessonId: 'les-1',
  itemIds: ['it-1', 'it-2'],
};

const BASE: BuildNotificationContentInput = {
  type: 'day_before',
  startAt: new Date(2026, 5, 2, 17, 0, 0),
  memberName: 'すずちゃん',
  lessonName: 'スイミング',
  location: null,
  itemNames: [],
  ids: IDS,
  prefs: {
    include_items_in_notification: true,
    lock_screen_privacy_mode: false,
    sound_enabled: true,
  },
};

describe('buildItemsLine', () => {
  it('空配列で空文字を返す', () => {
    expect(buildItemsLine([], true)).toBe('');
  });

  it('include フラグ false で空文字 (持ち物があっても抑止)', () => {
    expect(buildItemsLine(['水着', 'タオル'], false)).toBe('');
  });

  it('3 件以下は全件 / 連結', () => {
    expect(buildItemsLine(['水着', 'タオル', 'ゴーグル'], true)).toBe(
      '持ち物：水着 / タオル / ゴーグル',
    );
  });

  it('4 件以上は最初の 3 件 + 「他 N 点」', () => {
    expect(buildItemsLine(['A', 'B', 'C', 'D', 'E'], true)).toBe(
      '持ち物：A / B / C / 他2点',
    );
  });

  it('1 件のみは単独表示', () => {
    expect(buildItemsLine(['水着'], true)).toBe('持ち物：水着');
  });
});

describe('buildTitle', () => {
  it('day_before は「明日 HH:MM メンバーの習い事」', () => {
    expect(buildTitle({ ...BASE, type: 'day_before' })).toBe(
      '明日 17:00 すずちゃんのスイミング',
    );
  });

  it('same_day は「まもなく HH:MM メンバーの習い事」', () => {
    expect(buildTitle({ ...BASE, type: 'same_day' })).toBe(
      'まもなく 17:00 すずちゃんのスイミング',
    );
  });

  it('時刻は 2 桁 0 埋め (例: 09:05)', () => {
    expect(
      buildTitle({ ...BASE, startAt: new Date(2026, 5, 2, 9, 5, 0) }),
    ).toBe('明日 09:05 すずちゃんのスイミング');
  });
});

describe('buildBody', () => {
  it('day_before は持ち物のみ (場所表示なし)', () => {
    expect(
      buildBody({
        ...BASE,
        type: 'day_before',
        location: 'ABC スイミングスクール',
        itemNames: ['水着'],
      }),
    ).toBe('持ち物：水着');
  });

  it('same_day で場所あり + 持ち物あり', () => {
    expect(
      buildBody({
        ...BASE,
        type: 'same_day',
        location: 'ABC',
        itemNames: ['水着', 'タオル'],
      }),
    ).toBe('場所：ABC\n持ち物：水着 / タオル');
  });

  it('same_day で場所のみ (持ち物なし)', () => {
    expect(
      buildBody({ ...BASE, type: 'same_day', location: 'ABC', itemNames: [] }),
    ).toBe('場所：ABC');
  });

  it('持ち物統合フラグ false で持ち物セクション抑止', () => {
    expect(
      buildBody({
        ...BASE,
        type: 'same_day',
        location: 'ABC',
        itemNames: ['水着'],
        prefs: { ...BASE.prefs, include_items_in_notification: false },
      }),
    ).toBe('場所：ABC');
  });

  it('場所が空文字 / 空白のみは省略', () => {
    expect(
      buildBody({ ...BASE, type: 'same_day', location: '   ', itemNames: ['水着'] }),
    ).toBe('持ち物：水着');
  });
});

describe('buildNotificationContent', () => {
  it('privacy mode OFF で通常 title/body 出力', () => {
    const c = buildNotificationContent({
      ...BASE,
      itemNames: ['水着'],
    });
    expect(c.title).toBe('明日 17:00 すずちゃんのスイミング');
    expect(c.body).toBe('持ち物：水着');
    expect(c.sound).toBe(true);
    expect(c.data.scheduleId).toBe('sch-1');
    expect(c.data.occurrenceDate).toBe('2026-06-01');
  });

  it('privacy mode ON で title「予定があります」+ body 空、data はそのまま', () => {
    const c = buildNotificationContent({
      ...BASE,
      itemNames: ['水着'],
      prefs: { ...BASE.prefs, lock_screen_privacy_mode: true },
    });
    expect(c.title).toBe('予定があります');
    expect(c.body).toBe('');
    expect(c.data.scheduleId).toBe('sch-1');
  });

  it('sound_enabled = false で sound = false', () => {
    const c = buildNotificationContent({
      ...BASE,
      prefs: { ...BASE.prefs, sound_enabled: false },
    });
    expect(c.sound).toBe(false);
  });

  it('data.itemIds は ids 経由でそのまま透過', () => {
    const c = buildNotificationContent({ ...BASE });
    expect(c.data.itemIds).toEqual(['it-1', 'it-2']);
  });

  it('data.notificationType は ids から透過 (privacy mode 影響なし)', () => {
    const sameDayIds = { ...IDS, notificationType: 'same_day' as const };
    const c = buildNotificationContent({
      ...BASE,
      type: 'same_day',
      ids: sameDayIds,
      prefs: { ...BASE.prefs, lock_screen_privacy_mode: true },
    });
    expect(c.data.notificationType).toBe('same_day');
  });
});
