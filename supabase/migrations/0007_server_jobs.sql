-- ============================================================================
-- 0007 — Việc phía server: webhook an toàn khi SePay gửi lại · kết thúc hợp đồng
--        hết hạn · thông báo trong app cho chủ nhà và quản lý
--
-- Mọi hàm ở đây là của SERVER (Edge Function / pg_cron), trừ register_push_token.
-- ============================================================================

-- ---------------------------------------------------------------- 1. webhook

/*
 * LỖI ĐÃ SỬA: webhook bản cũ "mất tiền khi retry".
 *
 *   insert giao dịch → settle LỖI → trả 500 → SePay gửi lại → insert dính UNIQUE
 *   → webhook tưởng "đã nhận rồi" → trả 200 → giao dịch KHÔNG BAO GIỜ được đối soát lại.
 *
 * Nguyên nhân gốc: "đã LƯU giao dịch" và "đã XỬ LÝ giao dịch" là hai việc khác nhau,
 * mà bản cũ chỉ có một dấu hiệu (hàng tồn tại) cho cả hai. Giờ tách ra: `processed_at`.
 *
 * Các cột dưới đây là KẾT QUẢ XỬ LÝ, không phải dữ liệu ngân hàng. Dữ liệu gốc
 * (amount, content, raw_payload...) vẫn không ai sửa.
 */
alter table bank_transactions
  add column if not exists processed_at timestamptz,
  add column if not exists match_kind   text
    check (match_kind in ('PAID', 'DUPLICATE', 'PARTIAL', 'OVERPAID', 'UNMATCHED', 'MULTI_PERIOD')),
  add column if not exists match_code   text,
  add column if not exists match_reason text,
  add column if not exists request_id   uuid references payment_requests(id) on delete set null,
  -- Hàng đợi ngoại lệ: người xử lý xong thì điền hai cột này (luồng xử lý làm ở pha app).
  add column if not exists resolved_at  timestamptz,
  add column if not exists resolved_by  uuid references profiles(id);

create index if not exists bank_tx_unprocessed on bank_transactions (received_at) where processed_at is null;
create index if not exists bank_tx_exceptions  on bank_transactions (received_at desc)
  where processed_at is not null and match_kind not in ('PAID', 'DUPLICATE') and resolved_at is null;

-- Hàng đợi ngoại lệ cho màn "Cần xử lý". security_invoker: RLS của bank_transactions
-- vẫn áp — chủ nhà chỉ thấy giao dịch vào tài khoản của mình (xem 0003).
create or replace view bank_tx_exceptions
  with (security_invoker = true) as
  select id, account_number, amount, content, occurred_at, match_kind, match_code,
         match_reason, request_id
    from bank_transactions
   where processed_at is not null
     and match_kind not in ('PAID', 'DUPLICATE')
     and resolved_at is null;

/*
 * Xử lý MỘT giao dịch đã lưu — trọn trong một transaction:
 *   (khớp) cấp số phiếu thu + ghi tiền + sinh phiếu thu
 *   + đánh dấu đã xử lý + ghi nhật ký.
 *
 * GỌI LẠI BAO NHIÊU LẦN CŨNG AN TOÀN: lần sau thấy processed_at thì trả lại số phiếu
 * cũ, không ghi gì thêm. Đó là điều kiện để webhook trả 500 và để SePay gửi lại.
 *
 * Số phiếu thu cấp BÊN TRONG hàm (bản cũ cấp ở Edge Function trước khi settle):
 * settle lỗi thì bộ đếm cũng lùi theo, số phiếu không bị nhảy cóc.
 *
 * Số tiền lấy từ HÀNG ĐÃ LƯU, không nhận từ tham số — không để người gọi truyền
 * một con số khác với con số ngân hàng báo.
 */
create or replace function process_bank_tx(
  p_tx      uuid,
  p_kind    text,
  p_request uuid,
  p_code    text,
  p_reason  text
) returns text language plpgsql security definer set search_path = public as $$
declare
  v_tx      bank_transactions%rowtype;
  v_kind    text := p_kind;
  v_reason  text := p_reason;
  v_receipt text;
  v_seq     int;
  v_org     uuid;
