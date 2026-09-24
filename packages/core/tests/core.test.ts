/**
 * Test lõi nghiệp vụ. Chạy: npm test
 *
 * Quy tắc: HÀM NÀO TÍNH RA MỘT CON SỐ TIỀN, HÀM ĐÓ PHẢI CÓ TEST.
 * Không cần trình duyệt, không cần database, không cần dữ liệu giả — chỉ vài object
 * dựng tay. Đó là lý do lõi được tách ra và bắt phải thuần.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  addMonthsAnchored, buildSchedule, computeMoneyState, computeUnitState,
  crc16ccitt, day, daysBetween, extensionApprover, extractPaymentCode, formatShortVND,
  formatDay, heldInRoom, isAutoKind, isTerminable, isValidPaymentCode, lateFee,
  makeDocNo, makePaymentCode, marksDueToday, planReminders, prorateFirstMonth,
  readVND, reconcile, slotPrice, autoRent, autoServiceFee, buildVietQR, verifyVietQR,
  LATE_POLICY,
  type Contract, type Room, type Unit, type BankTransaction, type OpenRequest,
} from '../src/index.js';

/* Mốc thời gian dùng chung cho mọi test — cố định, không đọc đồng hồ hệ thống. */
const TODAY = day(2026, 9, 16);

/* ================================================================== ngày tháng */

test('ngày đóng tiền neo theo ngày vào, không trôi khi gặp tháng ngắn', () => {
  const moveIn = day(2026, 1, 31);
  const got = [1, 2, 3, 4, 5, 6].map(n => formatDay(addMonthsAnchored(moveIn, 31, n)));
  assert.deepEqual(got, [
    '28/02/2026',   // tháng 2 không có ngày 31 → lùi về ngày cuối
    '31/03/2026',   // nhưng MỐC vẫn là 31, nên tháng 3 quay lại đúng 31
    '30/04/2026',
    '31/05/2026',
    '30/06/2026',
    '31/07/2026',
  ]);
});

test('tiền dịch vụ tháng đầu chia theo số ngày ở, TÍNH CẢ ngày vào', () => {
  // vào 16/09 (tháng 30 ngày) → ở 16→30 = 15 ngày, không phải 14
  const r = prorateFirstMonth(day(2026, 9, 16), 500_000);
  assert.equal(r.days, 15);
  assert.equal(r.ofDays, 30);
  assert.equal(r.amount, 250_000);
});

/* ================================================================== tiền tệ */

test('dưới 1 triệu thì ghi đầy đủ, không rút gọn', () => {
  assert.equal(formatShortVND(700_000), '700.000đ');
  assert.equal(formatShortVND(999_999), '999.999đ');     // vẫn dưới 1tr thì vẫn ghi đủ
  assert.equal(formatShortVND(1_000_000), '1tr');
  assert.equal(formatShortVND(18_500_000), '18,5tr');
});

test('đọc số thành chữ đúng ba chỗ tiếng Việt hay sai', () => {
  assert.equal(readVND(21_000), 'Hai mươi mốt nghìn đồng');        // mốt, không phải một
  assert.equal(readVND(25_000), 'Hai mươi lăm nghìn đồng');        // lăm, không phải năm
  assert.equal(readVND(105_000), 'Một trăm linh năm nghìn đồng');  // có chữ linh
  assert.equal(readVND(18_000_000), 'Mười tám triệu đồng');
});

/* ================================================================== chiếm chỗ */

const room = (id: string, capacity: number, rent: number): Room =>
  ({ id, unitId: 'u1', name: id, capacity, rent });

const unit = (rooms: Room[]): Unit => ({
  id: 'u1', zoneId: 'S', towerId: 'S219', towerNo: 219, floor: 15, unitNo: '12',
  code: 'S219.1512', bedrooms: rooms.length, bathrooms: 2, areaM2: 66,
  serviceFee: 700_000, rooms,
});

const contract = (over: Partial<Contract> = {}): Contract => ({
  id: 'c1', code: 'C1', unitId: 'u1', rooms: [], occupants: [],
  rent: 6_000_000, serviceFee: 700_000, cycleMonths: 1, depositMonths: 1,
  moveIn: day(2026, 6, 1), endsOn: day(2027, 6, 1), payMode: 'REPRESENTATIVE',
  ...over,
});

test('bao phòng khoá TRỌN phòng dù khách ở một mình', () => {
  const pn1 = room('pn1', 2, 9_000_000);
  const c = contract({ rooms: [{ roomId: 'pn1', mode: 'EXCLUSIVE' }], occupants: [{} as never] });
  // 1 người ở, nhưng phòng đã kín — nếu đếm theo đầu người thì app sẽ mời khách lạ vào
  assert.equal(heldInRoom(pn1, [c]), 2);
});

