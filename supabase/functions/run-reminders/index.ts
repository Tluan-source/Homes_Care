/**
 * NHẮC HẠN — chạy mỗi sáng (pg_cron → pg_net, xem supabase/cron.sql).
 *
 * Chốt 24/09/2026: nhắc CHỈ TRONG APP, CHỈ cho chủ nhà và quản lý. Không nhắn khách.
 * Khách nhận QR qua Zalo do quản lý tự gửi.
 *
 * Mỗi người nhận MỘT bản tin/ngày, không phải một thông báo cho mỗi kỳ: 200 căn mà
 * bắn 200 push thì sau ba ngày người ta tắt thông báo của app, và lúc có việc gấp
 * thật thì không ai thấy.
 *
 * Mốc D-3 / D0 / D+1 / D+3 lấy từ `marksDueToday()` của core — KHÔNG định nghĩa lại ở đây.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { marksDueToday, parseDay, formatVND } from '../_shared/core.ts';
import { isCronCall, json, vnTodayISO } from '../_shared/http.ts';

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);

type Bucket = 'soon' | 'today' | 'late';
const BUCKET_OF: Record<string, Bucket> = { 'D-3': 'soon', 'D0': 'today', 'D+1': 'late', 'D+3': 'late' };

interface Hit { orgId: string; towerId: string; bucket: Bucket; owed: number }

Deno.serve(async (req) => {
  if (!isCronCall(req)) return json({ error: 'unauthorized' }, 401);

  const todayISO = vnTodayISO();
  const today = parseDay(todayISO);
  const from = shiftISO(todayISO, -3);   // mốc sớm nhất: D+3 → hạn là 3 ngày trước
  const to = shiftISO(todayISO, 3);      // mốc muộn nhất: D-3 → hạn là 3 ngày sau

  try {
    // Kỳ CÒN NỢ có hạn rơi vào cửa sổ mốc nhắc, kèm tòa + tổ chức để biết gửi ai.
    const { data: periods, error } = await db
      .from('payment_periods')
      .select('due_on, amount_due, amount_paid, contracts!inner(status, units!inner(tower_id, towers!inner(zones!inner(org_id))))')
      .in('status', ['OPEN', 'PARTIAL'])
      .gte('due_on', from).lte('due_on', to)
      .eq('contracts.status', 'ACTIVE');
    if (error) throw new Error(`periods ${error.code}`);

    const hits: Hit[] = [];
    // deno-lint-ignore no-explicit-any
    for (const p of (periods ?? []) as any[]) {
      for (const m of marksDueToday(parseDay(p.due_on), today, false)) {
        hits.push({
          orgId: p.contracts.units.towers.zones.org_id,
          towerId: p.contracts.units.tower_id,
          bucket: BUCKET_OF[m.key],
          owed: Number(p.amount_due) - Number(p.amount_paid),
        });
      }
    }

    // Người nhận: chủ nhà + quản lý của các tổ chức có việc, BỎ tài khoản bị khoá.
    const orgIds = [...new Set(hits.map(h => h.orgId))];
    if (orgIds.length === 0) return json({ ok: true, sent: 0 });

    const { data: members, error: e2 } = await db
      .from('memberships')
      .select('profile_id, org_id, role, tower_id, profiles!inner(locked_at)')
      .in('org_id', orgIds)
      .in('role', ['OWNER', 'MANAGER'])
      .is('profiles.locked_at', null);
    if (e2) throw new Error(`members ${e2.code}`);

    // Gom theo NGƯỜI: một người có thể có nhiều membership (vd. quản lý hai tòa) —
    // mỗi kỳ chỉ đếm một lần cho người đó.
    //   membership gắn tòa → chỉ thấy tòa đó · không gắn tòa → cả tổ chức.
    const byPerson = new Map<string, { orgId: string; towers: (string | null)[] }>();
    // deno-lint-ignore no-explicit-any
    for (const m of (members ?? []) as any[]) {
      const cur = byPerson.get(m.profile_id) ?? { orgId: m.org_id, towers: [] };
      cur.towers.push(m.tower_id);
      byPerson.set(m.profile_id, cur);
    }

    const inbox = new Map<string, { orgId: string; soon: number; today: number; late: number; owed: number }>();
    for (const [profileId, who] of byPerson) {
      const mine = hits.filter(h => h.orgId === who.orgId &&
        who.towers.some(t => t === null || t === h.towerId));
      if (mine.length === 0) continue;
      inbox.set(profileId, {
        orgId: who.orgId,
        soon: mine.filter(h => h.bucket === 'soon').length,
        today: mine.filter(h => h.bucket === 'today').length,
        late: mine.filter(h => h.bucket === 'late').length,
        owed: mine.filter(h => h.bucket !== 'soon').reduce((a, h) => a + h.owed, 0),
      });
    }

    const rows = [...inbox.entries()].map(([profileId, b]) => ({
      org_id: b.orgId,
      profile_id: profileId,
      kind: 'DIGEST',
      title: b.today > 0 ? `Hôm nay: ${b.today} kỳ cần gửi QR` : 'Việc thu tiền hôm nay',
      body: [
        b.today > 0 && `${b.today} kỳ tới hạn — gửi QR cho khách qua Zalo`,
        b.late > 0 && `${b.late} kỳ chưa nhận tiền — nhắc khách`,
        b.soon > 0 && `${b.soon} kỳ sắp tới hạn (3 ngày nữa)`,
        b.owed > 0 && `Cần thu: ${formatVND(b.owed)}`,
      ].filter(Boolean).join(' · '),
      data: { date: todayISO, ...b },
      // Chạy lại trong ngày (cron trễ, gọi tay) không gửi trùng.
      dedupe_key: `digest:${profileId}:${todayISO}`,
    }));

    const { data: inserted, error: e3 } = await db
      .from('notifications')
      .upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      .select('profile_id, title, body');
    if (e3) throw new Error(`notifications ${e3.code}`);

    const pushed = await pushTo(inserted ?? []);
    return json({ ok: true, digests: inserted?.length ?? 0, pushed });
  } catch (e) {
    console.error('run-reminders', e instanceof Error ? e.message : 'unknown');
    return json({ error: 'failed' }, 500);
  }
});

/** Gửi push qua Expo cho các thông báo VỪA tạo (bản đã có từ lần chạy trước thì không gửi lại). */
async function pushTo(items: { profile_id: string; title: string; body: string }[]): Promise<number> {
  if (items.length === 0) return 0;
  const { data: tokens } = await db
    .from('push_tokens').select('token, profile_id')
    .in('profile_id', items.map(i => i.profile_id));

  const messages = (tokens ?? []).map(t => {
    const n = items.find(i => i.profile_id === t.profile_id)!;
    return { to: t.token, title: n.title, body: n.body, sound: 'default', data: { kind: 'DIGEST' } };
  });

  // Expo nhận tối đa 100 tin mỗi lần gọi.
  for (let i = 0; i < messages.length; i += 100) {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(messages.slice(i, i + 100)),
    });
    // Push hỏng không làm hỏng cả job: thông báo đã nằm trong hộp thư của app rồi.
    if (!res.ok) console.error('expo push', res.status);
  }
  return messages.length;
}

function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
