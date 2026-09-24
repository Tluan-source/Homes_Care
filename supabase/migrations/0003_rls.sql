-- ============================================================================
-- 0003 — Row Level Security
--
-- PHÂN QUYỀN NẰM Ở ĐÂY, KHÔNG NẰM Ở GIAO DIỆN.
--
-- Mã nguồn React Native giải nén ra đọc được, và ai cũng gọi thẳng được API của
-- Supabase bằng anon key. "App không hiện nút đó" không phải là bảo mật.
--
-- Hai quy tắc xuyên suốt:
--   1. Tiền của ai, sổ của người đó. Chủ khu S không được thấy doanh thu khu M.
--   2. Người ghi nhận ≠ người duyệt. Quản lý thu tiền thì không tự duyệt khoản mình thu.
-- ============================================================================

-- ---------------------------------------------------------------- hàm trợ giúp

-- Đặt trong schema riêng để không lẫn với bảng dữ liệu, và để PostgREST không phơi
-- chúng ra thành endpoint RPC (PostgREST chỉ phơi schema được khai báo, mặc định `public`).
create schema if not exists auth_helpers;

/*
 * Phải cấp USAGE cho `authenticated`.
 *
 * Biểu thức của policy chạy dưới quyền NGƯỜI ĐANG TRUY VẤN, không phải quyền chủ bảng.
 * Thiếu dòng này thì mọi câu SELECT của người dùng đều đổ lỗi
 * "permission denied for schema auth_helpers" — và triệu chứng đó rất dễ bị chẩn
 * đoán nhầm thành "RLS chặn", rồi ai đó sẽ đi nới policy để chữa, tức là chữa sai bệnh.
 */
grant usage on schema auth_helpers to authenticated, service_role;

create or replace function auth_helpers.my_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid();
$$;

/*
 * Vai PHẢI xét trong phạm vi tổ chức của chính người đó.
 *
 * Bản trước chỉ hỏi "người này có vai MANAGER ở đâu đó không" — nghĩa là một người
 * làm quản lý cho chủ nhà A sẽ mang theo vai đó khi đụng vào dữ liệu của chủ nhà B.
 * Các policy khác có chặn bằng can_see_unit(), nhưng đó là trông cậy vào việc mọi
 * policy đều nhớ ghép thêm điều kiện — một ngày nào đó sẽ có policy quên.
 */
create or replace function auth_helpers.has_role(p_role app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from memberships m
     where m.profile_id = auth.uid()
       and m.role = p_role
       and m.org_id = auth_helpers.my_org()
  );
$$;

/*
 * Tòa nào người này được đụng tới.
 *  - OWNER / MANAGER có membership KHÔNG gắn tòa → toàn bộ tòa trong tổ chức
 *  - membership gắn tòa → đúng tòa đó
 * Tách thành hàm riêng vì mọi policy dưới đây đều bám vào nó; sửa quy tắc phạm vi
 * thì sửa đúng một chỗ.
 */
create or replace function auth_helpers.my_towers() returns setof uuid
language sql stable security definer set search_path = public as $$
  select t.id
    from towers t
    join zones z on z.id = t.zone_id
   where z.org_id = auth_helpers.my_org()
     and exists (
       select 1 from memberships m
        where m.profile_id = auth.uid()
          and m.org_id = z.org_id
          and (m.tower_id is null or m.tower_id = t.id)
     );
$$;

create or replace function auth_helpers.can_see_unit(p_unit uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from units u
     where u.id = p_unit and u.tower_id in (select auth_helpers.my_towers())
  );
$$;

create or replace function auth_helpers.can_see_contract(p_contract uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from contracts c where c.id = p_contract and auth_helpers.can_see_unit(c.unit_id)
  );
$$;

-- ---------------------------------------------------------------- bật RLS

