-- ============================================================================
-- 0002 — Ràng buộc và trigger ở tầng DATABASE
--
-- Những quy tắc trong file này KHÔNG THỂ đặt ở tầng app. Hai quản lý cùng bấm
-- "cho thuê" một phòng trong cùng một giây: giao diện không chặn được, unit test
-- không bắt được, chỉ database mới nhìn thấy cả hai transaction.
--
-- Đây cũng là lý do sản phẩm chạy ONLINE-ONLY: với chế độ offline, hai máy có thể
-- cùng ghi rồi đồng bộ sau, và lúc đó không còn tuyến phòng thủ nào.
-- ============================================================================

-- ---------------------------------------------------------------- mã căn

-- Ghép mã từ ba trường riêng. MỘT chỗ ghép duy nhất, dùng cho cả cột sinh ra lẫn
-- tìm kiếm — app không bao giờ được tự ghép theo cách khác.
-- 'S203' + tầng 6 + căn '24'  →  'S203.0624'
create or replace function unit_code(p_tower_code text, p_floor int, p_unit_no text)
returns text language sql immutable as $$
  select p_tower_code || '.' || lpad(p_floor::text, 2, '0') || p_unit_no;
$$;

alter table units add column code text;

create or replace function units_set_code() returns trigger language plpgsql as $$
declare v_tower text;
begin
  select code into v_tower from towers where id = new.tower_id;
  new.code := unit_code(v_tower, new.floor, new.unit_no);
  return new;
end $$;

create trigger units_code_biu before insert or update of tower_id, floor, unit_no
  on units for each row execute function units_set_code();

/*
 * MÃ CĂN KHÔNG BAO GIỜ ĐỔI (chốt với chủ dự án 24/09/2026).
 *
 * Vì đã chốt như vậy nên mã căn được in lên hợp đồng giấy, phiếu thu và nội dung
 * chuyển khoản. Nếu về sau ai đó sửa `floor` cho "gọn", mọi chứng từ đã in sẽ trỏ
 * vào một căn khác — và không có cách nào phát hiện, vì chứng từ giấy không tự cập
 * nhật. Chặn ngay ở đây rẻ hơn rất nhiều so với đi dò sau.
 *
 * Nhập sai lúc tạo thì xoá căn và tạo lại, khi nó chưa có hợp đồng nào.
 */
create or replace function units_code_immutable() returns trigger
language plpgsql as $$
begin
  raise exception
    'Mã căn không được đổi (% → %). Mã đã nằm trên hợp đồng và phiếu thu đã in. '
    'Nhập sai thì xoá căn và tạo lại khi nó chưa có hợp đồng.',
    unit_code((select code from towers where id = old.tower_id), old.floor, old.unit_no),
    unit_code((select code from towers where id = new.tower_id), new.floor, new.unit_no)
    using errcode = 'restrict_violation';
end $$;

create trigger units_code_frozen before update of tower_id, floor, unit_no on units
  for each row
  when (old.tower_id is distinct from new.tower_id
        or old.floor  is distinct from new.floor
        or old.unit_no is distinct from new.unit_no)
  execute function units_code_immutable();

create unique index units_code_uq on units (code);
-- Tìm kiếm bỏ dấu chấm: gõ 's2190501' hay 'S219.0501' đều phải ra.
create index units_code_norm on units (lower(replace(code, '.', '')));

-- ---------------------------------------------------------------- chiếm chỗ

-- Số chỗ một hợp đồng chiếm trong một phòng.
-- EXCLUSIVE chiếm TRỌN sức chứa dù ở ít người hơn — khách trả tiền để ở riêng.
--
-- KHÔNG kẹp về sức chứa bằng least(): kẹp đi thì thuê 5 chỗ trong phòng 2 chỗ sẽ
-- lặng lẽ thành 2 và không ai biết mình vừa nhập sai. Trả về đúng con số đã nhập,
-- để hàm kiểm tra bên dưới có cái mà từ chối.
create or replace function held_slots(p_mode room_hold_mode, p_slots int, p_capacity int)
returns int language sql immutable as $$
  select case when p_mode = 'EXCLUSIVE' then p_capacity else coalesce(p_slots, 1) end;
$$;