begin
  select * into v_tx from bank_transactions where id = p_tx for update;
  if not found then
    raise exception 'Không có giao dịch %', p_tx using errcode = 'no_data_found';
  end if;

  if v_tx.processed_at is not null then
    select r.doc_no into v_receipt
      from receipts r join payments p on p.id = r.payment_id
     where p.transaction_id = p_tx
     limit 1;
    return v_receipt;
  end if;

  if v_kind = 'PAID' then
    begin
      v_seq := next_doc_seq('PT');
      -- Cùng định dạng makeDocNo() của core: PT-YYYYMM-0001 (tháng theo giờ Việt Nam).
      -- greatest(): quá 9999 phiếu/tháng thì dài ra, không bị lpad cắt cụt.
      v_receipt := 'PT-' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYYMM') || '-'
                   || lpad(v_seq::text, greatest(4, length(v_seq::text)), '0');
      perform settle_request(p_request, p_tx, v_tx.amount, v_receipt);
    exception when unique_violation or check_violation or no_data_found then
      -- Thường gặp nhất: khách chuyển HAI LẦN cùng nội dung, lần một đã ghi nhận phiếu.
      -- Không tự ghi lần hai — đẩy sang hàng đợi ngoại lệ để người quyết (hoàn tiền,
      -- hay trừ vào kỳ sau). Khối begin/exception tự lùi cả bộ đếm số phiếu.
      v_receipt := null;
      v_kind    := 'UNMATCHED';
      v_reason  := 'không ghi nhận được: ' || sqlerrm;
    end;
  end if;

  update bank_transactions
     set processed_at = now(),
         match_kind   = v_kind,
         match_code   = p_code,
         match_reason = v_reason,
         request_id   = p_request
   where id = p_tx;

  select org_id into v_org from bank_accounts where number = v_tx.account_number limit 1;

  insert into audit_logs (org_id, actor_type, action, entity_type, entity_id, amount, meta)
  values (v_org, 'SEPAY',
          case when v_kind = 'PAID' then 'Đối soát khớp — ghi nhận đã thanh toán'
               else 'Không tự ghi nhận được — ' || v_kind end,
          'bank_transaction', v_tx.provider_tx_id, v_tx.amount,
          jsonb_build_object('kind', v_kind, 'code', p_code, 'reason', v_reason,
                             'receipt', v_receipt, 'request_id', p_request));

  return v_receipt;
end $$;

revoke all on function process_bank_tx(uuid, text, uuid, text, text) from public, anon, authenticated;
grant execute on function process_bank_tx(uuid, text, uuid, text, text) to service_role;

-- ---------------------------------------------------------------- 2. hợp đồng hết hạn

/*
 * Hợp đồng quá `ends_on` → ENDED. Chạy mỗi ngày bằng pg_cron (supabase/cron.sql).
 *
 * Không có job này thì hợp đồng hết hạn vẫn ACTIVE mãi: căn không bao giờ hiện
 * "Trống", và trigger hẹn xoá ảnh CCCD (S3 — xoá khi hết hợp đồng) không bao giờ chạy.
 */
create or replace function end_expired_contracts() returns int
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_n int;
begin
  with ended as (
    update contracts set status = 'ENDED'
     where status = 'ACTIVE' and ends_on < v_today
    returning id, code, unit_id
  )
  insert into audit_logs (org_id, actor_type, action, entity_type, entity_id, unit_id)
  select z.org_id, 'SYSTEM', 'Hợp đồng hết hạn — chuyển ENDED', 'contract', e.code, e.unit_id
    from ended e
    join units u on u.id = e.unit_id
    join towers t on t.id = u.tower_id
    join zones z on z.id = t.zone_id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function end_expired_contracts() from public, anon, authenticated;
grant execute on function end_expired_contracts() to service_role;

