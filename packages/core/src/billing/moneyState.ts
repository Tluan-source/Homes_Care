/**
 * Trạng thái tiền của một CĂN — thứ quyết định màu nhãn trên danh sách.
 *
 * Một căn có thể có nhiều hợp đồng cùng lúc (ở ghép), nên trạng thái tiền của căn là
 * tổng hợp của mọi hợp đồng đang chạy trong đó.
 */

import type { Contract, Invoice, MoneyState, MoneyStateKind, VND } from '../types.js';
import { daysBetween, formatDayMonth } from '../time/day.js';
import { isTerminable, lateFee } from '../penalty/late.js';
import { LATE_POLICY } from '../penalty/policy.js';
import { PENALIZED_INVOICE_TYPES } from '../penalty/policy.js';

/** Cửa sổ nhắc trước. Chốt D-3 với chủ dự án; mốc đòi nợ sau hạn ở `reminders.ts`. */
export const SOON_WINDOW_DAYS = 3;

export interface MoneyStateInput {
  contracts: readonly Contract[];
  /** Lịch thu đã tính sẵn của từng hợp đồng. Truyền vào để hàm này không phải biết
   *  sổ thanh toán nằm ở đâu. */
  scheduleOf: (c: Contract) => readonly Invoice[];
  today: Date;
  /** Có bill khách gửi tay đang chờ duyệt không (đường ngoại lệ, xem ARCHITECTURE §1.2). */
  hasPendingBill?: boolean;
  /** Căn đang bảo trì — chỉ dùng cho câu mô tả khi chưa cho thuê. */
  underMaintenance?: boolean;
}

const penalized = (t: string) => (PENALIZED_INVOICE_TYPES as readonly string[]).includes(t);

export function computeMoneyState(input: MoneyStateInput): MoneyState {
  const { contracts, scheduleOf, today } = input;

  if (contracts.length === 0) {
    return {
      kind: 'none', owed: 0, penalty: 0,
      detail: input.underMaintenance ? 'đang bảo trì' : 'sẵn sàng cho thuê',
    };
  }

  let owed: VND = 0;
  let penalty: VND = 0;
  let oldestLate: Date | undefined;
  let rentIsLate = false;
  let terminable = false;
  let nextDue: Date | undefined;
  let upcomingAmount: VND = 0;
  let extension = contracts.map(c => c.extension).find(Boolean);

  for (const c of contracts) {
    const invoices = scheduleOf(c);

    for (const iv of invoices) {
      if (iv.late) {
        // Nợ là phần CÒN THIẾU, không phải cả kỳ: chuyển thiếu 500k thì nợ 500k,
        // không phải nợ lại nguyên kỳ 102 triệu.
        owed += iv.owed;
        if (!oldestLate || iv.due < oldestLate) oldestLate = iv.due;

        // Phạt và mốc thanh lý CHỈ áp cho tiền nhà — lý do ở penalty/policy.ts
        if (penalized(iv.type)) {
          rentIsLate = true;
          penalty += lateFee(iv.due, today, c.extension);
          if (isTerminable(iv.due, today, c.extension)) terminable = true;
        }
      }

      // Gom MỌI kỳ tới hạn trong cửa sổ nhắc, không chỉ kỳ gần nhất: tiền nhà và
      // tiền dịch vụ chạy hai lịch riêng nên hai kỳ khác loại có thể cùng rơi một tuần.
      if (!iv.paid && iv.due >= today && daysBetween(iv.due, today) <= SOON_WINDOW_DAYS) {
        upcomingAmount += iv.owed;
        if (!nextDue || iv.due < nextDue) nextDue = iv.due;
      }
    }
  }

  const lateDayCount = oldestLate ? daysBetween(today, oldestLate) : 0;

  // Thứ tự ưu tiên, từ việc khẩn cấp nhất xuống.
  // `term` đứng TRÊN `wait`: khách trễ 20 ngày rồi mới xin khất thì sự thật cần nhìn là
  // căn đã chạm mốc thanh lý, không phải là "có đơn xin".
  let kind: MoneyStateKind;
  let detail: string;

  if (input.hasPendingBill) {
    kind = 'bill'; detail = 'chờ bạn duyệt';
  } else if (terminable) {
    kind = 'term';
    detail = `trễ ${lateDayCount} ngày — quá mốc thanh lý ${LATE_POLICY.terminateAfterDays} ngày`;
  } else if (extension?.status === 'PENDING') {
    kind = 'wait'; detail = `xin tới ${formatDayMonth(extension.newDue)}`;
  } else if (extension?.status === 'APPROVED') {
    kind = 'ext'; detail = `khất tới ${formatDayMonth(extension.newDue)}`;
  } else if (oldestLate) {
    kind = 'late';
    // Nói rõ trễ CÁI GÌ. "Trễ 46 ngày" trên căn 18tr/tháng làm người đọc tưởng mất nửa
    // trăm triệu, trong khi thực tế là hai kỳ phí dịch vụ 700k bị quên.
    detail = `trễ ${lateDayCount} ngày` + (rentIsLate ? '' : ' · chỉ tiền dịch vụ');
  } else if (nextDue) {
    kind = 'soon'; detail = describeUpcoming(nextDue, today);
  } else {
    kind = 'ok'; detail = 'đã thu đủ';
  }

  return {
    kind, owed, penalty, detail,
    since: oldestLate,
    nextDue: kind === 'soon' ? nextDue : undefined,
    upcomingAmount: kind === 'soon' ? upcomingAmount : undefined,
    extension,
  };
}

/** "Còn 3 ngày" đọc ra việc phải làm; "tới hạn 19/09" thì người xem còn phải tự trừ ngày. */
export function describeUpcoming(due: Date, today: Date): string {
  const n = daysBetween(due, today);
  if (n <= 0) return 'tới hạn hôm nay';
  if (n === 1) return 'tới hạn ngày mai';
  return `còn ${n} ngày · ${formatDayMonth(due)}`;
}

/** Hai nhóm việc KHÁC NHAU, cố ý không gộp: đỏ = phải xử lý hôm nay, cam = chỉ nhắc trước.
 *  Gộp chung thì con số đỏ phình lên vì toàn căn chưa nợ gì, và người quản lý sẽ nhanh
 *  chóng học được cách phớt lờ nó. */
export const URGENT_KINDS: readonly MoneyStateKind[] = ['late', 'term', 'wait', 'bill'];
export const isUrgent = (k: MoneyStateKind): boolean => URGENT_KINDS.includes(k);