/*
 * MỨC THUÊ của một hợp đồng — SUY RA từ contract_rooms, không lưu.
 *   UNIT  : bao trọn mọi phòng của căn
 *   ROOM  : bao trọn ít nhất một phòng, nhưng không phải cả căn
 *   SLOT  : chỉ thuê lẻ từng chỗ
 * Dùng cho báo cáo và cho màn hình chọn giá. Vì suy ra nên không bao giờ lệch với
 * dữ liệu thật.
 */
create or replace function contract_scope(p_contract uuid) returns text
language plpgsql stable as $$
declare
  v_unit        uuid;
  v_taken       int;
  v_all_excl    boolean;
  v_any_excl    boolean;
  v_rooms_total int;
begin
  select c.unit_id into v_unit from contracts c where c.id = p_contract;
  if v_unit is null then return null; end if;

  select count(*), bool_and(cr.mode = 'EXCLUSIVE'), bool_or(cr.mode = 'EXCLUSIVE')
    into v_taken, v_all_excl, v_any_excl
    from contract_rooms cr where cr.contract_id = p_contract;

  if v_taken = 0 then return null; end if;

  select count(*) into v_rooms_total from rooms r where r.unit_id = v_unit;

  if v_all_excl and v_taken = v_rooms_total then return 'UNIT'; end if;
  if v_any_excl                             then return 'ROOM'; end if;
  return 'SLOT';
end $$;

/*
 * TUYẾN PHÒNG THỦ CHÍNH: không cho chiếm quá sức chứa phòng.
 *
 * Trigger chạy trong cùng transaction với lệnh ghi, và khoá hàng phòng lại
 * (FOR UPDATE) trước khi đếm. Hai transaction song song thì transaction thứ hai
 * phải chờ, đọc lại số đã chiếm, và bị chặn. Không có FOR UPDATE thì cả hai cùng
 * đọc "còn trống" rồi cùng ghi — đúng lỗi kinh điển.
 */
create or replace function contract_rooms_check_capacity() returns trigger
language plpgsql as $$
declare
  v_capacity int;
  v_held     int;
  v_adding   int;
  v_room     text;
  v_unit     uuid;
begin
  select r.capacity, r.name, r.unit_id into v_capacity, v_room, v_unit
    from rooms r where r.id = new.room_id
    for update;                        -- khoá hàng phòng: ai tới sau phải xếp hàng

  -- Phòng phải thuộc đúng căn ghi trên hợp đồng. Thiếu kiểm tra này thì một hợp
  -- đồng có thể gom phòng của hai căn khác nhau và mọi báo cáo theo căn sẽ sai.
  if v_unit is distinct from (select unit_id from contracts where id = new.contract_id) then
    raise exception 'Phòng % không thuộc căn ghi trên hợp đồng', v_room
      using errcode = 'foreign_key_violation';
  end if;

  v_adding := held_slots(new.mode, new.slots_held, v_capacity);

  if v_adding > v_capacity then
    raise exception 'Phòng % chỉ có % chỗ, không thuê được % chỗ',
      v_room, v_capacity, v_adding using errcode = 'check_violation';
  end if;

  /*
   * ĐẾM CẢ HỢP ĐỒNG NHÁP, không chỉ ACTIVE.
   *
   * Chỉ đếm ACTIVE là một lỗ thật: hai quản lý cùng tạo hợp đồng nháp cho một
   * phòng — cả hai lọt, vì lúc tạo chưa ai ACTIVE. Rồi cả hai bấm ký, và trigger
   * này không chạy lại (nó chỉ gắn vào contract_rooms). Kết quả là phòng 2 chỗ có
   * 4 người, phát hiện ra lúc khách dọn tới.
   *
   * Nháp giữ chỗ là ĐÚNG về nghiệp vụ: đang làm hợp đồng cho khách A thì khách B
   * không được chen. Nháp bỏ dở thì chuyển sang TERMINATED để nhả chỗ.
   */
  select coalesce(sum(held_slots(cr.mode, cr.slots_held, v_capacity)), 0)
    into v_held
    from contract_rooms cr
    join contracts c on c.id = cr.contract_id
   where cr.room_id = new.room_id
     and cr.contract_id <> new.contract_id
     and c.status in ('DRAFT', 'ACTIVE');

  if v_held + v_adding > v_capacity then
    raise exception
      'Phòng % đã có % / % chỗ bị chiếm, không nhận thêm % chỗ được',
      v_room, v_held, v_capacity, v_adding
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

