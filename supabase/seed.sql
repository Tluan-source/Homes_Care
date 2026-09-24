-- ============================================================================
-- DỮ LIỆU MẪU
--
-- Cố ý dựng **HAI tổ chức khác nhau**, không phải một.
--
-- Một tổ chức thì không test được điều quan trọng nhất: "chủ khu S không thấy được
-- sổ của chủ khu M". Với một tổ chức, mọi policy hỏng đều vẫn "pass" — chẳng có dữ
-- liệu của ai khác để lộ ra cả.
--
-- UUID cố định để test đọc ra nghĩa ngay, không phải tra ngược.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- người dùng
-- (Supabase thật thì các hàng này do Auth tạo khi người dùng đăng ký.)

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'owner.a@homescare.test'),
  ('00000000-0000-0000-0000-00000000a002', 'manager.a@homescare.test'),
  ('00000000-0000-0000-0000-00000000a003', 'staff.a@homescare.test'),
  ('00000000-0000-0000-0000-00000000b001', 'owner.b@homescare.test')
on conflict (id) do nothing;

-- ---------------------------------------------------------------- tổ chức

insert into orgs (id, name) values
  ('0a000000-0000-0000-0000-000000000001', 'Nexus Home'),      -- tổ chức A
  ('0b000000-0000-0000-0000-000000000001', 'Riverside Group'); -- tổ chức B

insert into profiles (id, org_id, full_name, phone) values
  ('00000000-0000-0000-0000-00000000a001', '0a000000-0000-0000-0000-000000000001', 'Chủ nhà A',   '0901 000 001'),
  ('00000000-0000-0000-0000-00000000a002', '0a000000-0000-0000-0000-000000000001', 'Quản lý A',   '0901 000 002'),
  ('00000000-0000-0000-0000-00000000a003', '0a000000-0000-0000-0000-000000000001', 'Nhân viên A', '0901 000 003'),
  ('00000000-0000-0000-0000-00000000b001', '0b000000-0000-0000-0000-000000000001', 'Chủ nhà B',   '0902 000 001');

-- ---------------------------------------------------------------- không gian

insert into zones (id, org_id, code, name) values
  ('5a000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-000000000001', 'S', 'Khu S'),
  ('5b000000-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000001', 'R', 'Khu R');

insert into towers (id, zone_id, code, no, name) values
  ('7a000000-0000-0000-0000-000000000203', '5a000000-0000-0000-0000-000000000001', 'S203', 203, 'Toà S203'),
  ('7a000000-0000-0000-0000-000000000215', '5a000000-0000-0000-0000-000000000001', 'S215', 215, 'Toà S215'),
  ('7b000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001', 'R01',    1, 'Toà R01');

/*
 * VAI — điểm quan trọng nhất của file seed này.
 *
 * Quản lý A gắn vào ĐÚNG toà S203. Nhờ vậy test chứng minh được rằng phạm vi theo
 * toà có hiệu lực thật: cùng một tổ chức, cùng vai MANAGER, nhưng không thấy S215.
 * Nếu ai cũng thấy mọi toà thì `my_towers()` chỉ là đoạn code trang trí.
 */
insert into memberships (profile_id, org_id, role, tower_id) values
  ('00000000-0000-0000-0000-00000000a001', '0a000000-0000-0000-0000-000000000001', 'OWNER',   null),
  ('00000000-0000-0000-0000-00000000a002', '0a000000-0000-0000-0000-000000000001', 'MANAGER', '7a000000-0000-0000-0000-000000000203'),
  ('00000000-0000-0000-0000-00000000a003', '0a000000-0000-0000-0000-000000000001', 'STAFF',   '7a000000-0000-0000-0000-000000000203'),
  ('00000000-0000-0000-0000-00000000b001', '0b000000-0000-0000-0000-000000000001', 'OWNER',   null);

-- ---------------------------------------------------------------- căn hộ
-- Mã sinh ra theo quy ước [Toà].[tầng 2 số][căn 2 số] — xem 0002.

