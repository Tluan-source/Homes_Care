/**
 * Nối trạng thái nghiệp vụ với màu.
 *
 * Bảng tra này là CHỖ DUY NHẤT biết "quá mốc thanh lý thì màu gì". Màn hình chỉ hỏi
 * bảng, không tự chọn màu — nếu không thì thêm một trạng thái mới là phải đi sửa
 * năm chỗ và chắc chắn sót.
 */

import type { MoneyStateKind, UnitStatus } from '@homescare/core';
import type { Colors } from './tokens';

export interface Tone { fg: string; bg: string; label: string }

/** TRỤC 1 — tình trạng nhà. */
export const unitTone = (c: Colors): Record<UnitStatus, Tone> => ({
  empty:   { fg: c.stEmpty,   bg: c.stEmptyBg,   label: 'Trống' },
  partial: { fg: c.stPartial, bg: c.stPartialBg, label: 'Còn chỗ' },
  full:    { fg: c.stFull,    bg: c.stFullBg,    label: 'Đã đầy' },
  maint:   { fg: c.stMaint,   bg: c.stMaintBg,   label: 'Bảo trì' },
});

/** TRỤC 2 — trạng thái tiền. Hai trục ĐỘC LẬP: căn đã đầy vẫn có thể đang nợ. */
export const moneyTone = (c: Colors): Record<MoneyStateKind, Tone> => ({
  none: { fg: c.mNone, bg: c.mNoneBg, label: 'Chưa cho thuê' },
  ok:   { fg: c.mOk,   bg: c.mOkBg,   label: 'Đã đóng đủ' },
  soon: { fg: c.mSoon, bg: c.mSoonBg, label: 'Sắp tới hạn' },
  late: { fg: c.mLate, bg: c.mLateBg, label: 'Chưa đóng' },
  term: { fg: c.mTerm, bg: c.mTermBg, label: 'Quá mốc thanh lý' },
  wait: { fg: c.mSoon, bg: c.mSoonBg, label: 'Xin đóng trễ' },
  ext:  { fg: c.mExt,  bg: c.mExtBg,  label: 'Đã cho khất' },
  bill: { fg: c.mBill, bg: c.mBillBg, label: 'Bill chờ duyệt' },
});