create trigger contract_rooms_capacity_biu
  before insert or update on contract_rooms
  for each row execute function contract_rooms_check_capacity();

/*
 * TUYẾN THỨ HAI: kiểm lại lúc hợp đồng chuyển sang ACTIVE.
 *
 * Trigger trên chỉ chạy khi contract_rooms thay đổi. Một hợp đồng đã TERMINATED
 * (đã nhả chỗ) mà được bật lại thành ACTIVE sẽ không đi qua nó. Rẻ, và bịt đúng
 * đường vòng còn lại.
 */
create or replace function contracts_recheck_capacity() returns trigger
language plpgsql as $$
declare v record;
begin
  for v in
    select r.name, r.capacity,
           held_slots(cr.mode, cr.slots_held, r.capacity) as mine,
           coalesce((
             select sum(held_slots(o.mode, o.slots_held, r.capacity))
               from contract_rooms o join contracts c2 on c2.id = o.contract_id
              where o.room_id = cr.room_id
                and o.contract_id <> new.id
                and c2.status in ('DRAFT', 'ACTIVE')
           ), 0) as others
      from contract_rooms cr join rooms r on r.id = cr.room_id
     where cr.contract_id = new.id
  loop
    if v.others + v.mine > v.capacity then
      raise exception
        'Không kích hoạt được: phòng % đã có % / % chỗ bị chiếm bởi hợp đồng khác',
        v.name, v.others, v.capacity using errcode = 'check_violation';
    end if;
  end loop;
  return new;
end $$;

create trigger contracts_capacity_bu before update of status on contracts
  for each row when (new.status = 'ACTIVE' and old.status is distinct from 'ACTIVE')
  execute function contracts_recheck_capacity();

-- Người ở phải nằm trong một phòng mà hợp đồng có chiếm.
create or replace function occupants_check_room() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from contract_rooms
                  where contract_id = new.contract_id and room_id = new.room_id) then
    raise exception 'Hợp đồng này không thuê phòng đó, không xếp người vào được'
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end $$;

create trigger occupants_room_biu before insert or update on occupants
  for each row execute function occupants_check_room();

-- Mỗi hợp đồng đúng một người đại diện.
create unique index occupants_one_primary
  on occupants (contract_id) where is_primary;

-- ---------------------------------------------------------------- tiền

/*
 * amount_paid của kỳ thu là CỘT TÍNH RA từ bảng payments, không ai ghi tay.
 *
 * Đây là bản dịch sang SQL của bài học ở prototype v1.8: từng có hai chỗ cùng
 * trả lời "kỳ này đã đóng chưa" và chúng lệch nhau, kết quả là xử lý xong một giao
 * dịch mà danh sách căn hộ vẫn báo nợ. Giờ chỉ có payments là sự thật.
 */
/*
 * ⚠️ `security definer` Ở ĐÂY LÀ BẮT BUỘC — và đây là lỗi mà bộ test đã tóm được.
 *
 * Trigger thường chạy dưới quyền NGƯỜI GÂY RA nó. Bảng `payment_periods` cố ý không
 * có policy UPDATE nào (kỳ thu do hệ thống sinh, người dùng không ghi tay). Hệ quả:
 * khi quản lý ghi một khoản tiền mặt, trigger này chạy dưới quyền quản lý, câu UPDATE
 * bị RLS lọc sạch và **cập nhật 0 hàng — không hề báo lỗi**.
 *
 * Tiền vào sổ, kỳ thu vẫn OPEN, và danh sách căn hộ vẫn báo nợ. Đúng cái bệnh "hai
 * bộ máy tiền" của prototype v1.8, lần này núp dưới dạng một dòng RLS.
 *
 * `security definer` cho trigger tự bảo trì được cột tính ra của chính nó. Đây là
 * bất biến nội bộ của database, không phải một hành động của người dùng.
 */
create or replace function periods_recalc() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_period uuid := coalesce(new.period_id, old.period_id);
  v_paid   bigint;
  v_due    bigint;
