-- ============================================================================
-- CÁCH LY: ai thấy được gì
--
-- "Tiền của ai, sổ của người đó" là lời hứa với chủ nhà. File này là bằng chứng
-- cho lời hứa đó, chứ không phải một đoạn mô tả trong tài liệu.
-- ============================================================================

do $$
declare w record;
begin
  select * into w from t.who;

  -- ------------------------------------------------ giữa hai tổ chức

  perform t.eq('Chủ A thấy đúng 3 căn của mình, không thấy căn của tổ chức B',
    t.rows_as(w.owner_a, 'select 1 from units'), 3::bigint);

  perform t.eq('Chủ B thấy đúng 1 căn của mình',
    t.rows_as(w.owner_b, 'select 1 from units'), 1::bigint);

  perform t.eq('Chủ A KHÔNG đọc được hợp đồng của tổ chức B dù biết id',
    t.rows_as(w.owner_a,
      $q$select 1 from contracts where id = 'cb100000-0000-0000-0000-000000000001'$q$), 0::bigint);

  perform t.eq('Chủ A KHÔNG thấy tài khoản ngân hàng của chủ B',
    t.rows_as(w.owner_a,
      $q$select 1 from bank_accounts where number = '9876543210'$q$), 0::bigint);

  perform t.eq('Chủ B KHÔNG thấy kỳ thu nào của tổ chức A',
    t.rows_as(w.owner_b,
      $q$select 1 from payment_periods p join contracts c on c.id = p.contract_id
          where c.code like 'S%'$q$), 0::bigint);

  perform t.eq('Chủ A KHÔNG thấy người ở trong hợp đồng của tổ chức B',
    t.rows_as(w.owner_a,
      $q$select 1 from occupants where contract_id = 'cb100000-0000-0000-0000-000000000001'$q$),
    0::bigint);

  -- ------------------------------------------------ phạm vi theo toà

  /*
   * Cùng tổ chức, cùng dữ liệu, khác phạm vi. Nếu hai con số dưới đây bằng nhau thì
   * `my_towers()` không có tác dụng gì và phạm vi theo toà chỉ là trang trí.
   */
  perform t.eq('Quản lý A (gắn toà S203) chỉ thấy 2 căn của S203',
    t.rows_as(w.manager_a, 'select 1 from units'), 2::bigint);

  perform t.eq('Quản lý A KHÔNG thấy căn S215.1229 của toà mình không phụ trách',
    t.rows_as(w.manager_a, $q$select 1 from units where code = 'S215.1229'$q$), 0::bigint);

  perform t.eq('Chủ A (không gắn toà) thấy cả hai toà',
    t.rows_as(w.owner_a, 'select distinct 1 from units u join towers tw on tw.id = u.tower_id'),
    1::bigint);

  perform t.eq('Quản lý A KHÔNG thấy hợp đồng thuộc toà S215',
    t.rows_as(w.manager_a, $q$select 1 from contracts where code like 'S215%'$q$), 0::bigint);

  -- ------------------------------------------------ chưa đăng nhập

  perform t.ok('Chưa đăng nhập: không thấy căn nào',
    t.nothing_for(null, 'select 1 from units'));
  perform t.ok('Chưa đăng nhập: không thấy hợp đồng nào',
    t.nothing_for(null, 'select 1 from contracts'));
  perform t.ok('Chưa đăng nhập: không thấy khoản tiền nào',
    t.nothing_for(null, 'select 1 from payments'));
  perform t.ok('Chưa đăng nhập: không thấy người ở nào (họ tên, SĐT, CCCD)',
    t.nothing_for(null, 'select 1 from occupants'));

  -- ------------------------------------------------ VIEW không được là cửa hậu

  /*
   * Lỗ hổng kinh điển nhất khi dùng RLS. View mặc định chạy bằng quyền của NGƯỜI
   * TẠO VIEW (vai chạy migration — vai bỏ qua RLS), nên nó đi vòng qua mọi policy.
   * Ba test này canh `security_invoker = true`; thêm view mới mà quên thì hỏng ở đây.
   */
  perform t.eq('View units_sorted KHÔNG đi vòng qua RLS — quản lý A vẫn chỉ thấy 2 căn',
    t.rows_as(w.manager_a, 'select 1 from units_sorted'), 2::bigint);

  perform t.eq('View units_with_rent KHÔNG đi vòng qua RLS',
    t.rows_as(w.manager_a, 'select 1 from units_with_rent'), 2::bigint);

  perform t.ok('Chưa đăng nhập: view cũng không lộ gì',
    t.nothing_for(null, 'select 1 from units_sorted'));

  -- ------------------------------------------------ bảng nội bộ

  perform t.ok('Bộ đếm số chứng từ: người dùng không đọc được',
    t.nothing_for(w.owner_a, 'select 1 from doc_counters'));

  perform t.eq('Giao dịch ngân hàng của chủ B: chủ A không đọc được',
    t.rows_as(w.owner_a, 'select 1 from bank_transactions'), 0::bigint);
end $$;
