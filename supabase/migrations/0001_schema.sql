-- ============================================================================
-- 0001 — Lược đồ gốc
--
-- Quy ước migration: MỘT file một lần thay đổi, đánh số tăng dần, KHÔNG BAO GIỜ
-- sửa file đã chạy trên production. Muốn đổi thì thêm file mới.
--
-- Quy ước đặt tên: bảng số nhiều, cột snake_case, tiền là bigint VNĐ nguyên,
-- thời điểm là timestamptz (lưu UTC, hiển thị Asia/Ho_Chi_Minh ở tầng app).
-- ============================================================================

create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "btree_gist";    -- ràng buộc loại trừ theo khoảng

-- ---------------------------------------------------------------- tổ chức & người

create type app_role as enum ('OWNER', 'MANAGER', 'STAFF', 'TENANT');

create table orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- Hồ sơ người dùng, nối 1-1 với auth.users của Supabase.
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  org_id      uuid not null references orgs(id) on delete restrict,
  full_name   text not null,
  phone       text,
  created_at  timestamptz not null default now()
);

-- Một người có thể vừa là chủ khu S vừa là quản lý tòa M — nên vai là BẢNG,
-- không phải cột trên profiles.
create table memberships (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references profiles(id) on delete cascade,
  org_id      uuid not null references orgs(id) on delete cascade,
  role        app_role not null,
  -- null = áp cho toàn tổ chức; có giá trị = chỉ trong phạm vi tòa đó
  tower_id    uuid,
  created_at  timestamptz not null default now()
);
create index on memberships (profile_id);
create index on memberships (org_id, role);
-- Không gán trùng một vai hai lần. `tower_id` null nên phải dùng unique index có
-- coalesce — ràng buộc UNIQUE thường coi mọi null là khác nhau và sẽ cho lọt.
create unique index memberships_uq
  on memberships (profile_id, org_id, role, coalesce(tower_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------- không gian

create table zones (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references orgs(id) on delete cascade,
  code      text not null,                      -- 'S'
  name      text not null,                      -- 'Khu S'
  unique (org_id, code)
);

create table towers (
  id        uuid primary key default gen_random_uuid(),
  zone_id   uuid not null references zones(id) on delete restrict,
  code      text not null,                      -- 'S219'
  -- Số hiệu tòa dạng SỐ để sắp xếp. Không đệm 0 được vì đây là tên có thật ngoài đời;
  -- so chuỗi sẽ ra H120 → H213 → H7, trong khi đúng phải là H7 → H120 → H213.
  no        int  not null,
  name      text not null,
  unique (zone_id, code)
);

alter table memberships
  add constraint memberships_tower_fk foreign key (tower_id) references towers(id) on delete cascade;

/*
 * MÃ CĂN — chốt với chủ dự án 24/09/2026:
 *
 *     S203.0624   →  toà S203 · tầng 06 · căn thứ 24 trong tầng
 *     S215.1229   →  toà S215 · tầng 12 · căn thứ 29 trong tầng
 *
 * Tầng và số căn LUÔN hai chữ số, đệm 0. Mã căn **không bao giờ thay đổi** (chốt
 * cùng ngày) — nên nó xuất hiện trên hợp đồng in ra, phiếu thu và nội dung chuyển
 * khoản, và có trigger chặn sửa ở 0002.
 *
 * BA TRƯỜNG RIÊNG vẫn là nguồn sự thật, mã chỉ là thứ ghép ra. Không bao giờ tách
 * ngược từ chuỗi: '1512' là tầng 15 căn 12 hay tầng 1 căn 512? Không có cách nào
 * biết chắc — trừ khi luôn đệm 2 chữ số, đó chính là lý do bắt buộc đệm.
 */
create table units (
  id            uuid primary key default gen_random_uuid(),
  tower_id      uuid not null references towers(id) on delete restrict,
  floor         int  not null check (floor between 1 and 99),
  -- Hai chữ số, cho phép một hậu tố chữ ('05A') phòng khi có căn tách đôi.
  unit_no       text not null check (unit_no ~ '^[0-9]{2}[A-Z]?$'),
  bedrooms      int  not null check (bedrooms > 0),
  bathrooms     int  not null check (bathrooms >= 0),
  area_m2       numeric(6,1),
  service_fee   bigint not null default 0 check (service_fee >= 0),
  maintenance   boolean not null default false,
  maintenance_note text,
  created_at    timestamptz not null default now(),
  unique (tower_id, floor, unit_no)
);

-- Cột `code` được thêm ở 0002 cùng với hàm ghép mã. Cố ý KHÔNG dùng cột sinh ra
-- (`generated always as`): biểu thức của cột sinh ra không tham chiếu được bảng
-- khác, mà mã căn cần `towers.code`.

create table rooms (
  id        uuid primary key default gen_random_uuid(),
  unit_id   uuid not null references units(id) on delete cascade,
  name      text not null,                      -- 'PN1'
  -- Sức chứa = số chỗ nằm. KHÔNG phải số người đang ở.
  capacity  int  not null check (capacity between 1 and 8),
  -- GIÁ GỐC NẰM Ở PHÒNG. Giá cả căn là tổng — xem view units_with_rent.
  rent      bigint not null check (rent >= 0),
  sort      int not null default 0,
  unique (unit_id, name)
);
create index on rooms (unit_id);

-- ---------------------------------------------------------------- hợp đồng

create type contract_status  as enum ('DRAFT', 'ACTIVE', 'ENDED', 'TERMINATED');
create type room_hold_mode   as enum ('EXCLUSIVE', 'SHARED');
create type pay_mode         as enum ('REPRESENTATIVE', 'SPLIT_EQUAL');

create table contracts (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid not null references units(id) on delete restrict,
  code            text not null unique,
  status          contract_status not null default 'DRAFT',
  rent            bigint not null check (rent >= 0),     -- MỖI THÁNG
  service_fee     bigint not null default 0 check (service_fee >= 0),
  cycle_months    int not null check (cycle_months between 1 and 12),
  deposit_months  int not null default 1 check (deposit_months >= 0),
  move_in         date not null,
  ends_on         date not null,
  pay_mode        pay_mode not null default 'REPRESENTATIVE',
  -- Gia hạn tạo HỢP ĐỒNG MỚI trỏ về cũ, để giữ lịch sử giá (HĐ Điều 5 cho tăng ≤10%/năm).
  renewed_from_id uuid references contracts(id) on delete set null,
  note            text,
  created_by      uuid references profiles(id),
  created_at      timestamptz not null default now(),
  check (ends_on > move_in)
);
create index on contracts (unit_id, status);

/*
 * BA MỨC THUÊ, một bảng duy nhất — chốt với chủ dự án 24/09/2026:
 *
 *   thuê 1 CHỖ    → một dòng SHARED, slots_held = 1     (tính tiền 1 chỗ)
 *   bao 1 PHÒNG   → một dòng EXCLUSIVE                  (tính tiền cả phòng)
 *   bao CẢ NHÀ    → EXCLUSIVE cho MỌI phòng của căn     (tính tiền cả nhà)
 *
 * Cố ý KHÔNG thêm cột `scope` trên `contracts`: một cột như vậy có thể nói
 * 'UNIT' trong khi bảng này chỉ có 2/3 phòng, và lúc đó không biết tin bên nào.
 * Mức thuê được SUY RA, xem hàm contract_scope() ở 0002.
 */
create table contract_rooms (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  room_id     uuid not null references rooms(id) on delete restrict,
  mode        room_hold_mode not null,
  -- EXCLUSIVE chiếm trọn sức chứa nên slots_held VÔ NGHĨA và phải để trống.
  -- Cho phép điền sẽ sinh ra dòng tự mâu thuẫn: EXCLUSIVE + slots_held = 1.
  slots_held  int,
  check (
    (mode = 'EXCLUSIVE' and slots_held is null)
    or (mode = 'SHARED' and slots_held >= 1)
  ),
  unique (contract_id, room_id)
);
create index on contract_rooms (room_id);

create table occupants (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references contracts(id) on delete cascade,
  room_id       uuid not null references rooms(id) on delete restrict,
  full_name     text not null,
  is_primary    boolean not null default false,
  phone         text,
  id_number     text,                            -- CCCD
  id_issued_on  date,
  id_issued_by  text,
  address       text,
  dob           date,
  id_front_path text,                            -- đường dẫn trong Supabase Storage
  id_back_path  text,
  created_at    timestamptz not null default now()
);
create index on occupants (contract_id);

-- Xin đóng trễ. DUYỆT = miễn phạt tới new_due, nên đây là quyền đụng vào tiền.
create type extension_status as enum ('PENDING', 'APPROVED', 'REJECTED');

create table payment_extensions (
  id            uuid primary key default gen_random_uuid(),
  contract_id   uuid not null references contracts(id) on delete cascade,
  status        extension_status not null default 'PENDING',
  original_due  date not null,
  new_due       date not null,
  reason        text not null,
  requested_at  timestamptz not null default now(),
  decided_by    uuid references profiles(id),
  decided_at    timestamptz,
  check (new_due > original_due)
);
create index on payment_extensions (contract_id, status);

-- ---------------------------------------------------------------- tiền

create type invoice_type   as enum ('RENT', 'SERVICE');
create type period_status  as enum ('OPEN', 'PARTIAL', 'PAID', 'WAIVED');

-- KỲ THU — nguồn sự thật về "phải thu bao nhiêu, đã thu bao nhiêu".
create table payment_periods (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  type        invoice_type not null,
  due_on      date not null,
  period_from date not null,
  period_to   date not null,
  amount_due  bigint not null check (amount_due >= 0),
  -- Cột TÍNH RA từ payments, cập nhật bằng trigger. Không ai được ghi tay vào đây.
  amount_paid bigint not null default 0 check (amount_paid >= 0),
  status      period_status not null default 'OPEN',
  -- Một hợp đồng không thể có hai kỳ cùng loại cùng ngày tới hạn.
  unique (contract_id, type, due_on)
);
create index on payment_periods (due_on) where status <> 'PAID';
create index on payment_periods (contract_id);

-- YÊU CẦU THANH TOÁN (phiếu báo tiền) — KHÁC phiếu thu.
create type request_status as enum ('DRAFT', 'SENT', 'SETTLED', 'CANCELLED');

create table bank_accounts (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid not null references orgs(id) on delete cascade,
  owner_id  uuid not null references profiles(id) on delete restrict,
  bank_id   text not null,                       -- 'MB' — khớp BANKS trong core
  number    text not null,
  holder    text not null,
  unique (bank_id, number)
);

create table payment_requests (
  id          uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  doc_no      text not null unique,              -- 'YC-202609-0001' — cho người đọc
  -- MÃ THANH TOÁN nằm trong nội dung chuyển khoản. Khoá đối soát DUY NHẤT.
  -- Có ký tự kiểm tra, xem packages/core/src/payment/code.ts
  code        text not null unique,
  bank_account_id uuid not null references bank_accounts(id) on delete restrict,
  amount      bigint not null check (amount > 0),
  -- Phần phạt trễ nằm trong amount, tách ra đây để soát lại được.
  penalty     bigint not null default 0 check (penalty >= 0),
  qr_payload  text not null,
  status      request_status not null default 'DRAFT',
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  sent_at     timestamptz
);
create index on payment_requests (contract_id, status);

-- Một phiếu gom nhiều kỳ: tiền nhà kỳ này + công nợ cũ, một mã một QR.
create table payment_request_lines (
  request_id uuid not null references payment_requests(id) on delete cascade,
  period_id  uuid not null references payment_periods(id) on delete restrict,
  amount     bigint not null check (amount >= 0),
  primary key (request_id, period_id)
);

-- GIAO DỊCH NGÂN HÀNG — nguyên bản từ webhook, không sửa.
create table bank_transactions (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null default 'sepay',
  -- CHỐNG GHI TRÙNG. SePay retry tới 7 lần trong 5 giờ; thiếu ràng buộc này là
  -- ghi nhận một khoản tiền hai lần.
  provider_tx_id text not null,
  account_number text not null,
  amount        bigint not null,
  content       text not null default '',
  reference_code text,
  occurred_at   timestamptz not null,
  raw_payload   jsonb not null,
  received_at   timestamptz not null default now(),
  unique (provider, provider_tx_id)
);
create index on bank_transactions (occurred_at desc);

-- Gán tiền vào kỳ. Một giao dịch có thể phủ nhiều kỳ.
create table payments (
  id          uuid primary key default gen_random_uuid(),
  period_id   uuid not null references payment_periods(id) on delete restrict,
  transaction_id uuid references bank_transactions(id) on delete restrict,
  amount      bigint not null check (amount > 0),
  -- 'AUTO' khi đối soát khớp; 'MANUAL' khi người ghi tay (tiền mặt, ngân hàng chưa nối).
  source      text not null check (source in ('AUTO', 'MANUAL')),
  recorded_by uuid references profiles(id),
  recorded_at timestamptz not null default now(),
  note        text
);
create index on payments (period_id);
create index on payments (transaction_id);

-- PHIẾU THU — chỉ sinh SAU KHI tiền thật sự về. Sinh sớm là tự tạo chứng từ nói dối.
create table receipts (
  id          uuid primary key default gen_random_uuid(),
  doc_no      text not null unique,              -- 'PT-202609-0001'
  payment_id  uuid not null references payments(id) on delete restrict,
  issued_at   timestamptz not null default now(),
  issued_by   uuid references profiles(id)
);

-- NHẬT KÝ — sổ CHỈ GHI THÊM. Sai thì ghi dòng đính chính, không sửa dòng cũ.
create table audit_logs (
  id          bigserial primary key,
  org_id      uuid references orgs(id) on delete cascade,
  at          timestamptz not null default now(),
  actor_type  text not null,                     -- 'USER' | 'SYSTEM' | 'SEPAY'
  actor_id    uuid references profiles(id),
  action      text not null,
  entity_type text,                              -- 'payment_request' | 'receipt' | ...
  entity_id   text,                              -- SỐ chứng từ, thứ người đọc ra miệng
  unit_id     uuid references units(id) on delete set null,
  amount      bigint,
  meta        jsonb not null default '{}'::jsonb
);
create index on audit_logs (unit_id, at desc);
create index on audit_logs (org_id, at desc);

-- rollback: drop tất cả bảng theo thứ tự ngược, rồi drop các type và extension.
