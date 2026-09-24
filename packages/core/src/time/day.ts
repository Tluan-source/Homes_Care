/**
 * Ngày tháng — thuần, không đọc đồng hồ hệ thống.
 *
 * Mọi hàm cần "hôm nay" đều nhận nó làm tham số. Server chạy UTC, điện thoại chạy giờ
 * Việt Nam; hàm tự gọi new Date() thì cùng một dữ liệu ra hai kết quả ở hai nơi, và test
 * thì không cố định được (xem ARCHITECTURE §3.3).
 */

import type { Day } from '../types.js';

const MS_PER_DAY = 86_400_000;

/** Ghép một ngày ở 00:00 giờ địa phương. */
export const day = (y: number, m1: number, d: number): Day => new Date(y, m1 - 1, d);

/** Đọc chuỗi ISO 'YYYY-MM-DD' thành ngày địa phương.
 *  Cố ý KHÔNG dùng new Date(str): chuỗi chỉ có ngày sẽ bị hiểu là UTC rồi lệch múi giờ,
 *  và ở Việt Nam (UTC+7) thì lệch đúng một ngày về phía trước. */
export function parseDay(s: string): Day {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Cắt phần giờ phút, giữ lại đúng ngày. */
export const startOfDay = (d: Date): Day => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export const toISODate = (d: Day): string =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** 16/09/2026 */
export const formatDay = (d: Day): string =>
  `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

/** 16/09 */
export const formatDayMonth = (d: Day): string =>
  `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;

/** Số ngày từ `b` tới `a`. Dương nghĩa là `a` sau `b`. */
export const daysBetween = (a: Day, b: Day): number =>
  Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / MS_PER_DAY);

/** Số ngày trong tháng chứa `d`. */
export const daysInMonth = (d: Day): number =>
  new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

export const addDays = (d: Day, n: number): Day =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/**
 * Cộng tháng NEO theo một ngày mốc — quy tắc quan trọng nhất của lịch thu tiền.
 *
 * Khách vào ngày 31 thì tháng 2 đóng ngày 28, nhưng tháng 3 phải quay lại ngày 31,
 * không phải trôi luôn xuống 28 mãi mãi. Cộng ngày ngây thơ sẽ làm ngày đóng tiền
 * trượt dần mỗi năm mất mấy ngày, và khách sẽ là người phát hiện ra trước.
 */
export function addMonthsAnchored(base: Day, anchorDay: number, months: number): Day {
  const t = new Date(base.getFullYear(), base.getMonth() + months, 1);
  return new Date(t.getFullYear(), t.getMonth(), Math.min(anchorDay, daysInMonth(t)));
}

/**
 * Chia tiền dịch vụ tháng đầu theo số ngày ở — TÍNH CẢ NGÀY VÀO.
 *
 * Vào ngày 16 tháng có 30 ngày thì ở 15 ngày (16→30), không phải 14. Khách đếm bằng
 * cách nhìn lịch chứ không trừ ngày, nên tính thiếu một ngày là có khiếu nại.
 * Làm tròn xuống tới nghìn để không sinh ra số lẻ không chuyển khoản được.
 */
export function prorateFirstMonth(moveIn: Day, monthlyFee: number) {
  const ofDays = daysInMonth(moveIn);
  const days = ofDays - moveIn.getDate() + 1;
  return {
    amount: Math.floor((monthlyFee * days) / ofDays / 1000) * 1000,
    days,
    ofDays,
  };
}