test('ở ghép chỉ chiếm đúng số chỗ đã thuê', () => {
  const pn1 = room('pn1', 2, 9_000_000);
  const c = contract({ rooms: [{ roomId: 'pn1', mode: 'SHARED', slotsHeld: 1 }] });
  assert.equal(heldInRoom(pn1, [c]), 1);
});

test('trạng thái căn suy từ CHỖ BỊ CHIẾM, không từ số người', () => {
  const rooms = [room('pn1', 2, 9_000_000), room('pn2', 2, 8_000_000)];
  const u = unit(rooms);
  assert.equal(computeUnitState(u, []).status, 'empty');

  const one = contract({ rooms: [{ roomId: 'pn1', mode: 'EXCLUSIVE' }] });
  assert.equal(computeUnitState(u, [one]).status, 'partial');

  const both = contract({
    rooms: [{ roomId: 'pn1', mode: 'EXCLUSIVE' }, { roomId: 'pn2', mode: 'EXCLUSIVE' }],
  });
  const st = computeUnitState(u, [both]);
  assert.equal(st.status, 'full');
  assert.equal(st.held, 4);
  assert.equal(st.capacity, 4);
});

/* ================================================================== giá */

test('giá thuê lẻ chia cho SỨC CHỨA, không chia cho số chỗ còn trống', () => {
  const pn1 = room('pn1', 2, 9_000_000);
  assert.equal(slotPrice(pn1), 4_500_000);
  // Nếu chia cho chỗ còn trống, người thuê một mình bị tính 9tr = đúng giá bao phòng,
  // và hai kiểu thuê nhập làm một.
  const u = unit([pn1, room('pn2', 2, 8_000_000)]);
  assert.equal(autoRent(u, { kind: 'UNIT' }), 17_000_000);
  assert.equal(autoRent(u, { kind: 'ROOM', roomId: 'pn1' }), 9_000_000);
  assert.equal(autoRent(u, { kind: 'SLOTS', roomId: 'pn1', slots: 1 }), 4_500_000);
});

test('phí dịch vụ chia theo tỉ lệ sức chứa, sàn 50.000đ', () => {
  const u = unit([room('pn1', 2, 9_000_000), room('pn2', 2, 8_000_000)]);
  assert.equal(autoServiceFee(u, { kind: 'UNIT' }), 700_000);
  assert.equal(autoServiceFee(u, { kind: 'ROOM', roomId: 'pn1' }), 350_000);
  assert.equal(autoServiceFee(u, { kind: 'SLOTS', roomId: 'pn1', slots: 1 }), 200_000);
});

/* ================================================================== lịch thu */

test('lịch thu HỎI sổ thanh toán, không tự đoán kỳ nào đã đóng', () => {
  const c = contract();
  const empty = buildSchedule(c, TODAY);
  assert.equal(empty.every(iv => !iv.paid), true);

  const firstRent = empty.find(iv => iv.type === 'RENT')!;
  const withOne = buildSchedule(c, TODAY, k => (k === firstRent.key ? 6_000_000 : 0));
  assert.equal(withOne.filter(iv => iv.paid).length, 1);
  assert.equal(withOne.find(iv => iv.key === firstRent.key)!.paid, true);
});

test('đóng thiếu thì kỳ VẪN MỞ và chỉ nợ phần còn thiếu', () => {
  const c = contract();
  const key = buildSchedule(c, TODAY).find(iv => iv.type === 'RENT')!.key;
  const iv = buildSchedule(c, TODAY, k => (k === key ? 5_500_000 : 0)).find(x => x.key === key)!;
  assert.equal(iv.paid, false);
  assert.equal(iv.paidAmount, 5_500_000);
  assert.equal(iv.owed, 500_000);
});

test('kỳ thu không bao giờ vượt quá ngày hết hạn hợp đồng', () => {
  const c = contract({ moveIn: day(2026, 1, 15), endsOn: day(2026, 7, 15) });
  const s = buildSchedule(c, TODAY);
  assert.equal(s.every(iv => iv.due < c.endsOn), true);
});

/* ================================================================== trạng thái tiền */

function stateOf(invoices: ReturnType<typeof buildSchedule>, over: Partial<Contract> = {}) {
  const c = contract(over);
  return computeMoneyState({ contracts: [c], scheduleOf: () => invoices, today: TODAY });
}

