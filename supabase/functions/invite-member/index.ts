/**
 * MỜI QUẢN LÝ — chủ nhà nhập email, hàm này tạo tài khoản và gửi email mời.
 *
 * Chốt S1 (24/09/2026): đăng nhập email + mật khẩu, KHÔNG cho tự đăng ký. Vì vậy đây
 * là đường DUY NHẤT để có tài khoản quản lý. Tạo tài khoản cần quyền admin của Auth
 * (service_role) nên bắt buộc phải ở server.
 *
 * Deploy CÓ kiểm JWT (mặc định) — chỉ người đã đăng nhập mới gọi được; rồi hàm tự
 * kiểm tiếp người gọi có phải CHỦ NHÀ, không bị khoá.
 *
 * Body: { email, full_name, phone?, tower_id? }
 *   tower_id bỏ trống = quản lý toàn bộ tòa của chủ nhà.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { json, readJsonLimited } from '../_shared/http.ts';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});
/** Trang app mở khi quản lý bấm link trong email để đặt mật khẩu. */
const REDIRECT = Deno.env.get('INVITE_REDIRECT_URL') ?? 'homescare://set-password';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  // --- Người gọi là ai: đọc từ JWT của chính họ, không tin bất cứ id nào trong body.
  const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: me, error: eMe } = await admin.auth.getUser(jwt);
  if (eMe || !me.user) return json({ error: 'unauthorized' }, 401);

  const { data: caller } = await admin
    .from('profiles').select('id, org_id, locked_at').eq('id', me.user.id).maybeSingle();
  if (!caller || caller.locked_at) return json({ error: 'forbidden' }, 403);

  const { data: ownerRole } = await admin
    .from('memberships').select('id')
    .eq('profile_id', caller.id).eq('org_id', caller.org_id).eq('role', 'OWNER')
    .limit(1).maybeSingle();
  if (!ownerRole) return json({ error: 'Chỉ chủ nhà mới mời được quản lý' }, 403);

  // --- Kiểm dữ liệu.
  const parsed = await readJsonLimited(req, 8 * 1024);
  if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
  const b = parsed.body;
  const email = String(b.email ?? '').trim().toLowerCase();
  const fullName = String(b.full_name ?? '').trim();
  const phone = b.phone ? String(b.phone).trim() : null;
  const towerId = b.tower_id ? String(b.tower_id) : null;

  if (!EMAIL_RE.test(email)) return json({ error: 'Email không hợp lệ' }, 400);
  if (fullName.length < 2) return json({ error: 'Thiếu họ tên' }, 400);

  if (towerId) {
    // Tòa phải thuộc CHÍNH tổ chức của chủ nhà — không gán quản lý vào tòa người khác.
    const { data: t } = await admin
      .from('towers').select('id, zones!inner(org_id)')
      .eq('id', towerId).eq('zones.org_id', caller.org_id).maybeSingle();
    if (!t) return json({ error: 'Không tìm thấy tòa' }, 400);
  }

  // --- Tạo tài khoản + gửi email mời (người được mời tự đặt mật khẩu qua link).
  const { data: invited, error: eInv } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: REDIRECT,
    data: { full_name: fullName },
  });
  if (eInv || !invited.user) {
    // Thường gặp: email đã có tài khoản. Không nói thêm — tránh dò email người khác.
    return json({ error: 'Không mời được email này' }, 409);
  }
  const newId = invited.user.id;

  let failed: string | null = null;
  const { error: eP } = await admin.from('profiles')
    .insert({ id: newId, org_id: caller.org_id, full_name: fullName, phone });
  if (eP) failed = `profile ${eP.code}`;
  if (!failed) {
    const { error: eM } = await admin.from('memberships')
      .insert({ profile_id: newId, org_id: caller.org_id, role: 'MANAGER', tower_id: towerId });
    if (eM) failed = `membership ${eM.code}`;
  }
  if (failed) {
    // Dọn tài khoản Auth vừa tạo, để không có tài khoản "mồ côi" đăng nhập được mà
    // không thuộc tổ chức nào. (profiles có on delete cascade theo auth.users.)
    await admin.auth.admin.deleteUser(newId);
    console.error('invite-member', failed);
    return json({ error: 'Không tạo được hồ sơ quản lý' }, 500);
  }

  await admin.from('audit_logs').insert({
    org_id: caller.org_id, actor_type: 'USER', actor_id: caller.id,
    action: 'Mời quản lý', entity_type: 'profile', entity_id: newId,
    meta: { email, tower_id: towerId },
  });

  return json({ ok: true, profile_id: newId });
});
