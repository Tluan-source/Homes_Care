-- ============================================================================
-- SHIM — CHỈ DÙNG KHI CHẠY POSTGRES CỤC BỘ. KHÔNG BAO GIỜ CHẠY TRÊN SUPABASE.
--
-- Supabase dựng sẵn schema `auth`, schema `storage` và ba vai `anon`,
-- `authenticated`, `service_role`. Postgres trắng thì không có gì cả, nên 5 file
-- migration không chạy nổi dòng đầu tiên.
--
-- File này dựng lại ĐÚNG những thứ đó, **giống hệt định nghĩa thật của Supabase**
-- — đặc biệt là `auth.uid()`, vốn đọc GUC `request.jwt.claims`. Nhờ giống hệt,
-- bộ test RLS trong `supabase/tests/` chạy được **không sửa dòng nào** ở cả hai nơi:
-- máy bạn và project Supabase thật.
--
-- Đặt tên `00_` để luôn chạy trước. `supabase db reset` KHÔNG đụng tới thư mục này.
-- ============================================================================

-- ---------------------------------------------------------------- vai

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    -- bypassrls: đúng như trên Supabase — service_role bỏ qua toàn bộ RLS.
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- ---------------------------------------------------------------- schema auth

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

/*
 * ĐỊNH NGHĨA THẬT CỦA SUPABASE, chép nguyên văn.
 *
 * Đây là lý do bộ test chạy được ở cả hai nơi: test chỉ cần
 *   set local request.jwt.claims = '{"sub":"<uuid>"}';
 *   set local role authenticated;
 * là auth.uid() trả đúng người đó — cục bộ giống hệt trên Supabase.
 */
create or replace function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

-- ---------------------------------------------------------------- schema storage

create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  public             boolean default false,
  avif_autodetection boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id               uuid primary key default gen_random_uuid(),
  bucket_id        text references storage.buckets(id),
  name             text,
  owner            uuid,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata         jsonb,
  unique (bucket_id, name)
);

/*
 * Trả về các ĐOẠN THƯ MỤC của một object, bỏ tên file.
 * 'a1b2.../cccd-front.jpg' → {'a1b2...'}
 * Đây cũng là định nghĩa của Supabase.
 */
create or replace function storage.foldername(name text) returns text[]
language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts, 1) - 1];
end $$;

grant all on all tables in schema storage to anon, authenticated, service_role;