test('nợ cộng theo phần CÒN THIẾU, không cộng cả kỳ', () => {
  const invoices = [{
    key: 'k', contractId: 'c1', type: 'RENT' as const,
    due: day(2026, 9, 12), periodFrom: day(2026, 9, 12), periodTo: day(2026, 10, 12),
    amount: 6_000_000, paidAmount: 5_500_000, owed: 500_000, paid: false, late: true,
  }];
  const m = stateOf(invoices);
  assert.equal(m.kind, 'late');
  assert.equal(m.owed, 500_000);
});

test('trễ mà chỉ kẹt phí dịch vụ thì nhãn phải nói rõ', () => {
  const invoices = [{
    key: 'k', contractId: 'c1', type: 'SERVICE' as const,
    due: day(2026, 8, 1), periodFrom: day(2026, 8, 1), periodTo: day(2026, 8, 31),
    amount: 700_000, paidAmount: 0, owed: 700_000, paid: false, late: true,
  }];
  const m = stateOf(invoices);
  assert.equal(m.kind, 'late');
  assert.match(m.detail, /chỉ tiền dịch vụ/);
  assert.equal(m.penalty, 0);          // dịch vụ KHÔNG bị phạt
});

test('sắp tới hạn gom cả tiền nhà lẫn dịch vụ rơi trong cửa sổ D-3', () => {
  const mk = (type: 'RENT' | 'SERVICE', d: Date, amount: number) => ({
    key: `${type}-${d.getDate()}`, contractId: 'c1', type,
    due: d, periodFrom: d, periodTo: d, amount, paidAmount: 0, owed: amount,
    paid: false, late: false,
  });
  const m = stateOf([
    mk('RENT', day(2026, 9, 18), 6_000_000),      // còn 2 ngày
    mk('SERVICE', day(2026, 9, 19), 400_000),     // còn 3 ngày — sát mép
    mk('RENT', day(2026, 9, 20), 6_000_000),      // còn 4 ngày — NGOÀI cửa sổ
  ]);
  assert.equal(m.kind, 'soon');
  assert.equal(m.upcomingAmount, 6_400_000);
  assert.equal(m.owed, 0);
});

/* ================================================================== phạt trễ */

const dueBefore = (n: number) => day(2026, 9, 16 - n);

test('ân hạn 2 ngày: trễ 1–2 ngày chưa phạt đồng nào', () => {
  assert.equal(lateFee(dueBefore(0), TODAY), 0);
  assert.equal(lateFee(dueBefore(2), TODAY), 0);
  assert.equal(lateFee(dueBefore(3), TODAY), 100_000);
});

test('phạt 100k mỗi ngày, chặn trần 1 triệu mỗi kỳ', () => {
  assert.equal(lateFee(dueBefore(7), TODAY), 500_000);
  assert.equal(lateFee(dueBefore(12), TODAY), 1_000_000);
  assert.equal(lateFee(dueBefore(40), TODAY), 1_000_000);
  assert.equal(LATE_POLICY.feeCapPerPeriod, 1_000_000);
});

test('được DUYỆT khất thì không bị phạt trong thời hạn khất', () => {
  const due = dueBefore(10);
  assert.equal(lateFee(due, TODAY), 800_000);

  const approved = {
    id: 'e1', status: 'APPROVED' as const, newDue: day(2026, 9, 25),
    reason: 'chờ lương', requestedAt: TODAY,
  };
  assert.equal(lateFee(due, TODAY, approved), 0);
  // hết hạn khất mà vẫn chưa đóng thì đồng hồ chạy lại TỪ HẠN MỚI
  assert.equal(lateFee(due, day(2026, 10, 5), approved), 800_000);
});

test('xin khất mà CHƯA duyệt thì không dời được hạn', () => {
  const pending = {
    id: 'e1', status: 'PENDING' as const, newDue: day(2026, 9, 25),
    reason: 'chờ lương', requestedAt: TODAY,
  };
  assert.equal(lateFee(dueBefore(10), TODAY, pending), 800_000);
});

test('mốc thanh lý 15 ngày, và cũng dời theo khất đã duyệt', () => {
  assert.equal(isTerminable(dueBefore(14), TODAY), false);
  assert.equal(isTerminable(dueBefore(15), TODAY), true);
  const approved = {
    id: 'e1', status: 'APPROVED' as const, newDue: day(2026, 9, 20),
    reason: 'x', requestedAt: TODAY,
  };
  assert.equal(isTerminable(dueBefore(30), TODAY, approved), false);
});

