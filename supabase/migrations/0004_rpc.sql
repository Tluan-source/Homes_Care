-- ============================================================================
-- 0004 — Hàm gọi từ Edge Function
--
-- Ghi tiền phải là MỘT transaction: tạo payments + đánh dấu phiếu + sinh phiếu thu.
-- Tách thành nhiều lời gọi REST thì có lúc ghi được nửa chừng rồi đứt mạng, và để lại
-- dữ liệu nửa vời không ai dò ra.
-- ============================================================================

-- Bộ đếm số chứng từ, chạy lại từ 1 mỗi tháng.
create table if not exists doc_counters (
  kind    text not null,
  ym      text not null,                        -- '202609'
  last_no int  not null default 0,
  primary key (kind, ym)
);

-- Bật RLS và KHÔNG tạo policy nào = không người dùng nào đọc hay ghi được.
-- Thiếu dòng này thì bảng nằm trần trong schema public: bất kỳ ai cầm anon key cũng
-- đọc được tháng này đã phát bao nhiêu phiếu thu, và tệ hơn, UPDATE được last_no để
-- ép số chứng từ trùng nhau.
alter table doc_counters enable row level security;

create or replace function next_doc_seq(p_kind text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_ym text := to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYYMM');
  v_no int;
begin
  insert into doc_counters (kind, ym, last_no) values (p_kind, v_ym, 1)
    on conflict (kind, ym) do update set last_no = doc_counters.last_no + 1
    returning last_no into v_no;
  return v_no;
end $$;

/*
 * Ghi nhận một giao dịch khớp: rót tiền vào các kỳ của phiếu, kỳ CŨ NHẤT trước,
 * rồi sinh phiếu thu.
 *
 * Chạy trọn trong một transaction. Trigger periods_recalc tự cập nhật amount_paid và
 * status của kỳ — hàm này không đụng vào hai cột đó.
 */
create or replace function settle_request(
  p_request_id     uuid,
  p_transaction_id uuid,
  p_amount         bigint,
  p_receipt_no     text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_left    bigint := p_amount;
  v_line    record;
  v_take    bigint;
  v_payment uuid;
  v_first   uuid;
  v_status  request_status;
begin
  if p_amount <= 0 then
    raise exception 'Số tiền phải dương';
  end if;

  /*
   * KHOÁ PHIẾU LẠI rồi mới đọc trạng thái.
   *
   * SePay gửi lại tới 7 lần trong 5 giờ. Ràng buộc UNIQUE trên bank_transactions
   * chặn được cùng một giao dịch ghi hai lần, nhưng KHÔNG chặn hai giao dịch KHÁC
   * NHAU cùng khớp một phiếu (khách chuyển hai lần cùng nội dung). Không có khoá
   * này thì hai lần gọi song song cùng đọc thấy phiếu chưa SETTLED và cùng ghi tiền.
   */
  select status into v_status from payment_requests where id = p_request_id for update;

  if v_status is null then
    raise exception 'Không có phiếu %', p_request_id using errcode = 'no_data_found';
  end if;
  if v_status = 'SETTLED' then
    raise exception 'Phiếu này đã ghi nhận rồi — không ghi nhận lần hai'
      using errcode = 'unique_violation';
  end if;
  if v_status = 'CANCELLED' then
    raise exception 'Phiếu đã huỷ, không ghi nhận được' using errcode = 'check_violation';
  end if;

  for v_line in
    select l.period_id, l.amount, p.due_on
      from payment_request_lines l
      join payment_periods p on p.id = l.period_id
     where l.request_id = p_request_id
     order by p.due_on            -- kỳ cũ nhất trả trước
  loop
    exit when v_left <= 0;
    v_take := least(v_left, v_line.amount);

    insert into payments (period_id, transaction_id, amount, source)
    values (v_line.period_id, p_transaction_id, v_take, 'AUTO')
    returning id into v_payment;

    v_first := coalesce(v_first, v_payment);
    v_left  := v_left - v_take;
  end loop;

  update payment_requests set status = 'SETTLED' where id = p_request_id;

  if v_first is not null then
    insert into receipts (doc_no, payment_id) values (p_receipt_no, v_first);
  end if;

  return v_first;
end $$;

-- Ghi nhật ký từ phía server. Người dùng không có policy insert vào audit_logs,
-- nên mọi dòng nhật ký đều phải đi qua đây hoặc qua Edge Function.
create or replace function log_event(
  p_action text, p_entity_type text, p_entity_id text,
  p_unit_id uuid default null, p_amount bigint default null,
  p_meta jsonb default '{}'::jsonb
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint;
begin
  insert into audit_logs (org_id, actor_type, actor_id, action, entity_type, entity_id, unit_id, amount, meta)
  values (auth_helpers.my_org(), 'USER', auth.uid(), p_action, p_entity_type, p_entity_id, p_unit_id, p_amount, p_meta)
  returning id into v_id;
  return v_id;
end $$;

-- ============================================================================
-- AI ĐƯỢC GỌI HÀM NÀO
--
-- ⚠️ Postgres MẶC ĐỊNH cấp quyền EXECUTE cho PUBLIC trên mọi hàm mới tạo. Trên
-- Supabase, PostgREST phơi mọi hàm trong schema `public` ra ngoài dưới dạng
-- POST /rest/v1/rpc/<tên hàm>. Cộng hai điều đó lại:
--
--     BẤT KỲ AI cầm anon key — thứ nằm sẵn trong bản build app, giải nén là đọc
--     được — đều gọi được `settle_request` và tự ghi nhận đã thanh toán cho một
--     phiếu bất kỳ, mà không cần đăng nhập.
--
-- `security definer` càng làm nặng thêm: hàm chạy với quyền của chủ hàm, tức là
-- bỏ qua RLS. Vậy nên với hàm `security definer`, REVOKE không phải là "siết thêm
-- cho chắc" — nó là tuyến phòng thủ DUY NHẤT.
--
-- Quy tắc: viết xong một hàm `security definer` thì việc tiếp theo là thu hồi
-- quyền của PUBLIC, trước cả khi viết test.
-- ============================================================================

revoke all on function next_doc_seq(text)                  from public, anon, authenticated;
revoke all on function settle_request(uuid, uuid, bigint, text) from public, anon, authenticated;
revoke all on function log_event(text, text, text, uuid, bigint, jsonb) from public, anon;

-- Ghi tiền và cấp số chứng từ là việc của SERVER, không phải của điện thoại.
grant execute on function next_doc_seq(text)                   to service_role;
grant execute on function settle_request(uuid, uuid, bigint, text) to service_role;

-- Nhật ký thì người đã đăng nhập được ghi — hàm tự điền actor_id = auth.uid(),
-- nên không ai ghi hộ tên người khác được.
grant execute on function log_event(text, text, text, uuid, bigint, jsonb)
  to authenticated, service_role;

-- Hàm trong `auth_helpers` KHÔNG thu hồi được: biểu thức của policy chạy dưới quyền
-- của chính người đang truy vấn, nên `authenticated` bắt buộc phải gọi được chúng,
-- nếu không mọi câu SELECT đều đổ lỗi "permission denied". Chúng an toàn để phơi ra
-- vì chỉ trả lời về phạm vi của CHÍNH người gọi, và nằm ngoài schema `public` nên
-- PostgREST không phơi ra thành endpoint RPC. Quyền được cấp ở 0003.

-- rollback: drop function settle_request, next_doc_seq, log_event; drop table doc_counters.
