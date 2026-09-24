/**
 * Giá thuê.
 *
 * GIÁ GỐC NẰM Ở TỪNG PHÒNG NGỦ, giá cả căn là tổng. Ngược lại (giá ở căn rồi chia ra
 * phòng) thì không cho thuê lẻ từng phòng được, mà đó lại là nửa số hợp đồng thực tế.
 */

import type { Room, Unit, VND } from '../types.js';

/**
 * Giá MỘT CHỖ khi ở ghép = giá phòng ÷ SỨC CHỨA phòng.
 *
 * Chia cho sức chứa, KHÔNG chia cho số chỗ còn trống. Nếu chia cho số chỗ còn trống thì
 * người thuê một mình trong phòng 2 chỗ bị tính đủ giá phòng — mà đó chính là giá bao
 * phòng, tức hai kiểu thuê nhập làm một và không còn phân biệt được nữa.
 *
 * Làm tròn 100.000đ để ra con số đọc được, không phải 4.483.333đ.
 */
export const slotPrice = (room: Room): VND =>
  Math.round(room.rent / room.capacity / 100_000) * 100_000;

export type RentScope =
  | { kind: 'UNIT' }                                   // nguyên căn
  | { kind: 'ROOM'; roomId: string }                   // bao trọn một phòng
  | { kind: 'SLOTS'; roomId: string; slots: number };  // thuê lẻ N chỗ

/** Giá tự nhảy theo lựa chọn. Quản lý vẫn gõ đè được — thực tế luôn có ca thương lượng
 *  riêng, khoá cứng giá chỉ làm họ phải ghi chú ra ngoài sổ. */
export function autoRent(unit: Unit, scope: RentScope): VND {
  if (scope.kind === 'UNIT') return unit.rooms.reduce((a, r) => a + r.rent, 0);
  const room = unit.rooms.find(r => r.id === scope.roomId);
  if (!room) throw new Error(`Không có phòng '${scope.roomId}' trong căn ${unit.code}`);
  return scope.kind === 'ROOM' ? room.rent : slotPrice(room) * scope.slots;
}

/** Phí dịch vụ chia theo TỈ LỆ SỨC CHỨA đang thuê, làm tròn 50.000đ, sàn 50.000đ. */
export function autoServiceFee(unit: Unit, scope: RentScope): VND {
  const total = unit.rooms.reduce((a, r) => a + r.capacity, 0);
  if (scope.kind === 'UNIT' || total === 0) return unit.serviceFee;
  const room = unit.rooms.find(r => r.id === scope.roomId);
  if (!room) throw new Error(`Không có phòng '${scope.roomId}' trong căn ${unit.code}`);
  const share = scope.kind === 'ROOM' ? room.capacity : scope.slots;
  return Math.max(50_000, Math.round((unit.serviceFee * share) / total / 50_000) * 50_000);
}
