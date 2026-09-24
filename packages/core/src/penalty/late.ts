/**
 * Phạt trễ hạn, gia hạn và mốc thanh lý.
 *
 * Mọi hằng số nằm ở `policy.ts`. File này chỉ chứa phép tính, để đổi chính sách
 * không phải đọc lại logic.
 */

import type { Day, Extension, VND } from '../types.js';
import { daysBetween } from '../time/day.js';
import { LATE_POLICY, type LatePolicy } from './policy.js';

/**
 * Hạn THỰC TẾ của một kỳ: hạn gốc, hoặc hạn mới nếu đơn xin khất đã được DUYỆT.
 *
 * Xin mà chưa duyệt thì không dời được hạn — nếu không thì ai cũng bấm xin một cái là
 * thoát phạt, và nút duyệt của chủ nhà thành vô nghĩa.
 */
export function effectiveDue(due: Day, ext?: Extension): Day {
  if (ext?.status === 'APPROVED' && ext.newDue > due) return ext.newDue;
  return due;
}

/** Số ngày trễ, tính trên hạn thực tế. 0 nghĩa là chưa trễ. */
export function lateDays(due: Day, today: Day, ext?: Extension): number {
  return Math.max(0, daysBetween(today, effectiveDue(due, ext)));
}

/** Số ngày thực sự bị tính phạt, sau khi trừ ân hạn. */
export function billableLateDays(due: Day, today: Day, ext?: Extension, p: LatePolicy = LATE_POLICY): number {
  return Math.max(0, lateDays(due, today, ext) - p.graceDays);
}

/**
 * Tiền phạt của MỘT kỳ.
 *
 * Được duyệt khất và còn trong thời hạn khất → 0đ. Hết hạn khất mà vẫn chưa đóng thì
 * đồng hồ chạy lại từ hạn MỚI, không phải từ hạn gốc.
 */
export function lateFee(due: Day, today: Day, ext?: Extension, p: LatePolicy = LATE_POLICY): VND {
  return Math.min(billableLateDays(due, today, ext, p) * p.feePerDay, p.feeCapPerPeriod);
}

/** Đã chạm mốc thanh lý chưa. Mốc này cũng dời theo khất đã duyệt. */
export function isTerminable(due: Day, today: Day, ext?: Extension, p: LatePolicy = LATE_POLICY): boolean {
  return lateDays(due, today, ext) >= p.terminateAfterDays;
}

/** Ai được quyền duyệt lần xin khất này. */
export function extensionApprover(due: Day, newDue: Day, p: LatePolicy = LATE_POLICY): 'MANAGER' | 'OWNER' {
  return daysBetween(newDue, due) <= p.managerApproveMaxDays ? 'MANAGER' : 'OWNER';
}

/**
 * Diễn giải phép tính phạt thành chữ, để in lên phiếu.
 *
 * Người nhận phiếu phải KIỂM LẠI ĐƯỢC con số, không phải tin suông. Đây là khác biệt
 * giữa "phạt 800.000đ" và "trễ 10 ngày · 8 ngày tính phạt × 100.000đ".
 */
export function lateFeeNote(due: Day, today: Day, ext?: Extension, p: LatePolicy = LATE_POLICY): string {
  const n = lateDays(due, today, ext);
  if (n === 0) return 'chưa trễ';
  const billable = billableLateDays(due, today, ext, p);
  if (billable === 0) return `trễ ${n} ngày — còn trong ${p.graceDays} ngày ân hạn`;
  const raw = billable * p.feePerDay;
  const perDay = (p.feePerDay / 1000).toLocaleString('vi-VN') + '.000đ';
  return raw > p.feeCapPerPeriod
    ? `trễ ${n} ngày · ${billable} ngày tính phạt — đã chạm trần`
    : `trễ ${n} ngày · ${billable} ngày tính phạt × ${perDay}`;
}
