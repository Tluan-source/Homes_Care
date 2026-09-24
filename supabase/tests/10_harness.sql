-- ============================================================================
-- Khung test nhỏ, viết bằng SQL thuần.
--
-- Cố ý KHÔNG dùng pgTAP: pgTAP không có sẵn trên Supabase hosted, và cái giá phải
-- trả là bộ test chỉ chạy được ở máy. Bộ test phân quyền mà không chạy được trên
-- chính database thật thì mất phân nửa giá trị.
--
-- Cách đóng vai người dùng giống HỆT cách Supabase làm ngoài đời:
--     set role authenticated;
--     set request.jwt.claims = '{"sub":"<uuid người dùng>"}';
-- `auth.uid()` đọc đúng GUC đó. Nên các test dưới đây chạy y nguyên trên Supabase.
-- ============================================================================

create schema if not exists t;

create table if not exists t.results (
  n      serial primary key,
  name   text not null,
  ok     boolean not null,
  detail text
);
truncate t.results restart identity;

-- ---------------------------------------------------------------- đóng vai

/*
 * Chạy một câu lệnh DƯỚI DANH NGHĨA một người dùng và trả về SỐ HÀNG.
 * p_user null  → vai `anon` (chưa đăng nhập).
 *
 * Đây là hàm quan trọng nhất của khung test: RLS chỉ có nghĩa khi được nhìn từ
 * phía người dùng thật, chạy bằng superuser thì mọi policy đều vô hình.
 */
create or replace function t.rows_as(p_user uuid, p_sql text) returns bigint
language plpgsql as $$
declare v bigint;
begin
  perform set_config('request.jwt.claims',
                     case when p_user is null then '' else json_build_object('sub', p_user)::text end,
                     true);
  perform set_config('role', case when p_user is null then 'anon' else 'authenticated' end, true);
  begin
    execute 'select count(*) from (' || p_sql || ') _x' into v;
  exception when others then
    perform set_config('role', 'postgres', true);
    raise;
  end;
  perform set_config('role', 'postgres', true);
  return v;
end $$;

/*
 * "Người này KHÔNG thấy gì cả" — đúng khi hoặc đọc ra 0 hàng, hoặc bị chặn thẳng
 * bằng lỗi thiếu quyền (42501).
 *
 * Hai đường chặn khác nhau và cả hai đều đạt yêu cầu: RLS lọc hết hàng, hoặc GRANT
 * không cho đụng vào bảng. Với `anon` thì đường thứ hai mới là đường đang chặn, và
 * một test chỉ chấp nhận "0 hàng" sẽ báo hỏng trong khi hệ thống đang an toàn hơn.
 */
create or replace function t.nothing_for(p_user uuid, p_sql text) returns boolean
language plpgsql as $$
begin
  return t.rows_as(p_user, p_sql) = 0;
exception when insufficient_privilege then
  perform set_config('role', 'postgres', true);
  return true;
end $$;

/*
 * Chạy một câu lệnh GHI dưới danh nghĩa một người dùng.
 * Trả về: null nếu chạy được, hoặc 'SQLSTATE thông báo lỗi' nếu bị chặn.
 *
 * Luôn nuốt lỗi lại, vì trong test thì "bị chặn" mới là kết quả MONG ĐỢI.
 */
create or replace function t.err_as(p_user uuid, p_sql text) returns text
language plpgsql as $$
declare v_msg text;
begin
  perform set_config('request.jwt.claims',
                     case when p_user is null then '' else json_build_object('sub', p_user)::text end,
                     true);
  perform set_config('role', case when p_user is null then 'anon' else 'authenticated' end, true);
  begin
    execute p_sql;
    v_msg := null;
  exception when others then
    v_msg := sqlstate || ' ' || sqlerrm;
  end;
  perform set_config('role', 'postgres', true);
  return v_msg;
end $$;

/*
 * Số hàng mà một lệnh UPDATE/DELETE thật sự đụng tới.
 *
 * Rất cần một hàm riêng: RLS chặn UPDATE/DELETE bằng cách LỌC HÀNG ĐI, **không**
 * báo lỗi. Một lệnh `delete from payments` bị chặn hoàn toàn vẫn "thành công" —
 * nó chỉ xoá 0 hàng. Test nào chỉ bắt lỗi sẽ bỏ lọt đúng nhóm lỗ hổng này.
 */
create or replace function t.affected_as(p_user uuid, p_sql text) returns bigint
language plpgsql as $$
declare v bigint;
begin
  perform set_config('request.jwt.claims',
                     case when p_user is null then '' else json_build_object('sub', p_user)::text end,
                     true);
  perform set_config('role', case when p_user is null then 'anon' else 'authenticated' end, true);
  begin
    execute p_sql;
    get diagnostics v = row_count;
  exception when others then
    perform set_config('role', 'postgres', true);
    return -1;                      -- -1 = bị chặn bằng lỗi, không phải bằng lọc hàng
  end;
  perform set_config('role', 'postgres', true);
  return v;
end $$;

-- ---------------------------------------------------------------- khẳng định

create or replace function t.ok(p_name text, p_cond boolean, p_detail text default null)
returns void language plpgsql as $$
begin
  insert into t.results (name, ok, detail) values (p_name, coalesce(p_cond, false), p_detail);
end $$;

create or replace function t.eq(p_name text, p_actual anyelement, p_expected anyelement)
returns void language plpgsql as $$
begin
  perform t.ok(p_name, p_actual is not distinct from p_expected,
               case when p_actual is not distinct from p_expected then null
                    else format('nhận %s, đáng lẽ %s', p_actual, p_expected) end);
end $$;

-- Dùng cho các test "phải bị chặn": chỉ cần CÓ lỗi, không quan tâm lỗi gì.
create or replace function t.blocked(p_name text, p_err text)
returns void language plpgsql as $$
begin
  perform t.ok(p_name, p_err is not null,
               case when p_err is null then 'KHÔNG bị chặn — lệnh chạy lọt' else null end);
end $$;

create or replace function t.allowed(p_name text, p_err text)
returns void language plpgsql as $$
begin
  perform t.ok(p_name, p_err is null, p_err);
end $$;

-- ---------------------------------------------------------------- tổng kết

create or replace function t.report() returns void language plpgsql as $$
declare r record; v_bad int;
begin
  for r in select n, name, ok, detail from t.results order by n loop
    raise info '%', format('%s  %s%s',
      case when r.ok then '  ĐẠT ' else '  HỎNG' end,
      rpad(r.name, 64),
      coalesce(' → ' || r.detail, ''));
  end loop;

  select count(*) into v_bad from t.results where not ok;
  raise info '───────────────────────────────────────────────────────────────';
  raise info '%', format('   %s/%s đạt',
    (select count(*) from t.results where ok), (select count(*) from t.results));

  if v_bad > 0 then
    raise exception '% test phân quyền KHÔNG ĐẠT — xem danh sách ở trên', v_bad;
  end if;
end $$;

-- Người dùng trong seed, đặt tên cho dễ đọc test.
create or replace view t.who as
  select '00000000-0000-0000-0000-00000000a001'::uuid as owner_a,
         '00000000-0000-0000-0000-00000000a002'::uuid as manager_a,
         '00000000-0000-0000-0000-00000000a003'::uuid as staff_a,
         '00000000-0000-0000-0000-00000000b001'::uuid as owner_b;
