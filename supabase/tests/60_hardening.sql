-- ============================================================================
-- LƯỚI AN TOÀN CHUNG — kiểm TOÀN BỘ schema, không kiểm từng bảng.
--
-- Bốn lỗ hổng của vòng chạy đầu (SECURITY.md §7) đều là LỖI MẶC ĐỊNH của nền tảng:
-- hàm mới ai cũng gọi được, view mới đi vòng RLS, bảng mới quên bật RLS. Chúng sẽ
-- quay lại ở bất kỳ migration nào sau này. File này bắt chúng tự động, kể cả ở
-- những bảng/hàm chưa ai viết ra.
-- ============================================================================

do $$
declare v_bad text;
begin
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('anon', p.oid, 'EXECUTE');
  perform t.ok('Không hàm security definer nào gọi được khi CHƯA đăng nhập', v_bad is null,
               'gọi được: ' || v_bad || ' → thêm revoke ... from public, anon');

  -- Danh sách DUYỆT TAY. Thêm hàm cho người dùng gọi thì thêm tên vào đây — có chủ đích.
  select string_agg(p.proname, ', ' order by p.proname) into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and p.proname not in ('log_event', 'lock_member', 'unlock_member', 'register_push_token',
                            'resolve_bank_tx', 'dismiss_bank_tx');
  perform t.ok('Người dùng chỉ gọi được các hàm security definer đã duyệt', v_bad is null,
               'ngoài danh sách: ' || v_bad);

  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
     and not coalesce(c.reloptions @> array['security_invoker=true'], false);
  perform t.ok('Mọi view đều security_invoker (không đi vòng RLS)', v_bad is null,
               'thiếu: ' || v_bad);

  select string_agg(c.relname, ', ' order by c.relname) into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity;
  perform t.ok('Mọi bảng trong public đều bật RLS', v_bad is null, 'chưa bật: ' || v_bad);
end $$;
