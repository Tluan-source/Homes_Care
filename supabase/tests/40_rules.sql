-- ============================================================================
-- QUY TẮC NGHIỆP VỤ CẮM Ở DATABASE
--
-- Những thứ trong file này không phải chuyện phân quyền — chúng là các quy tắc mà
-- chỉ database mới giữ nổi, vì hai người bấm cùng lúc thì giao diện không thấy gì
-- và unit test cũng không.
-- ============================================================================

do $$
declare
  w         record;
  v_c       uuid;
  v_err     text;
begin
  select * into w from t.who;

  -- ------------------------------------------------ mã căn

  perform t.eq('Mã căn ghép đúng quy ước [Toà].[tầng 2 số][căn 2 số]',
    (select code from units where id = 'c0000000-0000-0000-0000-000000000624'), 'S203.0624');

  perform t.eq('Tầng 12 căn 29 ra S215.1229, không phải S215.1229 hiểu nhầm thành tầng 1',
    (select code from units where id = 'c0000000-0000-0000-0000-000000001229'), 'S215.1229');

  begin
    update units set floor = 7 where id = 'c0000000-0000-0000-0000-000000000624';
    v_err := null;
  exception when others then v_err := sqlstate; end;
  perform t.blocked('Mã căn KHÔNG đổi được — đã in trên hợp đồng và phiếu thu', v_err);

  begin
    insert into units (tower_id, floor, unit_no, bedrooms, bathrooms)
    values ('7a000000-0000-0000-0000-000000000203', 6, '7', 1, 1);
    v_err := null;
  exception when others then v_err := sqlstate; end;
  perform t.blocked('Số căn phải hai chữ số — "7" bị từ chối, nếu không mã sẽ nhập nhằng', v_err);

  -- ------------------------------------------------ ba mức thuê

  perform t.eq('Bao cả nhà (EXCLUSIVE mọi phòng) → mức UNIT',
    contract_scope('c1000000-0000-0000-0000-000000000001'), 'UNIT');
  perform t.eq('Thuê lẻ một chỗ → mức SLOT',
    contract_scope('c1000000-0000-0000-0000-000000000002'), 'SLOT');
  perform t.eq('Bao trọn một phòng trong căn ở ghép → mức ROOM',
    contract_scope('c1000000-0000-0000-0000-000000000003'), 'ROOM');

  -- ------------------------------------------------ sức chứa

  -- PN1 của S215.1229 có 2 chỗ, đã có 1 người thuê lẻ. Thuê thêm 1 chỗ: được.
  insert into contracts (id, unit_id, code, status, rent, service_fee, cycle_months,
                         deposit_months, move_in, ends_on)
  values (gen_random_uuid(), 'c0000000-0000-0000-0000-000000001229', 'TEST-CAP-1', 'DRAFT',
          5000000, 300000, 1, 1, date '2026-09-01', date '2027-09-01')
  returning id into v_c;

  begin
    insert into contract_rooms (contract_id, room_id, mode, slots_held)
    values (v_c, '40000000-0000-0000-0000-000000122901', 'SHARED', 1);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform t.allowed('Chỗ thứ 2 trong phòng 2 chỗ: nhận được', v_err);

  -- Chỗ thứ 3 thì không.
  insert into contracts (id, unit_id, code, status, rent, service_fee, cycle_months,
                         deposit_months, move_in, ends_on)
  values (gen_random_uuid(), 'c0000000-0000-0000-0000-000000001229', 'TEST-CAP-2', 'DRAFT',
          5000000, 300000, 1, 1, date '2026-09-01', date '2027-09-01')
  returning id into v_c;

  begin
    insert into contract_rooms (contract_id, room_id, mode, slots_held)
    values (v_c, '40000000-0000-0000-0000-000000122901', 'SHARED', 1);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform t.blocked('Chỗ thứ 3 trong phòng 2 chỗ: bị từ chối', v_err);

  /*
   * ĐÂY LÀ TEST QUAN TRỌNG NHẤT CỦA FILE.
   *
   * Hợp đồng NHÁP cũng phải giữ chỗ. Trước khi sửa, hàm kiểm tra chỉ đếm hợp đồng
   * ACTIVE — nghĩa là hai quản lý cùng làm hợp đồng nháp cho một phòng thì cả hai
   * đều lọt (lúc đó chưa ai ACTIVE), rồi cả hai cùng bấm ký. Phòng 2 chỗ có 4 người,
   * và phát hiện ra vào đúng ngày khách dọn tới.
   */
  begin
    insert into contract_rooms (contract_id, room_id, mode, slots_held)
    values (v_c, '40000000-0000-0000-0000-000000122903', 'EXCLUSIVE', null);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform t.blocked('Phòng đã bị một hợp đồng khác bao trọn: không nhận thêm', v_err);

  -- Thuê nhiều chỗ hơn sức chứa: từ chối thẳng, không lặng lẽ cắt bớt.
  begin
    insert into contract_rooms (contract_id, room_id, mode, slots_held)
    values (v_c, '40000000-0000-0000-0000-000000122902', 'SHARED', 5);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform t.blocked('Thuê 5 chỗ trong phòng 2 chỗ: từ chối, không lặng lẽ cắt còn 2', v_err);

  -- EXCLUSIVE mà điền slots_held là dòng tự mâu thuẫn.
  begin
    insert into contract_rooms (contract_id, room_id, mode, slots_held)
    values (v_c, '40000000-0000-0000-0000-000000122902', 'EXCLUSIVE', 1);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform t.blocked('EXCLUSIVE + slots_held là dòng tự mâu thuẫn: từ chối', v_err);

  -- Phòng của căn khác.
  begin
    insert into contract_rooms (contract_id, room_id, mode, slots_held)
    values (v_c, '40000000-0000-0000-0000-000000062401', 'EXCLUSIVE', null);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform t.blocked('Phòng không thuộc căn ghi trên hợp đồng: từ chối', v_err);

  -- ------------------------------------------------ người ở

  begin
    insert into occupants (contract_id, room_id, full_name)
    values ('c1000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000122901', 'Ai đó');
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform t.blocked('Không xếp người vào phòng mà hợp đồng không thuê', v_err);

  begin
    insert into occupants (contract_id, room_id, full_name, is_primary)
    values ('c1000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000062401',
            'Người đại diện thứ hai', true);
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform t.blocked('Mỗi hợp đồng đúng MỘT người đại diện', v_err);

  -- ------------------------------------------------ phiếu thu

  begin
    insert into receipts (doc_no, payment_id)
    values ('PT-GIA-MAO', gen_random_uuid());
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform t.blocked('Phiếu thu không gắn với khoản tiền có thật: từ chối', v_err);

  -- ------------------------------------------------ ghi nhận hai lần

  /*
   * Khách chuyển tiền hai lần cùng một nội dung → hai giao dịch KHÁC NHAU cùng khớp
   * một phiếu. Ràng buộc UNIQUE trên bank_transactions không cứu được trường hợp này,
   * chỉ có khoá phiếu trong settle_request mới cứu được.
   */
  perform settle_request('4e000000-0000-0000-0000-000000000001', null, 17700000, 'PT-202609-0001');
  begin
    perform settle_request('4e000000-0000-0000-0000-000000000001', null, 17700000, 'PT-202609-0002');
    v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform t.blocked('Một phiếu không ghi nhận được hai lần', v_err);
end $$;

select t.report();
