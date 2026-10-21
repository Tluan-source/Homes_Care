-- ============================================================================
-- VIỆC PHÍA SERVER (0007): webhook an toàn khi SePay gửi lại · hợp đồng hết hạn ·
-- thông báo trong app.
-- ============================================================================

do $$
declare
  w record;
  c_req    constant uuid := '4e000000-0000-0000-0000-0000000000a1';
  c_period constant uuid := '9e000000-0000-0000-0000-0000000000a1';
  v_tx uuid; v_tx2 uuid;
  v_r text; v_r2 text;
  v_seq_before int; v_seq_after int;
  v_ym text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYYMM');
begin
  select * into w from t.who;

  -- Dữ liệu riêng cho file này: một kỳ + một phiếu MỚI của hợp đồng (1), tổ chức A.
  insert into payment_periods (id, contract_id, type, due_on, period_from, period_to, amount_due)
  values (c_period, 'c1000000-0000-0000-0000-000000000001', 'RENT',
          date '2026-10-10', date '2026-10-10', date '2026-11-10', 17000000);
  insert into payment_requests (id, contract_id, doc_no, code, bank_account_id, amount, qr_payload, status)
  values (c_req, 'c1000000-0000-0000-0000-000000000001', 'YC-TEST-70', 'HCTEST70A',
          'ba000000-0000-0000-0000-00000000000a', 17000000, 'x', 'SENT');
  insert into payment_request_lines (request_id, period_id, amount) values (c_req, c_period, 17000000);

  insert into bank_transactions (provider_tx_id, account_number, amount, content, occurred_at, raw_payload)
  values ('T-70-1', '0123456789', 17000000, 'CK HCTEST70A', now(), '{}') returning id into v_tx;

  -- ------------------------------------------------ khớp

  v_r := process_bank_tx(v_tx, 'PAID', c_req, 'HCTEST70A', null);
  perform t.ok('Khớp: sinh phiếu thu đúng định dạng PT-YYYYMM-NNNN',
               v_r ~ '^PT-[0-9]{6}-[0-9]{4,}$', v_r);
  perform t.eq('Khớp: kỳ thu chuyển PAID',
    (select status::text from payment_periods where id = c_period), 'PAID');
  perform t.eq('Khớp: phiếu yêu cầu chuyển SETTLED',
    (select status::text from payment_requests where id = c_req), 'SETTLED');
  perform t.ok('Khớp: giao dịch được đánh dấu đã xử lý',
    (select processed_at is not null and match_kind = 'PAID' from bank_transactions where id = v_tx));

  -- ------------------------------------------------ SePay gửi lại sau khi đã xử lý

  v_r2 := process_bank_tx(v_tx, 'PAID', c_req, 'HCTEST70A', null);
  perform t.eq('Gửi lại: trả về ĐÚNG phiếu thu cũ', v_r2, v_r);
  perform t.eq('Gửi lại: không ghi tiền lần hai',
    (select count(*) from payments where transaction_id = v_tx), 1::bigint);

  -- ------------------------------------------------ khách chuyển 2 lần cùng nội dung

  select last_no into v_seq_before from doc_counters where kind = 'PT' and ym = v_ym;

  insert into bank_transactions (provider_tx_id, account_number, amount, content, occurred_at, raw_payload)
  values ('T-70-2', '0123456789', 17000000, 'CK HCTEST70A', now(), '{}') returning id into v_tx2;
  v_r := process_bank_tx(v_tx2, 'PAID', c_req, 'HCTEST70A', null);

  select last_no into v_seq_after from doc_counters where kind = 'PT' and ym = v_ym;

  perform t.eq('Chuyển trùng: KHÔNG sinh phiếu thu thứ hai', v_r, null::text);
  perform t.eq('Chuyển trùng: vào hàng đợi ngoại lệ',
    (select match_kind from bank_transactions where id = v_tx2), 'UNMATCHED');
  perform t.eq('Ghi nhận thất bại không làm nhảy số phiếu thu', v_seq_after, v_seq_before);

  perform t.eq('Chủ A thấy giao dịch lỗi trong hàng đợi ngoại lệ',
    t.rows_as(w.owner_a, format($q$select 1 from bank_tx_exceptions where id = %L$q$, v_tx2)), 1::bigint);
  perform t.eq('Chủ B KHÔNG thấy hàng đợi ngoại lệ của chủ A',
    t.rows_as(w.owner_b, format($q$select 1 from bank_tx_exceptions where id = %L$q$, v_tx2)), 0::bigint);

  perform t.eq('Mỗi giao dịch đúng MỘT dòng nhật ký, dù được gọi lại',
    (select count(*) from audit_logs where entity_id in ('T-70-1', 'T-70-2')), 2::bigint);

  perform t.blocked('Người dùng không gọi được process_bank_tx',
    t.err_as(w.owner_a, format($q$select process_bank_tx(%L, 'PAID', %L, 'x', null)$q$, v_tx2, c_req)));

  -- ------------------------------------------------ hợp đồng hết hạn

  insert into contracts (id, unit_id, code, status, rent, cycle_months, move_in, ends_on)
  values ('c1000000-0000-0000-0000-0000000000e1', 'c0000000-0000-0000-0000-000000000612',
          'TEST-70-HET-HAN', 'ACTIVE', 1000000, 1, date '2025-01-01', date '2025-12-31');

  perform end_expired_contracts();
  perform t.eq('Hợp đồng quá ngày kết thúc → ENDED',
    (select status::text from contracts where id = 'c1000000-0000-0000-0000-0000000000e1'), 'ENDED');
  perform t.eq('Hợp đồng còn hạn giữ nguyên ACTIVE',
    (select status::text from contracts where id = 'c1000000-0000-0000-0000-000000000001'), 'ACTIVE');
  perform t.blocked('Người dùng không gọi được end_expired_contracts',
    t.err_as(w.owner_a, 'select end_expired_contracts()'));

  -- ------------------------------------------------ thông báo trong app

  insert into notifications (org_id, profile_id, kind, title, body, dedupe_key)
  values ('0a000000-0000-0000-0000-000000000001', w.manager_a, 'DIGEST', 'Hôm nay', '3 căn cần gửi QR', 'test-70');

  perform t.eq('Quản lý thấy thông báo của mình',
    t.rows_as(w.manager_a, $q$select 1 from notifications where dedupe_key = 'test-70'$q$), 1::bigint);
  perform t.eq('Chủ nhà KHÔNG đọc hộp thư của quản lý',
    t.rows_as(w.owner_a, $q$select 1 from notifications where dedupe_key = 'test-70'$q$), 0::bigint);
  perform t.eq('Quản lý đánh dấu đã đọc được',
    t.affected_as(w.manager_a, $q$update notifications set read_at = now() where dedupe_key = 'test-70'$q$), 1::bigint);
  perform t.blocked('Quản lý KHÔNG sửa được nội dung thông báo',
    case when t.affected_as(w.manager_a,
      $q$update notifications set title = 'sửa' where dedupe_key = 'test-70'$q$) > 0 then null else 'chặn' end);
  perform t.blocked('Không ai tự tạo thông báo (chỉ server)',
    t.err_as(w.manager_a, format(
      $q$insert into notifications (org_id, profile_id, kind, title, body, dedupe_key)
         values ('0a000000-0000-0000-0000-000000000001', %L, 'X', 'x', 'x', 'gia-mao')$q$, w.owner_a)));

  perform t.allowed('Đăng ký máy nhận push',
    t.err_as(w.manager_a, $q$select register_push_token('ExponentPushToken[test70]', 'android')$q$));
  perform t.allowed('Máy đổi người đăng nhập: token chuyển sang người mới',
    t.err_as(w.staff_a, $q$select register_push_token('ExponentPushToken[test70]', 'android')$q$));
  perform t.eq('Người cũ thôi nhận push trên máy đó',
    t.rows_as(w.manager_a, $q$select 1 from push_tokens where token = 'ExponentPushToken[test70]'$q$), 0::bigint);
  perform t.blocked('Chưa đăng nhập không đăng ký push được',
    t.err_as(null, $q$select register_push_token('ExponentPushToken[x]', 'ios')$q$));
end $$;
