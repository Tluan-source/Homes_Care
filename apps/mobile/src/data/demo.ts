/**
 * DỮ LIỆU GIẢ — để app chạy được trước khi có Supabase.
 *
 * Cố ý tách hẳn một file: khi nối API thật thì xoá file này và thay bằng lớp gọi
 * Supabase, MÀN HÌNH KHÔNG PHẢI SỬA GÌ. Đó là lý do màn hình nhận dữ liệu qua props
 * chứ không tự đi lấy.
 *
 * Số liệu được gieo bằng bộ sinh số giả có hạt cố định, nên mỗi lần mở app ra đúng
 * một bộ dữ liệu — demo cho khách xem hai lần không ra hai con số khác nhau.
 */

import {
  buildSchedule, computeMoneyState, computeUnitState, day,
  type Contract, type MoneyState, type Room, type Unit, type UnitState,
} from '@homescare/core';

/** "Hôm nay" của bản demo. Cố định để ảnh chụp màn hình không đổi theo ngày thật. */
export const DEMO_TODAY = day(2026, 9, 16);

/* Bộ sinh số giả tuyến tính — cùng hạt thì cùng dãy số, ở mọi máy. */
function mkRandom(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Ngô'];
const DEM = ['Văn', 'Thị', 'Minh', 'Quốc', 'Gia', 'Hải', 'Thu', 'Anh', 'Bảo', 'Khánh'];
const TEN = ['An', 'Bình', 'Châu', 'Dũng', 'Duyên', 'Giang', 'Hà', 'Hiếu', 'Huy', 'Lâm',
             'Linh', 'Mai', 'Nam', 'Ngân', 'Quân', 'Quỳnh', 'Sơn', 'Tâm', 'Thảo', 'Tuấn'];

const TOWERS = [
  { id: 'S12',  zoneId: 'S', no: 12,  floors: [3, 18] },
  { id: 'S219', zoneId: 'S', no: 219, floors: [4, 25] },
  { id: 'M210', zoneId: 'M', no: 210, floors: [3, 24] },
  { id: 'H7',   zoneId: 'H', no: 7,   floors: [2, 15] },
];

export interface DemoRow {
  unit: Unit;
  state: UnitState;
  money: MoneyState;
  /** Người ở, để màn tìm kiếm khớp theo tên và số điện thoại. */
  occupants: { name: string; phone: string }[];
}

function build(): DemoRow[] {
  const rnd = mkRandom(20260916);
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
  const name = () => `${pick(HO)} ${pick(DEM)} ${pick(TEN)}`;
  const phone = () =>
    `09${Math.floor(rnd() * 90 + 10)} ${Math.floor(rnd() * 900 + 100)} ${Math.floor(rnd() * 900 + 100)}`;

  const rows: DemoRow[] = [];

  for (const t of TOWERS) {
    for (let i = 0; i < 12; i++) {
      const floor = t.floors[0]! + Math.floor(rnd() * (t.floors[1]! - t.floors[0]!));
      const unitNo = String(1 + Math.floor(rnd() * 12)).padStart(2, '0');
      const id = `${t.id}.${String(floor).padStart(2, '0')}${unitNo}`;
      if (rows.some(r => r.unit.id === id)) continue;   // trùng mã thì bỏ qua

      const bedrooms = rnd() < 0.35 ? 1 : rnd() < 0.85 ? 2 : 3;
      const target = bedrooms === 1 ? 12_000_000 : bedrooms === 2 ? 17_000_000 : 25_000_000;
      const weights = [1.14, 1.0, 0.9].slice(0, bedrooms);
      const sumW = weights.reduce((a, b) => a + b, 0);

      const rooms: Room[] = weights.map((w, k) => ({
        id: `${id}-pn${k + 1}`, unitId: id, name: `PN${k + 1}`,
        capacity: k > 0 && rnd() < 0.25 ? 1 : 2,
        rent: Math.round((target * w) / sumW / 500_000) * 500_000,
      }));

      const unit: Unit = {
        id, code: id, zoneId: t.zoneId, towerId: t.id, towerNo: t.no, floor, unitNo,
        bedrooms, bathrooms: bedrooms === 1 ? 1 : 2,
        areaM2: Math.round(30 + bedrooms * 17),
        serviceFee: bedrooms === 1 ? 500_000 : bedrooms === 2 ? 700_000 : 900_000,
        rooms,
      };

      const roll = rnd();
      if (roll < 0.06) {                                   // bảo trì
        unit.maintenance = true;
        unit.maintenanceNote = 'Thấm trần nhà vệ sinh, thợ hẹn xong 20/09';
        rows.push(row(unit, [], []));
        continue;
      }
      if (roll < 0.18) { rows.push(row(unit, [], [])); continue; }   // trống

      // --- có hợp đồng
      const monthsAgo = 1 + Math.floor(rnd() * 10);
      const moveIn = day(2026, 9 - monthsAgo, 1 + Math.floor(rnd() * 27));
      const cycleMonths = ([1, 1, 2, 3, 3, 6] as const)[Math.floor(rnd() * 6)]!;
      const people = Array.from(
        { length: Math.max(1, rooms.reduce((a, r) => a + r.capacity, 0) - (rnd() < 0.3 ? 1 : 0)) },
        (_, k) => ({ name: name(), phone: phone(), roomId: rooms[Math.min(rooms.length - 1, k >> 1)]!.id }),
      );

      const contract: Contract = {
        id: `c-${id}`, code: `${id}-01`, unitId: id,
        rooms: rooms.map(r => ({ roomId: r.id, mode: 'EXCLUSIVE' as const })),
        occupants: people.map((p, k) => ({
          id: `o-${id}-${k}`, name: p.name, roomId: p.roomId, primary: k === 0,
          phone: p.phone, idNumber: '0' + Math.floor(rnd() * 1e11).toString().padStart(11, '0'),
        })),
        rent: rooms.reduce((a, r) => a + r.rent, 0),
        serviceFee: unit.serviceFee,
        cycleMonths, depositMonths: 1,
        moveIn, endsOn: day(moveIn.getFullYear() + 1, moveIn.getMonth() + 1, moveIn.getDate()),
        payMode: 'REPRESENTATIVE',
      };

      // Nợ bao nhiêu: phần lớn đã đóng đủ, một ít còn nợ kỳ gần nhất.
      const behind = rnd() < 0.22;
      const raw = buildSchedule(contract, DEMO_TODAY);
      const dueSoFar = raw.filter(iv => iv.due <= DEMO_TODAY);
      const cut = behind && dueSoFar.length > 1
        ? dueSoFar[dueSoFar.length - 1]!.due
        : day(2026, 9, 17);
      const paid = new Map(raw.filter(iv => iv.due < cut).map(iv => [iv.key, iv.amount]));

      rows.push(row(unit, [contract], people, k => paid.get(k) ?? 0));
    }
  }

  return rows.sort((a, b) =>
    a.unit.zoneId.localeCompare(b.unit.zoneId) ||
    a.unit.towerNo - b.unit.towerNo ||
    a.unit.floor - b.unit.floor ||
    a.unit.unitNo.localeCompare(b.unit.unitNo));
}

function row(
  unit: Unit,
  contracts: Contract[],
  occupants: { name: string; phone: string }[],
  paidOf: (key: string) => number = () => 0,
): DemoRow {
  // Mọi con số đều do @homescare/core tính. Màn hình chỉ vẽ lại.
  const scheduleOf = (c: Contract) => buildSchedule(c, DEMO_TODAY, paidOf);
  return {
    unit,
    state: computeUnitState(unit, contracts),
    money: computeMoneyState({
      contracts, scheduleOf, today: DEMO_TODAY, underMaintenance: unit.maintenance,
    }),
    occupants,
  };
}

export const DEMO_ROWS: DemoRow[] = build();
