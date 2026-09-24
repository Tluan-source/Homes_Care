/**
 * Kiểu dùng chung cho toàn bộ lõi nghiệp vụ.
 *
 * Quy ước xuyên suốt:
 *  - Tiền là VNĐ nguyên, không có phần lẻ. Kiểu `number` an toàn vì số tiền thật
 *    còn cách rất xa 2^53; trong Postgres thì là `bigint`.
 *  - Ngày là `Date` ở mốc 00:00 giờ địa phương. Lõi không bao giờ tự đọc đồng hồ —
 *    "hôm nay" luôn là tham số truyền vào (xem ARCHITECTURE §3.3).
 */

/** Số tiền VNĐ nguyên. Đặt tên riêng để đọc chữ ký hàm là biết ngay đơn vị. */
export type VND = number;

/** Ngày đã chuẩn hoá về 00:00 giờ địa phương. */
export type Day = Date;

/* ------------------------------------------------------------------ không gian */

export type ZoneId = string;      // 'S' | 'M' | 'H' — mở rộng được, không khoá cứng
export type TowerId = string;     // 'S219'
export type UnitId = string;
export type RoomId = string;

export interface Zone {
  id: ZoneId;
  name: string;
}

export interface Tower {
  id: TowerId;
  zoneId: ZoneId;
  /** Số hiệu tòa dạng SỐ, dùng để sắp xếp. Không đệm 0 được vì đây là tên có thật
   *  ngoài đời (S12, S219, H7), nên so chuỗi sẽ ra H120 → H213 → H7. */
  no: number;
  code: string;
  name: string;
}

export interface Room {
  id: RoomId;
  unitId: UnitId;
  name: string;
  /** Sức chứa phòng — số chỗ nằm, KHÔNG phải số người đang ở. */
  capacity: number;
  /** Giá gốc nằm ở PHÒNG. Giá cả căn là tổng giá các phòng. */
  rent: VND;
}

export interface Unit {
  id: UnitId;
  zoneId: ZoneId;
  towerId: TowerId;
  towerNo: number;
  /** Tầng. Là SỐ ở v1 — nếu dự án có tầng lửng M hay hầm B1 thì phải đổi sang chuỗi
   *  và viết lại quy tắc sinh mã (câu hỏi Q13 còn treo trong đặc tả). */
  floor: number;
  /** MÃ căn trong tầng, không phải số lượng. Là chuỗi vì có '12A', và '07' khác '7'. */
  unitNo: string;
  /** Sinh ra từ towerId + floor + unitNo. Chỉ dùng để HIỂN THỊ và TÌM KIẾM,
   *  không bao giờ dùng để sắp xếp hay tách ngược ra ba phần. */
  code: string;
  bedrooms: number;
  bathrooms: number;
  areaM2: number;
  serviceFee: VND;
  rooms: Room[];
  maintenance?: boolean;
  maintenanceNote?: string;
}

/* ------------------------------------------------------------------ hợp đồng */

/** Cách một hợp đồng chiếm phòng.
 *  EXCLUSIVE khoá TRỌN sức chứa phòng dù ở ít người hơn — đây là chỗ dễ sai nhất:
 *  đếm theo đầu người thì app sẽ mời khách lạ vào phòng người ta đã thuê trọn. */
export type RoomHoldMode = 'EXCLUSIVE' | 'SHARED';

export interface ContractRoom {
  roomId: RoomId;
  mode: RoomHoldMode;
  /** Chỉ có nghĩa khi mode = SHARED. */
  slotsHeld?: number;
}

export interface Occupant {
  id: string;
  name: string;
  roomId: RoomId;
  primary: boolean;
  phone: string;
  idNumber: string;        // CCCD
  idIssuedOn?: string;     // ISO date
  idIssuedBy?: string;
  address?: string;
  dob?: string;
}

/** Ai đứng ra đóng tiền. Kỳ vẫn tính là đã đóng khi TỔNG đủ tiền, ai chuyển cũng được. */
export type PayMode = 'REPRESENTATIVE' | 'SPLIT_EQUAL';

export type ExtensionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

