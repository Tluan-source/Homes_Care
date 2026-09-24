/**
 * Đối soát tiền vào.
 *
 * Hàm này quyết định tiền của ai. Sai một dòng là ghi nhầm tiền của người này sang
 * người khác, nên mọi nhánh đều có test và KHÔNG nhánh nào "đoán gần đúng".
 *
 * Nguyên tắc cứng:
 *  - Khoá đối soát là MÃ THANH TOÁN, không bao giờ là số tiền. 200 căn thì rất nhiều căn
 *    cùng giá; đoán theo số tiền là sớm muộn cũng ghi nhầm.
 *  - LỆCH TIỀN THÌ KHÔNG BAO GIỜ TỰ GHI NHẬN, dù lệch 1.000đ.
 */

import type { VND } from '../types.js';
import { extractPaymentCode } from './code.js';

/** Giao dịch tiền vào, đã chuẩn hoá từ webhook của nhà cung cấp. */
export interface BankTransaction {
  /** Id bên nhà cung cấp (SePay). Khoá CHỐNG GHI TRÙNG — webhook có thể gửi lại nhiều lần. */
  providerTxId: string;
  accountNumber: string;
  amount: VND;
  content: string;
  referenceCode?: string;
  occurredAt: Date;
}

/** Yêu cầu thanh toán đang mở, dạng tối giản mà hàm đối soát cần. */
export interface OpenRequest {
  id: string;
  code: string;
  contractId: string;
  accountNumber: string;
  amount: VND;
  due: Date;
}

export type MatchKind =
  | 'PAID'          // đúng mã, đúng tài khoản, đúng tiền
  | 'DUPLICATE'     // webhook gửi lại
  | 'PARTIAL'       // đúng mã, thiếu tiền
  | 'OVERPAID'      // đúng mã, thừa tiền
  | 'UNMATCHED'     // không tìm được mã, hoặc sai tài khoản nhận
  | 'MULTI_PERIOD'; // một lần trả trọn nhiều kỳ

export interface Allocation {
  requestId: string;
  amount: VND;
}

export interface MatchResult {
  kind: MatchKind;
  /** Mã đọc được từ nội dung chuyển khoản, nếu có. */
  code?: string;
  request?: OpenRequest;
  /** Đề xuất phân bổ. Chỉ được ghi sổ khi `auto` = true, còn lại là gợi ý chờ duyệt. */
  allocations: Allocation[];
  shortBy?: VND;
  overBy?: VND;
  /** Vì sao không khớp — hiện thẳng lên thẻ ngoại lệ. */
  reason?: string;
}

/** Chỉ hai kết quả được ghi sổ mà không hỏi ai. */
export const AUTO_KINDS: ReadonlySet<MatchKind> = new Set<MatchKind>(['PAID', 'DUPLICATE']);
export const isAutoKind = (k: MatchKind): boolean => AUTO_KINDS.has(k);

export interface ReconcileOptions {
  /** Các providerTxId đã ghi nhận. SePay retry tới 7 lần trong 5 giờ. */
  seenTxIds?: ReadonlySet<string>;
}

export function reconcile(
  tx: BankTransaction,
  openRequests: readonly OpenRequest[],
  opts: ReconcileOptions = {},
): MatchResult {
  if (opts.seenTxIds?.has(tx.providerTxId)) {
    return { kind: 'DUPLICATE', allocations: [], reason: 'đã ghi nhận trước đó' };
  }

  const code = extractPaymentCode(tx.content) ?? undefined;
  const request = code ? openRequests.find(r => r.code === code) : undefined;

  if (!request) {
    return {
      kind: 'UNMATCHED', code, allocations: [],
      reason: code
        ? 'mã không khớp yêu cầu nào đang mở'
        : 'không tìm được mã thanh toán trong nội dung chuyển khoản',
    };
  }

  // Đúng mã nhưng sai tài khoản nhận: rất có thể khách quét lại QR cũ của chủ nhà khác
  // trong cùng hệ thống. Tiền vào nhầm túi thì không thể tự ghi nhận.
  if (request.accountNumber !== tx.accountNumber) {
    return {
      kind: 'UNMATCHED', code, request, allocations: [],
      reason: `mã ${code} đúng nhưng tiền vào nhầm tài khoản chủ nhà khác`,
    };
  }

  if (tx.amount === request.amount) {
    return { kind: 'PAID', code, request, allocations: [{ requestId: request.id, amount: tx.amount }] };
  }

  if (tx.amount < request.amount) {
    return {
      kind: 'PARTIAL', code, request,
      shortBy: request.amount - tx.amount,
      allocations: [{ requestId: request.id, amount: tx.amount }],
    };
  }

  // Thừa tiền: thử phủ tiếp các kỳ đang mở khác CỦA CÙNG HỢP ĐỒNG, theo thứ tự tới hạn.
  // Khớp trọn vẹn mới gọi là trả gộp — thừa lẻ thì vẫn là thừa.
  const siblings = openRequests
    .filter(r => r.id !== request.id && r.contractId === request.contractId)
    .sort((a, b) => a.due.getTime() - b.due.getTime());

  const allocations: Allocation[] = [{ requestId: request.id, amount: request.amount }];
  let left = tx.amount - request.amount;
  for (const r of siblings) {
    if (left < r.amount) break;
    allocations.push({ requestId: r.id, amount: r.amount });
    left -= r.amount;
  }

  if (left === 0 && allocations.length > 1) {
    return { kind: 'MULTI_PERIOD', code, request, allocations };
  }

  return {
    kind: 'OVERPAID', code, request,
    overBy: tx.amount - request.amount,
    allocations: [{ requestId: request.id, amount: request.amount }],
  };
}