begin
  select coalesce(sum(amount), 0) into v_paid from payments where period_id = v_period;
  select amount_due into v_due from payment_periods where id = v_period;

  -- Mở khoá `periods_guard_paid` đúng trong lúc trigger này ghi, rồi khoá lại ngay.
  -- `true` = chỉ trong transaction hiện tại, không rò sang phiên khác.
  perform set_config('homescare.recalc', 'on', true);

  update payment_periods
     set amount_paid = v_paid,
         status = case
           when v_paid >= v_due then 'PAID'::period_status
           when v_paid > 0      then 'PARTIAL'::period_status
           else 'OPEN'::period_status
         end
   where id = v_period;

  perform set_config('homescare.recalc', 'off', true);

  return null;
end $$;

create trigger payments_recalc_aiud
  after insert or update or delete on payments
  for each row execute function periods_recalc();

-- Không cho ghi tay vào cột tính ra.
create or replace function periods_guard_paid() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.amount_paid is distinct from old.amount_paid
     and current_setting('homescare.recalc', true) is distinct from 'on' then
    raise exception 'amount_paid là cột tính ra từ payments — ghi vào bảng payments, đừng sửa trực tiếp';
  end if;
  return new;
end $$;

/*
 * Trigger này TỪNG được viết mà quên gắn — nghĩa là suốt thời gian đó cột `amount_paid`
 * vẫn ghi tay được bởi bất kỳ ai có service_role (Edge Function, script seed, một
 * câu UPDATE gõ nhầm trong SQL editor). Gắn vào đây.
 *
 * Seed và các việc bảo trì hợp lệ mở khoá bằng:
 *     set local homescare.recalc = 'on';
 */
create trigger periods_guard_paid_bu before update on payment_periods
  for each row execute function periods_guard_paid();

-- Phiếu thu chỉ sinh khi đã có tiền thật — chặn ở DB, không chỉ chặn ở app.
create or replace function receipts_require_payment() returns trigger
language plpgsql as $$
begin
  if not exists (select 1 from payments where id = new.payment_id and amount > 0) then
    raise exception 'Phiếu thu phải gắn với một khoản tiền đã nhận';
  end if;
  return new;
end $$;

create trigger receipts_require_payment_bi before insert on receipts
  for each row execute function receipts_require_payment();

-- Nhật ký chỉ ghi thêm: chặn sửa và xoá ở tầng DB.
create or replace function audit_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'Nhật ký chỉ được ghi thêm. Sai thì ghi dòng đính chính.';
end $$;

create trigger audit_no_update before update or delete on audit_logs
  for each row execute function audit_append_only();

-- ---------------------------------------------------------------- view tiện dụng

/*
 * ⚠️ `security_invoker = true` LÀ BẮT BUỘC, KHÔNG PHẢI TUỲ CHỌN.
 *
 * Mặc định, view chạy với quyền của NGƯỜI TẠO RA VIEW — ở đây là vai chạy migration,
 * tức là vai bỏ qua RLS. Nghĩa là: mọi policy ở 0003 khoá bảng `units` lại rất kỹ,
 * nhưng bất kỳ ai cầm anon key gõ `select * from units_sorted` sẽ đọc được TOÀN BỘ
 * căn hộ của MỌI chủ nhà trong hệ thống. View trở thành cửa hậu đi vòng qua RLS.
 *
 * `security_invoker = true` bắt view chạy với quyền của người GỌI, nên policy trên
 * `units` được áp bình thường. Đây là lỗi kinh điển khi dùng RLS với view; thêm một
 * view mới thì nhớ thêm dòng này, và có test canh ở supabase/tests/.
 */

-- Giá cả căn = TỔNG giá các phòng. Không lưu, tính ra — để không bao giờ lệch.
create or replace view units_with_rent
  with (security_invoker = true) as
  select u.*, coalesce((select sum(r.rent) from rooms r where r.unit_id = u.id), 0) as rent,
         coalesce((select sum(r.capacity) from rooms r where r.unit_id = u.id), 0) as capacity
    from units u;

-- Sắp xếp theo TRƯỜNG, không theo chuỗi mã.
create or replace view units_sorted
  with (security_invoker = true) as
  select u.*, z.code as zone_code, t.code as tower_code, t.no as tower_no
    from units_with_rent u
    join towers t on t.id = u.tower_id
    join zones  z on z.id = t.zone_id
   order by z.code, t.no, u.floor, u.unit_no;

-- rollback: drop trigger và function theo tên, drop view.
