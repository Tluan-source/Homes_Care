-- ============================================================================
-- 0006 — Khoá tài khoản quản lý · Lưu ảnh CCCD tới hết hợp đồng
--
-- Chốt ngày 24/09/2026 (RELEASE-CHECKLIST §2):
--   S2 — Quản lý nghỉ việc → chủ nhà KHOÁ tài khoản, không xoá.
--   S3 — Ảnh CCCD giữ tới khi hợp đồng kết thúc, rồi xoá.
-- ============================================================================

-- ---------------------------------------------------------------- S2: khoá

/*
 * Vì sao KHOÁ chứ không XOÁ membership:
 *  - Xoá thì mất luôn dấu vết "người này từng làm quản lý tòa nào, từ bao giờ".
 *    Nhật ký và phiếu thu vẫn trỏ về profile đó; hỏi "ai đã ghi khoản tiền mặt này"
 *    thì phải còn trả lời được.
 *  - Khoá thì mở lại được nếu khoá nhầm.
 *
 * Vì sao khoá ở `profiles` chứ không ở từng `memberships`:
 *  mọi hàm trợ giúp RLS đều đi qua `my_org()`. Cho `my_org()` trả NULL khi tài khoản
 *  bị khoá là MỘT chỗ sửa, và toàn bộ 36 policy + policy storage cùng đóng lại —
 *  không phải trông cậy vào việc từng policy nhớ kiểm thêm cờ khoá.
 */
alter table profiles
  add column if not exists locked_at   timestamptz,
  add column if not exists locked_by   uuid references profiles(id),
  add column if not exists lock_reason text;

/*
 * Tài khoản bị khoá → không thuộc tổ chức nào → không thấy gì, không ghi được gì.
 *
 * Hiệu lực NGAY LẬP TỨC, kể cả khi điện thoại của người đó vẫn đang giữ phiên đăng
 * nhập: JWT còn hạn chỉ chứng minh "đây là ai", còn "được làm gì" thì database hỏi
 * lại ở MỖI câu truy vấn. Đây là lý do không cần chờ token hết hạn (câu S2 cũ).
 *
 * Người bị khoá vẫn đọc được hồ sơ của CHÍNH MÌNH (policy p_profiles_self dùng
 * `id = auth.uid()`), để app hiện được "Tài khoản đã bị khoá" thay vì màn hình trống.
 */
create or replace function auth_helpers.my_org() returns uuid
language sql stable security definer set search_path = public as $$
  select org_id from profiles where id = auth.uid() and locked_at is null;
$$;

create or replace function lock_member(p_profile uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := auth_helpers.my_org();
begin
  if v_org is null or not auth_helpers.has_role('OWNER') then
    raise exception 'Chỉ chủ nhà mới khoá được tài khoản' using errcode = 'insufficient_privilege';
  end if;
  if p_profile = auth.uid() then
    -- Chủ nhà tự khoá mình là tổ chức mất người duy nhất mở khoá được.
    raise exception 'Không tự khoá tài khoản của chính mình' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from profiles where id = p_profile and org_id = v_org) then
    -- Cùng một thông báo cho "không có" và "của tổ chức khác": không để dò id.
    raise exception 'Không tìm thấy tài khoản' using errcode = 'no_data_found';
  end if;
  if exists (select 1 from memberships where profile_id = p_profile and org_id = v_org and role = 'OWNER') then
    raise exception 'Không khoá được tài khoản chủ nhà' using errcode = 'check_violation';
  end if;

  update profiles
     set locked_at = coalesce(locked_at, now()),
         locked_by = auth.uid(),
         lock_reason = p_reason
   where id = p_profile;

  insert into audit_logs (org_id, actor_type, actor_id, action, entity_type, entity_id, meta)
  values (v_org, 'USER', auth.uid(), 'Khoá tài khoản', 'profile', p_profile::text,
          jsonb_build_object('reason', p_reason));
end $$;

create or replace function unlock_member(p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := auth_helpers.my_org();
begin
  if v_org is null or not auth_helpers.has_role('OWNER') then
    raise exception 'Chỉ chủ nhà mới mở khoá được tài khoản' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from profiles where id = p_profile and org_id = v_org) then
    raise exception 'Không tìm thấy tài khoản' using errcode = 'no_data_found';
  end if;

  update profiles set locked_at = null, locked_by = null, lock_reason = null where id = p_profile;

  insert into audit_logs (org_id, actor_type, actor_id, action, entity_type, entity_id)
  values (v_org, 'USER', auth.uid(), 'Mở khoá tài khoản', 'profile', p_profile::text);
end $$;

/*
 * log_event bản cũ ghi được nhật ký với org_id = NULL khi my_org() rỗng. Tài khoản bị
 * khoá mà vẫn rải được dòng nhật ký vô chủ vào bảng chỉ-ghi-thêm (không xoá được) thì
 * không ổn. Chặn lại.
 */
create or replace function log_event(
  p_action text, p_entity_type text, p_entity_id text,
  p_unit_id uuid default null, p_amount bigint default null,
  p_meta jsonb default '{}'::jsonb
) returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_org uuid := auth_helpers.my_org();
begin
  if v_org is null then
    raise exception 'Tài khoản không thuộc tổ chức nào hoặc đã bị khoá'
      using errcode = 'insufficient_privilege';
  end if;
  insert into audit_logs (org_id, actor_type, actor_id, action, entity_type, entity_id, unit_id, amount, meta)
  values (v_org, 'USER', auth.uid(), p_action, p_entity_type, p_entity_id, p_unit_id, p_amount, p_meta)
  returning id into v_id;
  return v_id;
end $$;

-- security definer mới → thu quyền PUBLIC TRƯỚC, rồi mới cấp (xem 0004).
revoke all on function lock_member(uuid, text) from public, anon;
revoke all on function unlock_member(uuid)     from public, anon;
grant execute on function lock_member(uuid, text) to authenticated;
grant execute on function unlock_member(uuid)     to authenticated;

-- ---------------------------------------------------------------- S3: ảnh CCCD

/*
 * CHÍNH SÁCH: ảnh CCCD giữ tới khi hợp đồng kết thúc (ENDED / TERMINATED), rồi xoá.
 * Bản 0005 để 90 ngày; chủ dự án chốt lại là 0.
 *
 * ⚠️ Đánh đổi đã biết: hoàn cọc là 10 ngày SAU bàn giao, và tranh chấp cọc có thể
 * tới sau đó — lúc ấy không còn ảnh CCCD để đối chiếu. Hợp đồng giấy và biên bản
 * bàn giao vẫn còn. Đổi chính sách thì chỉ sửa con số trong hàm dưới.
 */
create or replace function id_doc_retention_days() returns int
language sql immutable as $$ select 0 $$;

create or replace function schedule_file_purge() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('ENDED', 'TERMINATED') and old.status not in ('ENDED', 'TERMINATED') then
    insert into file_retention (path, bucket_id, contract_id, purge_after, note)
    select o.name, o.bucket_id, new.id, current_date + id_doc_retention_days(),
           'hợp đồng kết thúc ' || to_char(now() at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD')
      from storage.objects o
     where o.bucket_id = 'id-docs'
       and storage_contract_id(o.name) = new.id
    on conflict (path) do nothing;
  end if;
  return new;
end $$;

-- rollback: alter table profiles drop column locked_at, drop column locked_by,
--           drop column lock_reason; drop function lock_member, unlock_member,
--           id_doc_retention_days; chạy lại định nghĩa my_org/log_event/schedule_file_purge
--           ở 0003/0004/0005.
