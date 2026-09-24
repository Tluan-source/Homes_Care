-- ============================================================================
-- 0008 — Những gì các màn hình app cần
--
--   1. Phiếu yêu cầu thanh toán: người dùng KHÔNG tự tạo, KHÔNG sửa số tiền.
--   2. Ghi chú căn hộ — chỉ ghi thêm, không ghi đè nhau (đặc tả 6.2).
--   3. Xử lý hàng đợi ngoại lệ: ghép giao dịch vào phiếu · đánh dấu đã xử lý ngoài.
-- ============================================================================

-- ---------------------------------------------------------------- 1. phiếu

/*
 * LỖ HỔNG ĐÃ VÁ: policy cũ cho quản lý INSERT phiếu và UPDATE phiếu mà không có
 * `with check`, không giới hạn cột. Nghĩa là qua REST API (anon key nằm sẵn trong app),
 * một quản lý có thể:
 *   - sửa `amount` của phiếu 17 triệu thành 1 triệu, chuyển 1 triệu → webhook thấy
 *     "đúng mã, đúng tiền" → tự ghi nhận ĐÃ THANH TOÁN cả kỳ 17 triệu;
 *   - hoặc tự tạo phiếu với số tiền tuỳ ý.
 * Đối soát tự động chỉ đáng tin khi số tiền trên phiếu là do SERVER tính.
 *
 * Giờ: phiếu chỉ tạo qua Edge Function `create-payment-request` (tính tiền bằng core),
 * người dùng chỉ được đổi TRẠNG THÁI (đánh dấu đã gửi / huỷ) — không đụng số tiền, mã.
 */
drop policy if exists p_requests_write  on payment_requests;
drop policy if exists p_requests_update on payment_requests;
drop policy if exists p_request_lines_write on payment_request_lines;

revoke insert, update, delete on payment_requests      from authenticated;
revoke insert, update, delete on payment_request_lines from authenticated;
grant update (status, sent_at) on payment_requests to authenticated;

create policy p_requests_mark on payment_requests for update to authenticated
  using (auth_helpers.can_see_contract(contract_id)
         and (auth_helpers.has_role('MANAGER') or auth_helpers.has_role('OWNER'))
         and status in ('DRAFT', 'SENT'))
  -- Chỉ được: DRAFT → SENT (đã gửi Zalo), → CANCELLED (huỷ). SETTLED là việc của server.
  with check (status in ('SENT', 'CANCELLED'));

-- ---------------------------------------------------------------- 2. ghi chú

create table if not exists unit_notes (
  id          bigserial primary key,
  unit_id     uuid not null references units(id) on delete cascade,
  body        text not null check (length(btrim(body)) between 1 and 2000),
  created_by  uuid not null default auth.uid() references profiles(id),
  created_at  timestamptz not null default now()
);
create index if not exists unit_notes_unit on unit_notes (unit_id, created_at desc);

alter table unit_notes enable row level security;
create policy p_notes_read on unit_notes for select to authenticated
  using (auth_helpers.can_see_unit(unit_id));
-- Ai ghi thì tên người đó nằm trên ghi chú — không ghi hộ, không ghi ẩn danh.
create policy p_notes_add on unit_notes for insert to authenticated
  with check (auth_helpers.can_see_unit(unit_id)
              and created_by = auth.uid()
              and (auth_helpers.has_role('MANAGER') or auth_helpers.has_role('OWNER')));

revoke all on unit_notes from anon;
revoke all on unit_notes from authenticated;
-- KHÔNG có update/delete: ghi chú không ghi đè nhau. Sai thì ghi thêm dòng đính chính.
grant select, insert on unit_notes to authenticated;
grant usage on sequence unit_notes_id_seq to authenticated;

-- ---------------------------------------------------------------- 3. ngoại lệ

alter table bank_transactions add column if not exists resolve_note text;

/*
 * Ghép một giao dịch LỆCH (thiếu / thừa / sai mã) vào một phiếu — người quyết, máy ghi.
 * Đây là nút "Ghép vào kỳ này" ở màn Cần xử lý.
 */
