/**
 * Lịch nhắc — chốt D-3 → D+3 với chủ dự án.
 *
 * Mốc nhắc nằm ở đây, KHÔNG rải trong màn hình hay trong Edge Function.
 */

import type { Day } from '../types.js';
import { addDays, daysBetween } from '../time/day.js';

export interface ReminderMark {
  /** Lệch bao nhiêu ngày so với hạn. Âm là trước hạn. */
  offset: number;
  key: string;
  label: string;
}

export const REMINDER_MARKS: readonly ReminderMark[] = [
  { offset: -3, key: 'D-3', label: 'Nhắc sắp tới hạn' },
  { offset:  0, key: 'D0',  label: 'Gửi yêu cầu thanh toán' },
  { offset:  1, key: 'D+1', label: 'Nhắc lần 1' },
  { offset:  3, key: 'D+3', label: 'Nhắc lần 2' },
];

export interface PlannedReminder extends ReminderMark {
  on: Day;
  /** Mốc này đã tới chưa. */
  due: boolean;
  /** Đã thanh toán thì DỪNG HẲN mọi lời nhắc. */
  stopped: boolean;
}

/**
 * Lịch nhắc của một kỳ.
 *
 * Nhắc tiếp một người đã trả tiền là cách nhanh nhất để họ tắt thông báo của mình,
 * nên `paid` chặn toàn bộ, không chỉ chặn các mốc còn lại.
 */
export function planReminders(due: Day, today: Day, paid = false): PlannedReminder[] {
  const elapsed = daysBetween(today, due);
  return REMINDER_MARKS.map(m => ({
    ...m,
    on: addDays(due, m.offset),
    due: !paid && elapsed >= m.offset,
    stopped: paid,
  }));
}

/** Mốc cần bắn HÔM NAY — đây là thứ Edge Function chạy theo giờ sẽ hỏi. */
export function marksDueToday(due: Day, today: Day, paid = false): ReminderMark[] {
  if (paid) return [];
  const elapsed = daysBetween(today, due);
  return REMINDER_MARKS.filter(m => m.offset === elapsed);
}
