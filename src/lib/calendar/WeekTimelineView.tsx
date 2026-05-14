import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { colors } from '../../theme/colors';
import { groupByDate, resolveOverlaps, type ResolvedEvent } from './week-utils';
import type { CalendarEvent } from './types';

export interface WeekTimelineViewProps {
  weekStart: Date;
  events: readonly CalendarEvent[];
  onEventPress?: (event: ResolvedEvent) => void;
  onOverflowPress?: (event: ResolvedEvent) => void;
  /** 時刻軸開始 (デフォルト 6:00) */
  rangeStartHour?: number;
  /** 時刻軸終了 (デフォルト 23:00) */
  rangeEndHour?: number;
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const HOUR_HEIGHT = 60;
const MIN_BLOCK_HEIGHT = 24;
const TIME_AXIS_WIDTH = 50;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * CAL-02 週表示 (Timeline) の薄ラッパー。ADR-004 §3.3 / §4.3 準拠。
 *
 * Sprint 3 初版は `react-native-calendars` の Timeline を直接使わず、
 * シンプルな自前 ScrollView + 絶対配置で実装する (ADR-004 R-A1 mitigation):
 * - Timeline week モードの「events 配列を週単位でまとめて渡す」検証は次ステップ
 * - 重なり 3 列 + 「+N 件」は本ラッパーで完全制御 (CAL-02 §3.5)
 * - 移行時はこのファイル内のみ書き換え、CAL-02 画面側は無変更で OK
 */
export function WeekTimelineView({
  weekStart,
  events,
  onEventPress,
  onOverflowPress,
  rangeStartHour = 6,
  rangeEndHour = 23,
}: WeekTimelineViewProps) {
  const days = useMemo(() => {
    const arr: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      arr.push(d);
    }
    return arr;
  }, [weekStart]);

  const today = useMemo(() => formatDate(new Date()), []);

  const eventsByDate = useMemo(() => {
    const grouped = groupByDate(events);
    const resolved: Record<string, ResolvedEvent[]> = {};
    for (const key of Object.keys(grouped)) {
      resolved[key] = resolveOverlaps(grouped[key]!);
    }
    return resolved;
  }, [events]);

  const hours = useMemo(() => {
    const arr: number[] = [];
    for (let h = rangeStartHour; h <= rangeEndHour; h += 1) arr.push(h);
    return arr;
  }, [rangeStartHour, rangeEndHour]);

  return (
    <View className="flex-1" testID="week-timeline">
      <View
        className="flex-row border-b border-border bg-surface"
        testID="week-timeline-header"
      >
        <View style={{ width: TIME_AXIS_WIDTH }} />
        {days.map((d) => {
          const dateKey = formatDate(d);
          const isToday = dateKey === today;
          const dayLabel = DAY_LABELS[d.getDay()];
          return (
            <View
              key={dateKey}
              className="flex-1 items-center py-2"
              style={isToday ? { backgroundColor: colors.primaryLight } : undefined}
              accessibilityLabel={`${dayLabel}曜日、${d.getMonth() + 1}月${d.getDate()}日${
                isToday ? '、今日' : ''
              }`}
            >
              <Text
                className="text-caption"
                style={{ color: isToday ? colors.primaryDark : colors.textSecondary }}
              >
                {dayLabel}
              </Text>
              <Text
                className="text-body"
                style={{ color: isToday ? colors.primaryDark : colors.textPrimary }}
              >
                {d.getDate()}
              </Text>
            </View>
          );
        })}
      </View>

      <ScrollView
        className="flex-1"
        testID="week-timeline-scroll"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <View className="flex-row">
          <View style={{ width: TIME_AXIS_WIDTH }}>
            {hours.map((h) => (
              <View
                key={h}
                style={{ height: HOUR_HEIGHT }}
                className="border-b border-border pr-2"
              >
                <Text className="text-caption text-text-secondary text-right pt-1">
                  {pad(h)}:00
                </Text>
              </View>
            ))}
          </View>

          {days.map((d) => {
            const dateKey = formatDate(d);
            const dayEvents = eventsByDate[dateKey] ?? [];
            return (
              <View
                key={dateKey}
                className="flex-1 border-l border-border"
                style={{ position: 'relative', height: hours.length * HOUR_HEIGHT }}
                testID={`week-timeline-day-${dateKey}`}
              >
                {hours.map((h) => (
                  <View
                    key={h}
                    className="border-b border-border"
                    style={{ height: HOUR_HEIGHT }}
                  />
                ))}
                {dayEvents.map((e) => {
                  const start = new Date(e.startAt);
                  const end = new Date(e.endAt);
                  const startMinutes =
                    (start.getHours() - rangeStartHour) * 60 + start.getMinutes();
                  const endMinutes =
                    (end.getHours() - rangeStartHour) * 60 + end.getMinutes();
                  if (endMinutes <= 0 || startMinutes >= (rangeEndHour - rangeStartHour + 1) * 60) {
                    return null;
                  }
                  const top = Math.max(0, (startMinutes / 60) * HOUR_HEIGHT);
                  const rawHeight = ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT;
                  const height = Math.max(MIN_BLOCK_HEIGHT, rawHeight);
                  const columnWidthPercent = 100 / 3;
                  const leftPercent = e.column * columnWidthPercent;
                  return (
                    <Pressable
                      key={`${e.id}-${e.column}`}
                      onPress={() => {
                        if (e.overflowCount && onOverflowPress) onOverflowPress(e);
                        else if (onEventPress) onEventPress(e);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`${start.getMonth() + 1}月${start.getDate()}日 ${pad(start.getHours())}時 ${e.memberName ?? ''} ${e.title}`}
                      testID={`week-timeline-event-${e.id}`}
                      style={{
                        position: 'absolute',
                        top,
                        height,
                        left: `${leftPercent}%`,
                        width: `${columnWidthPercent - 1}%`,
                        backgroundColor: e.memberColor,
                        borderRadius: 6,
                        padding: 4,
                      }}
                    >
                      <Text
                        className="text-caption"
                        numberOfLines={1}
                        style={{ color: '#FFFFFF' }}
                      >
                        {pad(start.getHours())}:{pad(start.getMinutes())}
                      </Text>
                      <Text
                        className="text-caption"
                        numberOfLines={2}
                        style={{ color: '#FFFFFF' }}
                      >
                        {e.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