insert into units (id, tower_id, floor, unit_no, bedrooms, bathrooms, area_m2, service_fee) values
  -- S203.0624 — 2 phòng ngủ, 4 chỗ. Dùng cho test thuê lẻ / bao phòng / bao nhà.
  ('c0000000-0000-0000-0000-000000000624', '7a000000-0000-0000-0000-000000000203',  6, '24', 2, 2, 64.0, 700000),
  -- S203.0612 — 1 phòng ngủ
  ('c0000000-0000-0000-0000-000000000612', '7a000000-0000-0000-0000-000000000203',  6, '12', 1, 1, 47.0, 500000),
  -- S215.1229 — toà mà Quản lý A KHÔNG phụ trách
  ('c0000000-0000-0000-0000-000000001229', '7a000000-0000-0000-0000-000000000215', 12, '29', 3, 2, 91.0, 900000),
  -- R01.0101 — tổ chức khác hoàn toàn
  ('cb000000-0000-0000-0000-000000000101', '7b000000-0000-0000-0000-000000000001',  1, '01', 2, 2, 60.0, 600000);

insert into rooms (id, unit_id, name, capacity, rent, sort) values
  ('40000000-0000-0000-0000-000000062401', 'c0000000-0000-0000-0000-000000000624', 'PN1', 2, 9000000, 1),
  ('40000000-0000-0000-0000-000000062402', 'c0000000-0000-0000-0000-000000000624', 'PN2', 2, 8000000, 2),
  ('40000000-0000-0000-0000-000000061201', 'c0000000-0000-0000-0000-000000000612', 'PN1', 2, 12000000, 1),
  ('40000000-0000-0000-0000-000000122901', 'c0000000-0000-0000-0000-000000001229', 'PN1', 2, 10000000, 1),
  ('40000000-0000-0000-0000-000000122902', 'c0000000-0000-0000-0000-000000001229', 'PN2', 2,  8000000, 2),
  ('40000000-0000-0000-0000-000000122903', 'c0000000-0000-0000-0000-000000001229', 'PN3', 1,  7000000, 3),
  ('4b000000-0000-0000-0000-000000010101', 'cb000000-0000-0000-0000-000000000101', 'PN1', 2, 11000000, 1);

-- ---------------------------------------------------------------- hợp đồng
-- Ba mức thuê, mỗi mức một hợp đồng, để test contract_scope() và kiểm tra sức chứa.

-- (1) BAO CẢ NHÀ — EXCLUSIVE mọi phòng của S203.0624 → contract_scope = 'UNIT'
insert into contracts (id, unit_id, code, status, rent, service_fee, cycle_months,
                       deposit_months, move_in, ends_on, pay_mode, created_by) values
  ('c1000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000624',
   'S203.0624-01', 'ACTIVE', 17000000, 700000, 1, 1,
   date '2026-03-10', date '2027-03-10', 'REPRESENTATIVE',
   '00000000-0000-0000-0000-00000000a002');

insert into contract_rooms (contract_id, room_id, mode, slots_held) values
  ('c1000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000062401', 'EXCLUSIVE', null),
  ('c1000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000062402', 'EXCLUSIVE', null);

insert into occupants (contract_id, room_id, full_name, is_primary, phone) values
  ('c1000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000062401', 'Nguyễn Văn An',  true,  '0911 111 111'),
  ('c1000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000062402', 'Trần Thị Bình', false, '0911 111 222');

-- (2) THUÊ LẺ 1 CHỖ trong PN1 của S215.1229 → contract_scope = 'SLOT'
insert into contracts (id, unit_id, code, status, rent, service_fee, cycle_months,
                       deposit_months, move_in, ends_on, pay_mode, created_by) values
  ('c1000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000001229',
   'S215.1229-01', 'ACTIVE', 5000000, 300000, 1, 1,
   date '2026-07-01', date '2027-07-01', 'REPRESENTATIVE',
   '00000000-0000-0000-0000-00000000a001');

insert into contract_rooms (contract_id, room_id, mode, slots_held) values
  ('c1000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000122901', 'SHARED', 1);

insert into occupants (contract_id, room_id, full_name, is_primary, phone) values
  ('c1000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000122901', 'Lê Minh Châu', true, '0922 222 222');

-- (3) BAO 1 PHÒNG — PN3 của cùng căn S215.1229 → contract_scope = 'ROOM'
insert into contracts (id, unit_id, code, status, rent, service_fee, cycle_months,
                       deposit_months, move_in, ends_on, pay_mode, created_by) values
  ('c1000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000001229',
   'S215.1229-02', 'ACTIVE', 7000000, 300000, 1, 1,
   date '2026-08-01', date '2027-08-01', 'REPRESENTATIVE',
   '00000000-0000-0000-0000-00000000a001');

