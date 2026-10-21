-- ============================================================================
-- DỮ LIỆU MẪU CHO STAGING — để mở app lên là thấy các màn có số liệu.
--
-- CHỈ CHẠY TRÊN PROJECT STAGING. KHÔNG BAO GIỜ trên production.
-- Chạy SAU khi đã tạo chủ nhà đầu tiên (docs/DEPLOY.md §7), trong SQL Editor.
--
--   1. Sửa dòng c_email bên dưới thành email chủ nhà bạn đã tạo.
--   2. Sửa c_bank_* thành TÀI KHOẢN THẬT đã liên kết SePay nếu muốn thử QR + tiền thật.
--   3. Run. Chạy lại lần hai sẽ báo lỗi trùng — xoá dữ liệu cũ trước (cuối file).
--
-- Sinh: 2 khu · 3 tòa · 30 căn · ~24 hợp đồng · kỳ thu từ ngày vào ở tới nay.
-- Phần lớn đã đóng đủ; một số còn nợ (quá hạn, sắp tới hạn) để màn Cần xử lý có việc.
-- ============================================================================

do $$
declare
  c_email       constant text := 'chu.nha@example.com';   -- ← SỬA
  c_bank_id     constant text := 'MB';                    -- ← MB / VCB / TCB / BIDV ...
  c_bank_number constant text := '0123456789';            -- ← SỬA nếu thử tiền thật
  c_bank_holder constant text := 'NGUYEN VAN A';          -- ← SỬA

  v_owner uuid; v_org uuid;
  v_zone_s uuid; v_zone_h uuid;
  v_tower uuid; v_unit uuid; v_contract uuid; v_room uuid;
  tw record; i int; k int; r int; n_rooms int;
  v_floor int; v_no text; v_rent bigint; v_fee bigint; v_cycle int;
  v_move date; v_end date; v_due date; v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_pid uuid; v_behind boolean; v_people int;
  ho text[] := array['Nguyễn','Trần','Lê','Phạm','Hoàng','Vũ','Đặng','Bùi','Đỗ','Ngô'];
  dem text[] := array['Văn','Thị','Minh','Quốc','Gia','Hải','Thu','Anh','Bảo','Khánh'];
  ten text[] := array['An','Bình','Châu','Dũng','Duyên','Giang','Hà','Hiếu','Huy','Lâm','Linh','Mai','Nam','Ngân','Quân','Sơn','Tâm','Thảo','Tuấn','Vy'];