alter table orgs                  enable row level security;
alter table profiles              enable row level security;
alter table memberships           enable row level security;
alter table zones                 enable row level security;
alter table towers                enable row level security;
alter table units                 enable row level security;
alter table rooms                 enable row level security;
alter table contracts             enable row level security;
alter table contract_rooms        enable row level security;
alter table occupants             enable row level security;
alter table payment_extensions    enable row level security;
alter table payment_periods       enable row level security;
alter table bank_accounts         enable row level security;
alter table payment_requests      enable row level security;
alter table payment_request_lines enable row level security;
alter table bank_transactions     enable row level security;
alter table payments              enable row level security;
alter table receipts              enable row level security;
alter table audit_logs            enable row level security;

-- ---------------------------------------------------------------- người & tổ chức

create policy p_profiles_self on profiles for select
  using (id = auth.uid() or org_id = auth_helpers.my_org());

create policy p_orgs_mine on orgs for select using (id = auth_helpers.my_org());

create policy p_memberships_read on memberships for select
  using (org_id = auth_helpers.my_org());

-- Chỉ chủ nhà mới gán được vai. Không để quản lý tự nâng quyền cho mình.
create policy p_memberships_write on memberships for all
  using (org_id = auth_helpers.my_org() and auth_helpers.has_role('OWNER'))
  with check (org_id = auth_helpers.my_org() and auth_helpers.has_role('OWNER'));

-- ---------------------------------------------------------------- không gian

create policy p_zones_read on zones for select using (org_id = auth_helpers.my_org());

create policy p_towers_read on towers for select
  using (id in (select auth_helpers.my_towers()));

/*
 * Dựng khu và toà: CHỈ CHỦ NHÀ.
 *
 * Trước đây không có policy ghi nào cho hai bảng này, nghĩa là chính chủ nhà cũng
 * không tự tạo được toà đầu tiên — phải nhờ ai đó chạy SQL tay bằng service_role.
 * Đó không phải "bảo mật chặt", đó là sản phẩm không dùng được, và hệ quả thực tế
 * là service_role key sẽ bị đem ra dùng cho việc thường ngày.
 *
 * Hiếm khi dùng (mỗi toà một lần trong đời) nên khoá ở mức OWNER là đủ.
 */
create policy p_zones_write on zones for all
  using (org_id = auth_helpers.my_org() and auth_helpers.has_role('OWNER'))
  with check (org_id = auth_helpers.my_org() and auth_helpers.has_role('OWNER'));

create policy p_towers_write on towers for all
  using (exists (select 1 from zones z where z.id = zone_id
                  and z.org_id = auth_helpers.my_org()) and auth_helpers.has_role('OWNER'))
  with check (exists (select 1 from zones z where z.id = zone_id
                  and z.org_id = auth_helpers.my_org()) and auth_helpers.has_role('OWNER'));

create policy p_units_read on units for select
  using (tower_id in (select auth_helpers.my_towers()));

-- Sửa căn: quản lý được. Xoá: chỉ chủ nhà.
create policy p_units_write on units for insert
  with check (tower_id in (select auth_helpers.my_towers())
              and (auth_helpers.has_role('MANAGER') or auth_helpers.has_role('OWNER')));
create policy p_units_update on units for update
  using (tower_id in (select auth_helpers.my_towers())
         and (auth_helpers.has_role('MANAGER') or auth_helpers.has_role('OWNER')));
create policy p_units_delete on units for delete
  using (tower_id in (select auth_helpers.my_towers()) and auth_helpers.has_role('OWNER'));

create policy p_rooms_read on rooms for select using (auth_helpers.can_see_unit(unit_id));
create policy p_rooms_write on rooms for all
  using (auth_helpers.can_see_unit(unit_id)
         and (auth_helpers.has_role('MANAGER') or auth_helpers.has_role('OWNER')))
  with check (auth_helpers.can_see_unit(unit_id)
         and (auth_helpers.has_role('MANAGER') or auth_helpers.has_role('OWNER')));

-- ---------------------------------------------------------------- hợp đồng

create policy p_contracts_read on contracts for select using (auth_helpers.can_see_unit(unit_id));
create policy p_contracts_write on contracts for insert
  with check (auth_helpers.can_see_unit(unit_id)
              and (auth_helpers.has_role('MANAGER') or auth_helpers.has_role('OWNER')));