test('quản lý tự duyệt khất ≤ 7 ngày, quá thì phải chủ nhà', () => {
  const due = day(2026, 9, 10);
  assert.equal(extensionApprover(due, day(2026, 9, 17)), 'MANAGER');
  assert.equal(extensionApprover(due, day(2026, 9, 18)), 'OWNER');
});

/* ================================================================== mã thanh toán */

test('mã thanh toán không đụng nhau trong 20.000 kỳ liên tiếp', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 20_000; i++) seen.add(makePaymentCode(i, TODAY));
  assert.equal(seen.size, 20_000);
});

test('mã mang YYMM để đọc sao kê bằng mắt còn biết tháng nào', () => {
  assert.match(makePaymentCode(1, TODAY), /^HC2609/);
});

test('mã bỏ ký tự dễ đọc nhầm: I, L, O, U', () => {
  for (let i = 0; i < 500; i++) {
    assert.doesNotMatch(makePaymentCode(i, TODAY).slice(2), /[ILOU]/);
  }
});

test('KÝ TỰ KIỂM TRA bắt được gõ nhầm — đây là thứ chặn tiền rơi nhầm kỳ', () => {
  const code = makePaymentCode(42, TODAY);
  assert.equal(isValidPaymentCode(code), true);

  // đổi một ký tự bất kỳ thì mã phải thành KHÔNG HỢP LỆ, chứ không được khớp kỳ khác
  let caught = 0, tried = 0;
  const A = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  for (let i = 2; i < code.length; i++) {
    for (const ch of A) {
      if (ch === code[i]) continue;
      tried++;
      const typo = code.slice(0, i) + ch + code.slice(i + 1);
      if (!isValidPaymentCode(typo)) caught++;
    }
  }
  // phải bắt được ít nhất 95% — phần lọt lưới sẽ rơi vào hàng đợi ngoại lệ ở bước sau
  assert.ok(caught / tried > 0.95, `chỉ bắt được ${(caught / tried * 100).toFixed(1)}%`);
});

test('moi được mã ra khỏi nội dung dù ngân hàng cắt khoảng trắng', () => {
  const code = makePaymentCode(7, TODAY);
  assert.equal(extractPaymentCode(`CK ${code} TIEN NHA`), code);
  assert.equal(extractPaymentCode(`CK${code}TIENNHA`), code);
  assert.equal(extractPaymentCode(code.toLowerCase()), code);
  assert.equal(extractPaymentCode('ME CHUYEN TIEN NHA CHO CON'), null);
});

test('số chứng từ đọc được và chạy lại từ 1 mỗi tháng', () => {
  assert.equal(makeDocNo('YC', TODAY, 1), 'YC-202609-0001');
  assert.equal(makeDocNo('PT', TODAY, 128), 'PT-202609-0128');
});

/* ================================================================== VietQR */

test('CRC dùng đúng biến thể CCITT-FALSE', () => {
  assert.equal(crc16ccitt('123456789'), '29B1');   // vector chuẩn
});

test('payload VietQR đúng cấu trúc TLV và tự kiểm CRC', () => {
  const code = makePaymentCode(1, TODAY);
  assert.equal(code.length, 11, 'mã 11 ký tự: HC + YYMM + 4 thân + 1 kiểm tra');
  const p = buildVietQR({
    bankId: 'MB', accountNumber: '0123456789', amount: 3_500_000, content: code,
  });
  assert.ok(p.startsWith('000201'));       // format 01
  assert.ok(p.includes('010212'));         // QR ĐỘNG, không phải tĩnh (11)
  assert.ok(p.includes('A000000727'));     // GUID VietQR/NAPAS
  assert.ok(p.includes('0006970422'));     // BIN của MB Bank
  assert.ok(p.includes('01100123456789')); // số tài khoản
  assert.ok(p.includes('5303704'));        // VND
  assert.ok(p.includes('54073500000'));    // số tiền
  assert.ok(p.includes(`0811${code}`));    // nội dung chuyển khoản
  assert.equal(verifyVietQR(p), true);
});

test('ngân hàng lạ thì báo lỗi ngay, không sinh QR sai âm thầm', () => {
  assert.throws(() => buildVietQR({ bankId: 'XXX', accountNumber: '1' }), /Không biết ngân hàng/);
});

/* ================================================================== đối soát */

/* Mã phải SINH RA, không gõ tay: mã gõ tay sai ký tự kiểm tra và sẽ bị loại — đúng như
   thiết kế, nhưng làm test tưởng là lỗi. Chính chỗ này đã bắt được một lỗi test. */
const CODE = makePaymentCode(1, TODAY);