insert into contract_rooms (contract_id, room_id, mode, slots_held) values
  ('c1000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000122903', 'EXCLUSIVE', null);

insert into occupants (contract_id, room_id, full_name, is_primary, phone) values
  ('c1000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000122903', 'Phạm Gia Huy', true, '0933 333 333');

-- (4) Hợp đồng của TỔ CHỨC B — thứ mà người của tổ chức A không được thấy dòng nào.
insert into contracts (id, unit_id, code, status, rent, service_fee, cycle_months,
                       deposit_months, move_in, ends_on, pay_mode) values
  ('cb100000-0000-0000-0000-000000000001', 'cb000000-0000-0000-0000-000000000101',
   'R01.0101-01', 'ACTIVE', 11000000, 600000, 1, 1,
   date '2026-05-05', date '2027-05-05', 'REPRESENTATIVE');

insert into contract_rooms (contract_id, room_id, mode, slots_held) values
  ('cb100000-0000-0000-0000-000000000001', '4b000000-0000-0000-0000-000000010101', 'EXCLUSIVE', null);

-- ---------------------------------------------------------------- tiền

insert into bank_accounts (id, org_id, owner_id, bank_id, number, holder) values
  ('ba000000-0000-0000-0000-00000000000a', '0a000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-00000000a001', 'MB', '0123456789', 'NGUYEN VAN A'),
  ('ba000000-0000-0000-0000-00000000000b', '0b000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-00000000b001', 'VCB', '9876543210', 'TRAN VAN B');

-- Kỳ thu: hai kỳ tiền nhà của hợp đồng (1) — một đã đóng đủ, một còn mở.
insert into payment_periods (id, contract_id, type, due_on, period_from, period_to, amount_due) values
  ('9e000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'RENT', date '2026-08-10', date '2026-08-10', date '2026-09-10', 17000000),
  ('9e000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001',
   'RENT', date '2026-09-10', date '2026-09-10', date '2026-10-10', 17000000),
  ('9e000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001',
   'SERVICE', date '2026-09-01', date '2026-09-01', date '2026-09-30', 700000),
  -- kỳ của tổ chức B
  ('9b000000-0000-0000-0000-000000000001', 'cb100000-0000-0000-0000-000000000001',
   'RENT', date '2026-09-05', date '2026-09-05', date '2026-10-05', 11000000);

-- Kỳ tháng 8 đã thu đủ. Ghi qua bảng `payments` — KHÔNG ghi tay vào amount_paid;
-- trigger periods_recalc tự cập nhật. Đó chính là quy tắc file này cũng phải tuân theo.
insert into payments (period_id, amount, source, recorded_by) values
  ('9e000000-0000-0000-0000-000000000001', 17000000, 'MANUAL',
   '00000000-0000-0000-0000-00000000a002');

-- Một phiếu yêu cầu thanh toán đang mở cho kỳ tháng 9.
insert into payment_requests (id, contract_id, doc_no, code, bank_account_id, amount, qr_payload, status, created_by) values
  ('4e000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'YC-202609-0001', 'HC2609GD92T', 'ba000000-0000-0000-0000-00000000000a',
   17700000, '00020101021238...', 'SENT', '00000000-0000-0000-0000-00000000a002');

insert into payment_request_lines (request_id, period_id, amount) values
  ('4e000000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-000000000002', 17000000),
  ('4e000000-0000-0000-0000-000000000001', '9e000000-0000-0000-0000-000000000003',   700000);

-- Một đơn xin khất đang chờ duyệt — để test ngưỡng 7 ngày của quản lý.
insert into payment_extensions (id, contract_id, status, original_due, new_due, reason) values
  ('e0000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'PENDING', date '2026-09-10', date '2026-09-15', 'Khách báo lương về muộn 5 ngày'),
  ('e0000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001',
   'PENDING', date '2026-09-10', date '2026-10-05', 'Khách xin dời gần một tháng'),
  -- Đơn thứ ba để test "duyệt hộ người khác": phải còn PENDING lúc test chạy tới,
  -- nếu dùng lại đơn đã duyệt ở test trước thì RLS lọc nó đi và test luôn "đạt" giả.
  ('e0000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001',
   'PENDING', date '2026-09-10', date '2026-09-13', 'Khách xin dời 3 ngày');

commit;