create policy p_contracts_update on contracts for update
  using (auth_helpers.can_see_unit(unit_id)
         and (auth_helpers.has_role('MANAGER') or auth_helpers.has_role('OWNER')));

create policy p_contract_rooms_all on contract_rooms for all
  using (auth_helpers.can_see_contract(contract_id))
  with check (auth_helpers.can_see_contract(contract_id));

create policy p_occupants_all on occupants for all
  using (auth_helpers.can_see_contract(contract_id))
  with check (auth_helpers.can_see_contract(contract_id));

-- ---------------------------------------------------------------- xin đóng trễ

create policy p_ext_read on payment_extensions for select
  using (auth_helpers.can_see_contract(contract_id));

-- Ai cũng TẠO được đơn xin (sau này khách thuê cũng tạo được).
create policy p_ext_create on payment_extensions for insert
  with check (auth_helpers.can_see_contract(contract_id) and status = 'PENDING');

/*
 * DUYỆT đơn xin khất = miễn phạt, nên đây là quyền đụng vào tiền.
 * Quản lý chỉ tự duyệt được khi dời KHÔNG QUÁ 7 ngày; quá thì phải chủ nhà.
 * Ngưỡng 7 ngày trùng với LATE_POLICY.managerApproveMaxDays trong core — đổi một bên
 * thì phải đổi bên kia, và có test DB canh chuyện đó.
 */
create policy p_ext_decide on payment_extensions for update
  -- CHỈ đơn đang chờ mới sửa được. Thiếu vế này thì một đơn đã duyệt 30 ngày vẫn
  -- bị sửa lại về sau, và dấu vết "ai duyệt cái gì" không còn đáng tin.
  using (auth_helpers.can_see_contract(contract_id) and status = 'PENDING')
  with check (
    -- Ai bấm duyệt thì tên người đó nằm trên đơn. Không duyệt hộ, không duyệt ẩn danh.
    decided_by = auth.uid()
    and status <> 'PENDING'
    and (
      auth_helpers.has_role('OWNER')
      or (auth_helpers.has_role('MANAGER') and (new_due - original_due) <= 7)
    )
  );

-- ---------------------------------------------------------------- tiền

create policy p_periods_read on payment_periods for select
  using (auth_helpers.can_see_contract(contract_id));

-- Kỳ thu do hệ thống sinh, người dùng KHÔNG ghi tay.
-- (Edge Function dùng service_role nên bỏ qua RLS.)

create policy p_requests_read on payment_requests for select
  using (auth_helpers.can_see_contract(contract_id));
create policy p_requests_write on payment_requests for insert
  with check (auth_helpers.can_see_contract(contract_id)
              and (auth_helpers.has_role('MANAGER') or auth_helpers.has_role('OWNER')));
create policy p_requests_update on payment_requests for update
  using (auth_helpers.can_see_contract(contract_id)
         and (auth_helpers.has_role('MANAGER') or auth_helpers.has_role('OWNER')));

create policy p_request_lines_read on payment_request_lines for select
  using (exists (select 1 from payment_requests r
                  where r.id = request_id and auth_helpers.can_see_contract(r.contract_id)));

-- Thiếu policy này thì `p_requests_write` ở trên là nút chết: tạo được phiếu nhưng
-- không gắn được kỳ nào vào phiếu, nên phiếu luôn rỗng.
-- Chỉ gắn được vào phiếu CHƯA gửi — phiếu đã gửi cho khách thì số tiền đã chốt.
create policy p_request_lines_write on payment_request_lines for insert
  with check (exists (
    select 1 from payment_requests r
     where r.id = request_id
       and r.status = 'DRAFT'
       and auth_helpers.can_see_contract(r.contract_id)
       and (auth_helpers.has_role('MANAGER') or auth_helpers.has_role('OWNER'))
  ));

/*
 * TIỀN CỦA AI, SỔ CỦA NGƯỜI ĐÓ.
 * Chủ nhà chỉ thấy tài khoản ngân hàng của mình. Quản lý thấy tài khoản của các tòa
 * mình phụ trách để còn tạo được QR, nhưng KHÔNG thấy số dư hay tổng thu của chủ khác.
 */
