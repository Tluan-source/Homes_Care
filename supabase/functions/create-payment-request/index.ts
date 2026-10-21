/**
 * TẠO YÊU CẦU THANH TOÁN — app gọi khi quản lý bấm "Tạo yêu cầu thanh toán".
 *
 * Vì sao ở SERVER chứ không ở app (0008): đối soát tự động chỉ đáng tin khi số tiền
 * trên phiếu là do server tính. Để app tự tạo phiếu thì qua REST API ai cũng tạo được
 * phiếu 1 triệu cho kỳ 17 triệu, chuyển 1 triệu, và webhook ghi nhận "đã thanh toán".
 *
 * Tính bằng CHÍNH core mà app dùng để hiển thị: phạt trễ (lateFee), mã thanh toán
 * (makePaymentCode), payload VietQR (buildVietQR). App hiện bao nhiêu thì phiếu bấy nhiêu.
 *
 * Body: { contract_id, preview?: boolean, bank_account_id? }
 *   preview = true  → chỉ tính và trả về (bước 1 "Soát lại các khoản"), không ghi gì
 *   preview = false → tạo phiếu DRAFT + QR (bước 2). Đã có phiếu đang mở với ĐÚNG các
 *                     khoản đó thì trả lại phiếu cũ — một hợp đồng, một phiếu đang mở.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildVietQR, findBank, lateFee, lateDays, makeDocNo, makePaymentCode, parseDay, addDays, toISODate,
  type Extension,
} from '../_shared/core.ts';
import { json, readJsonLimited, vnTodayISO } from '../_shared/http.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

/** Kỳ quá hạn hơn chừng này không gom vào phiếu nữa — đó là việc thanh lý (đặc tả 8.3). */
const MAX_AGE_DAYS = 120;
/** Cho phép tạo sẵn phiếu cho kỳ sắp tới trong cửa sổ nhắc D-3. */
const AHEAD_DAYS = 3;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405);

  try {
    // --- Người gọi: đọc từ JWT, không tin id trong body.
    const jwt = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const { data: me, error: eMe } = await admin.auth.getUser(jwt);
    if (eMe || !me.user) return json({ error: 'unauthorized' }, 401);

    const { data: caller } = await admin.from('profiles')
      .select('id, org_id, locked_at').eq('id', me.user.id).maybeSingle();
    if (!caller || caller.locked_at) return json({ error: 'Tài khoản đã bị khoá' }, 403);

    const { data: roles } = await admin.from('memberships')
      .select('role, tower_id').eq('profile_id', caller.id).eq('org_id', caller.org_id)
      .in('role', ['OWNER', 'MANAGER']);
    if (!roles || roles.length === 0) return json({ error: 'Không có quyền tạo phiếu' }, 403);

    const parsed = await readJsonLimited(req, 4 * 1024);
    if (!parsed.ok) return json({ error: parsed.error }, parsed.status);
    const contractId = String(parsed.body.contract_id ?? '');
    const preview = parsed.body.preview === true;
    const wantAccount = parsed.body.bank_account_id ? String(parsed.body.bank_account_id) : null;

    // --- Hợp đồng + kiểm phạm vi tòa của người gọi.
    const { data: c } = await admin.from('contracts')
      .select('id, code, status, cycle_months, units!inner(id, code, tower_id, towers!inner(zones!inner(org_id))), occupants(full_name, phone, is_primary)')
      .eq('id', contractId).maybeSingle();
    // deno-lint-ignore no-explicit-any
    const unit: any = c?.units;
    const inScope = c && unit.towers.zones.org_id === caller.org_id &&
      roles.some(r => r.tower_id === null || r.tower_id === unit.tower_id);
    if (!c || !inScope) return json({ error: 'Không tìm thấy hợp đồng' }, 404);
    if (c.status !== 'ACTIVE') return json({ error: 'Hợp đồng không còn hiệu lực' }, 409);

    const todayISO = vnTodayISO();
    const today = parseDay(todayISO);

    // --- Các kỳ còn nợ, tới hạn trong khoảng [hôm nay − 120, hôm nay + 3].
    const { data: periods, error: eP } = await admin.from('payment_periods')
      .select('id, type, due_on, period_from, period_to, amount_due, amount_paid')
      .eq('contract_id', contractId).in('status', ['OPEN', 'PARTIAL'])
      .gte('due_on', toISODate(addDays(today, -MAX_AGE_DAYS)))
      .lte('due_on', toISODate(addDays(today, AHEAD_DAYS)))
      .order('due_on');
    if (eP) throw new Error(`periods ${eP.code}`);
    if (!periods || periods.length === 0) {
      return json({ error: 'Không có kỳ nào cần thu', empty: true }, 409);
    }

    // Khất đã DUYỆT thì miễn phạt tới hạn mới (policy.ts) — core tự xử lý khi truyền vào.
    const { data: exts } = await admin.from('payment_extensions')
      .select('id, status, original_due, new_due, reason, requested_at')
      .eq('contract_id', contractId).eq('status', 'APPROVED');
    const extOf = (due: string): Extension | undefined => {
      const e = (exts ?? []).find(x => x.original_due === due);
      return e ? {
        id: e.id, status: 'APPROVED', newDue: parseDay(e.new_due), reason: e.reason,
        requestedAt: new Date(e.requested_at),
      } : undefined;
    };

    const lines = periods.map(p => {
      const due = parseDay(p.due_on);
      const ext = extOf(p.due_on);
      const owed = Number(p.amount_due) - Number(p.amount_paid);
      return {
        period_id: p.id,
        type: p.type as 'RENT' | 'SERVICE',
        due_on: p.due_on,
        period_from: p.period_from,
        period_to: p.period_to,
        amount: owed,
        late_days: Math.max(0, lateDays(due, today, ext)),
        // Phạt CHỈ tính trên tiền nhà (PENALIZED_INVOICE_TYPES) — core quyết.
        fee: p.type === 'RENT' ? lateFee(due, today, ext) : 0,
      };
    }).filter(l => l.amount > 0);

    const penalty = lines.reduce((a, l) => a + l.fee, 0);
    const amount = lines.reduce((a, l) => a + l.amount, 0) + penalty;

    // --- Tài khoản nhận: của chính tổ chức; chỉ định được nếu có nhiều.
    let accQ = admin.from('bank_accounts').select('id, bank_id, number, holder').eq('org_id', caller.org_id);
    if (wantAccount) accQ = accQ.eq('id', wantAccount);
    const { data: accounts } = await accQ;
    if (!accounts || accounts.length === 0) return json({ error: 'Chưa khai báo tài khoản nhận tiền' }, 409);
    if (accounts.length > 1 && !wantAccount) {
      return json({ error: 'Có nhiều tài khoản nhận — chọn một', accounts }, 409);
    }
    const acc = accounts[0];
    const bank = findBank(acc.bank_id);
    if (!bank) return json({ error: `Ngân hàng ${acc.bank_id} chưa hỗ trợ VietQR` }, 409);

    const tenant = (c.occupants ?? []).find(o => o.is_primary) ?? (c.occupants ?? [])[0] ?? null;
    const base = {
      unit_code: unit.code, contract_code: c.code, cycle_months: c.cycle_months,
      tenant: tenant ? { name: tenant.full_name, phone: tenant.phone } : null,
      lines, penalty, amount,
      bank: { id: acc.id, bank_id: acc.bank_id, bank_name: bank.name, number: acc.number, holder: acc.holder },
    };
    if (preview) return json({ ok: true, preview: true, ...base });

    // --- Một hợp đồng, MỘT phiếu đang mở. Khớp đúng các khoản thì trả lại phiếu cũ.
    const { data: open } = await admin.from('payment_requests')
      .select('id, doc_no, code, amount, qr_payload, status, sent_at, payment_request_lines(period_id, amount)')
      .eq('contract_id', contractId).in('status', ['DRAFT', 'SENT']);
    const sig = (xs: { period_id: string; amount: number }[]) =>
      xs.map(x => `${x.period_id}:${Number(x.amount)}`).sort().join('|');
    const same = (open ?? []).find(r =>
      Number(r.amount) === amount && sig(r.payment_request_lines ?? []) === sig(lines));
    if (same) return json({ ok: true, reused: true, request: same, ...base });

    // Khác (vừa có kỳ mới tới hạn, hoặc khách đóng bớt) → huỷ phiếu cũ, lập phiếu mới.
    // Khách lỡ quét QR cũ thì webhook thấy phiếu đã huỷ → hàng đợi ngoại lệ, không ghi nhầm.
    if (open && open.length > 0) {
      await admin.from('payment_requests').update({ status: 'CANCELLED' })
        .in('id', open.map(r => r.id));
    }

    const { data: seqHC } = await admin.rpc('next_doc_seq', { p_kind: 'HC' });
    const { data: seqYC } = await admin.rpc('next_doc_seq', { p_kind: 'YC' });
    const code = makePaymentCode(Number(seqHC), today);
    const docNo = makeDocNo('YC', today, Number(seqYC));
    const qr = buildVietQR({ bankId: acc.bank_id, accountNumber: acc.number, amount, content: code });

    const { data: created, error: eC } = await admin.from('payment_requests').insert({
      contract_id: contractId, doc_no: docNo, code, bank_account_id: acc.id,
      amount, penalty, qr_payload: qr, status: 'DRAFT', created_by: caller.id,
    }).select('id, doc_no, code, amount, qr_payload, status, sent_at').single();
    if (eC) throw new Error(`insert request ${eC.code}`);

    const { error: eL } = await admin.from('payment_request_lines')
      .insert(lines.map(l => ({ request_id: created.id, period_id: l.period_id, amount: l.amount })));
    if (eL) {
      await admin.from('payment_requests').update({ status: 'CANCELLED' }).eq('id', created.id);
      throw new Error(`insert lines ${eL.code}`);
    }

    await admin.from('audit_logs').insert({
      org_id: caller.org_id, actor_type: 'USER', actor_id: caller.id,
      action: 'Tạo yêu cầu thanh toán và sinh QR', entity_type: 'payment_request', entity_id: docNo,
      unit_id: unit.id, amount,
      meta: { code, periods: lines.length, penalty, account: acc.number },
    });

    return json({ ok: true, request: created, ...base });
  } catch (e) {
    console.error('create-payment-request', e instanceof Error ? e.message : 'unknown');
    return json({ error: 'Không tạo được phiếu, thử lại' }, 500);
  }
});
