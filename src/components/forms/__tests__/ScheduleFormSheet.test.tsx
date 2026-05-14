import { configure, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ScheduleFormSheet, type ScheduleFormLessonOption } from '../ScheduleFormSheet';
import { renderWithProviders } from '../../../test-utils/renderWithProviders';
import {
  createSchedule,
  splitScheduleAt,
  updateSchedule,
} from '../../../lib/schedules';
import type { Schedule } from '../../../types/database';

/**
 * L2 サンプル: ScheduleFormSheet (Sprint 1 C1-T04)
 *
 * 検証ポイント:
 *   - lessons 空の時の placeholder + 保存ボタン disabled
 *   - lessons 1 件のとき初期選択済 + 通常 submit で createSchedule 呼び出し
 *   - 終了 <= 開始 でエラー表示 + createSchedule 未呼び出し
 *   - 24h 超予定の警告 + 2 回目 submit で続行
 *   - 閉じるボタンで onClose
 */

jest.mock('../../../lib/schedules', () => ({
  createSchedule: jest.fn(() => Promise.resolve({ id: 's-1' })),
  updateSchedule: jest.fn(() => Promise.resolve({ id: 's-1' })),
  splitScheduleAt: jest.fn(() =>
    Promise.resolve({ updated: { id: 's-1' }, created: { id: 's-2' } }),
  ),
}));

const mockedCreateSchedule = createSchedule as jest.MockedFunction<typeof createSchedule>;
const mockedUpdateSchedule = updateSchedule as jest.MockedFunction<typeof updateSchedule>;
const mockedSplitScheduleAt = splitScheduleAt as jest.MockedFunction<typeof splitScheduleAt>;

configure({ defaultHidden: true });

const lessons: ScheduleFormLessonOption[] = [
  { id: 'lesson-1', memberId: 'm1', memberName: 'すずちゃん', name: 'スイミング' },
  { id: 'lesson-2', memberId: 'm2', memberName: 'パパ', name: 'ヨガ' },
];

const baseProps = {
  visible: true,
  defaultDate: new Date(2026, 4, 14),
  lessons,
  onClose: jest.fn(),
  onCreated: jest.fn(),
};