create policy p_bank_accounts_read on bank_accounts for select
  using (org_id = auth_helpers.my_org()
         and (owner_id = auth.uid() or auth_helpers.has_role('MANAGER')));
-- `org_id` phải khớp tổ chức của chính mình: thiếu vế này thì người dùng tự tạo được
-- một tài khoản ngân hàng mang org_id của chủ nhà khác, và tiền của họ chảy vào đó.
create policy p_bank_accounts_write on bank_accounts for all
  using (owner_id = auth.uid() and org_id = auth_helpers.my_org())
  with check (owner_id = auth.uid() and org_id = auth_helpers.my_org());

-- Giao dịch ngân hàng: CHỈ ĐỌC với người dùng. Ghi là việc của Edge Function.
create policy p_bank_tx_read on bank_transactions for select
  using (exists (
    select 1 from bank_accounts b
     where b.number = bank_transactions.account_number
       and b.org_id = auth_helpers.my_org()
       and (b.owner_id = auth.uid() or auth_helpers.has_role('MANAGER'))
  ));

create policy p_payments_read on payments for select
  using (exists (select 1 from payment_periods p
                  where p.id = period_id and auth_helpers.can_see_contract(p.contract_id)));

/*
 * NGƯỜI GHI NHẬN ≠ NGƯỜI DUYỆT.
 *
 * Ghi tay một khoản tiền (tiền mặt, ngân hàng chưa nối) là quyền của quản lý,
 * nhưng phải để lại dấu: recorded_by BẮT BUỘC là chính mình, không ghi hộ người khác.
 * Ai ghi thì tên người đó nằm trên phiếu, và nhật ký giữ vĩnh viễn.
 */
create policy p_payments_manual on payments for insert
  with check (
    source = 'MANUAL'
    and recorded_by = auth.uid()
    and (auth_helpers.has_role('MANAGER') or auth_helpers.has_role('OWNER'))
    and exists (select 1 from payment_periods p
                 where p.id = period_id and auth_helpers.can_see_contract(p.contract_id))
  );

-- Không ai được SỬA hay XOÁ một khoản tiền đã ghi. Sai thì ghi khoản đối ứng.
-- (không tạo policy update/delete = mặc định cấm)

create policy p_receipts_read on receipts for select
  using (exists (select 1 from payments pm
                  join payment_periods p on p.id = pm.period_id
                 where pm.id = payment_id and auth_helpers.can_see_contract(p.contract_id)));

create policy p_audit_read on audit_logs for select using (org_id = auth_helpers.my_org());
-- Ghi nhật ký: qua hàm security definer hoặc Edge Function. Không policy insert cho người dùng.

-- ---------------------------------------------------------------- quyền bảng

/*
 * RLS và GRANT là HAI lớp khác nhau, cả hai đều phải đúng.
 *
 *   GRANT  trả lời "được đụng vào BẢNG này không"
 *   RLS    trả lời "được đụng vào NHỮNG HÀNG NÀO trong bảng"
 *
 * Supabase có sẵn default privileges cấp quyền bảng cho `anon` và `authenticated`,
 * nhưng dựa vào đó là dựa vào một thiết lập vô hình ở ngoài file này. Viết rõ ra để
 * migration tự đủ, và để bất kỳ ai đọc file cũng thấy `anon` KHÔNG được cấp gì.
 *
 * `anon` = chưa đăng nhập. Sản phẩm này không có màn hình công khai nào, nên anon
 * không cần đọc bất cứ thứ gì. Mặc định là CẤM.
 */
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Thu hồi mọi thứ của anon, kể cả khi default privileges đã trót cấp.
revoke all on all tables in schema public from anon;

-- Bảng bộ đếm chứng từ (0004) và các bảng chỉ server đụng tới thì siết lại ở file
-- tương ứng — ở đây chỉ lo phần chung.

-- rollback: drop policy theo tên, alter table ... disable row level security.
