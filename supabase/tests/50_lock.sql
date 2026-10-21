-- ============================================================================
-- KHOÁ TÀI KHOẢN (S2) — quản lý nghỉ việc thì chủ nhà khoá, và khoá phải có
-- hiệu lực NGAY ở database, không chờ token hết hạn.
-- ============================================================================

do $$
declare w record; v_before bigint;
begin
  select * into w from t.who;

  v_before := t.rows_as(w.manager_a, 'select 1 from units');
  perform t.ok('Trước khi khoá: quản lý A thấy căn của tòa mình', v_before > 0);

  -- ------------------------------------------------ ai được khoá

  perform t.blocked('Chưa đăng nhập: không gọi được lock_member',
    t.err_as(null, format($q$select lock_member(%L)$q$, w.staff_a)));

  perform t.blocked('Quản lý KHÔNG khoá được người khác',
    t.err_as(w.manager_a, format($q$select lock_member(%L)$q$, w.staff_a)));

  perform t.blocked('Quản lý KHÔNG khoá được chủ nhà',
    t.err_as(w.manager_a, format($q$select lock_member(%L)$q$, w.owner_a)));

  perform t.blocked('Chủ B KHÔNG khoá được quản lý của tổ chức A',
    t.err_as(w.owner_b, format($q$select lock_member(%L)$q$, w.manager_a)));

  perform t.blocked('Chủ nhà KHÔNG tự khoá chính mình',
    t.err_as(w.owner_a, format($q$select lock_member(%L)$q$, w.owner_a)));

  perform t.blocked('Không ai sửa thẳng cột locked_at qua REST (phải đi qua lock_member)',
    case when t.affected_as(w.owner_a,
      format($q$update profiles set locked_at = now() where id = %L$q$, w.manager_a)) > 0
      then null else 'chặn' end);

  -- ------------------------------------------------ khoá

  perform t.allowed('Chủ A khoá được quản lý A',
    t.err_as(w.owner_a, format($q$select lock_member(%L, 'nghỉ việc')$q$, w.manager_a)));

  perform t.eq('Bị khoá: không thấy căn nào',
    t.rows_as(w.manager_a, 'select 1 from units'), 0::bigint);
  perform t.eq('Bị khoá: không thấy hợp đồng nào',
    t.rows_as(w.manager_a, 'select 1 from contracts'), 0::bigint);
  perform t.eq('Bị khoá: không thấy kỳ thu nào',
    t.rows_as(w.manager_a, 'select 1 from payment_periods'), 0::bigint);
  perform t.eq('Bị khoá: không thấy tài khoản ngân hàng nào',
    t.rows_as(w.manager_a, 'select 1 from bank_accounts'), 0::bigint);
  perform t.eq('Bị khoá: không thấy người thuê nào',
    t.rows_as(w.manager_a, 'select 1 from occupants'), 0::bigint);
  perform t.eq('Bị khoá: không thấy danh sách thành viên',
    t.rows_as(w.manager_a, 'select 1 from memberships'), 0::bigint);

  perform t.blocked('Bị khoá: không ghi được nhật ký',
    t.err_as(w.manager_a, $q$select log_event('thử', 'x', 'y')$q$));

  perform t.blocked('Bị khoá: không tự mở khoá được',
    t.err_as(w.manager_a, format($q$select unlock_member(%L)$q$, w.manager_a)));

  perform t.eq('Bị khoá: vẫn đọc được hồ sơ của chính mình (để app báo "đã bị khoá")',
    t.rows_as(w.manager_a,
      format($q$select 1 from profiles where id = %L and locked_at is not null$q$, w.manager_a)),
    1::bigint);

  perform t.eq('Khoá để lại dấu trong nhật ký',
    (select count(*) from audit_logs
      where action = 'Khoá tài khoản' and entity_id = w.manager_a::text
        and actor_id = w.owner_a),
    1::bigint);

  perform t.eq('Khoá quản lý A không ảnh hưởng nhân viên A',
    t.rows_as(w.staff_a, 'select 1 from units') > 0, true);

  -- ------------------------------------------------ mở khoá

  perform t.allowed('Chủ A mở khoá được',
    t.err_as(w.owner_a, format($q$select unlock_member(%L)$q$, w.manager_a)));

  perform t.eq('Mở khoá: quản lý A thấy lại đúng như trước',
    t.rows_as(w.manager_a, 'select 1 from units'), v_before);

  -- ------------------------------------------------ S3

  perform t.eq('Ảnh CCCD: hẹn xoá ngay khi hợp đồng kết thúc (0 ngày)',
    id_doc_retention_days(), 0);
end $$;