create or replace function resolve_bank_tx(p_tx uuid, p_request uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_org     uuid := auth_helpers.my_org();
  v_tx      bank_transactions%rowtype;
  v_req     payment_requests%rowtype;
  v_acc     text;
  v_receipt text;
begin
  if v_org is null or not (auth_helpers.has_role('MANAGER') or auth_helpers.has_role('OWNER')) then
    raise exception 'Không có quyền xử lý giao dịch' using errcode = 'insufficient_privilege';
  end if;

  select * into v_tx from bank_transactions where id = p_tx for update;
  -- Giao dịch vào tài khoản của tổ chức KHÁC: báo "không tìm thấy", không để dò.
  if not found or not exists (select 1 from bank_accounts b
                               where b.number = v_tx.account_number and b.org_id = v_org) then
    raise exception 'Không tìm thấy giao dịch' using errcode = 'no_data_found';
  end if;
  if v_tx.resolved_at is not null or v_tx.match_kind in ('PAID', 'DUPLICATE') then
    raise exception 'Giao dịch này đã được xử lý' using errcode = 'check_violation';
  end if;

  select * into v_req from payment_requests where id = p_request;
  if not found or not auth_helpers.can_see_contract(v_req.contract_id) then
    raise exception 'Không tìm thấy phiếu' using errcode = 'no_data_found';
  end if;
  select number into v_acc from bank_accounts where id = v_req.bank_account_id;
  if v_acc is distinct from v_tx.account_number then
    raise exception 'Tiền vào tài khoản khác với tài khoản trên phiếu — không ghép được'
      using errcode = 'check_violation';
  end if;

  v_receipt := next_receipt_no();
  -- settle_request tự chặn phiếu đã SETTLED / đã huỷ, và rót tiền kỳ cũ nhất trước.
  perform settle_request(p_request, p_tx, v_tx.amount, v_receipt);

  update bank_transactions
     set resolved_at = now(), resolved_by = auth.uid(), request_id = p_request
   where id = p_tx;

  insert into audit_logs (org_id, actor_type, actor_id, action, entity_type, entity_id, amount, meta)
  values (v_org, 'USER', auth.uid(), 'Ghép giao dịch vào phiếu — sinh phiếu thu',
          'bank_transaction', v_tx.provider_tx_id, v_tx.amount,
          jsonb_build_object('receipt', v_receipt, 'request_id', p_request,
                             'was', v_tx.match_kind, 'request_amount', v_req.amount));
  return v_receipt;
end $$;

/*
 * Đánh dấu một giao dịch lệch là ĐÃ XỬ LÝ NGOÀI APP (đã hoàn tiền cho khách, tiền
 * không phải tiền nhà...). Bắt buộc ghi lý do — sau này đối chiếu sao kê phải đọc ra
 * được vì sao khoản tiền này không nằm trong sổ.
 */
create or replace function dismiss_bank_tx(p_tx uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_org uuid := auth_helpers.my_org();
  v_tx  bank_transactions%rowtype;
begin
  if v_org is null or not (auth_helpers.has_role('MANAGER') or auth_helpers.has_role('OWNER')) then
    raise exception 'Không có quyền xử lý giao dịch' using errcode = 'insufficient_privilege';
  end if;
  if p_note is null or length(btrim(p_note)) < 3 then
    raise exception 'Cần ghi lý do' using errcode = 'check_violation';
  end if;

  select * into v_tx from bank_transactions where id = p_tx for update;
  if not found or not exists (select 1 from bank_accounts b
                               where b.number = v_tx.account_number and b.org_id = v_org) then
    raise exception 'Không tìm thấy giao dịch' using errcode = 'no_data_found';
  end if;
  if v_tx.resolved_at is not null then
    raise exception 'Giao dịch này đã được xử lý' using errcode = 'check_violation';
  end if;

  update bank_transactions
     set resolved_at = now(), resolved_by = auth.uid(), resolve_note = btrim(p_note)
   where id = p_tx;

  insert into audit_logs (org_id, actor_type, actor_id, action, entity_type, entity_id, amount, meta)
  values (v_org, 'USER', auth.uid(), 'Đánh dấu đã xử lý ngoài app',
          'bank_transaction', v_tx.provider_tx_id, v_tx.amount,
          jsonb_build_object('note', btrim(p_note), 'was', v_tx.match_kind));
end $$;

revoke all on function resolve_bank_tx(uuid, uuid) from public, anon;
revoke all on function dismiss_bank_tx(uuid, text) from public, anon;
grant execute on function resolve_bank_tx(uuid, uuid) to authenticated;
grant execute on function dismiss_bank_tx(uuid, text) to authenticated;

-- Hàng đợi ngoại lệ trả thêm cột cho màn hình.
create or replace view bank_tx_exceptions
  with (security_invoker = true) as
  select id, account_number, amount, content, occurred_at, match_kind, match_code,
         match_reason, request_id, provider_tx_id, reference_code
    from bank_transactions
   where processed_at is not null
     and match_kind not in ('PAID', 'DUPLICATE')
     and resolved_at is null;

-- rollback: drop function resolve_bank_tx, dismiss_bank_tx; drop table unit_notes;
--           alter table bank_transactions drop column resolve_note; khôi phục policy
--           p_requests_write / p_requests_update / p_request_lines_write như ở 0003.
