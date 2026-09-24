/**
 * MỌI CON SỐ CÓ Ý NGHĨA NGHIỆP VỤ VỀ TRỄ HẠN NẰM Ở ĐÂY — và chỉ ở đây.
 *
 * Muốn đổi mức phạt, ân hạn, trần, mốc thanh lý thì sửa đúng file này, không phải đi
 * tìm số 100000 rải rác trong code. Mỗi giá trị ghi kèm điều khoản hợp đồng tương ứng
 * để lúc tranh chấp còn tra ngược được.
 *
 * Chốt với chủ dự án ngày 19/09/2026. Hợp đồng gốc tự mâu thuẫn ở ba chỗ (Điều 6 vs 10.4
 * về mức phạt, Điều 4.4/8.9 vs 10.5 về hoàn cọc, Điều 10.3 vs 10.4 về hệ quả khi trễ) —
 * bảng dưới là bản chốt, và HỢP ĐỒNG PHẢI SỬA LẠI CHO KHỚP.
 */

export interface LatePolicy {
  /** Phạt mỗi ngày trễ. HĐ Điều 10.4 "phí phạt 100k/ngày". */
  feePerDay: number;
  /** Số ngày đầu không phạt. Hiểu cụm "muộn TỐI ĐA 02 ngày" ở Điều 6 là ân hạn.
   *  Có ân hạn để khách chuyển khoản chiều thứ 6 mà ngân hàng báo sáng thứ 7
   *  không thành chuyện phải cãi nhau. */
  graceDays: number;
  /** Trần phạt MỖI KỲ. Không phải mỗi hợp đồng — hai kỳ nợ thì trần là 2 triệu. */
  feeCapPerPeriod: number;
  /** Trễ TIỀN NHÀ tới ngày này thì chuyển quy trình thanh lý. HĐ Điều 10.3. */
  terminateAfterDays: number;
  /** Hoàn cọc sau khi bàn giao. HĐ Điều 10.5.
   *  Điều 4.4 và 8.9 đang ghi 15 ngày — PHẢI SỬA XUỐNG 10 cho khớp. */
  depositReturnDays: number;
  /** Quản lý tự duyệt xin khất trong ngưỡng này; quá thì phải chủ nhà.
   *  Duyệt khất = miễn phạt, nên đây là quyền đụng vào tiền. */
  managerApproveMaxDays: number;
}

export const LATE_POLICY: LatePolicy = {
  feePerDay: 100_000,
  graceDays: 2,
  feeCapPerPeriod: 1_000_000,
  terminateAfterDays: 15,
  depositReturnDays: 10,
  managerApproveMaxDays: 7,
};

/**
 * Phạt và mốc thanh lý CHỈ áp cho loại kỳ này.
 *
 * Hợp đồng nói rõ "tiền nhà" ở cả Điều 10.3 và 10.4; phí dịch vụ có Điều 8.5 riêng.
 * Nếu áp chung, một kỳ dịch vụ 700k chưa đóng sẽ đẩy căn 18tr/tháng vào diện thanh lý —
 * và trạng thái thanh lý mất sạch sức nặng. Chạy thử trên 200 căn giả: áp chung thì 23 căn
 * vào diện thanh lý, tách ra thì còn 2.
 */
export const PENALIZED_INVOICE_TYPES = ['RENT'] as const;
