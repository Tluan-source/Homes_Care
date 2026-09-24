-- ============================================================================
-- TIỀN: ai ghi được, ai duyệt được, và cái gì thì không ai sửa được
--
-- Hai quy tắc được kiểm ở đây:
--   1. Người ghi nhận ≠ người duyệt.
--   2. Tiền đã ghi thì không sửa, không xoá. Sai thì ghi khoản đối ứng.
-- ============================================================================

do $$
declare w record;
begin
  select * into w from t.who;

  -- ------------------------------------------------ tiền đã ghi là bất biến

  /*
   * Chú ý: hai test này dùng `affected_as` chứ không dùng `err_as`.
   * RLS chặn UPDATE/DELETE bằng cách LỌC HÀNG ĐI, không báo lỗi — lệnh vẫn "thành
   * công" với 0 hàng. Test nào chỉ bắt lỗi sẽ tưởng là pass trong khi thật ra
   * chẳng kiểm được gì.
   */
  perform t.eq('Không ai SỬA được một khoản tiền đã ghi',
    t.affected_as(w.owner_a, 'update payments set amount = 1'), 0::bigint);

  perform t.eq('Không ai XOÁ được một khoản tiền đã ghi',
    t.affected_as(w.owner_a, 'delete from payments'), 0::bigint);

  perform t.eq('Kể cả quản lý cũng không xoá được',
    t.affected_as(w.manager_a, 'delete from payments'), 0::bigint);

  -- ------------------------------------------------ ghi tay một khoản tiền

  perform t.blocked('Ghi tiền mà đề tên người khác thì bị chặn',
    t.err_as(w.manager_a, format(
      $q$insert into payments (period_id, amount, source, recorded_by)
         values ('9e000000-0000-0000-0000-000000000002', 100000, 'MANUAL', '%s')$q$, w.owner_a)));

  perform t.blocked('Nhân viên (STAFF) không được ghi nhận tiền',
    t.err_as(w.staff_a, format(
      $q$insert into payments (period_id, amount, source, recorded_by)
         values ('9e000000-0000-0000-0000-000000000002', 100000, 'MANUAL', '%s')$q$, w.staff_a)));

  perform t.blocked('Không ai tự ghi một khoản source = AUTO (chỉ server đối soát mới được)',
    t.err_as(w.manager_a, format(
      $q$insert into payments (period_id, amount, source, recorded_by)
         values ('9e000000-0000-0000-0000-000000000002', 100000, 'AUTO', '%s')$q$, w.manager_a)));

  perform t.allowed('Quản lý ghi tiền mặt đứng tên chính mình thì ĐƯỢC',
    t.err_as(w.manager_a, format(
      $q$insert into payments (period_id, amount, source, recorded_by)
         values ('9e000000-0000-0000-0000-000000000002', 500000, 'MANUAL', '%s')$q$, w.manager_a)));

  -- Và cột tính ra phải tự cập nhật theo.
  perform t.eq('amount_paid tự cập nhật từ payments, không ai ghi tay',
    (select amount_paid from payment_periods where id = '9e000000-0000-0000-0000-000000000002'),
    500000::bigint);

  /*
   * Cột tính ra được canh bằng HAI lớp, và phải kiểm cả hai vì chúng chặn theo hai
   * kiểu khác nhau:
   *   lớp 1 — RLS: người dùng thường không có policy UPDATE → lọc sạch hàng, 0 hàng
   *   lớp 2 — trigger: ai vượt qua được RLS (service_role, Edge Function, câu SQL gõ
   *           tay trong SQL editor) thì vẫn bị trigger chặn bằng lỗi
   */
  perform t.eq('Người dùng thường không UPDATE nổi kỳ thu (lớp RLS)',
    t.affected_as(w.owner_a,
      $q$update payment_periods set amount_paid = 99999999
          where id = '9e000000-0000-0000-0000-000000000002'$q$), 0::bigint);

  declare v_err text;
  begin
    begin
      update payment_periods set amount_paid = 99999999
       where id = '9e000000-0000-0000-0000-000000000002';
      v_err := null;
    exception when others then v_err := sqlerrm; end;
    perform t.blocked('Kể cả quyền cao nhất cũng không ghi tay được amount_paid (lớp trigger)', v_err);
  end;

  -- ------------------------------------------------ duyệt xin khất = đụng vào tiền

  /*
   * Ngưỡng 7 ngày TRÙNG với LATE_POLICY.managerApproveMaxDays trong packages/core.
   * Hai nơi phải khớp: app chặn ở giao diện cho dễ hiểu, database chặn để thật sự
   * an toàn. Đổi một bên mà quên bên kia thì test này hỏng — đó là việc của nó.
   */
  perform t.allowed('Quản lý TỰ DUYỆT được đơn khất 5 ngày (≤ 7)',
    t.err_as(w.manager_a, format(
      $q$update payment_extensions
            set status = 'APPROVED', decided_by = '%s', decided_at = now()
          where id = 'e0000000-0000-0000-0000-000000000001'$q$, w.manager_a)));

  perform t.blocked('Quản lý KHÔNG tự duyệt được đơn khất 25 ngày (> 7)',
    t.err_as(w.manager_a, format(
      $q$update payment_extensions
            set status = 'APPROVED', decided_by = '%s', decided_at = now()
          where id = 'e0000000-0000-0000-0000-000000000002'$q$, w.manager_a)));

  perform t.allowed('Chủ nhà thì duyệt được đơn 25 ngày',
    t.err_as(w.owner_a, format(
      $q$update payment_extensions
            set status = 'APPROVED', decided_by = '%s', decided_at = now()
          where id = 'e0000000-0000-0000-0000-000000000002'$q$, w.owner_a)));

  -- Đơn e...0003 vẫn còn PENDING, nên nếu bị chặn thì đúng là do quy tắc "đề tên
  -- chính mình", không phải do nó đã được duyệt từ test trước.
  perform t.blocked('Duyệt mà đề tên người khác thì bị chặn',
    t.err_as(w.manager_a, format(
      $q$update payment_extensions
            set status = 'APPROVED', decided_by = '%s', decided_at = now()
          where id = 'e0000000-0000-0000-0000-000000000003'$q$, w.owner_a)));

  perform t.blocked('Không "duyệt ẩn danh" — bỏ trống người duyệt cũng bị chặn',
    t.err_as(w.manager_a,
      $q$update payment_extensions set status = 'APPROVED'
          where id = 'e0000000-0000-0000-0000-000000000003'$q$));

  perform t.eq('Đơn ĐÃ duyệt thì không sửa lại được nữa',
    t.affected_as(w.owner_a, format(
      $q$update payment_extensions set new_due = new_due + 30, decided_by = '%s'
          where id = 'e0000000-0000-0000-0000-000000000001'$q$, w.owner_a)), 0::bigint);

  -- ------------------------------------------------ nhật ký

  -- Cũng hai lớp: RLS lọc hàng cho người dùng thường, trigger chặn bằng lỗi cho
  -- bất kỳ ai vượt qua được RLS.
  perform t.eq('Chủ nhà không sửa nổi dòng nhật ký nào (lớp RLS)',
    t.affected_as(w.owner_a, $q$update audit_logs set action = 'đổi'$q$), 0::bigint);
  perform t.eq('Chủ nhà không xoá nổi dòng nhật ký nào (lớp RLS)',
    t.affected_as(w.owner_a, $q$delete from audit_logs$q$), 0::bigint);

  perform t.blocked('Không ai chèn thẳng vào nhật ký (phải qua hàm log_event)',
    t.err_as(w.owner_a,
      $q$insert into audit_logs (actor_type, action) values ('USER', 'giả mạo')$q$));

  declare v_err text;
  begin
    -- Phải có ít nhất MỘT dòng thì trigger FOR EACH ROW mới chạy. Không có dòng nào
    -- thì `update audit_logs` đụng 0 hàng, không lỗi, và test sẽ "đạt" một cách rỗng
    -- tuếch — vừa đúng cái bẫy đã làm hỏng bốn test ở vòng trước.
    insert into audit_logs (org_id, actor_type, action, entity_type, entity_id)
    values ('0a000000-0000-0000-0000-000000000001', 'SYSTEM', 'dòng mồi cho test',
            'test', 'x');

    begin
      update audit_logs set action = 'đổi';
      v_err := null;
    exception when others then v_err := sqlerrm; end;
    perform t.blocked('Nhật ký: quyền cao nhất cũng không SỬA được (lớp trigger)', v_err);

    begin
      delete from audit_logs;
      v_err := null;
    exception when others then v_err := sqlerrm; end;
    perform t.blocked('Nhật ký: quyền cao nhất cũng không XOÁ được (lớp trigger)', v_err);
  end;

  -- ------------------------------------------------ hàm phía server

  /*
   * Đây là lỗ hổng nặng nhất đã tìm thấy khi rà lại: Postgres mặc định cho PUBLIC
   * gọi mọi hàm mới, và PostgREST phơi mọi hàm trong schema public thành endpoint.
   * Cộng lại: bất kỳ ai cầm anon key — thứ nằm sẵn trong bản build app — đều gọi
   * được settle_request và tự ghi nhận "đã thanh toán" cho một phiếu bất kỳ.
   */
  perform t.blocked('settle_request KHÔNG gọi được khi chưa đăng nhập',
    t.err_as(null,
      $q$select settle_request('4e000000-0000-0000-0000-000000000001', null, 1000, 'PT-X')$q$));

  perform t.blocked('settle_request KHÔNG gọi được kể cả bởi chủ nhà đã đăng nhập',
    t.err_as(w.owner_a,
      $q$select settle_request('4e000000-0000-0000-0000-000000000001', null, 1000, 'PT-X')$q$));

  perform t.blocked('next_doc_seq KHÔNG gọi được từ phía người dùng',
    t.err_as(w.owner_a, $q$select next_doc_seq('PT')$q$));

  perform t.blocked('log_event KHÔNG gọi được khi chưa đăng nhập',
    t.err_as(null, $q$select log_event('thử', 'x', 'y')$q$));

  perform t.allowed('log_event thì người đã đăng nhập gọi được (tự điền tên người ghi)',
    t.err_as(w.owner_a, $q$select log_event('xem sổ', 'unit', 'S203.0624')$q$));

  -- ------------------------------------------------ không tự nâng quyền

  perform t.blocked('Quản lý KHÔNG tự phong mình làm chủ nhà',
    t.err_as(w.manager_a, format(
      $q$insert into memberships (profile_id, org_id, role)
         values ('%s', '0a000000-0000-0000-0000-000000000001', 'OWNER')$q$, w.manager_a)));

  perform t.blocked('Quản lý KHÔNG tự mở rộng phạm vi sang toà khác',
    t.err_as(w.manager_a, format(
      $q$insert into memberships (profile_id, org_id, role, tower_id)
         values ('%s', '0a000000-0000-0000-0000-000000000001', 'MANAGER',
                 '7a000000-0000-0000-0000-000000000215')$q$, w.manager_a)));

  perform t.blocked('Không ai tạo tài khoản ngân hàng đứng tên tổ chức khác',
    t.err_as(w.owner_a, format(
      $q$insert into bank_accounts (org_id, owner_id, bank_id, number, holder)
         values ('0b000000-0000-0000-0000-000000000001', '%s', 'ACB', '111', 'X')$q$, w.owner_a)));
end $$;
