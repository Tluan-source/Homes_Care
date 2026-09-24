-- ============================================================================
-- 0005 — Kho ảnh: CCCD, biên bản bàn giao, ảnh chuyển khoản
--
-- ⚠️ ĐÂY LÀ DỮ LIỆU NHẠY CẢM NHẤT CỦA CẢ HỆ THỐNG.
--
-- Ảnh CCCD đủ để mạo danh một người: mở tài khoản ngân hàng, vay tín chấp, đăng ký
-- SIM. Rò rỉ một thư mục ảnh CCCD nặng hơn rò rỉ toàn bộ số liệu doanh thu.
--
-- Bucket của Supabase Storage MẶC ĐỊNH PUBLIC nếu tạo qua giao diện mà quên tắt.
-- Public nghĩa là ai có URL là xem được, không cần đăng nhập, không log lại.
-- File này tạo bucket ở chế độ private VÀ đặt policy — thiếu một trong hai là hở.
-- ============================================================================

-- ---------------------------------------------------------------- bucket

-- private = true. Truy cập chỉ qua signed URL có hạn, không qua URL cố định.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('id-docs',  'id-docs',  false, 8388608,   array['image/jpeg','image/png','image/webp']),
  ('handover', 'handover', false, 104857600, array['image/jpeg','image/png','image/webp','video/mp4']),
  ('bills',    'bills',    false, 8388608,   array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update
  set public = false,                       -- ép về private kể cả khi ai đó lỡ bật
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/*
 * QUY ƯỚC ĐƯỜNG DẪN — policy bên dưới bám vào nó, nên KHÔNG ĐƯỢC đổi tuỳ tiện:
 *
 *   id-docs/{contract_id}/{occupant_id}-front.jpg
 *   handover/{contract_id}/{yyyy-mm-dd}-{n}.mp4
 *   bills/{contract_id}/{payment_request_id}-{n}.jpg
 *
 * Đoạn đầu LUÔN là contract_id. Nhờ vậy quyền xem ảnh suy được thẳng từ quyền xem
 * hợp đồng, không phải dựng bảng phân quyền thứ hai cho file.
 */

create or replace function storage_contract_id(p_name text) returns uuid
language plpgsql immutable as $$
declare v uuid;
begin
  -- Tên file hỏng thì trả null → mọi policy đều trượt → từ chối. Mặc định là TỪ CHỐI.
  begin
    v := (storage.foldername(p_name))[1]::uuid;
  exception when others then
    return null;
  end;
  return v;
end $$;

-- ---------------------------------------------------------------- policy

alter table storage.objects enable row level security;

/*
 * XEM: chỉ người xem được hợp đồng. Không có policy nào cho `anon` —
 * chưa đăng nhập thì không thấy gì, kể cả khi đoán đúng đường dẫn.
 */
create policy p_files_read on storage.objects for select to authenticated
using (
  bucket_id in ('id-docs', 'handover', 'bills')
  and auth_helpers.can_see_contract(storage_contract_id(name))
);

/*
 * TẢI LÊN: quản lý và chủ nhà, và chỉ vào hợp đồng mình được đụng tới.
 * `owner` do Supabase gán = auth.uid(), giữ lại để biết ai đã tải lên.
 */
create policy p_files_upload on storage.objects for insert to authenticated
with check (
  bucket_id in ('id-docs', 'handover', 'bills')
  and auth_helpers.can_see_contract(storage_contract_id(name))
  and (auth_helpers.has_role('MANAGER') or auth_helpers.has_role('OWNER'))
);

/*
 * KHÔNG CÓ policy UPDATE — ảnh CCCD đã tải lên thì không cho GHI ĐÈ.
 * Ghi đè là cách âm thầm thay bằng ảnh người khác mà không để lại dấu vết.
 * Chụp lại thì tải lên file mới, ảnh cũ vẫn còn trong nhật ký.
 */

/*
 * XOÁ: CHỈ CHỦ NHÀ. Đây là đường để thực hiện quyền xoá dữ liệu của khách thuê
 * theo Nghị định 13/2023/NĐ-CP — xem docs/SECURITY.md §4.
 */
create policy p_files_delete on storage.objects for delete to authenticated
using (
  bucket_id in ('id-docs', 'handover', 'bills')
  and auth_helpers.can_see_contract(storage_contract_id(name))
  and auth_helpers.has_role('OWNER')
);

-- ---------------------------------------------------------------- lưu trữ có hạn

/*
 * Ảnh CCCD KHÔNG được giữ vô thời hạn. Nghị định 13/2023 buộc phải xoá khi hết mục
 * đích xử lý. Mục đích ở đây là thực hiện hợp đồng thuê → hết hợp đồng + thời hạn
 * khiếu nại thì phải xoá.
 *
 * Bảng này ghi mốc phải xoá; Edge Function `purge-expired-docs` chạy hằng tuần
 * đọc bảng và xoá thật. Không xoá ngay lúc kết thúc hợp đồng vì còn tranh chấp cọc
 * (hoàn cọc 10 ngày, khiếu nại có thể kéo dài hơn).
 */
create table if not exists file_retention (
  path         text primary key,
  bucket_id    text not null,
  contract_id  uuid not null references contracts(id) on delete cascade,
  purge_after  date not null,
  purged_at    timestamptz,
  note         text
);
create index on file_retention (purge_after) where purged_at is null;

alter table file_retention enable row level security;
create policy p_retention_read on file_retention for select to authenticated
  using (auth_helpers.can_see_contract(contract_id));

/*
 * Hợp đồng kết thúc → hẹn lịch xoá sau 90 ngày.
 * 90 ngày = 10 ngày hoàn cọc + đệm cho tranh chấp. Con số này là CHÍNH SÁCH,
 * đổi thì đổi ở đây và ghi lại vào docs/SECURITY.md.
 */
create or replace function schedule_file_purge() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('ENDED', 'TERMINATED') and old.status not in ('ENDED', 'TERMINATED') then
    insert into file_retention (path, bucket_id, contract_id, purge_after, note)
    select o.name, o.bucket_id, new.id, current_date + 90,
           'hợp đồng kết thúc ' || to_char(now(), 'YYYY-MM-DD')
      from storage.objects o
     where o.bucket_id = 'id-docs'
       and storage_contract_id(o.name) = new.id
    on conflict (path) do nothing;
  end if;
  return new;
end $$;

create trigger contracts_schedule_purge after update of status on contracts
  for each row execute function schedule_file_purge();

-- rollback: drop policy p_files_*, drop trigger contracts_schedule_purge,
--           drop function schedule_file_purge, storage_contract_id,
--           drop table file_retention, delete from storage.buckets where id in (...).
