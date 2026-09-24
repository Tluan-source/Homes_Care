/**
 * Sinh kỳ thu tiền của một hợp đồng.
 *
 * Sinh SẴN HẾT từ ngày vào tới ngày hết hạn, không sinh dần từng kỳ. Hai lý do:
 * chủ nhà xem trước được dòng tiền cả năm, và server chết vài ngày cũng không mất kỳ nào.
 *
 * MỘT NGUỒN SỰ THẬT: hàm này KHÔNG tự đoán kỳ nào đã đóng. Nó HỎI `paidAmountOf`.
 * Bản prototype từng có hai bộ máy tiền song song (một suy từ "hợp đồng chậm mấy chu kỳ",
 * một đọc bảng thanh toán) và kết quả là xử lý xong một giao dịch mà danh sách căn hộ
 * vẫn báo nợ. Đừng dựng lại kiểu đó.
 */

import type { Contract, Invoice, VND } from '../types.js';
import { addMonthsAnchored, daysInMonth, prorateFirstMonth, toISODate } from '../time/day.js';

/** Khoá nối giữa lịch thu (tính ra) và sổ thanh toán (tiền thật đã vào). */
export const invoiceKey = (contractId: string, type: string, due: Date): string =>
  `${contractId}|${type}|${toISODate(due)}`;

/** Tra số tiền đã nhận cho một kỳ. Trả 0 nếu chưa nhận đồng nào. */
export type PaidAmountOf = (key: string) => VND;

const NOTHING_PAID: PaidAmountOf = () => 0;

/**
 * @param today  cần để đánh dấu kỳ nào đã quá hạn. Truyền vào, không tự đọc đồng hồ.
 */
export function buildSchedule(
  contract: Contract,
  today: Date,
  paidAmountOf: PaidAmountOf = NOTHING_PAID,
): Invoice[] {
  const { moveIn, endsOn } = contract;
  const anchor = moveIn.getDate();
  const out: Omit<Invoice, 'paidAmount' | 'owed' | 'paid' | 'late'>[] = [];

  // --- tiền nhà: neo theo NGÀY CHUYỂN VÀO, mỗi cycleMonths tháng một kỳ
  for (let i = 0; ; i++) {
    const due = addMonthsAnchored(moveIn, anchor, i * contract.cycleMonths);
    if (due >= endsOn) break;
    out.push({
      key: invoiceKey(contract.id, 'RENT', due),
      contractId: contract.id,
      type: 'RENT',
      due,
      periodFrom: due,
      periodTo: addMonthsAnchored(moveIn, anchor, (i + 1) * contract.cycleMonths),
      amount: contract.rent * contract.cycleMonths,
    });
  }

  // --- tiền dịch vụ: theo THÁNG DƯƠNG LỊCH, tới hạn ngày 1.
  // Hai lịch khác nhau là cố ý, không phải quên đồng bộ: tiền nhà neo theo ngày vào ở,
  // còn dịch vụ (điện chung, thang máy, vệ sinh) tính theo tháng của toà nhà.
  const first = prorateFirstMonth(moveIn, contract.serviceFee);
  out.push({
    key: invoiceKey(contract.id, 'SERVICE', moveIn),
    contractId: contract.id,
    type: 'SERVICE',
    due: moveIn,
    periodFrom: moveIn,
    periodTo: new Date(moveIn.getFullYear(), moveIn.getMonth(), daysInMonth(moveIn)),
    amount: first.amount,
    proration: { days: first.days, ofDays: first.ofDays },
  });
  for (let k = 1; ; k++) {
    const due = new Date(moveIn.getFullYear(), moveIn.getMonth() + k, 1);
    if (due >= endsOn) break;
    out.push({
      key: invoiceKey(contract.id, 'SERVICE', due),
      contractId: contract.id,
      type: 'SERVICE',
      due,
      periodFrom: due,
      periodTo: new Date(due.getFullYear(), due.getMonth(), daysInMonth(due)),
      amount: contract.serviceFee,
    });
  }

  out.sort((a, b) => a.due.getTime() - b.due.getTime());

  return out.map((iv): Invoice => {
    const paidAmount = Math.min(paidAmountOf(iv.key) || 0, iv.amount);
    const paid = paidAmount >= iv.amount;
    return {
      ...iv,
      paidAmount,
      // Đóng thiếu thì kỳ VẪN MỞ và vẫn tính là trễ — chỉ trừ đi phần đã nhận.
      owed: iv.amount - paidAmount,
      paid,
      late: !paid && iv.due < today,
    };
  });
}