begin
  perform setseed(0.2609);   -- cùng một bộ dữ liệu mỗi lần chạy

  select p.id, p.org_id into v_owner, v_org
    from profiles p join auth.users u on u.id = p.id
   where lower(u.email) = lower(c_email);
  if v_owner is null then
    raise exception 'Không tìm thấy chủ nhà có email % — tạo theo DEPLOY.md §7 trước', c_email;
  end if;

  insert into bank_accounts (org_id, owner_id, bank_id, number, holder)
  values (v_org, v_owner, c_bank_id, c_bank_number, c_bank_holder)
  on conflict (bank_id, number) do nothing;

  insert into zones (org_id, code, name) values (v_org, 'S', 'Khu S') returning id into v_zone_s;
  insert into zones (org_id, code, name) values (v_org, 'H', 'Khu H') returning id into v_zone_h;

  for tw in select * from (values
      (v_zone_s, 'S12', 12, 'Tòa S12', 12),
      (v_zone_s, 'S219', 219, 'Tòa S219', 10),
      (v_zone_h, 'H7', 7, 'Tòa H7', 8)) as x(zone_id, code, no, name, units)
  loop
    insert into towers (zone_id, code, no, name) values (tw.zone_id, tw.code, tw.no, tw.name) returning id into v_tower;

    for i in 1..tw.units loop
      v_floor := 2 + (i - 1) / 2 * 3;
      v_no := lpad(((i - 1) % 2 * 6 + 2 + (random() * 3)::int)::text, 2, '0');
      n_rooms := case when random() < 0.35 then 1 when random() < 0.85 then 2 else 3 end;
      v_fee := case n_rooms when 1 then 500000 when 2 then 700000 else 900000 end;

      insert into units (tower_id, floor, unit_no, bedrooms, bathrooms, area_m2, service_fee, maintenance, maintenance_note)
      values (v_tower, v_floor, v_no, n_rooms, greatest(1, n_rooms - 1 + (random() < 0.5)::int), 30 + n_rooms * 17,
              v_fee, i = 3, case when i = 3 then 'Thấm trần nhà vệ sinh, thợ hẹn tuần sau' end)
      on conflict (tower_id, floor, unit_no) do nothing
      returning id into v_unit;
      continue when v_unit is null;

      v_rent := 0;
      for r in 1..n_rooms loop
        insert into rooms (unit_id, name, capacity, rent, sort)
        values (v_unit, 'PN' || r, 2, (case r when 1 then 9500000 when 2 then 8000000 else 7000000 end), r);
        v_rent := v_rent + (case r when 1 then 9500000 when 2 then 8000000 else 7000000 end);
      end loop;

      -- căn bảo trì + ~15% căn trống: không có hợp đồng
      continue when i = 3 or random() < 0.15;

      v_cycle := (array[1, 1, 2, 3, 3, 6])[1 + (random() * 5)::int];
      v_move := v_today - (30 + (random() * 280)::int);
      v_end := (v_move + interval '1 year')::date;
      v_behind := random() < 0.25;

      insert into contracts (unit_id, code, status, rent, service_fee, cycle_months, deposit_months, move_in, ends_on, pay_mode, created_by)
      values (v_unit, (select code from units where id = v_unit) || '-01', 'ACTIVE', v_rent, v_fee, v_cycle, 1, v_move, v_end, 'REPRESENTATIVE', v_owner)
      returning id into v_contract;

      insert into contract_rooms (contract_id, room_id, mode)
      select v_contract, id, 'EXCLUSIVE' from rooms where unit_id = v_unit;

      v_people := 1 + (random() * (n_rooms * 2 - 1))::int;
      for k in 1..v_people loop
        select id into v_room from rooms where unit_id = v_unit order by sort offset ((k - 1) / 2) % n_rooms limit 1;
        insert into occupants (contract_id, room_id, full_name, is_primary, phone, id_number, id_issued_by)
        values (v_contract, v_room,
                ho[1 + (random() * 9)::int] || ' ' || dem[1 + (random() * 9)::int] || ' ' || ten[1 + (random() * 19)::int],
                k = 1,
                '09' || lpad((random() * 99999999)::bigint::text, 8, '0'),
                '0' || lpad((random() * 99999999999)::bigint::text, 11, '0'),
                'Cục CS QLHC về TTXH');
      end loop;

      -- Kỳ tiền nhà: NEO theo ngày vào ở — cộng tháng TỪ NGÀY GỐC mỗi lần (31/01 → 28/02 → 31/03),
      -- đúng quy tắc addMonthsAnchored của core.
      k := 0;
      loop
        v_due := (v_move + make_interval(months => k * v_cycle))::date;
        exit when v_due >= v_end or v_due > v_today + 20;
        insert into payment_periods (contract_id, type, due_on, period_from, period_to, amount_due)
        values (v_contract, 'RENT', v_due, v_due, (v_move + make_interval(months => (k + 1) * v_cycle))::date, v_rent * v_cycle)
        returning id into v_pid;
        -- đã đóng: mọi kỳ đã qua, TRỪ kỳ gần nhất của các căn "đang nợ"
        if v_due < v_today - (case when v_behind then 40 else 0 end) then
          insert into payments (period_id, amount, source, recorded_by, note)
          values (v_pid, v_rent * v_cycle, 'MANUAL', v_owner, 'dữ liệu mẫu');
        end if;
        k := k + 1;
      end loop;

      -- Kỳ dịch vụ: tháng dương lịch, hạn ngày 1 (tháng đầu tính từ ngày vào ở).
      k := 0;
      loop
        v_due := case when k = 0 then v_move else (date_trunc('month', v_move) + make_interval(months => k))::date end;
        exit when v_due >= v_end or v_due > v_today + 20;
        insert into payment_periods (contract_id, type, due_on, period_from, period_to, amount_due)
        values (v_contract, 'SERVICE', v_due, v_due,
                (date_trunc('month', v_due) + interval '1 month - 1 day')::date,
                case when k = 0 then (v_fee * (extract(day from date_trunc('month', v_move) + interval '1 month - 1 day') - extract(day from v_move) + 1)
                                      / extract(day from date_trunc('month', v_move) + interval '1 month - 1 day'))::bigint / 1000 * 1000
                     else v_fee end)
        returning id into v_pid;
        if v_due < v_today - (case when v_behind and random() < 0.5 then 35 else 0 end) then
          insert into payments (period_id, amount, source, recorded_by, note)
          select v_pid, amount_due, 'MANUAL', v_owner, 'dữ liệu mẫu' from payment_periods where id = v_pid and amount_due > 0;
        end if;
        k := k + 1;
      end loop;
    end loop;
  end loop;

  raise notice 'Xong: % căn, % hợp đồng, % kỳ thu',
    (select count(*) from units u join towers t on t.id = u.tower_id join zones z on z.id = t.zone_id where z.org_id = v_org),
    (select count(*) from contracts c join units u on u.id = c.unit_id join towers t on t.id = u.tower_id join zones z on z.id = t.zone_id where z.org_id = v_org),
    (select count(*) from payment_periods p join contracts c on c.id = p.contract_id join units u on u.id = c.unit_id join towers t on t.id = u.tower_id join zones z on z.id = t.zone_id where z.org_id = v_org);
end $$;

-- ---------------------------------------------------------------- xoá để chạy lại
-- Bỏ ghi chú khối dưới, sửa email, rồi Run — xoá SẠCH khu/tòa/căn/hợp đồng của chủ nhà đó.
-- Nhật ký (audit_logs) chỉ-ghi-thêm nên không xoá được — đúng như thiết kế.
/*
do $$
declare v_org uuid;
begin
  select p.org_id into v_org from profiles p join auth.users u on u.id = p.id where lower(u.email) = lower('chu.nha@example.com');
  delete from payments where period_id in (select p.id from payment_periods p join contracts c on c.id = p.contract_id
    join units u on u.id = c.unit_id join towers t on t.id = u.tower_id join zones z on z.id = t.zone_id where z.org_id = v_org);
  delete from contracts where unit_id in (select u.id from units u join towers t on t.id = u.tower_id join zones z on z.id = t.zone_id where z.org_id = v_org);
  delete from units where tower_id in (select t.id from towers t join zones z on z.id = t.zone_id where z.org_id = v_org);
  delete from towers where zone_id in (select id from zones where org_id = v_org);
  delete from zones where org_id = v_org;
end $$;
*/
