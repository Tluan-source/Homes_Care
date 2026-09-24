-- ============================================================================
-- 0008: phiếu chỉ server tạo · ghi chú chỉ ghi thêm · xử lý hàng đợi ngoại lệ
-- ============================================================================

do $$
declare
  w record;
  c_req    constant uuid := '4e000000-0000-0000-0000-0000000000b1';
  c_period constant uuid := '9e000000-0000-0000-0000-0000000000b1';
  v_tx1 uuid; v_tx2 uuid; v_r text;
begin
  select * into w from t.who;

  insert into payment_periods (id, contract_id, type, due_on, period_from, period_to, amount_due)
  values (c_period, 'c1000000-0000-0000-0000-000000000001', 'RENT',
          date '2026-11-10', date '2026-11-10', date '2026-12-10', 17000000);
  insert into payment_requests (id, contract_id, doc_no, code, bank_account_id, amount, qr_payload, status)
  values (c_req, 'c1000000-0000-0000-0000-000000000001', 'YC-TEST-80', 'HCTEST80B',
          'ba000000-0000-0000-0000-00000000000a', 17000000, 'x', 'DRAFT');
  insert into payment_request_lines (request_id, period_id, amount) values (c_req, c_period, 17000000);

  -- ------------------------------------------------ phiếu: chỉ server tạo, không sửa tiền

  perform t.blocked('Quản lý KHÔNG tự tạo phiếu (phải qua Edge Function)',
    t.err_as(w.manager_a,
      $q$insert into payment_requests (contract_id, doc_no, code, bank_account_id, amount, qr_payload)
         values ('c1000000-0000-0000-0000-000000000001', 'YC-GIA', 'HCGIAMAO1',
                 'ba000000-0000-0000-0000-00000000000a', 1000, 'x')$q$));
  perform t.blocked('Quản lý KHÔNG sửa được số tiền trên phiếu',
    case when t.affected_as(w.manager_a,
      format($q$update payment_requests set amount = 1000 where id = %L$q$, c_req)) > 0
      then null else 'chặn' end);
  perform t.blocked('Quản lý KHÔNG thêm dòng kỳ vào phiếu',
    t.err_as(w.manager_a, format(
      $q$insert into payment_request_lines (request_id, period_id, amount) values (%L, %L, 1)$q$,
      c_req, '9e000000-0000-0000-0000-000000000002')));
  perform t.eq('Quản lý đánh dấu "đã gửi Zalo" được',
    t.affected_as(w.manager_a,
      format($q$update payment_requests set status = 'SENT', sent_at = now() where id = %L$q$, c_req)),
    1::bigint);
  perform t.blocked('Quản lý KHÔNG tự đánh dấu phiếu ĐÃ THANH TOÁN',
    case when t.affected_as(w.manager_a,
      format($q$update payment_requests set status = 'SETTLED' where id = %L$q$, c_req)) > 0
      then null else 'chặn' end);
  perform t.eq('Chủ B KHÔNG đổi được phiếu của chủ A',
    t.affected_as(w.owner_b,
      format($q$update payment_requests set status = 'CANCELLED' where id = %L$q$, c_req)),
    0::bigint);

  -- ------------------------------------------------ ghi chú

  perform t.allowed('Quản lý ghi chú vào căn mình phụ trách',
    t.err_as(w.manager_a, format(
      $q$insert into unit_notes (unit_id, body, created_by) values (%L, 'Khách báo hỏng vòi sen', %L)$q$,
      'c0000000-0000-0000-0000-000000000624', w.manager_a)));
  perform t.blocked('Không ghi chú đứng tên người khác',
    t.err_as(w.manager_a, format(
      $q$insert into unit_notes (unit_id, body, created_by) values (%L, 'x', %L)$q$,
      'c0000000-0000-0000-0000-000000000624', w.owner_a)));
  perform t.eq('Chủ A đọc được ghi chú',
    t.rows_as(w.owner_a, $q$select 1 from unit_notes where body = 'Khách báo hỏng vòi sen'$q$), 1::bigint);
  perform t.eq('Chủ B KHÔNG đọc được ghi chú của tổ chức A',
    t.rows_as(w.owner_b, 'select 1 from unit_notes'), 0::bigint);
  perform t.blocked('Ghi chú không sửa được (không ghi đè nhau)',
    case when t.affected_as(w.manager_a, $q$update unit_notes set body = 'sửa'$q$) > 0
      then null else 'chặn' end);
  perform t.blocked('Ghi chú không xoá được',
    case when t.affected_as(w.owner_a, 'delete from unit_notes') > 0 then null else 'chặn' end);

  -- ------------------------------------------------ hàng đợi ngoại lệ

  insert into bank_transactions (provider_tx_id, account_number, amount, content, occurred_at,
                                 raw_payload, processed_at, match_kind, match_reason)
  values ('T-80-1', '0123456789', 16500000, 'CK tien nha', now(), '{}', now(), 'UNMATCHED', 'không có mã')
  returning id into v_tx1;
  insert into bank_transactions (provider_tx_id, account_number, amount, content, occurred_at,
                                 raw_payload, processed_at, match_kind, match_reason)
  values ('T-80-2', '0123456789', 300000, 'chuyen nham', now(), '{}', now(), 'UNMATCHED', 'không có mã')
  returning id into v_tx2;

  perform t.blocked('Chủ B KHÔNG ghép được giao dịch của chủ A',
    t.err_as(w.owner_b, format($q$select resolve_bank_tx(%L, %L)$q$, v_tx1, c_req)));

  perform t.allowed('Quản lý ghép giao dịch lệch vào phiếu',
    t.err_as(w.manager_a, format($q$select resolve_bank_tx(%L, %L)$q$, v_tx1, c_req)));
  perform t.eq('Ghép xong: phiếu SETTLED',
    (select status::text from payment_requests where id = c_req), 'SETTLED');
  perform t.eq('Ghép xong: kỳ ghi nhận đúng số tiền THẬT đã chuyển (thiếu vẫn là thiếu)',
    (select amount_paid from payment_periods where id = c_period), 16500000::bigint);
  perform t.ok('Ghép xong: có phiếu thu',
    exists (select 1 from receipts r join payments p on p.id = r.payment_id where p.transaction_id = v_tx1));
  perform t.eq('Ghép xong: rời hàng đợi ngoại lệ',
    (select count(*) from bank_tx_exceptions where id = v_tx1), 0::bigint);
  perform t.blocked('Không ghép cùng một giao dịch hai lần',
    t.err_as(w.manager_a, format($q$select resolve_bank_tx(%L, %L)$q$, v_tx1, c_req)));

  perform t.blocked('Đánh dấu đã xử lý ngoài phải ghi lý do',
    t.err_as(w.owner_a, format($q$select dismiss_bank_tx(%L, '')$q$, v_tx2)));
  perform t.allowed('Chủ nhà đánh dấu đã hoàn tiền cho khách',
    t.err_as(w.owner_a, format($q$select dismiss_bank_tx(%L, 'Đã hoàn lại cho khách 25/09')$q$, v_tx2)));
  perform t.eq('Đã xử lý ngoài: rời hàng đợi ngoại lệ',
    (select count(*) from bank_tx_exceptions where id = v_tx2), 0::bigint);
  perform t.eq('Mỗi lần xử lý đều để lại dấu trong nhật ký',
    (select count(*) from audit_logs where entity_id in ('T-80-1', 'T-80-2') and actor_type = 'USER'),
    2::bigint);
end $$;
