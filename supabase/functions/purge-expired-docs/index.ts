/**
 * XOÁ ẢNH CCCD HẾT HẠN LƯU — chạy mỗi ngày (pg_cron → pg_net, xem supabase/cron.sql).
 *
 * Chốt S3 (24/09/2026): giữ ảnh CCCD tới khi hợp đồng kết thúc, rồi xoá. Trigger ở
 * database chỉ HẸN lịch (bảng `file_retention`); hàm này mới XOÁ THẬT.
 *
 * Xoá qua Storage API, không `delete from storage.objects` bằng SQL: xoá hàng trong
 * bảng không xoá file thật trên kho lưu trữ — ảnh vẫn nằm đó, chỉ là không ai thấy
 * nó trong danh sách nữa. Với ảnh CCCD thì đó là kiểu "đã xoá" tệ nhất.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { isCronCall, json, vnTodayISO } from '../_shared/http.ts';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

/** Mỗi lần chạy xoá tối đa chừng này file — còn thừa thì hôm sau xoá tiếp. */
const BATCH = 500;

Deno.serve(async (req) => {
  if (!isCronCall(req)) return json({ error: 'unauthorized' }, 401);

  try {
    const { data: due, error } = await db
      .from('file_retention')
      .select('path, bucket_id')
      .is('purged_at', null)
      .lte('purge_after', vnTodayISO())
      .limit(BATCH);
    if (error) throw new Error(`load ${error.code}`);
    if (!due || due.length === 0) return json({ ok: true, purged: 0 });

    let purged = 0;
    const byBucket = new Map<string, string[]>();
    for (const f of due) byBucket.set(f.bucket_id, [...(byBucket.get(f.bucket_id) ?? []), f.path]);

    for (const [bucket, paths] of byBucket) {
      const { error: e2 } = await db.storage.from(bucket).remove(paths);
      // Lỗi ở một bucket thì bỏ qua bucket đó, KHÔNG đánh dấu đã xoá — hôm sau thử lại.
      if (e2) { console.error('remove', bucket, e2.message); continue; }

      const { error: e3 } = await db
        .from('file_retention')
        .update({ purged_at: new Date().toISOString() })
        .eq('bucket_id', bucket)
        .in('path', paths);
      if (e3) throw new Error(`mark ${e3.code}`);
      purged += paths.length;
    }

    if (purged > 0) {
      await db.from('audit_logs').insert({
        actor_type: 'SYSTEM',
        action: `Xoá ${purged} ảnh CCCD hết hạn lưu`,
        entity_type: 'file_retention',
        meta: { count: purged },
      });
    }
    return json({ ok: true, purged });
  } catch (e) {
    console.error('purge-expired-docs', e instanceof Error ? e.message : 'unknown');
    return json({ error: 'failed' }, 500);
  }
});
