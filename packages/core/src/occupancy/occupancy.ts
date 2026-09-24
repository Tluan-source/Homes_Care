/**
 * Chỗ bị chiếm và trạng thái căn hộ.
 *
 * Đây là chỗ dễ sai nhất của cả mô hình: đếm theo ĐẦU NGƯỜI thay vì theo CHỖ BỊ CHIẾM
 * thì app sẽ mời khách lạ vào phòng người ta đã thuê trọn.
 */

import type { Contract, Room, Unit, UnitState } from '../types.js';

/**
 * Số chỗ trong một phòng đang bị các hợp đồng chiếm.
 *
 * Bao phòng (EXCLUSIVE) chiếm TRỌN sức chứa dù khách ở một mình — vì khách trả tiền để
 * ở riêng. Ở ghép (SHARED) chỉ chiếm đúng số chỗ đã thuê.
 */
export function heldInRoom(room: Room, contracts: readonly Contract[]): number {
  let held = 0;
  for (const c of contracts) {
    for (const cr of c.rooms) {
      if (cr.roomId !== room.id) continue;
      held += cr.mode === 'EXCLUSIVE' ? room.capacity : (cr.slotsHeld ?? 1);
    }
  }
  return Math.min(held, room.capacity);
}

export function computeUnitState(unit: Unit, contracts: readonly Contract[]): UnitState {
  const capacity = unit.rooms.reduce((a, r) => a + r.capacity, 0);
  const held = unit.rooms.reduce((a, r) => a + heldInRoom(r, contracts), 0);
  const people = contracts.reduce((a, c) => a + c.occupants.length, 0);

  const status =
    unit.maintenance ? 'maint' :       // cờ tay, ưu tiên cao nhất
    held === 0       ? 'empty' :
    held >= capacity ? 'full'  : 'partial';

  return {
    capacity, held, people, status,
    freeRooms: unit.rooms.filter(r => heldInRoom(r, contracts) === 0),
    partialRooms: unit.rooms.filter(r => {
      const h = heldInRoom(r, contracts);
      return h > 0 && h < r.capacity;
    }),
  };
}