const req = (over: Partial<OpenRequest> = {}): OpenRequest => ({
  id: 'r1', code: CODE, contractId: 'c1',
  accountNumber: '0904112233', amount: 6_000_000, due: day(2026, 9, 10),
  ...over,
});

const tx = (over: Partial<BankTransaction> = {}): BankTransaction => ({
  providerTxId: 'SEPAY-1', accountNumber: '0904112233', amount: 6_000_000,
  content: `CK ${CODE}`, occurredAt: TODAY,
  ...over,
});

test('đúng mã đúng tài khoản đúng tiền thì tự ghi nhận', () => {
  const r = reconcile(tx(), [req()]);
  assert.equal(r.kind, 'PAID');
  assert.equal(isAutoKind(r.kind), true);
  assert.deepEqual(r.allocations, [{ requestId: 'r1', amount: 6_000_000 }]);
});

test('LỆCH TIỀN THÌ KHÔNG BAO GIỜ TỰ GHI NHẬN, dù lệch 1.000đ', () => {
  const thieu = reconcile(tx({ amount: 5_999_000 }), [req()]);
  assert.equal(thieu.kind, 'PARTIAL');
  assert.equal(thieu.shortBy, 1_000);
  assert.equal(isAutoKind(thieu.kind), false);

  const thua = reconcile(tx({ amount: 6_001_000 }), [req()]);
  assert.equal(thua.kind, 'OVERPAID');
  assert.equal(thua.overBy, 1_000);
  assert.equal(isAutoKind(thua.kind), false);
});

test('không có mã thì vào hàng đợi, KHÔNG đoán theo số tiền', () => {
  const r = reconcile(tx({ content: 'ME CHUYEN TIEN NHA' }), [req()]);
  assert.equal(r.kind, 'UNMATCHED');
  assert.deepEqual(r.allocations, []);
});

test('đúng mã nhưng sai tài khoản nhận thì không tự ghi nhận', () => {
  const r = reconcile(tx({ accountNumber: '9999999999' }), [req()]);
  assert.equal(r.kind, 'UNMATCHED');
  assert.match(r.reason!, /nhầm tài khoản/);
});

test('một lần trả trọn nhiều kỳ thì đề xuất phân bổ, vẫn chờ người duyệt', () => {
  const r2 = req({ id: 'r2', code: makePaymentCode(99, TODAY), amount: 700_000, due: day(2026, 10, 1) });
  const r = reconcile(tx({ amount: 6_700_000, content: `${CODE} dong luon 2 ky` }), [req(), r2]);
  assert.equal(r.kind, 'MULTI_PERIOD');
  assert.equal(isAutoKind(r.kind), false);
  assert.deepEqual(r.allocations, [
    { requestId: 'r1', amount: 6_000_000 },
    { requestId: 'r2', amount: 700_000 },
  ]);
});

test('webhook gửi lại bị bỏ qua, không ghi nhận hai lần', () => {
  const r = reconcile(tx(), [req()], { seenTxIds: new Set(['SEPAY-1']) });
  assert.equal(r.kind, 'DUPLICATE');
  assert.deepEqual(r.allocations, []);
});

/* ================================================================== lịch nhắc */

test('lịch nhắc D-3 → D+3, và DỪNG HẲN khi đã thanh toán', () => {
  const due = day(2026, 9, 10);
  const plan = planReminders(due, day(2026, 9, 11));      // quá hạn 1 ngày
  assert.deepEqual(plan.map(m => m.due), [true, true, true, false]);

  const paid = planReminders(due, day(2026, 9, 20), true);
  assert.equal(paid.every(m => !m.due && m.stopped), true);
});

test('mốc cần bắn HÔM NAY — thứ Edge Function chạy theo giờ sẽ hỏi', () => {
  const due = day(2026, 9, 10);
  assert.deepEqual(marksDueToday(due, day(2026, 9, 7)).map(m => m.key), ['D-3']);
  assert.deepEqual(marksDueToday(due, day(2026, 9, 10)).map(m => m.key), ['D0']);
  assert.deepEqual(marksDueToday(due, day(2026, 9, 13)).map(m => m.key), ['D+3']);
  assert.deepEqual(marksDueToday(due, day(2026, 9, 14)).map(m => m.key), []);
  assert.deepEqual(marksDueToday(due, day(2026, 9, 10), true).map(m => m.key), []);
});

test('daysBetween không lệch vì giờ phút', () => {
  const a = new Date(2026, 8, 16, 23, 59);
  const b = new Date(2026, 8, 15, 0, 1);
  assert.equal(daysBetween(a, b), 1);
});