-- ---------------------------------------------------------------- 3. thông báo trong app

/*
 * Chốt 24/09/2026: NHẮC CHỈ TRONG APP, chỉ cho chủ nhà và quản lý. App không nhắn khách.
 *
 * `notifications` là hộp thư trong app — push chỉ là cái chuông báo có thư mới. Tắt
 * thông báo trên điện thoại thì vẫn đọc được trong app, nên hộp thư mới là nguồn chính.
 *
 * `dedupe_key` UNIQUE: job chạy lại (pg_cron trễ, gọi tay) cũng không gửi trùng.
 */
create table if not exists notifications (
  id          bigserial primary key,
  org_id      uuid not null references orgs(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  kind        text not null,                    -- 'DIGEST' | 'PAID' | 'EXCEPTION' ...
  title       text not null,
  body        text not null,
  data        jsonb not null default '{}'::jsonb,
  dedupe_key  text not null unique,
  created_at  timestamptz not null default now(),
  read_at     timestamptz
);
create index if not exists notifications_inbox on notifications (profile_id, created_at desc);

alter table notifications enable row level security;
-- `my_org()` rỗng khi tài khoản bị khoá → hộp thư cũng đóng theo.
create policy p_notifications_read on notifications for select to authenticated
  using (profile_id = auth.uid() and org_id = auth_helpers.my_org());
create policy p_notifications_mark_read on notifications for update to authenticated
  using (profile_id = auth.uid() and org_id = auth_helpers.my_org())
  with check (profile_id = auth.uid() and org_id = auth_helpers.my_org());

revoke all on notifications from anon;
revoke all on notifications from authenticated;
grant select on notifications to authenticated;
-- Người dùng chỉ được đánh dấu ĐÃ ĐỌC — không sửa được nội dung thông báo.
grant update (read_at) on notifications to authenticated;

create table if not exists push_tokens (
  token       text primary key,                 -- ExponentPushToken[...]
  profile_id  uuid not null references profiles(id) on delete cascade,
  platform    text not null check (platform in ('ios', 'android')),
  updated_at  timestamptz not null default now()
);
create index if not exists push_tokens_profile on push_tokens (profile_id);

alter table push_tokens enable row level security;
create policy p_push_tokens_own on push_tokens for select to authenticated
  using (profile_id = auth.uid());
create policy p_push_tokens_delete on push_tokens for delete to authenticated
  using (profile_id = auth.uid());

revoke all on push_tokens from anon;
revoke all on push_tokens from authenticated;
grant select, delete on push_tokens to authenticated;

/*
 * Đăng ký máy nhận push. Qua hàm chứ không INSERT thẳng: một máy có thể đổi người
 * đăng nhập (quản lý cũ đưa máy cho quản lý mới). Token đó đang thuộc người khác nên
 * RLS không cho thấy để sửa — hàm này chuyển token sang người đang đăng nhập, và
 * người cũ thôi nhận thông báo trên máy đó.
 */
create or replace function register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or auth_helpers.my_org() is null then
    raise exception 'Chưa đăng nhập hoặc tài khoản đã bị khoá' using errcode = 'insufficient_privilege';
  end if;
  if p_token !~ '^Expo(nent)?PushToken\[.+\]$' then
    raise exception 'Token không hợp lệ' using errcode = 'check_violation';
  end if;
  insert into push_tokens (token, profile_id, platform, updated_at)
  values (p_token, auth.uid(), p_platform, now())
  on conflict (token) do update
    set profile_id = excluded.profile_id, platform = excluded.platform, updated_at = now();
end $$;

revoke all on function register_push_token(text, text) from public, anon;
grant execute on function register_push_token(text, text) to authenticated;

-- rollback: drop function register_push_token, end_expired_contracts, process_bank_tx;
--           drop table push_tokens, notifications; drop view bank_tx_exceptions;
--           alter table bank_transactions drop column processed_at, match_kind, match_code,
--           match_reason, request_id, resolved_at, resolved_by.