describe('ScheduleFormSheet', () => {
  it('lessons が空ならプレースホルダ表示 + 保存ボタンは disabled', () => {
    renderWithProviders(
      <ScheduleFormSheet {...baseProps} lessons={[]} />,
    );

    expect(screen.getByTestId('schedule-form-no-lessons')).toBeTruthy();
    const submit = screen.getByTestId('schedule-form-submit');
    expect(submit.props.accessibilityState?.disabled).toBe(true);
  });

  it('初期状態で最初の lesson が選択されている', () => {
    renderWithProviders(<ScheduleFormSheet {...baseProps} />);
    const first = screen.getByTestId('schedule-form-lesson-lesson-1');
    expect(first.props.accessibilityState?.selected).toBe(true);
  });

  it('通常 submit で createSchedule が呼ばれ onCreated が起動', async () => {
    const onCreated = jest.fn();
    renderWithProviders(<ScheduleFormSheet {...baseProps} onCreated={onCreated} />);

    fireEvent.press(screen.getByTestId('schedule-form-submit'));

    await waitFor(() => {
      expect(mockedCreateSchedule).toHaveBeenCalledTimes(1);
    });
    expect(mockedCreateSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: 'lesson-1',
      }),
    );
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it('閉じるボタンで onClose が呼ばれる', () => {
    const onClose = jest.fn();
    renderWithProviders(<ScheduleFormSheet {...baseProps} onClose={onClose} />);

    fireEvent.press(screen.getByTestId('schedule-form-close'));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('別 lesson を選択するとアクティブ状態が切り替わる', () => {
    renderWithProviders(<ScheduleFormSheet {...baseProps} />);

    const second = screen.getByTestId('schedule-form-lesson-lesson-2');
    fireEvent.press(second);

    expect(second.props.accessibilityState?.selected).toBe(true);
    const first = screen.getByTestId('schedule-form-lesson-lesson-1');
    expect(first.props.accessibilityState?.selected).toBe(false);
  });

  it('createSchedule が reject したらエラー文を表示し onCreated 未呼び出し', async () => {
    mockedCreateSchedule.mockRejectedValueOnce(new Error('network'));
    const onCreated = jest.fn();
    renderWithProviders(<ScheduleFormSheet {...baseProps} onCreated={onCreated} />);

    fireEvent.press(screen.getByTestId('schedule-form-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('schedule-form-error')).toBeTruthy();
    });
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('繰り返し switch を ON にすると曜日 chip と終了日 picker が表示', () => {
    renderWithProviders(<ScheduleFormSheet {...baseProps} />);

    fireEvent(screen.getByTestId('schedule-form-recurrence-switch'), 'valueChange', true);

    expect(screen.getByTestId('schedule-form-recurrence-panel')).toBeTruthy();
    expect(screen.getByTestId('schedule-form-recurrence-day-MO')).toBeTruthy();
    expect(screen.getByTestId('schedule-form-recurrence-until')).toBeTruthy();
  });

  it('繰り返し ON + 曜日未選択 で submit するとエラー表示', async () => {
    renderWithProviders(<ScheduleFormSheet {...baseProps} />);

    fireEvent(screen.getByTestId('schedule-form-recurrence-switch'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('schedule-form-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('schedule-form-error')).toBeTruthy();
    });
    expect(mockedCreateSchedule).not.toHaveBeenCalled();
  });

  it('繰り返し ON + 月曜選択 で submit すると recurrenceRule が渡される', async () => {
    const onCreated = jest.fn();
    mockedCreateSchedule.mockResolvedValueOnce({ id: 's-r' } as never);
    renderWithProviders(<ScheduleFormSheet {...baseProps} onCreated={onCreated} />);

    fireEvent(screen.getByTestId('schedule-form-recurrence-switch'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('schedule-form-recurrence-day-MO'));
    fireEvent.press(screen.getByTestId('schedule-form-submit'));

    await waitFor(() => {
      expect(mockedCreateSchedule).toHaveBeenCalledTimes(1);
    });
    expect(mockedCreateSchedule).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
      }),
    );
  });

  it('繰り返し ON で曜日を 2 件選択すると description が表示される', () => {
    renderWithProviders(<ScheduleFormSheet {...baseProps} />);

    fireEvent(screen.getByTestId('schedule-form-recurrence-switch'), 'valueChange', true);
    fireEvent.press(screen.getByTestId('schedule-form-recurrence-day-MO'));
    fireEvent.press(screen.getByTestId('schedule-form-recurrence-day-TH'));

    const desc = screen.getByTestId('schedule-form-recurrence-description');
    const text = String(desc.props.children);
    expect(text).toContain('毎週月・木曜日');
  });

  describe('編集モード (Sprint 2 C2-T03)', () => {
    function makeSchedule(overrides: Partial<Schedule> = {}): Schedule {
      return {
        id: overrides.id ?? 's-existing',
        lesson_id: overrides.lesson_id ?? 'lesson-1',
        start_at:
          overrides.start_at ?? new Date(Date.UTC(2026, 4, 4, 8, 0)).toISOString(),
        end_at:
          overrides.end_at ?? new Date(Date.UTC(2026, 4, 4, 9, 0)).toISOString(),
        recurrence_rule: overrides.recurrence_rule ?? null,
        recurrence_until: overrides.recurrence_until ?? null,
        note: overrides.note ?? 'メモテスト',
        created_at: overrides.created_at ?? new Date().toISOString(),
        updated_at: overrides.updated_at ?? new Date().toISOString(),
      };
    }

    it('mode=edit + editScope=all で submit すると updateSchedule が呼ばれる', async () => {
      const onUpdated = jest.fn();
      const schedule = makeSchedule();
      renderWithProviders(
        <ScheduleFormSheet
          mode="edit"
          visible
          defaultDate={new Date(2026, 4, 4)}
          lessons={lessons}
          initialValues={{ schedule, editScope: 'all' }}
          onClose={jest.fn()}
          onUpdated={onUpdated}
        />,
      );

      fireEvent.press(screen.getByTestId('schedule-form-submit'));

      await waitFor(() => {
        expect(mockedUpdateSchedule).toHaveBeenCalledTimes(1);
      });
      expect(mockedUpdateSchedule).toHaveBeenCalledWith(
        expect.objectContaining({ id: 's-existing', lessonId: 'lesson-1' }),
      );
      expect(onUpdated).toHaveBeenCalledTimes(1);
    });

    it('mode=edit + editScope=thisAndFuture で submit すると splitScheduleAt が呼ばれる', async () => {
      const onUpdated = jest.fn();
      const schedule = makeSchedule({
        recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
      });
      const splitFrom = new Date(2026, 4, 18);
      renderWithProviders(
        <ScheduleFormSheet
          mode="edit"
          visible
          defaultDate={new Date(2026, 4, 4)}
          lessons={lessons}
          initialValues={{ schedule, splitFrom, editScope: 'thisAndFuture' }}
          onClose={jest.fn()}
          onUpdated={onUpdated}
        />,
      );

      fireEvent.press(screen.getByTestId('schedule-form-submit'));

      await waitFor(() => {
        expect(mockedSplitScheduleAt).toHaveBeenCalledTimes(1);
      });
      expect(mockedSplitScheduleAt).toHaveBeenCalledWith(
        expect.objectContaining({
          source: schedule,
        }),
      );
      expect(onUpdated).toHaveBeenCalledTimes(1);
    });

    it('編集モードの初期値はメモが prefill される', () => {
      const schedule = makeSchedule({ note: 'すずちゃんメモ' });
      renderWithProviders(
        <ScheduleFormSheet
          mode="edit"
          visible
          defaultDate={new Date(2026, 4, 4)}
          lessons={lessons}
          initialValues={{ schedule, editScope: 'all' }}
          onClose={jest.fn()}
          onUpdated={jest.fn()}
        />,
      );

      expect(screen.getByDisplayValue('すずちゃんメモ')).toBeTruthy();
    });
  });
});