/** Đơn xin đóng trễ. Được DUYỆT thì hạn dời sang `newDue` và miễn phạt tới đó. */
export interface Extension {
  id: string;
  status: ExtensionStatus;
  newDue: Day;
  reason: string;
  requestedAt: Day;
  decidedBy?: string;
  decidedAt?: Day;
}

export interface Contract {
  id: string;
  code: string;
  unitId: UnitId;
  rooms: ContractRoom[];
  occupants: Occupant[];
  /** Tiền nhà MỖI THÁNG. Một kỳ thu = rent × cycleMonths. */
  rent: VND;
  serviceFee: VND;
  /** Bao nhiêu tháng một lần đóng — "2 cọc 1" nghĩa là cycleMonths = 2. */
  cycleMonths: number;
  depositMonths: number;
  moveIn: Day;
  /** Ngày kết thúc. Kỳ thu không bao giờ vượt qua mốc này. */
  endsOn: Day;
  payMode: PayMode;
  /** Gia hạn tạo HỢP ĐỒNG MỚI, trỏ về hợp đồng cũ để giữ lịch sử giá
   *  (Điều 5 cho tăng tối đa 10%/năm — không có lịch sử thì không chứng minh được). */
  renewedFromId?: string;
  extension?: Extension;
}

/* ------------------------------------------------------------------ tiền */

export type InvoiceType = 'RENT' | 'SERVICE';

/** Một KỲ THU sinh ra từ hợp đồng. Không lưu trong DB dưới dạng này — DB lưu
 *  `payment_periods`; đây là dạng đã tính toán xong để hiển thị. */
export interface Invoice {
  /** Khoá nối giữa lịch thu và sổ thanh toán: hợp đồng + loại + ngày tới hạn. */
  key: string;
  contractId: string;
  type: InvoiceType;
  due: Day;
  periodFrom: Day;
  periodTo: Day;
  amount: VND;
  /** Đã nhận được bao nhiêu — đọc từ sổ thanh toán, KHÔNG suy đoán. */
  paidAmount: VND;
  /** Còn thiếu bao nhiêu. Đóng thiếu thì kỳ vẫn mở. */
  owed: VND;
  paid: boolean;
  late: boolean;
  /** Chỉ có ở kỳ dịch vụ tháng đầu — chia theo số ngày ở. */
  proration?: { days: number; ofDays: number };
}

/** Trạng thái tiền của một CĂN, suy ra từ mọi hợp đồng đang chạy trong căn đó. */
export type MoneyStateKind =
  | 'none'   // chưa cho thuê
  | 'ok'     // đã thu đủ
  | 'soon'   // sắp tới hạn, chưa nợ đồng nào
  | 'late'   // quá hạn
  | 'term'   // quá mốc thanh lý
  | 'wait'   // khách xin đóng trễ, chờ duyệt
  | 'ext'    // đã cho khất
  | 'bill';  // có bill khách gửi tay đang chờ duyệt

export interface MoneyState {
  kind: MoneyStateKind;
  /** Nợ GỐC — phần còn thiếu của các kỳ quá hạn. Không gồm tiền phạt. */
  owed: VND;
  /** Tiền phạt trễ, để RIÊNG khỏi nợ gốc để người đọc soát lại được. */
  penalty: VND;
  /** Câu mô tả ngắn hiển thị trên dòng căn hộ. */
  detail: string;
  /** Kỳ quá hạn cũ nhất. */
  since?: Day;
  /** Ngày tới hạn gần nhất, khi kind = 'soon'. */
  nextDue?: Day;
  /** Số tiền sắp phải đóng, khi kind = 'soon'. */
  upcomingAmount?: VND;
  extension?: Extension;
}

/* ------------------------------------------------------------------ chiếm chỗ */

export type UnitStatus = 'empty' | 'partial' | 'full' | 'maint';

export interface UnitState {
  /** Tổng sức chứa các phòng ngủ. Phòng vệ sinh không tính. */
  capacity: number;
  /** Số chỗ đang bị chiếm — tính theo CHỖ, không theo đầu người. */
  held: number;
  /** Số người đang ở thật. */
  people: number;
  status: UnitStatus;
  freeRooms: Room[];
  partialRooms: Room[];
}
