-- ============================================================================
-- LỊCH CHẠY NỀN — chạy MỘT LẦN trên project Supabase (SQL Editor), SAU khi đã deploy
-- các Edge Function. Xem docs/DEPLOY.md §6.
--
-- Cố ý KHÔNG đặt trong migrations/: pg_cron và pg_net chỉ có trên Supabase, còn bộ
-- test chạy trên Postgres trắng. Và mỗi project (staging / production) có URL riêng.
--
-- Giờ trong pg_cron là UTC. Việt Nam = UTC+7.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1. Hai bí mật lưu trong Vault — THAY giá trị trước khi chạy.
--    Không dán thẳng vào câu lệnh cron: bảng cron.job ai có quyền đọc là thấy.
--    (Chạy lại file này thì bỏ qua 2 dòng dưới — Vault báo trùng tên.)
select vault.create_secret('https://<PROJECT_REF>.supabase.co', 'project_url');
select vault.create_secret('<CRON_SECRET — đúng chuỗi đã đặt bằng supabase secrets set>', 'cron_secret');

-- 2. 00:05 giờ VN — hợp đồng quá ngày kết thúc → ENDED (và hẹn xoá ảnh CCCD).
select cron.schedule('end-expired-contracts', '5 17 * * *',
  $$ select public.end_expired_contracts() $$);

-- 3. 00:20 giờ VN — xoá ảnh CCCD tới hạn (chạy SAU job trên).
select cron.schedule('purge-expired-docs', '20 17 * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/purge-expired-docs',
    headers := jsonb_build_object(
                 'content-type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := '{}'::jsonb)
$$);

-- 4. 08:00 giờ VN — bản tin sáng cho chủ nhà + quản lý.
select cron.schedule('run-reminders', '0 1 * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
               || '/functions/v1/run-reminders',
    headers := jsonb_build_object(
                 'content-type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body    := '{}'::jsonb)
$$);

-- Kiểm tra:
--   select jobname, schedule, active from cron.job;
--   select jobid, status, return_message, start_time from cron.job_run_details order by start_time desc limit 20;
--   select id, status_code, left(content::text, 200) from net._http_response order by id desc limit 10;
